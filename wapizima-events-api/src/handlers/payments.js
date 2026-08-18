const { Op } = require("sequelize");
const crypto = require("crypto");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const sequelize = require("../config/database");
const Event = require("../models/Event");
const Order = require("../models/Order");
const Ticket = require("../models/Ticket");
const { enviarBoletosPorCorreo } = require("../utils/email");

exports.handler = async (event) => {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type,X-Amz-Date,Authorization,X-Api-Key",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  try {
    await sequelize.authenticate();
    const currentPath = event.resource || event.path || "";
    console.log(currentPath, "el currentpath");

    // -------------------------------------------------------------
    // ENRUTADOR 1: DETECTAR SI ES LA RUTA DE RESERVAR
    // -------------------------------------------------------------
    if (currentPath === "/reservar" || currentPath.endsWith("/reservar")) {
      if (!event.body) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ message: "Cuerpo faltante" }),
        };
      }

      const { eventId, cantidadBoletos, buyerEmail, buyerName, buyerPhone } =
        JSON.parse(event.body);

      if (
        !eventId ||
        !cantidadBoletos ||
        !buyerEmail ||
        !buyerName ||
        !buyerPhone
      ) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            message: "Todos los campos son obligatorios",
          }),
        };
      }

      const eventData = await Event.findByPk(eventId);
      if (!eventData) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ message: "El evento no existe" }),
        };
      }

      const CAPACIDAD_MAXIMA = eventData.total_boletos;
      const quinceMinutosAtras = new Date(Date.now() - 15 * 60 * 1000);

      const boletosOcupados =
        (await Order.sum("cantidad_boletos", {
          where: {
            eventId,
            [Op.or]: [
              { status: "pagado" },
              {
                status: "pendiente",
                reservedAt: { [Op.gte]: quinceMinutosAtras },
              },
            ],
          },
        })) || 0;

      const disponibilidadReal = CAPACIDAD_MAXIMA - boletosOcupados;

      if (cantidadBoletos > disponibilidadReal) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            message: `Sin lugares suficientes. Disponibles: ${disponibilidadReal}`,
          }),
        };
      }

      const total = parseFloat(eventData.costo) * cantidadBoletos;

      // 1. Guardar la reserva en la base de datos (Estatus: pendiente)
      const nuevaOrden = await Order.create({
        eventId,
        cantidadBoletos,
        buyerEmail,
        buyerName,
        buyerPhone,
        total,
        status: "pendiente",
        reservedAt: new Date(),
      });

      // 2. CREAR LA SESIÓN DE CHECKOUT DE STRIPE
      // Multiplicamos por 100 porque Stripe procesa en centavos (ej. $100.00 MXN = 10000)
      const cantidadEnCentavos = Math.round(total * 100);

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card", "oxxo"], // Puedes agregar 'oxxo' si la cuenta es de México y está activa
        line_items: [
          {
            price_data: {
              currency: "mxn", // Pesos Mexicanos
              product_data: {
                name: `Boleto(s) para: ${eventData.titulo}`,
                description: `${cantidadBoletos} acceso(s) para el evento.`,
              },
              unit_amount: Math.round(parseFloat(eventData.costo) * 100),
            },
            quantity: cantidadBoletos,
          },
        ],
        mode: "payment",
        payment_intent_data: {
          description: `Boletos para ${eventData.titulo}`,
          metadata: {
            orderId: nuevaOrden.id.toString(), // Súper importante para tu Webhook
            eventId: eventData.id,
          },
        },
        customer_email: buyerEmail,
        // URLs a las que Stripe redirigirá al cliente al terminar
        success_url: `${process.env.FRONTEND_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.FRONTEND_URL}/payment-error`,
        // ¡ESTO ES LO MÁS IMPORTANTE!: Guardamos el orderId en los metadata para el Webhook
        metadata: {
          orderId: nuevaOrden.id.toString(),
          buyerName: buyerName,
          buyerEmail: buyerEmail,
          buyerPhone: buyerPhone,
        },
      });

      // 3. Regresar la URL de Stripe a React
      return {
        statusCode: 201,
        headers,
        body: JSON.stringify({
          message: "Reserva creada con éxito. Redirigiendo a pasarela.",
          orderId: nuevaOrden.id,
          stripeUrl: session.url, // URL de redirección
          expiresAt: new Date(nuevaOrden.reservedAt.getTime() + 15 * 60 * 1000),
        }),
      };
    }

    // -------------------------------------------------------------
    // ENRUTADOR 2: DETECTAR SI ES LA RUTA DEL WEBHOOK DE PAGO
    // -------------------------------------------------------------
    if (
      currentPath === "/webhook/pago" ||
      currentPath.endsWith("/webhook/pago")
    ) {
      let stripeEvent;

      // 1. VALIDACIÓN DE LA FIRMA DE STRIPE
      const signature =
        event.headers["stripe-signature"] || event.headers["Stripe-Signature"];
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

      if (webhookSecret && signature) {
        try {
          const rawBody = event.isBase64Encoded
            ? Buffer.from(event.body, "base64")
            : Buffer.from(event.body, "utf8");

          stripeEvent = stripe.webhooks.constructEvent(
            rawBody,
            signature,
            webhookSecret
          );
        } catch (err) {
          console.error(
            "❌ Error de validación de firma del Webhook:",
            err.message
          );
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ message: `Webhook Error: ${err.message}` }),
          };
        }
      } else {
        try {
          stripeEvent = JSON.parse(event.body);
        } catch (err) {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ message: "Payload inválido" }),
          };
        }
      }

      // 🛠️ FUNCIÓN HELPER PARA EMITIR BOLETOS E IMPACTAR BD
      const procesarOrdenPagada = async (session) => {
        const orderId = session.metadata ? session.metadata.orderId : null;

        if (!orderId) {
          console.error(
            "❌ No se encontró el orderId en los metadata de Stripe"
          );
          return;
        }

        const orden = await Order.findByPk(orderId);

        // Idempotencia: Evitar duplicación si Stripe reintenta el evento
        if (!orden || orden.status === "pagado") {
          console.log(`ℹ️ Orden ${orderId} ya procesada o inexistente.`);
          return;
        }

        // TRANSACCIÓN ATÓMICA EN LA BASE DE DATOS
        await sequelize.transaction(async (t) => {
          orden.status = "pagado";
          await orden.save({ transaction: t });

          const evento = await Event.findByPk(orden.eventId, {
            transaction: t,
          });

          if (!evento) {
            throw new Error(`Evento con ID ${orden.eventId} no encontrado.`);
          }

          // Generación de folios
          const ticketsAGenerar = [];
          const totalBoletos =
            orden.cantidad_boletos || orden.cantidadBoletos || 0;

          for (let i = 0; i < totalBoletos; i++) {
            const hashUnico = crypto
              .randomBytes(4)
              .toString("hex")
              .toUpperCase();
            const codigoBoleto = `WPZ-${hashUnico}`;

            ticketsAGenerar.push({
              compraId: orden.id,
              eventId: orden.eventId,
              code: codigoBoleto,
              scanned: false,
              scannedAt: null,
            });
          }

          const boletosCreados = await Ticket.bulkCreate(ticketsAGenerar, {
            transaction: t,
            validate: true,
          });

          // Monitoreo de Sold Out
          const totalVendidos = await Ticket.count({
            where: { eventId: evento.id },
            transaction: t,
          });

          const capacidadMaxima = evento.total_boletos || 0;

          if (totalVendidos >= capacidadMaxima) {
            evento.is_sold_out = true;
            await evento.save({ transaction: t });

            console.log(
              `🔥 [SOLD OUT AUTOMÁTICO] Evento "${evento.titulo}" agotado.`
            );

            await Order.update(
              { status: "cancelado_por_cupo" },
              {
                where: {
                  eventId: evento.id,
                  status: ["pendiente", "pendiente_oxxo"],
                },
                transaction: t,
              }
            );
          }

          // Enviar correo con Resend
          await enviarBoletosPorCorreo(
            orden.buyerEmail,
            orden.buyerName,
            boletosCreados,
            evento.titulo
          );
        });
      };

      // 2. MANEJO DE EVENTOS DE STRIPE (TARJETAS + OXXO)

      // A) CHECKOUT COMPLETADO
      if (stripeEvent.type === "checkout.session.completed") {
        const session = stripeEvent.data.object;

        if (session.payment_status === "paid") {
          // 💳 Pago inmediato con tarjeta de crédito/débito
          await procesarOrdenPagada(session);
        } else if (session.payment_status === "unpaid") {
          // 🏪 El cliente generó su ficha de OXXO pero AÚN NO HA PAGADO en la tienda
          const orderId = session.metadata ? session.metadata.orderId : null;
          if (orderId) {
            await Order.update(
              { status: "pendiente_oxxo" },
              { where: { id: orderId } }
            );
            console.log(
              `⏳ Ficha OXXO generada para la orden ${orderId}. Esperando pago en tienda.`
            );
          }
        }
      }

      // B) PAGO ASÍNCRONO EN OXXO CONFIRMADO
      else if (
        stripeEvent.type === "checkout.session.async_payment_succeeded"
      ) {
        // 🏪 OXXO confirmó que el cliente entregó el dinero en el cajero
        const session = stripeEvent.data.object;
        console.log(
          `✅ Pago en OXXO acreditado con éxito para la sesión ${session.id}`
        );
        await procesarOrdenPagada(session);
      }

      // C) FICHA DE OXXO EXPIRADA
      else if (stripeEvent.type === "checkout.session.async_payment_failed") {
        // ❌ El cliente nunca fue a pagar a la tienda OXXO y la ficha venció
        const session = stripeEvent.data.object;
        const orderId = session.metadata ? session.metadata.orderId : null;

        if (orderId) {
          await Order.update(
            { status: "expirado" },
            { where: { id: orderId } }
          );
          console.log(`🔴 Ficha OXXO expirada para la orden ${orderId}`);
        }
      }

      // Respuesta exitosa a Stripe para evitar reintentos
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ received: true }),
      };
    }

    // Si por alguna razón cae aquí y no es ninguna ruta conocida
    return {
      statusCode: 404,
      headers,
      body: JSON.stringify({
        message: "Ruta no encontrada dentro del handler de pagos",
      }),
    };
  } catch (error) {
    console.error("Error en Payments Lambda:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: "Error interno", error: error.message }),
    };
  }
};

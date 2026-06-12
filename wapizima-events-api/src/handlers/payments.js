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
        payment_method_types: ["card"], // Puedes agregar 'oxxo' si la cuenta es de México y está activa
        line_items: [
          {
            price_data: {
              currency: "mxn", // Pesos Mexicanos
              product_data: {
                name: `Boleto(s) para: ${eventData.titulo}`,
                description: `${cantidadBoletos} acceso(s) para el evento.`,
                images: eventData.flyer ? [eventData.flyer] : [],
              },
              unit_amount: Math.round(parseFloat(eventData.costo) * 100),
            },
            quantity: cantidadBoletos,
          },
        ],
        mode: "payment",
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

      // 1. VALIDACIÓN DE LA FIRMA DE STRIPE (Seguridad para evitar peticiones falsas)
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
            webhookSecret,
          );
        } catch (err) {
          console.error(
            "❌ Error de validación de firma del Webhook:",
            err.message,
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

      // 2. ESCUCHAR EL EVENTO DE ÉXITO DE STRIPE
      if (stripeEvent.type === "checkout.session.completed") {
        const session = stripeEvent.data.object;

        // Recuperamos el orderId de los metadata
        const orderId = session.metadata ? session.metadata.orderId : null;

        if (!orderId) {
          console.error(
            "❌ No se encontró el orderId en los metadata de Stripe",
          );
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ message: "orderId ausente en metadata" }),
          };
        }

        // 3. BUSCAR LA ORDEN ASOCIADA
        const orden = await Order.findByPk(orderId);

        // Idempotencia: Evitar duplicación
        if (!orden || orden.status === "pagado") {
          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
              received: true,
              message: "Orden ya procesada o inexistente",
            }),
          };
        }

        // 4. TRANSACCIÓN ATÓMICA EN LA BASE DE DATOS
        await sequelize.transaction(async (t) => {
          // Actualizar estatus de la orden
          orden.status = "pagado";
          await orden.save({ transaction: t });

          // Obtener los datos del evento
          const evento = await Event.findByPk(orden.eventId, {
            transaction: t,
          });

          if (!evento) {
            throw new Error(`Evento con ID ${orden.eventId} no encontrado.`);
          }

          // 5. GENERAR LOS FOLIOS DE LOS BOLETOS
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

          // Inserción masiva de boletos
          const boletosCreados = await Ticket.bulkCreate(ticketsAGenerar, {
            transaction: t,
            validate: true,
          });

          // 🔒 6. MONITOREO EN TIEMPO REAL DEL SOLD OUT (DENTRO DE LA TRANSACCIÓN)
          // Contamos cuántos boletos se han emitido en total para este evento
          const totalVendidos = await Ticket.count({
            where: { eventId: evento.id },
            transaction: t, // Súper importante usar la misma transacción
          });

          const capacidadMaxima = evento.total_boletos || 0;

          // Si llegamos o superamos el límite, impactamos la BD de inmediato
          if (totalVendidos >= capacidadMaxima) {
            evento.is_sold_out = true;
            await evento.save({ transaction: t });

            console.log(
              `🔥 [SOLD OUT AUTOMÁTICO] El evento "${evento.titulo}" se ha agotado.`,
            );

            // 🛑 Cancelamos órdenes 'pendiente' en cola para este evento, limpiando la pasarela
            await Order.update(
              { status: "cancelado_por_cupo" },
              {
                where: {
                  eventId: evento.id,
                  status: "pendiente",
                },
                transaction: t,
              },
            );
          }

          // 7. ENVIAR CORREO CON RESEND (Asíncrono)
          await enviarBoletosPorCorreo(
            orden.buyerEmail,
            orden.buyerName,
            boletosCreados,
            evento.titulo,
          );
        });
      }

      // Respuesta rápida para Stripe
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

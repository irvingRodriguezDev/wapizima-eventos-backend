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

    // -------------------------------------------------------------
    // ENRUTADOR 1: DETECTAR SI ES LA RUTA DE RESERVAR
    // -------------------------------------------------------------
    if (event.path === "/reservar") {
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

      const CAPACIDAD_MAXIMA = 500;
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
        success_url: `https://tu-dominio-react.com/pago-exitoso?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `https://tu-dominio-react.com/evento/${eventData.slug}`,
        // ¡ESTO ES LO MÁS IMPORTANTE!: Guardamos el orderId en los metadata para el Webhook
        metadata: {
          orderId: nuevaOrden.id.toString(),
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
    if (event.path === "/webhook/pago") {
      let stripeEvent;

      // 1. VALIDACIÓN DE LA FIRMA DE STRIPE (Seguridad para evitar peticiones falsas)
      const signature =
        event.headers["stripe-signature"] || event.headers["Stripe-Signature"];
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

      if (webhookSecret && signature) {
        try {
          // En AWS Lambda con API Gateway, event.body viene como string listo para validar
          stripeEvent = stripe.webhooks.constructEvent(
            event.body,
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
        // Modo desarrollo: Si no configuras el STRIPE_WEBHOOK_SECRET localmente, parseamos el JSON directo
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

        // Recuperamos el orderId que guardamos previamente en los metadata de la sesión
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

        // Idempotencia: Si la orden ya está pagada o no existe, respondemos 200 para no duplicar boletos
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

        // 4. TRANSACCIÓN ATÓMICA EN LA BASE DE DATOS (Consistencia total)
        await sequelize.transaction(async (t) => {
          // Actualizar estatus de la orden
          orden.status = "pagado";
          await orden.save({ transaction: t });

          // Obtener los datos del evento para el cuerpo del correo
          const evento = await Event.findByPk(orden.eventId, {
            transaction: t,
          });

          // 5. GENERAR LOS FOLIOS DE LOS BOLETOS (Según la cantidad comprada)
          const ticketsAGenerar = [];
          for (let i = 0; i < orden.cantidadBoletos; i++) {
            // Creamos un código alfanumérico único y corto (Ej: WPZ-E9F3A1B2)
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
            });
          }

          // Inserción masiva de boletos en la tabla boletos_tickets
          const boletosCreados = await Ticket.bulkCreate(ticketsAGenerar, {
            transaction: t,
          });

          // 6. ENVIAR CORREO CON RESEND (Asíncrono)
          await enviarBoletosPorCorreo(
            orden.buyerEmail,
            orden.buyerName,
            boletosCreados,
            evento.titulo,
          );
        });
      }

      // Stripe exige recibir obligatoriamente un HTTP 200 rápido para no reintentar el envío
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

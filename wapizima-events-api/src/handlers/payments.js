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

  const httpMethod =
    event.httpMethod ||
    (event.requestContext &&
      event.requestContext.http &&
      event.requestContext.http.method);

  if (httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  try {
    await sequelize.authenticate();

    // Normalizar la ruta eliminando barras al final
    const rawPath = event.path || event.resource || "";
    const currentPath = rawPath.replace(/\/$/, "");

    // -------------------------------------------------------------
    // ENRUTADOR 1: EMITIR BOLETOS GRATUITOS (PROTEGIDO POR COGNITO)
    // -------------------------------------------------------------
    if (currentPath.endsWith("emitir-boletos-gratis")) {
      if (!event.body) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ message: "Cuerpo de la solicitud faltante" }),
        };
      }

      // 1. Extraer el identificador único de la vendedora autenticada desde Cognito
      const claims = event.requestContext?.authorizer?.claims;
      // Usamos el 'sub' (ID único e inmutable) o el 'email' registrado en Cognito
      const vendedoraId =
        claims?.sub || claims?.email || "vendedora_desconocida";
      const vendedoraNombre = claims?.name || claims?.email || vendedoraId;

      const {
        eventId,
        cantidadBoletos,
        buyerEmail,
        buyerName,
        buyerPhone,
        folioVenta,
        montoCompra,
        saleType,
      } = JSON.parse(event.body);

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

      // 2. Contar la SUMA TOTAL de boletos emitidos previamente por esta vendedora
      const boletosEmitidosVendedora =
        (await Order.sum("cantidad_boletos", {
          where: {
            vendedora: vendedoraId, // Comparamos contra el ID inmutable de Cognito
            status: "completo_gratis", // Solo contamos los boletos emitidos exitosamente
          },
        })) || 0;

      const LIMITE_BOLETOS_VENDEDORA = 10;
      const boletosDisponiblesVendedora =
        LIMITE_BOLETOS_VENDEDORA - boletosEmitidosVendedora;

      // 3. Validar si la petición actual supera el límite de 10
      if (
        boletosEmitidosVendedora + Number(cantidadBoletos) >
        LIMITE_BOLETOS_VENDEDORA
      ) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            message: `Límite superado. Solo tienes ${boletosDisponiblesVendedora} boleto(s) disponible(s) de tu cuota de ${LIMITE_BOLETOS_VENDEDORA}.`,
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
              { status: "completo_gratis" },
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
            message: `Sin lugares suficientes en el evento. Disponibles: ${disponibilidadReal}`,
          }),
        };
      }

      let resultado = await sequelize.transaction(async (t) => {
        const nuevaOrden = await Order.create(
          {
            eventId,
            cantidadBoletos,
            buyerEmail,
            buyerName,
            buyerPhone,
            vendedora: vendedoraId, // Guardamos el identificador inmutable de Cognito
            vendedoraNombre: vendedoraNombre, // Opcional si agregas este campo a tu modelo Order
            montoCompra,
            folioVenta,
            total:
              saleType === "completo_gratis"
                ? 0
                : eventData.costo * cantidadBoletos,
            status: saleType,
            reservedAt: new Date(),
          },
          { transaction: t },
        );

        const ticketsAGenerar = [];
        for (let i = 0; i < cantidadBoletos; i++) {
          const hashUnico = crypto.randomBytes(4).toString("hex").toUpperCase();
          const codigoBoleto = `WPZ-${hashUnico}`;

          ticketsAGenerar.push({
            compraId: nuevaOrden.id,
            eventId: eventId,
            code: codigoBoleto,
            scanned: false,
            scannedAt: null,
          });
        }

        const boletosCreados = await Ticket.bulkCreate(ticketsAGenerar, {
          transaction: t,
          validate: true,
        });

        const totalVendidos = await Ticket.count({
          where: { eventId },
          transaction: t,
        });

        if (totalVendidos >= CAPACIDAD_MAXIMA) {
          eventData.is_sold_out = true;
          await eventData.save({ transaction: t });
        }

        await enviarBoletosPorCorreo(
          buyerEmail,
          buyerName,
          boletosCreados,
          eventData.titulo,
        );

        return {
          orderId: nuevaOrden.id,
          boletosEmitidos: boletosCreados.length,
        };
      });

      return {
        statusCode: 201,
        headers,
        body: JSON.stringify({
          message: "Boletos gratuitos emitidos y enviados exitosamente.",
          orderId: resultado.orderId,
          totalBoletos: resultado.boletosEmitidos,
        }),
      };
    }

    // -------------------------------------------------------------
    // ENRUTADOR 2: RESERVAR (PAGO PÚBLICO CON STRIPE)
    // -------------------------------------------------------------
    if (currentPath.endsWith("/reservar") || currentPath === "/reservar") {
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
              { status: "completo_gratis" },
              { status: "pago_completo_vendedora" },
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

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card", "oxxo"],
        line_items: [
          {
            price_data: {
              currency: "mxn",
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
            orderId: nuevaOrden.id.toString(),
            eventId: eventData.id,
          },
        },
        customer_email: buyerEmail,
        success_url: `${process.env.FRONTEND_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.FRONTEND_URL}/payment-error`,
        metadata: {
          orderId: nuevaOrden.id.toString(),
          buyerName: buyerName,
          buyerEmail: buyerEmail,
          buyerPhone: buyerPhone,
        },
      });

      return {
        statusCode: 201,
        headers,
        body: JSON.stringify({
          message: "Reserva creada con éxito. Redirigiendo a pasarela.",
          orderId: nuevaOrden.id,
          stripeUrl: session.url,
          expiresAt: new Date(nuevaOrden.reservedAt.getTime() + 15 * 60 * 1000),
        }),
      };
    }

    // -------------------------------------------------------------
    // ENRUTADOR 3: WEBHOOK DE PAGO STRIPE (PÚBLICO)
    // -------------------------------------------------------------
    if (currentPath.endsWith("webhook/pago")) {
      let stripeEvent;

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

      const procesarOrdenPagada = async (session) => {
        const orderId = session.metadata ? session.metadata.orderId : null;

        if (!orderId) {
          console.error(
            "❌ No se encontró el orderId en los metadata de Stripe",
          );
          return;
        }

        const orden = await Order.findByPk(orderId);

        if (!orden || orden.status === "pagado") {
          console.log(`ℹ️ Orden ${orderId} ya procesada o inexistente.`);
          return;
        }

        await sequelize.transaction(async (t) => {
          orden.status = "pagado";
          await orden.save({ transaction: t });

          const evento = await Event.findByPk(orden.eventId, {
            transaction: t,
          });

          if (!evento) {
            throw new Error(`Evento con ID ${orden.eventId} no encontrado.`);
          }

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

          const totalVendidos = await Ticket.count({
            where: { eventId: evento.id },
            transaction: t,
          });

          const capacidadMaxima = evento.total_boletos || 0;

          if (totalVendidos >= capacidadMaxima) {
            evento.is_sold_out = true;
            await evento.save({ transaction: t });

            await Order.update(
              { status: "cancelado_por_cupo" },
              {
                where: {
                  eventId: evento.id,
                  status: ["pendiente", "pendiente_oxxo"],
                },
                transaction: t,
              },
            );
          }

          await enviarBoletosPorCorreo(
            orden.buyerEmail,
            orden.buyerName,
            boletosCreados,
            evento.titulo,
          );
        });
      };

      if (stripeEvent.type === "checkout.session.completed") {
        const session = stripeEvent.data.object;

        if (session.payment_status === "paid") {
          await procesarOrdenPagada(session);
        } else if (session.payment_status === "unpaid") {
          const orderId = session.metadata ? session.metadata.orderId : null;
          if (orderId) {
            await Order.update(
              { status: "pendiente_oxxo" },
              { where: { id: orderId } },
            );
          }
        }
      } else if (
        stripeEvent.type === "checkout.session.async_payment_succeeded"
      ) {
        const session = stripeEvent.data.object;
        await procesarOrdenPagada(session);
      } else if (stripeEvent.type === "checkout.session.async_payment_failed") {
        const session = stripeEvent.data.object;
        const orderId = session.metadata ? session.metadata.orderId : null;

        if (orderId) {
          await Order.update(
            { status: "expirado" },
            { where: { id: orderId } },
          );
        }
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ received: true }),
      };
    }

    return {
      statusCode: 404,
      headers,
      body: JSON.stringify({
        message: `Ruta no encontrada dentro del handler de pagos: ${currentPath}`,
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

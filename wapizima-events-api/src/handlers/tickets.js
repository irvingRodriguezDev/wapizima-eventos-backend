const { Op } = require("sequelize");
const sequelize = require("../config/database");
const Ticket = require("../models/Ticket");
const Order = require("../models/Order");
const Event = require("../models/Event");
if (!Ticket.associations.evento) {
  Ticket.belongsTo(Event, { foreignKey: "eventId", as: "evento" });
  Event.hasMany(Ticket, { foreignKey: "eventId", as: "tickets" });
}
// 💡 NUEVA RELACIÓN: Un boleto pertenece a una orden de compra
if (!Ticket.associations.orden) {
  Ticket.belongsTo(Order, { foreignKey: "compraId", as: "orden" });
  Order.hasMany(Ticket, { foreignKey: "compraId", as: "tickets" });
}
exports.handler = async (event) => {
  // Configuración de Headers globales (Incluyendo soporte completo de métodos)
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,PUT,OPTIONS,POST",
    "Access-Control-Allow-Headers":
      "Content-Type,X-Amz-Date,Authorization,X-Api-Key,Stripe-Signature",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  // 💡 Extraemos la ruta limpia de AWS para el enrutador de pases digitales
  const path = event.path || "";

  try {
    await sequelize.authenticate();

    // -------------------------------------------------------------
    // ACCIÓN 1: BUSCAR BOLETOS VIGENTES POR CORREO (GET /ticket/search?email=...)
    // -------------------------------------------------------------
    if (event.httpMethod === "GET" && path.endsWith("/ticket/search")) {
      const email = event.queryStringParameters?.email;

      if (!email) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            message: "El correo electrónico (email) es requerido.",
          }),
        };
      }

      // Buscamos los boletos directamente filtrando por el email de la orden y que no estén usados
      const boletosVigentes = await Ticket.findAll({
        where: {
          scanned: false, // 💡 Filtramos solo los boletos vigentes (no usados)
        },
        include: [
          {
            model: Order,
            as: "orden",
            where: {
              buyerEmail: email,
              status: "pagado", // 🔒 Solo de órdenes confirmadas y pagadas
            },
            attributes: ["id", "buyerName", "buyerEmail"], // Evitamos traer datos basura
          },
          {
            model: Event,
            as: "evento",
            attributes: ["id", "titulo", "fecha", "lugar", "flyer"], // Para pintar la tarjeta premium en el front
          },
        ],
      });

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          status: "success",
          tickets: boletosVigentes,
        }),
      };
    }

    // -------------------------------------------------------------
    // ACCIÓN 2: VALIDAR Y ESCANEAR BOLETO (POST /buscar-boletos)
    // -------------------------------------------------------------
    if (event.httpMethod === "POST" && path.endsWith("/ticket/validate")) {
      // Parseamos el body que manda el frontend
      const body = JSON.parse(event.body || "{}");
      const { code } = body;

      if (!code) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            message: "El código del boleto es requerido en el body.",
          }),
        };
      }

      const boleto = await Ticket.findOne({ where: { code } });

      if (!boleto) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({
            valid: false,
            message: "Boleto no encontrado",
          }),
        };
      }

      if (boleto.scanned) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            valid: false,
            message: `Este boleto YA FUE USADO el ${boleto.scannedAt}`,
            scannedAt: boleto.scannedAt,
          }),
        };
      }

      // 🔒 Marcamos como usado con seguridad
      boleto.scanned = true;
      boleto.scannedAt = new Date();
      await boleto.save();

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          valid: true,
          message: "Acceso concedido. Boleto registrado con éxito.",
          ticket: boleto,
        }),
      };
    }

    // -------------------------------------------------------------
    // ACCIÓN 3: OBTENER DETALLE DE TICKET CON SU EVENTO (/ticket/{code})
    // -------------------------------------------------------------
    if (path.includes("/ticket/") && event.httpMethod === "GET") {
      // Capturamos el Path Parameter mapeado por API Gateway ({code})
      const ticketCode = event.pathParameters?.code;

      if (!ticketCode) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            message: "El código del boleto es requerido en la URL.",
          }),
        };
      }

      // Buscamos el ticket e incluimos la relación de su Evento (alias: 'evento')
      const ticket = await Ticket.findOne({
        where: { code: ticketCode },
        include: [
          {
            model: Event,
            as: "evento",
            attributes: [
              "id",
              "titulo",
              "fecha",
              "lugar",
              "flyer",
              "descripcion",
            ],
          },
          {
            model: Order,
            as: "orden", // 👈 El alias que acabamos de definir arriba
            attributes: [
              "id",
              "buyerName", // Asegúrate de que estos nombres coincidan con los atributos
              "buyerEmail", // que definiste en tu modelo Order (ej: buyer_name / buyerName)
              "status",
            ],
          },
        ],
      });

      if (!ticket) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({
            message: "Boleto no encontrado o código inválido.",
          }),
        };
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          status: "success",
          data: ticket,
        }),
      };
    }

    // Si entra una petición que no concuerda con ninguna estructura anterior
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({
        message: "Ruta o parámetros de búsqueda inválidos.",
      }),
    };
  } catch (error) {
    console.error("❌ Error en Tickets Lambda:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: "Error interno", error: error.message }),
    };
  }
};

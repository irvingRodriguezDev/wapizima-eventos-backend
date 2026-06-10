const { Op } = require("sequelize");
const sequelize = require("../config/database");
const Ticket = require("../models/Ticket");
const Order = require("../models/Order");
const Event = require("../models/Event");

exports.handler = async (event) => {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,PUT,OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type,X-Amz-Date,Authorization,X-Api-Key",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  try {
    await sequelize.authenticate();

    // -------------------------------------------------------------
    // ACCIÓN 1: BUSCAR BOLETOS POR CORREO (GET /buscar-boletos?email=...)
    // -------------------------------------------------------------
    if (
      event.httpMethod === "GET" &&
      event.queryStringParameters &&
      event.queryStringParameters.email
    ) {
      const { email } = event.queryStringParameters;

      // Buscamos todas las órdenes pagadas de ese correo
      const ordenes = await Order.findAll({
        where: { buyerEmail: email, status: "pagado" },
        include: [{ model: Event, as: "Evento" }], // Si tienes configurada la relación
      });

      const ordenIds = ordenes.map((o) => o.id);

      // Buscamos los boletos físicos de esas órdenes
      const boletos = await Ticket.findAll({
        where: { compraId: { [Op.in]: ordenIds } },
      });

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ tickets: boletos }),
      };
    }

    // -------------------------------------------------------------
    // ACCIÓN 2: VALIDAR / ESCANEAR BOLETO (GET /buscar-boletos?code=...)
    // -------------------------------------------------------------
    if (
      event.httpMethod === "GET" &&
      event.queryStringParameters &&
      event.queryStringParameters.code
    ) {
      const { code } = event.queryStringParameters;

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

      // Si el staff solo está "consultando" el QR sin validarlo aún, regresamos éxito
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          valid: true,
          message: "Boleto válido listo para acceso",
          ticket: boleto,
        }),
      };
    }

    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({
        message: "Parámetros de búsqueda inválidos (usa email o code)",
      }),
    };
  } catch (error) {
    console.error("Error en Tickets Lambda:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: "Error interno", error: error.message }),
    };
  }
};

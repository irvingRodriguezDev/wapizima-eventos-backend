const sequelize = require("../config/database");
const Event = require("../models/Event");

exports.handler = async (event) => {
  // Encabezados básicos para evitar problemas de CORS con React (Vite)
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type,X-Amz-Date,Authorization,X-Api-Key",
  };

  // Manejar el preflight de CORS (solicitudes OPTIONS que hace el navegador)
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  try {
    // Asegurar la conexión a la base de datos
    await sequelize.authenticate();

    // 1. DETALLE DEL EVENTO: Si viene el parámetro {slug} en la URL
    if (event.pathParameters && event.pathParameters.slug) {
      const { slug } = event.pathParameters;

      const eventDetail = await Event.findOne({ where: { slug } });

      if (!eventDetail) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ message: "Evento no encontrado" }),
        };
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(eventDetail),
      };
    }

    // 2. INDEX DE EVENTOS: Si no hay parámetros, listar todos los eventos activos
    // Tip de optimización: Traer solo los eventos cuya fecha sea mayor o igual a hoy
    const { Op } = require("sequelize");
    const events = await Event.findAll({
      where: {
        fecha: {
          [Op.gte]: new Date(), // Solo eventos futuros o de hoy
        },
      },
      order: [["fecha", "ASC"]], // Ordenar por el más cercano primero
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(events),
    };
  } catch (error) {
    console.error("Error en Events Lambda:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        message: "Error interno del servidor",
        error: error.message,
      }),
    };
  }
};

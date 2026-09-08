// src/functions/events/getEvents.js
const { Event } = require("../../../models");
const sendResponse = require("../../../utils/response");

module.exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;

  try {
    const eventos = await Event.findAll({
      where: {
        visibleWeb: true,
      },
      attributes: [
        "id",
        "titulo",
        "slug",
        "lugar",
        "fecha",
        "costo",
        "flyer",
        "isSoldOut",
        "tieneMapa",
      ],
      order: [["fecha", "ASC"]],
    });

    return sendResponse(200, {
      success: true,
      data: eventos,
    });
  } catch (error) {
    console.error("Error al obtener eventos:", error);
    return sendResponse(500, {
      success: false,
      message: "Error interno al consultar los eventos.",
    });
  }
};

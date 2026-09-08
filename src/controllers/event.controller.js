// src/controllers/events.controller.js
const { Event } = require("../models");
const slugify = (text) => {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[\s\W-]+/g, "-")
    .replace(/^-+|-+$/g, "");
};

const createEvent = async (req, res) => {
  try {
    const {
      titulo,
      descripcion,
      lugar,
      direccion,
      fecha,
      costo,
      montoApartado,
      flyer,
      tieneMapa,
      capacidadTotal,
      visibleWeb,
    } = req.body;

    // Validación básica de campos requeridos
    if (!titulo || !fecha || !costo) {
      return res.status(400).json({
        success: false,
        message: "Los campos título, fecha y costo son obligatorios.",
      });
    }

    const slug = slugify(titulo);

    // Verificar si ya existe un evento con el mismo slug
    const existingEvent = await Event.findOne({ where: { slug } });
    if (existingEvent) {
      return res.status(409).json({
        success: false,
        message: "Ya existe un evento registrado con un título similar.",
      });
    }

    // Crear el nuevo evento
    const newEvent = await Event.create({
      titulo,
      slug,
      descripcion,
      lugar,
      direccion,
      fecha,
      costo,
      montoApartado: montoApartado || 0,
      flyer,
      tieneMapa: tieneMapa || false,
      capacidadTotal: capacidadTotal || 0,
      visibleWeb: visibleWeb !== undefined ? visibleWeb : true,
      isSoldOut: false,
    });

    return res.status(201).json({
      success: true,
      message: "Evento creado exitosamente.",
      data: newEvent,
    });
  } catch (error) {
    console.error("Error al crear evento:", error);
    return res.status(500).json({
      success: false,
      message: "Error interno al registrar el evento.",
    });
  }
};
const getEvents = async (req, res) => {
  try {
    const eventos = await Event.findAll({
      where: { visibleWeb: true },
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

    return res.status(200).json({
      success: true,
      data: eventos,
    });
  } catch (error) {
    console.error("Error al obtener eventos:", error);
    return res.status(500).json({
      success: false,
      message: "Error interno al consultar los eventos.",
    });
  }
};

module.exports = {
  getEvents,
  createEvent,
};

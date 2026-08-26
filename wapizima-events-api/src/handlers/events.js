const sequelize = require("../config/database");
const Event = require("../models/Event");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { Op } = require("sequelize");
const Ticket = require("../models/Ticket");

// Inicializar el cliente de S3
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
});
const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME;

exports.handler = async (event) => {
  // Encabezados estandarizados para CORS con tu ecosistema React + Vite
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*", // Apuntamos directo a tu origen para máxima seguridad
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
  };

  try {
    // Asegurar conexión activa al pool de RDS antes de procesar la lógica
    await sequelize.authenticate();

    const method = event.httpMethod;
    // Manejar el preflight de CORS de forma inmediata
    if (method === "OPTIONS") {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ message: "CORS preflight lookin good" }),
      };
    }
    const path = event.path || event.requestContext?.resourcePath || "";

    // ==========================================
    // 1. RUTAS DE ESCRITURA Y ACCIONES (POST)
    // ==========================================
    if (method === "POST") {
      const body = JSON.parse(event.body || "{}");

      // 2.1 GENERAR URL FIRMADA (PRESIGNED URL) PARA EL FLYER
      // Detectamos si la petición va dirigida a la ruta de subida
      if (
        path.includes("/upload-url") ||
        (event.pathParameters && event.pathParameters.proxy === "upload-url")
      ) {
        const { filename, filetype } = body;

        if (!filename || !filetype) {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({
              message: "filename y filetype son requeridos.",
            }),
          };
        }

        // Estructura limpia de carpetas dentro del bucket de S3 con timestamp único
        const fileKey = `flyers/${Date.now()}-${filename}`;

        const command = new PutObjectCommand({
          Bucket: BUCKET_NAME,
          Key: fileKey,
          ContentType: filetype,
        });

        // Generar enlace temporal con una validez óptima de 5 minutos
        const uploadUrl = await getSignedUrl(s3Client, command, {
          expiresIn: 300,
        });
        const finalAssetUrl = `https://${BUCKET_NAME}.s3.amazonaws.com/${fileKey}`;

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ uploadUrl, finalAssetUrl }),
        };
      }

      // 2.2 CREACIÓN DEL EVENTO EN BASE DE DATOS
      const {
        titulo,
        descripcion,
        fecha,
        costo,
        lugar,
        total_boletos,
        flyer_url,
        slug,
        mapa,
        visible_web,
      } = body;

      // Validaciones básicas de negocio
      if (!titulo || !fecha || !flyer_url || !slug) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            message:
              "Campos obligatorios faltantes (titulo, fecha, flyer_url, slug).",
          }),
        };
      }

      // Validar que el slug no esté duplicado antes de intentar insertar
      const existingSlug = await Event.findOne({ where: { slug } });
      if (existingSlug) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            message: "El slug ya se encuentra registrado para otro evento.",
          }),
        };
      }

      const newEvent = await Event.create({
        titulo,
        descripcion,
        fecha: fecha, // Se mapea al campo de tu base de datos
        lugar,
        costo,
        mapa,
        total_boletos,
        flyer: flyer_url,
        status: "active",
        slug,
        visible_web,
      });

      return {
        statusCode: 201,
        headers,
        body: JSON.stringify({
          message: "Evento dado de alta exitosamente.",
          event: newEvent,
        }),
      };
    }

    // =========================================================
    // 2. RUTAS DE LECTURA (GET)
    // =========================================================
    if (method === "GET") {
      const proxyParam = event.pathParameters?.proxy;

      // CASO A: LISTAR TODOS LOS EVENTOS
      // Si el proxy no existe, está vacío, o es una barra limpia, el frente quiere la lista completa
      if (!proxyParam || proxyParam === "" || proxyParam === "/") {
        try {
          // 🚀 Tu consulta limpia y rápida en /src/handlers/events.js
          const eventos = await Event.findAll({
            where: {
              fecha: { [Op.gte]: new Date() },
              visible_web: { [Op.eq]: true },
            },
            // 💡 QUITAMOS EL "include: [Ticket]" porque 'isSoldOut' ya se lee directo de la tabla
            order: [["fecha", "ASC"]],
          });

          // Ya no necesitas mapear ni contar boletos aquí, el JSON ya lleva "isSoldOut: true/false" desde la BD
          return {
            statusCode: 200,
            headers,
            body: JSON.stringify(eventos),
          };
        } catch (error) {
          console.error("Error al listar eventos:", error);
          return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: "Error al listar." }),
          };
        }
      }

      if (!proxyParam || proxyParam === "" || proxyParam === "available-free") {
        try {
          // 🚀 Tu consulta limpia y rápida en /src/handlers/events.js
          const eventos = await Event.findAll({
            where: {
              fecha: { [Op.gte]: new Date() },
              visible_web: { [Op.eq]: false },
            },
            // 💡 QUITAMOS EL "include: [Ticket]" porque 'isSoldOut' ya se lee directo de la tabla
            order: [["fecha", "ASC"]],
          });

          // Ya no necesitas mapear ni contar boletos aquí, el JSON ya lleva "isSoldOut: true/false" desde la BD
          return {
            statusCode: 200,
            headers,
            body: JSON.stringify(eventos),
          };
        } catch (error) {
          console.error("Error al listar eventos:", error);
          return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: "Error al listar." }),
          };
        }
      }

      // CASO B: DETALLE DE UN EVENTO POR SLUG
      // Si llegó hasta aquí y "proxyParam" tiene texto, asumimos con certeza que es el slug
      try {
        const eventDetail = await Event.findOne({
          where: { slug: proxyParam },
        });

        if (!eventDetail) {
          return {
            statusCode: 404,
            headers,
            body: JSON.stringify({ message: "Evento no encontrado." }),
          };
        }

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify(eventDetail),
        };
      } catch (error) {
        console.error("Error al buscar el slug:", error);
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ error: "Error en el servidor." }),
        };
      }
    }

    // Si entra un método no soportado en esta configuración
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ message: "Método no permitido." }),
    };
  } catch (error) {
    console.error("Error crítico en Events Lambda:", error);
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

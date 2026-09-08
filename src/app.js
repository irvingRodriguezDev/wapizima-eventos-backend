require("dotenv").config();
process.env.TZ = "America/Mexico_City";
const express = require("express");
const http = require("http");
const sequelize = require("./config/database");
const routes = require("./routes");
const cors = require("cors");

const app = express();

// Middlewares globales
const corsOptions = {
  origin: ["http://localhost:5173"],
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
};
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});
app.use(cors(corsOptions));
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true }));
const httpServer = http.createServer(app);
// Importar rutas
app.use("/api", routes);
// Middleware para manejo de rutas no encontradas (404)
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    return res.status(400).json({
      error: "Petición rechazada: El cuerpo enviado no es un JSON válido.",
    });
  }
  next(err);
  res.status(404).json({ msg: "Ruta no encontrada" });
});

const PORT = process.env.PORT || 3000;

// Verificar conexión a la BD e iniciar servidor
sequelize
  .sync({ alter: false })
  .then(async () => {
    console.log("✅ Base de datos sincronizada");
    // await seedData();
    // initCronJobs();
    httpServer.listen(PORT, "0.0.0.0", () => {
      console.log(`🌐 Servidor corriendo en puerto ${PORT}`);
    });
  })
  .catch((err) => console.error("❌ Error DB:", err));

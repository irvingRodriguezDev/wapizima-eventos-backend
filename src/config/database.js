const { Sequelize } = require("sequelize");

// Resuelve el path desde env o fallback local

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    port: 3306,
    dialect: "mysql",
    logging: false,
    timezone: "-06:00",

    retry: {
      match: [/read ECONNRESET/, /ETIMEDOUT/, /EADDRNOTAVAIL/, /ECONNREFUSED/],
    },

    pool: {
      max: 15, // 6 tareas × 15 = 90 conexiones máx, margen seguro para db.t4g.small
      min: 2, // no desperdicies conexiones en idle
      acquire: 60000,
      idle: 10000,
    },
  },
);

module.exports = sequelize;

const { Sequelize } = require("sequelize");

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,
    dialect: "mysql",
    logging: false,
    dialectOptions: {
      dateStrings: true,
      typeCast: true,
    },
    retry: {
      match: [/read ECONNRESET/, /ETIMEDOUT/, /EADDRNOTAVAIL/, /ECONNREFUSED/],
    },
    pool: {
      max: 15,
      min: 2,
      acquire: 60000,
      idle: 10000,
    },
  },
);

module.exports = sequelize;

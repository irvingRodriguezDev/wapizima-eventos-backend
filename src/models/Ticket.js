const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const Ticket = sequelize.define(
  "Ticket",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    ventaId: {
      type: DataTypes.INTEGER,
      field: "venta_id",
      allowNull: false,
    },
    clientId: {
      type: DataTypes.INTEGER,
      field: "client_id",
      allowNull: false,
    },
    code: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    tipoBoleto: {
      type: DataTypes.ENUM("general", "cortesia", "numerado", "vip"),
      field: "tipo_boleto",
      defaultValue: "general",
    },
    asientoId: {
      type: DataTypes.INTEGER,
      field: "asiento_id",
      allowNull: true,
    },
    scanned: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    scannedAt: {
      type: DataTypes.DATE,
      field: "scanned_at",
      allowNull: true,
    },
  },
  {
    tableName: "boletos",
    timestamps: true,
    underscored: true,
  },
);

module.exports = Ticket;

const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const Sale = sequelize.define(
  "Sale",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    folio: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    clientId: {
      type: DataTypes.INTEGER,
      field: "client_id",
      allowNull: false,
    },
    eventId: {
      type: DataTypes.INTEGER,
      field: "event_id",
      allowNull: false,
    },
    cantidad: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    total: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    tipoVenta: {
      type: DataTypes.ENUM("total", "apartado", "cortesia"),
      field: "tipo_venta",
      allowNull: false,
    },
    statusPago: {
      type: DataTypes.ENUM(
        "pendiente",
        "apartado",
        "completado",
        "cancelado",
        "expirado",
      ),
      field: "status_pago",
      allowNull: false,
      defaultValue: "pendiente",
    },
    montoPagado: {
      type: DataTypes.DECIMAL(10, 2),
      field: "monto_pagado",
      defaultValue: 0.0,
    },
    montoPendiente: {
      type: DataTypes.DECIMAL(10, 2),
      field: "monto_pendiente",
      defaultValue: 0.0,
    },
    esCortesia: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: "es_cortesia",
    },
    userId: {
      type: DataTypes.STRING,
      field: "user_id",
      allowNull: true,
    },
    userName: {
      type: DataTypes.STRING,
      field: "user_name",
      allowNull: true,
    },
    reservedAt: {
      type: DataTypes.DATE,
      field: "reserved_at",
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: "ventas",
    timestamps: true,
    underscored: true,
  },
);

module.exports = Sale;

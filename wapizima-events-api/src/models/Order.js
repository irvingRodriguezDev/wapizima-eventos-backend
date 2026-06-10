const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const Order = sequelize.define(
  "Order",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    eventId: { type: DataTypes.INTEGER, field: "event_id", allowNull: false },
    cantidadBoletos: {
      type: DataTypes.INTEGER,
      field: "cantidad_boletos",
      allowNull: false,
    },
    buyerEmail: {
      type: DataTypes.STRING,
      field: "buyer_email",
      allowNull: false,
    },
    buyerName: {
      type: DataTypes.STRING,
      field: "buyer_name",
      allowNull: false,
    },
    buyerPhone: {
      type: DataTypes.STRING,
      field: "buyer_phone",
      allowNull: false,
    },
    total: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    status: {
      type: DataTypes.ENUM("pendiente", "pagado", "expirado"),
      defaultValue: "pendiente",
    },
    reservedAt: {
      type: DataTypes.DATE,
      field: "reserved_at",
      allowNull: false,
    },
  },
  {
    tableName: "compras_ordenes",
    underscored: true,
  },
);

module.exports = Order;

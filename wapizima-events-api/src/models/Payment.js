const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const Payment = sequelize.define(
  "Payment",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    ventaId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "venta_id",
    },
    monto: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    metodoPago: {
      type: DataTypes.ENUM("card", "oxxo"),
      field: "metodo_pago",
      allowNull: false,
    },
    paymentIntentId: {
      type: DataTypes.STRING,
      field: "payment_intent_id",
      allowNull: true,
    },
    tipoPago: {
      type: DataTypes.ENUM("total", "apartado", "liquidacion"),
      field: "tipo_pago",
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM("pendiente", "completado", "expirado", "cancelado"),
      allowNull: false,
      defaultValue: "pendiente",
    },
  },
  {
    tableName: "pagos",
    timestamps: true,
    underscored: true,
  },
);

module.exports = Payment;

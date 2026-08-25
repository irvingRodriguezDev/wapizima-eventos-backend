const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const Payment = sequelize.define(
  "Payment",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    orderId: { type: DataTypes.INTEGER, allowNull: false },
    amount: { type: DataTypes.DECIMAL },
    paymentMethod: { type: DataTypes.STRING },
    referenceNumber: { type: DataTypes.STRING },
  },
  {
    tableName: "payments",
    timestamps: true,
    underscored: true,
  }
);

module.exports = Payment;

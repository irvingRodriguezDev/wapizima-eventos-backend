const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const Ticket = sequelize.define(
  "Ticket",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    compraId: { type: DataTypes.INTEGER, field: "compra_id", allowNull: false },
    eventId: { type: DataTypes.INTEGER, field: "event_id", allowNull: false },
    code: { type: DataTypes.STRING, allowNull: false, unique: true },
    scanned: { type: DataTypes.BOOLEAN, defaultValue: false },
    scannedAt: { type: DataTypes.DATE, field: "scanned_at" },
  },
  {
    tableName: "boletos_tickets",
    underscored: true,
  },
);

module.exports = Ticket;

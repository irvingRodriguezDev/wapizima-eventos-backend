const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const Seat = sequelize.define(
  "Seat",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    eventId: {
      type: DataTypes.INTEGER,
      field: "event_id",
      allowNull: false,
    },
    zona: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    fila: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    numero: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    precio: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    estado: {
      type: DataTypes.ENUM("disponible", "bloqueado", "apartado", "vendido"),
      defaultValue: "disponible",
    },
    bloqueadoHasta: {
      type: DataTypes.DATE, // Cambiado de TIME a DATE para manejar Timestamps
      field: "bloqueado_hasta",
      allowNull: true,
    },
    reservaTemporalId: {
      type: DataTypes.STRING,
      field: "reserva_temporal_id",
      allowNull: true,
    },
  },
  {
    tableName: "asientos",
    timestamps: true,
    underscored: true,
    paranoid: true,
  },
);

module.exports = Seat;

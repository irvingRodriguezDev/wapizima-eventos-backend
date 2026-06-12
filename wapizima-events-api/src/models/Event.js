const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const Event = sequelize.define(
  "Event",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    titulo: { type: DataTypes.STRING, allowNull: false },
    slug: { type: DataTypes.STRING, allowNull: false, unique: true },
    fecha: { type: DataTypes.DATE, allowNull: false },
    descripcion: { type: DataTypes.TEXT, allowNull: true },
    mapa: { type: DataTypes.TEXT, allowNull: false },
    lugar: { type: DataTypes.TEXT, allowNull: false },
    costo: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    total_boletos: { type: DataTypes.INTEGER, allowNull: false },
    flyer: { type: DataTypes.STRING, allowNull: true },
    is_sold_out: { type: DataTypes.BOOLEAN, defaultValue: false },
  },
  {
    tableName: "eventos",
    timestamps: true,
    underscored: true,
  },
);

module.exports = Event;

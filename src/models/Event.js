const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const Event = sequelize.define(
  "Event",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    titulo: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    slug: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    lugar: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    fecha: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    descripcion: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    mapa: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    totalBoletos: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "total_boletos",
    },
    costo: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    flyer: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    isSoldOut: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: "is_sold_out",
    },
    tieneMapa: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: "tiene_mapa",
    },
    mapaConfig: {
      type: DataTypes.JSON,
      field: "mapa_config",
    },
    visibleWeb: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: "visible_web",
    },
  },
  {
    tableName: "eventos",
    timestamps: true,
    underscored: true,
    paranoid: true,
  },
);

module.exports = Event;

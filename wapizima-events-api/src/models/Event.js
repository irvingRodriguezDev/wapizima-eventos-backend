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
    fecha: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    descripcion: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    costo: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    flyer: {
      type: DataTypes.STRING,
      allowNull: true, // Aquí se guardará la URL de S3
    },
  },
  {
    tableName: "eventos",
    timestamps: true, // Crea createdAt y updatedAt automáticamente
    underscored: true, // Para que use snake_case en la BD (created_at)
  },
);

module.exports = Event;

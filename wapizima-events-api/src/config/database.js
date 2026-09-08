const { Sequelize } = require("sequelize");

// Guardar la instancia en el scope global del contenedor Lambda
let sequelizeInstance = null;

const getSequelizeInstance = () => {
  if (sequelizeInstance) {
    return sequelizeInstance;
  }

  sequelizeInstance = new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASSWORD,
    {
      host: process.env.DB_HOST,
      port: process.env.DB_PORT || 3306,
      dialect: "mysql",
      logging: process.env.NODE_ENV !== "production" ? console.log : false,

      // Deshabilitar la verificación de conexión en cada inicio (acelera el startup)
      benchmark: false,

      // Ajustes del Pool optimizados para Lambda
      pool: {
        max: 2, // Limitar a 1-2 conexiones por contenedor Lambda para evitar exhaustar MySQL
        min: 0,
        acquire: 10000, // Reducir tiempo de espera a 10s (evita colapsar el timeout de Lambda)
        idle: 3000, // Desconectar conexiones inactivas rápido para liberar recursos en MySQL
        evict: 1000,
      },
      dialectOptions: {
        // Mantener la conexión TCP viva a nivel de Socket
        keepAlive: true,
        connectTimeout: 5000, // Timeout de conexión rápida (5s max)
      },
    },
  );

  return sequelizeInstance;
};

const sequelize = getSequelizeInstance();

module.exports = sequelize;

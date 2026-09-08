const sequelize = require("../config/database");

// Importación de Modelos
const Event = require("./Event");
const Client = require("./Client");
const Sale = require("./Sale");
const Payment = require("./Payment");
const Ticket = require("./Ticket");
const Seat = require("./Seat");

// ==========================================
// DEFINICIÓN DE RELACIONES
// ==========================================

// 1. EVENTO <-> VENTAS (Un evento tiene muchas ventas)
Event.hasMany(Sale, { foreignKey: "eventId", as: "ventas" });
Sale.belongsTo(Event, { foreignKey: "eventId", as: "evento" });

// 2. CLIENTE <-> VENTAS (Un cliente puede tener muchas ventas)
Client.hasMany(Sale, { foreignKey: "clientId", as: "ventas" });
Sale.belongsTo(Client, { foreignKey: "clientId", as: "cliente" });

// 3. VENTA <-> PAGOS (Una venta puede tener varios pagos: anticipo, liquidación)
Sale.hasMany(Payment, { foreignKey: "ventaId", as: "pagos" });
Payment.belongsTo(Sale, { foreignKey: "ventaId", as: "venta" });

// 4. VENTA <-> BOLETOS (Una venta genera uno o varios boletos)
Sale.hasMany(Ticket, { foreignKey: "ventaId", as: "boletos" });
Ticket.belongsTo(Sale, { foreignKey: "ventaId", as: "venta" });

// 5. CLIENTE <-> BOLETOS (Un cliente tiene muchos boletos a su nombre)
Client.hasMany(Ticket, { foreignKey: "clientId", as: "boletos" });
Ticket.belongsTo(Client, { foreignKey: "clientId", as: "cliente" });

// 6. EVENTO <-> ASIENTOS (Un evento con mapa tiene muchos asientos)
Event.hasMany(Seat, { foreignKey: "eventId", as: "asientos" });
Seat.belongsTo(Event, { foreignKey: "eventId", as: "evento" });

// 7. ASIENTO <-> BOLETO (Un asiento de mapa puede vincularse a un boleto)
Seat.hasOne(Ticket, { foreignKey: "asientoId", as: "boleto" });
Ticket.belongsTo(Seat, { foreignKey: "asientoId", as: "asiento" });

module.exports = {
  sequelize,
  Event,
  Client,
  Sale,
  Payment,
  Ticket,
  Seat,
};

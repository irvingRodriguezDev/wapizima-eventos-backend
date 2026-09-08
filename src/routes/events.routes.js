// src/routes/events.routes.js
const { Router } = require("express");
const { getEvents } = require("../controllers/event.controller");

const router = Router();

// GET /api/eventos
router.get("/", getEvents);

module.exports = router;

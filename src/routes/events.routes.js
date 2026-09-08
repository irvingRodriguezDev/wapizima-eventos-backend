// src/routes/events.routes.js
const { Router } = require("express");
const { getEvents, createEvent } = require("../controllers/event.controller");

const router = Router();

// GET /api/eventos
router.post("/", createEvent);
router.get("/", getEvents);

module.exports = router;

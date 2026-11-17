const express = require("express");
const db = require("../db");
const { requireAuth } = require("../auth");

const router = express.Router();

const PROMO_CODES = { PODII10: 10, SALE100: 0 };

// GET /api/tickets — квитки поточного користувача
router.get("/", requireAuth, (req, res) => {
  const rows = db
    .prepare(`
      SELECT t.*, e.title AS event_title, e.date_label, e.place, e.city, e.slug AS event_slug
      FROM tickets t
      JOIN events e ON e.id = t.event_id
      WHERE t.user_id = ?
      ORDER BY t.created_at DESC
    `)
    .all(req.user.id);
  res.json({ tickets: rows });
});

// POST /api/tickets — оформлення замовлення (купівля квитка)
router.post("/", requireAuth, (req, res) => {
  const { eventId, qty, promoCode } = req.body || {};
  const quantity = Math.max(1, Math.min(10, Number(qty) || 1));

  const event = db.prepare("SELECT * FROM events WHERE id = ?").get(eventId);
  if (!event) return res.status(404).json({ error: "Захід не знайдено." });
  if (event.status !== "published") {
    return res.status(400).json({ error: "Квитки на цей захід наразі недоступні." });
  }

  let discountPct = 0;
  let normalizedPromo = null;
  if (promoCode) {
    normalizedPromo = String(promoCode).trim().toUpperCase();
    if (!Object.prototype.hasOwnProperty.call(PROMO_CODES, normalizedPromo)) {
      return res.status(400).json({ error: "Такого промокоду не знайдено." });
    }
    discountPct = PROMO_CODES[normalizedPromo];
  }

  const subtotal = event.price * quantity;
  const total = Math.round(subtotal * (1 - discountPct / 100));

  const info = db
    .prepare(`
      INSERT INTO tickets (user_id, event_id, qty, promo_code, discount_pct, total, status)
      VALUES (?, ?, ?, ?, ?, ?, 'paid')
    `)
    .run(req.user.id, event.id, quantity, normalizedPromo, discountPct, total);

  const ticket = db
    .prepare(`
      SELECT t.*, e.title AS event_title, e.date_label, e.place, e.city
      FROM tickets t JOIN events e ON e.id = t.event_id WHERE t.id = ?
    `)
    .get(info.lastInsertRowid);

  res.status(201).json({ ticket });
});

// GET /api/tickets/:id — один квиток (лише власник)
router.get("/:id", requireAuth, (req, res) => {
  const ticket = db
    .prepare(`
      SELECT t.*, e.title AS event_title, e.date_label, e.place, e.city, e.slug AS event_slug
      FROM tickets t JOIN events e ON e.id = t.event_id
      WHERE t.id = ?
    `)
    .get(req.params.id);
  if (!ticket) return res.status(404).json({ error: "Квиток не знайдено." });
  if (ticket.user_id !== req.user.id) {
    return res.status(403).json({ error: "Це не ваш квиток." });
  }
  res.json({ ticket });
});

module.exports = router;

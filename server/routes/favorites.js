const express = require("express");
const db = require("../db");
const { requireAuth } = require("../auth");

const router = express.Router();

// GET /api/favorites — список обраних заходів поточного користувача
router.get("/", requireAuth, (req, res) => {
  const rows = db
    .prepare(`
      SELECT e.* FROM favorites f
      JOIN events e ON e.id = f.event_id
      WHERE f.user_id = ?
      ORDER BY f.created_at DESC
    `)
    .all(req.user.id);
  res.json({ favorites: rows });
});

// POST /api/favorites/:eventId — додати в обране
router.post("/:eventId", requireAuth, (req, res) => {
  const event = db.prepare("SELECT id FROM events WHERE id = ?").get(req.params.eventId);
  if (!event) return res.status(404).json({ error: "Захід не знайдено." });
  db.prepare("INSERT OR IGNORE INTO favorites (user_id, event_id) VALUES (?, ?)").run(
    req.user.id,
    req.params.eventId
  );
  res.status(201).json({ ok: true });
});

// DELETE /api/favorites/:eventId — прибрати з обраного
router.delete("/:eventId", requireAuth, (req, res) => {
  db.prepare("DELETE FROM favorites WHERE user_id = ? AND event_id = ?").run(
    req.user.id,
    req.params.eventId
  );
  res.status(204).end();
});

module.exports = router;

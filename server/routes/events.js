const express = require("express");
const db = require("../db");
const { requireAuth, requireOrganizer } = require("../auth");

const router = express.Router();

function slugify(title) {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9а-яіїєґ]+/giu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "podiya"
  );
}

// GET /api/events — список заходів (CRUD: Read)
// Публічний каталог показує лише опубліковані заходи, окрім випадку
// коли запит автентифікований як організатор-власник (бачить усі свої).
router.get("/", (req, res) => {
  const { category, status } = req.query;
  let sql = "SELECT * FROM events WHERE 1=1";
  const params = [];
  if (category && category !== "all") {
    sql += " AND category = ?";
    params.push(category);
  }
  if (status) {
    sql += " AND status = ?";
    params.push(status);
  } else {
    sql += " AND status = 'published'";
  }
  sql += " ORDER BY created_at DESC";
  const rows = db.prepare(sql).all(...params);
  res.json({ events: rows });
});

// GET /api/events/organizer/mine — заходи поточного організатора (усі статуси)
router.get("/organizer/mine", requireAuth, requireOrganizer, (req, res) => {
  const rows = db
    .prepare("SELECT * FROM events WHERE organizer_id = ? ORDER BY created_at DESC")
    .all(req.user.id);
  res.json({ events: rows });
});

// GET /api/events/:idOrSlug — один захід (CRUD: Read)
router.get("/:idOrSlug", (req, res) => {
  const { idOrSlug } = req.params;
  const row = /^\d+$/.test(idOrSlug)
    ? db.prepare("SELECT * FROM events WHERE id = ?").get(idOrSlug)
    : db.prepare("SELECT * FROM events WHERE slug = ?").get(idOrSlug);
  if (!row) return res.status(404).json({ error: "Захід не знайдено." });
  res.json({ event: row });
});

// POST /api/events — створення заходу організатором (CRUD: Create)
router.post("/", requireAuth, requireOrganizer, (req, res) => {
  const { title, date_label, category, city, place, price } = req.body || {};

  if (!title || String(title).trim().length < 3) {
    return res.status(400).json({ error: "Вкажіть назву (мінімум 3 символи)." });
  }
  if (!date_label || String(date_label).trim().length < 3) {
    return res.status(400).json({ error: "Вкажіть дату проведення." });
  }
  const allowedCategories = ["concert", "theatre", "expo", "festival", "standup", "kids"];
  if (!allowedCategories.includes(category)) {
    return res.status(400).json({ error: "Оберіть коректну категорію." });
  }

  const base = slugify(title);
  let slug = base;
  let n = 1;
  while (db.prepare("SELECT 1 FROM events WHERE slug = ?").get(slug)) {
    slug = `${base}-${++n}`;
  }

  const info = db
    .prepare(`
      INSERT INTO events (slug, title, category, date_label, city, place, price, status, organizer_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?)
    `)
    .run(slug, title.trim(), category, date_label.trim(), city || "Київ", place || "—", Number(price) || 0, req.user.id);

  const event = db.prepare("SELECT * FROM events WHERE id = ?").get(info.lastInsertRowid);
  res.status(201).json({ event });
});

// PATCH /api/events/:id — оновлення (наприклад, зміна статусу) (CRUD: Update)
router.patch("/:id", requireAuth, requireOrganizer, (req, res) => {
  const event = db.prepare("SELECT * FROM events WHERE id = ?").get(req.params.id);
  if (!event) return res.status(404).json({ error: "Захід не знайдено." });
  if (event.organizer_id !== req.user.id) {
    return res.status(403).json({ error: "Ви можете редагувати лише власні заходи." });
  }

  const allowedStatuses = ["draft", "moderation", "published", "cancelled"];
  const fields = [];
  const values = [];

  if (req.body.status) {
    if (!allowedStatuses.includes(req.body.status)) {
      return res.status(400).json({ error: "Некоректний статус." });
    }
    fields.push("status = ?");
    values.push(req.body.status);
  }
  for (const key of ["title", "date_label", "city", "place"]) {
    if (req.body[key] !== undefined) {
      fields.push(`${key} = ?`);
      values.push(String(req.body[key]));
    }
  }
  if (req.body.price !== undefined) {
    fields.push("price = ?");
    values.push(Number(req.body.price) || 0);
  }

  if (fields.length === 0) {
    return res.status(400).json({ error: "Немає полів для оновлення." });
  }

  values.push(req.params.id);
  db.prepare(`UPDATE events SET ${fields.join(", ")} WHERE id = ?`).run(...values);
  const updated = db.prepare("SELECT * FROM events WHERE id = ?").get(req.params.id);
  res.json({ event: updated });
});

// DELETE /api/events/:id — видалення (CRUD: Delete)
router.delete("/:id", requireAuth, requireOrganizer, (req, res) => {
  const event = db.prepare("SELECT * FROM events WHERE id = ?").get(req.params.id);
  if (!event) return res.status(404).json({ error: "Захід не знайдено." });
  if (event.organizer_id !== req.user.id) {
    return res.status(403).json({ error: "Ви можете видаляти лише власні заходи." });
  }
  db.prepare("DELETE FROM events WHERE id = ?").run(req.params.id);
  res.status(204).end();
});

module.exports = router;

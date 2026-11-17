const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db");
const { signToken, requireAuth } = require("../auth");

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// POST /api/auth/register  — реєстрація нового користувача
router.post("/register", (req, res) => {
  const { name, email, password, role } = req.body || {};

  if (!name || String(name).trim().length < 2) {
    return res.status(400).json({ error: "Вкажіть ім'я (мінімум 2 символи)." });
  }
  if (!email || !EMAIL_RE.test(email)) {
    return res.status(400).json({ error: "Введіть коректну email-адресу." });
  }
  if (!password || String(password).length < 8) {
    return res.status(400).json({ error: "Пароль має містити щонайменше 8 символів." });
  }

  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (existing) {
    return res.status(409).json({ error: "Користувач із таким email вже зареєстрований." });
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  const safeRole = role === "organizer" ? "organizer" : "user";
  const info = db
    .prepare("INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)")
    .run(name.trim(), email, passwordHash, safeRole);

  const user = { id: info.lastInsertRowid, name: name.trim(), email, role: safeRole };
  res.status(201).json({ token: signToken(user), user });
});

// POST /api/auth/login — вхід
router.post("/login", (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: "Вкажіть email і пароль." });
  }

  const row = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  if (!row || !bcrypt.compareSync(password, row.password_hash)) {
    return res.status(401).json({ error: "Невірний email або пароль." });
  }

  const user = { id: row.id, name: row.name, email: row.email, role: row.role };
  res.json({ token: signToken(user), user });
});

// GET /api/auth/me — поточний користувач за токеном
router.get("/me", requireAuth, (req, res) => {
  const row = db.prepare("SELECT id, name, email, role FROM users WHERE id = ?").get(req.user.id);
  if (!row) return res.status(404).json({ error: "Користувача не знайдено." });
  res.json({ user: row });
});

module.exports = router;

// Ініціалізація SQLite-бази та опис схеми таблиць.
// Файл бази зберігається поруч (podii.db) і створюється автоматично при першому запуску.
const path = require("path");
const Database = require("better-sqlite3");

const DB_PATH = path.join(__dirname, "..", "podii.db");
const db = new Database(DB_PATH);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','organizer')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('concert','theatre','expo','festival','standup','kids')),
  date_label TEXT NOT NULL,
  city TEXT NOT NULL,
  place TEXT NOT NULL,
  price INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','moderation','published','cancelled')),
  organizer_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS favorites (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, event_id)
);

CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  qty INTEGER NOT NULL CHECK (qty > 0),
  promo_code TEXT,
  discount_pct INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'paid' CHECK (status IN ('paid','cancelled')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

// --- Початкові дані (seed), лише якщо таблиця подій порожня ---
const eventsCount = db.prepare("SELECT COUNT(*) AS n FROM events").get().n;
if (eventsCount === 0) {
  const insertEvent = db.prepare(`
    INSERT INTO events (slug, title, category, date_label, city, place, price, status, organizer_id)
    VALUES (@slug, @title, @category, @date_label, @city, @place, @price, @status, @organizer_id)
  `);
  const seedOrganizer = db.prepare(`
    INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'organizer')
  `).run("Демооргайнайзер", "organizer@podii.ua", require("bcryptjs").hashSync("organizer123", 10));

  const organizerId = seedOrganizer.lastInsertRowid;

  const seed = [
    { slug: "onuka", title: "ONUKA. Великий сольний концерт", category: "concert", date_label: "24 травня · 19:00", city: "Київ", place: "Stereo Plaza", price: 890, status: "published", organizer_id: organizerId },
    { slug: "kaidashi", title: "Театр «Дикий». Кайдаші 2.0", category: "theatre", date_label: "26 травня · 18:30", city: "Львів", place: "Театр Лесі", price: 520, status: "published", organizer_id: organizerId },
    { slug: "mria", title: "Українська мрія. Нова хвиля", category: "expo", date_label: "до 2 червня · 10:00–19:00", city: "Київ", place: "Мистецький Арсенал", price: 250, status: "published", organizer_id: organizerId }
  ];
  const insertMany = db.transaction((rows) => rows.forEach((r) => insertEvent.run(r)));
  insertMany(seed);
  console.log("[db] Базу заповнено початковими даними (3 заходи, 1 організатор).");
}

module.exports = db;

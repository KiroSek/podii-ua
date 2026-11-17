// ПОДІЇ UA — сервер (Express) + REST API + SQLite.
// Обслуговує статичний фронтенд (ЛР №1–4) і REST API (ЛР №5).
require("dotenv").config();
const path = require("path");
const express = require("express");
const cors = require("cors");

require("./db"); // ініціалізація/seed бази при старті

const authRoutes = require("./routes/auth");
const eventsRoutes = require("./routes/events");
const favoritesRoutes = require("./routes/favorites");
const ticketsRoutes = require("./routes/tickets");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// --- REST API ---
app.use("/api/auth", authRoutes);
app.use("/api/events", eventsRoutes);
app.use("/api/favorites", favoritesRoutes);
app.use("/api/tickets", ticketsRoutes);

app.get("/api/health", (req, res) => res.json({ ok: true, service: "podii-ua", time: new Date().toISOString() }));

// --- Статичний фронтенд (клієнтська частина з ЛР №1–4) ---
app.use(express.static(path.join(__dirname, "..", "public")));

// 404 для невідомих /api/* маршрутів — повертаємо JSON, а не HTML
app.use("/api", (req, res) => res.status(404).json({ error: "Маршрут не знайдено." }));

// Обробник помилок
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Внутрішня помилка сервера." });
});

app.listen(PORT, () => {
  console.log(`[server] ПОДІЇ UA запущено на http://localhost:${PORT}`);
});

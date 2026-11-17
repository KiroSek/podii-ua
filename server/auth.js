// Допоміжні функції автентифікації: видача/перевірка JWT-токена,
// middleware requireAuth / requireOrganizer для захищених маршрутів.
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "podii-ua-navchalnyi-proiekt-secret";

function signToken(user) {
  return jwt.sign({ id: user.id, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: "7d" });
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Потрібна автентифікація (відсутній токен)." });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: "Недійсний або прострочений токен." });
  }
}

function requireOrganizer(req, res, next) {
  if (!req.user || req.user.role !== "organizer") {
    return res.status(403).json({ error: "Дія доступна лише організаторам." });
  }
  next();
}

module.exports = { signToken, requireAuth, requireOrganizer, JWT_SECRET };

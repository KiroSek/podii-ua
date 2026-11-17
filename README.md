# ПОДІЇ UA

Агрегатор культурних заходів України (концерти, вистави, виставки) — навчальний
вебпроєкт, що проходить через лабораторні роботи №1–5:

1. **ПР №1** — специфікація вимог і користувацькі історії.
2. **ПР №2** — інтерактивний прототип у Figma.
3. **ЛР №3** — верстка семантичним HTML + CSS (Flexbox/Grid, адаптивність).
4. **ЛР №4** — інтерактивність засобами JavaScript (DOM, події, валідація форм).
5. **ЛР №5** (цей репозиторій) — повноцінний вебзастосунок: клієнт + сервер
   (Node.js/Express) + база даних (SQLite) + REST API + розгортання.

## Архітектура

```
public/          клієнтська частина (HTML/CSS/JS з ЛР №1-4)
server/
  index.js       точка входу Express-сервера
  db.js          ініціалізація SQLite, схема таблиць, seed-дані
  auth.js        видача/перевірка JWT, middleware requireAuth/requireOrganizer
  routes/
    auth.js      POST /api/auth/register, /login, GET /api/auth/me
    events.js    CRUD над заходами (/api/events)
    favorites.js обране користувача (/api/favorites)
    tickets.js   купівля та перегляд квитків (/api/tickets)
test/            Playwright-тести (e2e.py, a11y.py) і скриншоти для звіту
```

Сервер віддає одночасно і статичний фронтенд (`public/`), і REST API (`/api/*`)
на одному origin, тому фронтенд звертається до бекенду простими відносними
шляхами (`fetch('/api/events')`) без налаштування CORS для продакшну.

## REST API

| Метод | Маршрут | Опис | Автентифікація |
|---|---|---|---|
| POST | `/api/auth/register` | Реєстрація (роль `user`/`organizer`) | — |
| POST | `/api/auth/login` | Вхід, повертає JWT | — |
| GET | `/api/auth/me` | Поточний користувач | ✅ |
| GET | `/api/events` | Список опублікованих заходів (`?category=`) | — |
| GET | `/api/events/organizer/mine` | Усі заходи поточного організатора | ✅ organizer |
| GET | `/api/events/:idOrSlug` | Один захід | — |
| POST | `/api/events` | Створити захід (чернетка) | ✅ organizer |
| PATCH | `/api/events/:id` | Оновити захід / змінити статус | ✅ organizer (власник) |
| DELETE | `/api/events/:id` | Видалити захід | ✅ organizer (власник) |
| GET | `/api/favorites` | Обрані заходи користувача | ✅ |
| POST/DELETE | `/api/favorites/:eventId` | Додати/прибрати з обраного | ✅ |
| GET | `/api/tickets` | Квитки користувача | ✅ |
| POST | `/api/tickets` | Купити квиток (промокод опційно) | ✅ |
| GET | `/api/tickets/:id` | Один квиток (лише власник) | ✅ |

## Модель даних (SQLite)

- **users** — id, name, email (унікальний), password_hash (bcrypt), role (`user`/`organizer`)
- **events** — id, slug, title, category, date_label, city, place, price, status (`draft`→`moderation`→`published`/`cancelled`), organizer_id
- **favorites** — зв'язка user_id ↔ event_id
- **tickets** — id, user_id, event_id, qty, promo_code, discount_pct, total, status

## Запуск локально

```bash
npm install
cp .env.example .env     # за потреби змінити JWT_SECRET/PORT
npm start                # http://localhost:3000
```

База `podii.db` створюється автоматично при першому запуску та одразу
заповнюється демоданими: 3 опубліковані заходи й демо-акаунт організатора
`organizer@podii.ua` / `organizer123`.

## Тести

```bash
npm install --no-save axe-core   # потрібно лише для a11y.py
python3 test/e2e.py              # повний сценарій: реєстрація → обране →
                                  # купівля квитка → кабінет організатора → CRUD
python3 test/a11y.py             # WCAG 2.1 A/AA аудит (axe-core) усіх сторінок
```

## Безпека

- Паролі зберігаються лише як bcrypt-хеші (ніколи у відкритому вигляді).
- Автентифікація — JWT (7 днів), перевіряється middleware `requireAuth`.
- Усі SQL-запити — параметризовані (`better-sqlite3` `prepare().run()/.get()/.all()`),
  що захищає від SQL-ін'єкцій.
- Увесь текст, що вставляється в DOM через `innerHTML` (назви заходів тощо),
  екранується функцією `esc()` на клієнті — захист від XSS.
- Авторизація розмежована за ролями: створювати/редагувати/видаляти заходи
  може лише організатор, і лише власні заходи.
- Секрет JWT і порт винесені у змінні середовища (`.env`, не комітиться).

## Розгортання (Render.com)

Репозиторій містить `render.yaml` — Render підхоплює налаштування автоматично
при підключенні GitHub-репозиторію ("New + → Blueprint"). Збірка: `npm install`,
запуск: `npm start`. SQLite-файл зберігається у файловій системі контейнера
(достатньо для навчального проєкту; для продакшн-масштабування варто
підключити постійний диск Render або перейти на PostgreSQL).

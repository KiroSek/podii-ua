/* ПОДІЇ UA — клієнтська логіка (ЛР № 5)
   Увесь динамічний вміст тепер надходить із власного REST API
   (Express + SQLite) через fetch/async-await, а не з localStorage
   чи статичної розмітки, як було в ЛР № 4. */
(function () {
  "use strict";

  const API = ""; // той самий origin, що й сторінки (сервер віддає і статику, і /api/*)
  const TOKEN_KEY = "podiiToken";
  const USER_KEY = "podiiUser";

  /* ---------- Утиліти ---------- */
  function qs(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function formatUAH(n) { return Number(n).toLocaleString("uk-UA") + " ₴"; }
  // Екранування тексту перед вставкою в innerHTML — захист від XSS, якщо
  // назва заходу чи інше поле міститиме символи на кшталт <script>.
  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[ch]));
  }
  function getToken() { return localStorage.getItem(TOKEN_KEY); }
  function getUser() {
    try { return JSON.parse(localStorage.getItem(USER_KEY) || "null"); } catch (e) { return null; }
  }
  function setSession(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }
  function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }

  // Єдина обгортка над fetch: додає JSON-заголовки й Authorization,
  // кидає виняток із текстом помилки сервера, якщо відповідь не ok.
  async function api(path, options) {
    const opts = Object.assign({}, options);
    opts.headers = Object.assign({ "Content-Type": "application/json" }, opts.headers || {});
    const token = getToken();
    if (token) opts.headers.Authorization = "Bearer " + token;
    if (opts.body && typeof opts.body !== "string") opts.body = JSON.stringify(opts.body);

    const res = await fetch(API + path, opts);
    let data = null;
    try { data = await res.json(); } catch (e) { /* 204 No Content тощо */ }
    if (!res.ok) {
      const message = (data && data.error) || `Помилка запиту (${res.status})`;
      throw new Error(message);
    }
    return data;
  }

  const CATEGORY_LABEL = {
    concert: "Концерт", theatre: "Вистава", expo: "Виставка",
    festival: "Фестиваль", standup: "Стендап", kids: "Дітям"
  };
  const CATEGORY_BADGE_CLASS = {
    concert: "badge--concert", theatre: "badge--theatre", expo: "badge--expo",
    festival: "badge--concert", standup: "badge--theatre", kids: "badge--expo"
  };
  const PH_CLASS = { theatre: "ph--theatre", expo: "ph--expo" };

  function qsParam(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  /* ---------- 1. Мобільна навігація (без змін від ЛР №4) ---------- */
  function initNavToggle() {
    const btn = qs("#navToggle");
    const nav = qs("#siteNav");
    if (!btn || !nav) return;
    btn.addEventListener("click", function () {
      const open = nav.classList.toggle("is-open");
      btn.setAttribute("aria-expanded", String(open));
      btn.textContent = open ? "✕" : "☰";
    });
    nav.addEventListener("click", function (e) {
      if (e.target.closest("a")) {
        nav.classList.remove("is-open");
        btn.setAttribute("aria-expanded", "false");
        btn.textContent = "☰";
      }
    });
  }

  /* ---------- 2. Шапка: стан кабінету й лічильник обраного ---------- */
  async function refreshHeaderState() {
    const user = getUser();
    const cabinetLinks = qsa('.header-actions a.btn--dark');
    cabinetLinks.forEach((a) => {
      if (user) {
        a.textContent = user.name.split(" ")[0];
        a.href = "cabinet.html";
      }
    });

    const favCountEls = qsa("#favCount");
    if (!user) {
      favCountEls.forEach((el) => { el.hidden = true; });
      return;
    }
    try {
      const { favorites } = await api("/api/favorites");
      favCountEls.forEach((el) => {
        el.textContent = String(favorites.length);
        el.hidden = favorites.length === 0;
      });
      return favorites;
    } catch (e) {
      return [];
    }
  }

  /* ---------- 3. Головна сторінка: каталог заходів із API ---------- */
  function cardTemplate(ev, favIds) {
    const isFav = favIds.includes(ev.id);
    const phClass = PH_CLASS[ev.category] || "";
    const badgeClass = CATEGORY_BADGE_CLASS[ev.category] || "badge--concert";
    const priceText = ev.category === "expo" ? `${ev.price} ₴` : `від ${ev.price} ₴`;
    return `
      <article class="card" data-category="${esc(ev.category)}" data-event-id="${ev.id}">
        <div class="card__media ph ${phClass}">
          <span class="badge ${badgeClass}">${esc(CATEGORY_LABEL[ev.category] || ev.category)}</span>
          <button class="fav${isFav ? " is-active" : ""}" type="button" aria-label="Додати в обране"
                  aria-pressed="${isFav}" data-event-id="${ev.id}">${isFav ? "♥" : "♡"}</button>
        </div>
        <div class="card__body">
          <p class="card__date">${esc(ev.date_label)}</p>
          <h3><a href="event.html?slug=${encodeURIComponent(ev.slug)}">${esc(ev.title)}</a></h3>
          <p class="card__place">${esc(ev.city)} · ${esc(ev.place)}</p>
          <p class="card__price">${priceText}</p>
        </div>
      </article>`;
  }

  async function loadEventsGrid(category) {
    const grid = qs("#eventsGrid");
    const counter = qs("#resultsCount");
    if (!grid) return;

    grid.setAttribute("aria-busy", "true");
    try {
      const query = category && category !== "all" ? `?category=${encodeURIComponent(category)}` : "";
      const [{ events }, favorites] = await Promise.all([
        api("/api/events" + query),
        getUser() ? api("/api/favorites").then((d) => d.favorites).catch(() => []) : Promise.resolve([])
      ]);
      const favIds = favorites.map((f) => f.id);

      if (events.length === 0) {
        grid.innerHTML = '<p class="empty-state">За цим фільтром заходів поки немає.</p>';
      } else {
        grid.innerHTML = events.map((ev) => cardTemplate(ev, favIds)).join("");
      }
      if (counter) {
        counter.hidden = false;
        counter.textContent = category && category !== "all"
          ? `Знайдено подій: ${events.length}`
          : `Показано всі заходи — ${events.length}`;
      }
    } catch (e) {
      grid.innerHTML = `<p class="empty-state">Не вдалося завантажити заходи: ${e.message}</p>`;
    } finally {
      grid.removeAttribute("aria-busy");
    }
  }

  function initCatalog() {
    const grid = qs("#eventsGrid");
    if (!grid) return;

    loadEventsGrid("all");

    const chips = qs("#catChips");
    if (chips) {
      chips.addEventListener("click", function (e) {
        const chip = e.target.closest(".chip");
        if (!chip) return;
        qsa(".chip", chips).forEach((c) => c.classList.toggle("is-active", c === chip));
        loadEventsGrid(chip.dataset.cat);
      });
    }

    // Делегування кліків по кнопці "♡" — підтягується динамічно рендереними картками.
    grid.addEventListener("click", async function (e) {
      const btn = e.target.closest(".fav");
      if (!btn) return;
      if (!getUser()) {
        window.location.href = "login.html";
        return;
      }
      const id = btn.dataset.eventId;
      const active = btn.classList.contains("is-active");
      try {
        if (active) await api(`/api/favorites/${id}`, { method: "DELETE" });
        else await api(`/api/favorites/${id}`, { method: "POST" });
        btn.classList.toggle("is-active", !active);
        btn.setAttribute("aria-pressed", String(!active));
        btn.textContent = !active ? "♥" : "♡";
        refreshHeaderState();
      } catch (err) {
        alert("Не вдалося оновити обране: " + err.message);
      }
    });
  }

  /* ---------- 4. Сторінка заходу ---------- */
  async function initEventPage() {
    const hero = qs(".event-hero");
    if (!hero) return;

    const slug = qsParam("slug") || "onuka";
    let event;
    try {
      const data = await api(`/api/events/${encodeURIComponent(slug)}`);
      event = data.event;
    } catch (e) {
      hero.querySelector("h1").textContent = "Захід не знайдено";
      return;
    }

    document.title = `${event.title} — ПОДІЇ UA`;
    hero.querySelector(".badge").textContent = CATEGORY_LABEL[event.category] || event.category;
    hero.querySelector(".badge").className = "badge " + (CATEGORY_BADGE_CLASS[event.category] || "badge--concert");
    hero.querySelector("h1").textContent = event.title;
    const metaItems = qsa(".event-meta li", hero);
    if (metaItems[0]) metaItems[0].textContent = "📅 " + event.date_label.split("·")[0].trim();
    if (metaItems[2]) metaItems[2].textContent = "📍 " + event.city;

    const priceBig = qs(".price-big");
    if (priceBig) priceBig.textContent = (event.category === "expo" ? "" : "від ") + formatUAH(event.price);
    const placeHeading = qs("#loc");
    if (placeHeading) placeHeading.textContent = event.place;

    const buyBtn = qs(".panel a.btn--primary");
    if (buyBtn) buyBtn.href = `checkout.html?slug=${encodeURIComponent(event.slug)}`;

    const favBtn = qs("#eventFavBtn");
    if (favBtn) {
      favBtn.dataset.eventId = event.id;
      if (getUser()) {
        try {
          const { favorites } = await api("/api/favorites");
          setEventFavState(favBtn, favorites.some((f) => f.id === event.id));
        } catch (e) { /* ignore */ }
      }
      favBtn.addEventListener("click", async function () {
        if (!getUser()) { window.location.href = "login.html"; return; }
        const active = favBtn.classList.contains("is-active");
        try {
          if (active) await api(`/api/favorites/${event.id}`, { method: "DELETE" });
          else await api(`/api/favorites/${event.id}`, { method: "POST" });
          setEventFavState(favBtn, !active);
          refreshHeaderState();
        } catch (err) {
          alert("Не вдалося оновити обране: " + err.message);
        }
      });
    }
  }
  function setEventFavState(btn, active) {
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-pressed", String(active));
    const icon = qs("#eventFavIcon", btn);
    const label = qs("#eventFavLabel", btn);
    if (icon) icon.textContent = active ? "♥" : "♡";
    if (label) label.textContent = active ? "У обраному" : "Додати в обране";
  }

  /* ---------- 5. Оформлення замовлення (checkout) ---------- */
  async function initCheckout() {
    const stepper = qs("#qtyStepper");
    const form = qs(".checkout");
    if (!stepper || !form) return;

    const slug = qsParam("slug") || "onuka";
    let event;
    try {
      const data = await api(`/api/events/${encodeURIComponent(slug)}`);
      event = data.event;
    } catch (e) {
      form.innerHTML = `<p class="empty-state">Не вдалося завантажити захід: ${e.message}</p>`;
      return;
    }

    // Підставляємо реальні дані заходу в картку замовлення.
    const badge = qs(".panel.row .badge", form);
    if (badge) { badge.textContent = CATEGORY_LABEL[event.category] || event.category; badge.className = "badge " + (CATEGORY_BADGE_CLASS[event.category] || "badge--concert"); }
    const titleEl = qs(".panel.row h2", form);
    if (titleEl) titleEl.textContent = event.title;
    const metaEl = qs(".panel.row p.muted", form);
    if (metaEl) metaEl.innerHTML = `${esc(event.date_label)}<br>${esc(event.place)}, ${esc(event.city)}`;
    const priceFieldset = qs("[data-unit-price]", form);
    if (priceFieldset) {
      priceFieldset.dataset.unitPrice = event.price;
      const priceStrong = qs(".row strong:last-of-type", priceFieldset);
      if (priceStrong) priceStrong.textContent = formatUAH(event.price);
    }

    const input = qs("#qtyInput");
    const promoMsg = qs("#promoMsg");
    let discountRate = 0;

    function recalc() {
      const qty = Math.max(1, Math.min(10, Number(input.value) || 1));
      input.value = qty;
      const subtotal = qty * event.price;
      const discount = Math.round(subtotal * discountRate);
      const total = subtotal - discount;

      qs("#summaryQtyLabel").textContent = "Квитки × " + qty;
      qs("#summarySubtotal").textContent = formatUAH(subtotal);
      qs("#summaryTotal").textContent = formatUAH(total);
      const discountRow = qs("#discountRow");
      if (discountRow) {
        discountRow.hidden = discount === 0;
        qs("#summaryDiscount").textContent = "−" + formatUAH(discount);
      }
    }

    qs("#qtyMinus").addEventListener("click", () => { input.value = Number(input.value) - 1; recalc(); });
    qs("#qtyPlus").addEventListener("click", () => { input.value = Number(input.value) + 1; recalc(); });
    input.addEventListener("input", recalc);

    let appliedPromo = null;
    qs("#promoBtn").addEventListener("click", function () {
      const code = (qs("#promoInput").value || "").trim().toUpperCase();
      if (code === "PODII10") {
        discountRate = 0.10; appliedPromo = code;
        showPromoMsg("Промокод застосовано: знижка 10%.", true);
      } else if (code === "SALE100") {
        discountRate = 0; appliedPromo = code;
        showPromoMsg("Промокод дійсний, але без знижки.", true);
      } else {
        discountRate = 0; appliedPromo = null;
        showPromoMsg(code ? "Такого промокоду не знайдено." : "Введіть промокод.", false);
      }
      recalc();
    });
    function showPromoMsg(text, ok) {
      promoMsg.hidden = false;
      promoMsg.textContent = text;
      promoMsg.className = "form-msg " + (ok ? "form-msg--ok" : "form-msg--err");
    }

    recalc();

    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      if (!getUser()) {
        window.location.href = "login.html?next=" + encodeURIComponent(window.location.href);
        return;
      }
      const submitBtn = qs('button[type="submit"]', form);
      submitBtn.disabled = true;
      submitBtn.textContent = "Оформлюємо…";
      try {
        const { ticket } = await api("/api/tickets", {
          method: "POST",
          body: { eventId: event.id, qty: Number(input.value), promoCode: appliedPromo }
        });
        window.location.href = `ticket.html?id=${ticket.id}`;
      } catch (err) {
        alert("Не вдалося оформити замовлення: " + err.message);
        submitBtn.disabled = false;
        submitBtn.textContent = "Перейти до оплати →";
      }
    });
  }

  /* ---------- 6. Вхід / Реєстрація ---------- */
  function showFieldError(input, message) {
    clearFieldError(input);
    input.closest("label").classList.add("has-error");
    const p = document.createElement("p");
    p.className = "field-error";
    p.textContent = message;
    p.id = input.id + "-error";
    input.setAttribute("aria-describedby", p.id);
    input.closest("label").appendChild(p);
  }
  function clearFieldError(input) {
    input.closest("label").classList.remove("has-error");
    const old = qs("#" + input.id + "-error");
    if (old) old.remove();
    input.removeAttribute("aria-describedby");
  }
  function isEmailValid(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }

  function initAuthForms() {
    const tabs = qs("#authTabs");
    if (!tabs) return;

    if (getUser()) {
      const next = qsParam("next");
      window.location.href = next || "cabinet.html";
      return;
    }

    tabs.addEventListener("click", function (e) {
      const link = e.target.closest("a[data-tab]");
      if (!link) return;
      e.preventDefault();
      qsa("a[data-tab]", tabs).forEach((a) => a.setAttribute("aria-selected", String(a === link)));
      qsa("form[data-panel]").forEach((form) => form.classList.toggle("panel-hidden", form.dataset.panel !== link.dataset.tab));
    });

    const loginForm = qs("#loginForm");
    if (loginForm) {
      loginForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        const email = qs("#loginEmail"), password = qs("#loginPassword");
        clearFieldError(email); clearFieldError(password);
        let ok = true;
        if (!isEmailValid(email.value)) { showFieldError(email, "Введіть коректну email-адресу."); ok = false; }
        if (password.value.length < 8) { showFieldError(password, "Пароль має містити щонайменше 8 символів."); ok = false; }
        if (!ok) return;
        try {
          const { token, user } = await api("/api/auth/login", { method: "POST", body: { email: email.value, password: password.value } });
          setSession(token, user);
          window.location.href = qsParam("next") || "cabinet.html";
        } catch (err) {
          showFieldError(password, err.message);
        }
      });
    }

    const regForm = qs("#regForm");
    if (regForm) {
      regForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        const name = qs("#regName"), email = qs("#regEmail"), pass = qs("#regPassword"), pass2 = qs("#regPassword2");
        [name, email, pass, pass2].forEach(clearFieldError);
        let ok = true;
        if (name.value.trim().length < 2) { showFieldError(name, "Вкажіть ім'я (мінімум 2 символи)."); ok = false; }
        if (!isEmailValid(email.value)) { showFieldError(email, "Введіть коректну email-адресу."); ok = false; }
        if (pass.value.length < 8) { showFieldError(pass, "Пароль має містити щонайменше 8 символів."); ok = false; }
        if (pass2.value !== pass.value || pass2.value === "") { showFieldError(pass2, "Паролі не збігаються."); ok = false; }
        if (!ok) return;
        const isOrganizer = qs("#regIsOrganizer") && qs("#regIsOrganizer").checked;
        try {
          const { token, user } = await api("/api/auth/register", {
            method: "POST",
            body: { name: name.value.trim(), email: email.value, password: pass.value, role: isOrganizer ? "organizer" : "user" }
          });
          setSession(token, user);
          window.location.href = qsParam("next") || "cabinet.html";
        } catch (err) {
          showFieldError(email, err.message);
        }
      });
    }
  }

  /* ---------- 7. Кабінет користувача ---------- */
  async function initCabinet() {
    const tabs = qs("#cabinetTabs");
    if (!tabs) return;

    const user = getUser();
    if (!user) {
      window.location.href = "login.html?next=" + encodeURIComponent("cabinet.html");
      return;
    }

    qs("#profileName").textContent = user.name;
    qs("#profileEmail").textContent = user.email;
    qs("#avatarInitials").textContent = user.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

    tabs.addEventListener("click", function (e) {
      const link = e.target.closest("a[data-tab]");
      if (!link) return;
      e.preventDefault();
      qsa("a[data-tab]", tabs).forEach((a) => a.setAttribute("aria-selected", String(a === link)));
      qsa("[data-panel]").forEach((p) => { if (p.tagName === "SECTION") p.classList.toggle("panel-hidden", p.dataset.panel !== link.dataset.tab); });
    });

    const favGrid = qs("#favGrid");
    const favEmpty = qs("#favEmpty");
    try {
      const { favorites } = await api("/api/favorites");
      qs("#favTabCount") && (qs("#favTabCount").textContent = String(favorites.length));
      if (favorites.length === 0) {
        if (favGrid) favGrid.innerHTML = "";
        if (favEmpty) favEmpty.hidden = false;
      } else {
        if (favEmpty) favEmpty.hidden = true;
        if (favGrid) favGrid.innerHTML = favorites.map((ev) => cardTemplate(ev, favorites.map(f => f.id))).join("");
      }
    } catch (e) { /* ignore */ }

    if (favGrid) {
      favGrid.addEventListener("click", async function (e) {
        const btn = e.target.closest(".fav");
        if (!btn) return;
        const id = btn.dataset.eventId;
        try {
          await api(`/api/favorites/${id}`, { method: "DELETE" });
          btn.closest(".card").remove();
          if (qsa(".card", favGrid).length === 0 && favEmpty) favEmpty.hidden = false;
          refreshHeaderState();
        } catch (err) {
          alert("Не вдалося прибрати з обраного: " + err.message);
        }
      });
    }

    const ticketsList = qs("#ticketsList");
    if (ticketsList) {
      try {
        const { tickets } = await api("/api/tickets");
        if (tickets.length === 0) {
          ticketsList.innerHTML = '<p class="empty-state">У вас поки немає придбаних квитків.</p>';
        } else {
          ticketsList.innerHTML = tickets.map((t) => `
            <article class="ticket-mini mb16">
              <div class="thumb ph"></div>
              <div class="grow"><strong>${esc(t.event_title)}</strong><br>
              <span class="muted fs-s">${esc(t.date_label)} · ${t.qty} кв. · ${formatUAH(t.total)}</span></div>
              <a class="btn btn--secondary btn--xs" href="ticket.html?id=${t.id}">Відкрити</a>
            </article>`).join("");
        }
      } catch (e) { /* ignore */ }
    }
  }

  /* ---------- 8. Кабінет організатора ---------- */
  async function initOrganizer() {
    const dialog = qs("#createEventDialog");
    if (!dialog) return;

    const user = getUser();
    if (!user) { window.location.href = "login.html?next=" + encodeURIComponent("organizer.html"); return; }
    if (user.role !== "organizer") {
      qs("main .wrap").insertAdjacentHTML("afterbegin",
        '<p class="empty-state mb16">Цей розділ доступний лише організаторам. Увійдіть під обліковим записом organizer@podii.ua / organizer123 (демо) або зареєструйтесь як організатор.</p>');
    }

    const tbody = qs("#eventsBody");
    const kpiTotal = qs("#kpiTotal");
    const kpiPublished = qs("#kpiPublished");

    async function loadEvents() {
      const { events } = await api("/api/events/organizer/mine");
      kpiTotal.textContent = String(events.length);
      kpiPublished.textContent = String(events.filter((e) => e.status === "published").length);
      tbody.innerHTML = events.map(rowTemplate).join("");
    }
    function statusLabel(s) {
      return { draft: "Чернетка", moderation: "На модерації", published: "Опубліковано", cancelled: "Скасовано" }[s] || s;
    }
    function rowTemplate(ev) {
      const canPublish = ev.status !== "published";
      return `<tr data-id="${ev.id}">
        <td><strong>${esc(ev.title)}</strong></td>
        <td>${esc(ev.date_label)}</td>
        <td><span class="status status--${ev.status === "published" ? "published" : ev.status === "moderation" ? "review" : "draft"}">${esc(statusLabel(ev.status))}</span></td>
        <td>—</td>
        <td class="row-actions">
          <button class="btn ${canPublish ? "btn--primary" : "btn--secondary"} btn--xs" type="button" data-action="publish" ${canPublish ? "" : "disabled"}>${canPublish ? "Опублікувати" : "Опубліковано"}</button>
          <button class="btn btn--secondary btn--xs" type="button" data-action="delete">Видалити</button>
        </td>
      </tr>`;
    }

    await loadEvents().catch((e) => { tbody.innerHTML = `<tr><td colspan="5">Помилка завантаження: ${e.message}</td></tr>`; });

    qs("#openCreateEvent").addEventListener("click", () => dialog.showModal());
    qs("#closeCreateEvent").addEventListener("click", () => dialog.close());
    dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); });

    qs("#createEventForm").addEventListener("submit", async function (e) {
      e.preventDefault();
      const title = qs("#ceTitle"), date = qs("#ceDate"), category = qs("#ceCategory");
      [title, date, category].forEach(clearFieldError);
      let ok = true;
      if (title.value.trim().length < 3) { showFieldError(title, "Вкажіть назву (мінімум 3 символи)."); ok = false; }
      if (date.value.trim().length < 3) { showFieldError(date, "Вкажіть дату проведення."); ok = false; }
      if (!category.value) { showFieldError(category, "Оберіть категорію."); ok = false; }
      if (!ok) return;

      try {
        await api("/api/events", {
          method: "POST",
          body: { title: title.value.trim(), date_label: date.value.trim(), category: category.value, city: "Київ", place: "—", price: 0 }
        });
        await loadEvents();
        e.target.reset();
        dialog.close();
      } catch (err) {
        showFieldError(title, err.message);
      }
    });

    tbody.addEventListener("click", async function (e) {
      const btn = e.target.closest("button[data-action]");
      if (!btn || btn.disabled) return;
      const id = btn.closest("tr").dataset.id;
      try {
        if (btn.dataset.action === "delete") {
          await api(`/api/events/${id}`, { method: "DELETE" });
        } else if (btn.dataset.action === "publish") {
          await api(`/api/events/${id}`, { method: "PATCH", body: { status: "published" } });
        }
        await loadEvents();
      } catch (err) {
        alert("Не вдалося виконати дію: " + err.message);
      }
    });
  }

  /* ---------- 9. Квиток ---------- */
  async function initTicketPage() {
    const ticketPage = qs(".ticket-page");
    if (!ticketPage) return;

    const id = qsParam("id");
    const user = getUser();
    if (id && user) {
      try {
        const { ticket } = await api(`/api/tickets/${id}`);
        qs("#ticketTitle").textContent = ticket.event_title;
        qs("#ticketDate").textContent = ticket.date_label;
        qs("#ticketPlace").textContent = `📍 ${ticket.place}, ${ticket.city}`;
        qs("#ticketNumber").textContent = "PUA-" + String(ticket.id).padStart(6, "0");
        qs("#ticketQty").textContent = String(ticket.qty);
        qs("#ticketPromo").textContent = ticket.promo_code || "—";
        qs("#ticketTotal").textContent = formatUAH(ticket.total);
        qs("#ticketOwnerLine").textContent = `Квиток збережено у кабінеті ${user.email}.`;
      } catch (e) {
        qs("#ticketOwnerLine").textContent = "Не вдалося завантажити дані квитка: " + e.message;
      }
    } else if (!user) {
      qs("#ticketOwnerLine").textContent = "Увійдіть у кабінет, щоб переглянути деталі цього квитка.";
    }

    const btn = qs("#downloadPdfBtn");
    if (btn) btn.addEventListener("click", () => window.print());
  }

  /* ---------- Вихід із кабінету ---------- */
  function initLogout() {
    const logoutBtn = qs("#logoutBtn");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", function () {
        clearSession();
        window.location.href = "index.html";
      });
    }
  }

  /* ---------- Старт ---------- */
  document.addEventListener("DOMContentLoaded", function () {
    initNavToggle();
    refreshHeaderState();
    initCatalog();
    initEventPage();
    initCheckout();
    initAuthForms();
    initCabinet();
    initOrganizer();
    initTicketPage();
    initLogout();
  });
})();

from playwright.sync_api import sync_playwright
import random

BASE = "http://localhost:3000"
rand = random.randint(10000, 99999)
USER_EMAIL = f"testuser{rand}@example.com"
ORG_EMAIL = f"testorg{rand}@example.com"

def log(name, ok, detail=""):
    print(("OK  " if ok else "FAIL") + " " + name + ("" if not detail else " -- " + detail))

with sync_playwright() as p:
    browser = p.chromium.launch()
    errs = []
    page = browser.new_page(viewport={"width":1280,"height":900})
    page.on("pageerror", lambda e: errs.append(str(e)))
    console_errs = []
    page.on("console", lambda m: console_errs.append(m.text) if m.type == "error" else None)

    # 1. Головна сторінка завантажує реальні події з API
    page.goto(BASE + "/index.html")
    page.wait_for_selector("#eventsGrid .card", timeout=5000)
    cards = page.locator("#eventsGrid .card").count()
    log("Головна: картки заходів завантажені з API", cards == 3, f"cards={cards}")

    # 2. Фільтр категорій (серверний запит з ?category=)
    page.locator("[data-cat='theatre']").click()
    page.wait_for_timeout(300)
    visible = page.locator("#eventsGrid .card").count()
    log("Фільтр категорій повертає відфільтровані дані з API", visible == 1, f"visible={visible}")
    page.locator("[data-cat='all']").click()
    page.wait_for_timeout(300)

    # 3. Реєстрація нового користувача
    page.goto(BASE + "/login.html")
    page.locator("#authTabs a[data-tab='reg']").click()
    page.locator("#regName").fill("Тест Юзер")
    page.locator("#regEmail").fill(USER_EMAIL)
    page.locator("#regPassword").fill("password123")
    page.locator("#regPassword2").fill("password123")
    page.locator("#regForm button[type=submit]").click()
    page.wait_for_url("**/cabinet.html", timeout=5000)
    log("Реєстрація користувача -> редірект у кабінет", "cabinet.html" in page.url)

    # 4. Кабінет показує ім'я користувача
    page.wait_for_selector("#profileName")
    name_text = page.locator("#profileName").inner_text()
    log("Кабінет показує ім'я з токена/БД", name_text == "Тест Юзер", name_text)

    # 5. Обране з головної сторінки (delegated click -> POST /api/favorites)
    page.goto(BASE + "/index.html")
    page.wait_for_selector("#eventsGrid .card")
    fav_btn = page.locator(".fav[data-event-id='1']")
    fav_btn.click()
    page.wait_for_timeout(300)
    is_active = "is-active" in (fav_btn.get_attribute("class") or "")
    log("Додавання в обране через REST API", is_active)

    page.goto(BASE + "/cabinet.html")
    page.wait_for_timeout(300)
    fav_cards = page.locator("#favGrid .card").count()
    log("Обране в кабінеті підтягується з GET /api/favorites", fav_cards == 1, f"count={fav_cards}")

    # 6. Купівля квитка (checkout -> POST /api/tickets -> ticket.html)
    page.goto(BASE + "/event.html?slug=onuka")
    page.wait_for_selector(".price-big")
    page.locator(".panel a.btn--primary").click()
    page.wait_for_url("**/checkout.html*")
    page.wait_for_selector("#summaryTotal")
    page.locator("#qtyPlus").click()
    page.wait_for_timeout(200)
    page.locator('button[type=submit]').click()
    page.wait_for_url("**/ticket.html*", timeout=5000)
    page.wait_for_timeout(300)
    ticket_title = page.locator("#ticketTitle").inner_text()
    log("Купівля квитка створила реальний запис через API", "ONUKA" in ticket_title, ticket_title)

    # 7. Квиток зберігся в кабінеті
    page.goto(BASE + "/cabinet.html")
    page.locator("#cabinetTabs a[data-tab='tickets']").click()
    page.wait_for_timeout(300)
    tickets_html = page.locator("#ticketsList").inner_html()
    log("Куплений квиток відображається у вкладці «Мої квитки»", "ONUKA" in tickets_html)

    # 8. Вихід
    page.locator("#logoutBtn").click()
    page.wait_for_url("**/index.html*")
    log("Вихід працює і повертає на головну", True)

    # 9. Реєстрація організатора + CRUD подій
    page.goto(BASE + "/login.html")
    page.locator("#authTabs a[data-tab='reg']").click()
    page.locator("#regName").fill("Тест Організатор")
    page.locator("#regEmail").fill(ORG_EMAIL)
    page.locator("#regPassword").fill("password123")
    page.locator("#regPassword2").fill("password123")
    page.locator("#regIsOrganizer").check()
    page.locator("#regForm button[type=submit]").click()
    page.wait_for_url("**/cabinet.html", timeout=5000)

    page.goto(BASE + "/organizer.html")
    page.wait_for_selector("#eventsBody", state="attached")
    rows_before = page.locator("#eventsBody tr").count()
    log("Організатор бачить лише свої події (CRUD: Read)", rows_before == 0, f"rows={rows_before}")

    page.locator("#openCreateEvent").click()
    page.locator("#ceTitle").fill("Тестова подія E2E")
    page.locator("#ceDate").fill("1 грудня 2026")
    page.locator("#ceCategory").select_option("concert")
    page.locator("#createEventForm button[type=submit]").click()
    page.wait_for_timeout(400)
    rows_after_create = page.locator("#eventsBody tr").count()
    log("Створення події через POST /api/events (CRUD: Create)", rows_after_create == 1)

    page.locator("[data-action='publish']").click()
    page.wait_for_timeout(300)
    published_badge = page.locator("#eventsBody .status--published").count()
    log("Публікація через PATCH /api/events/:id (CRUD: Update)", published_badge == 1)

    kpi_published = page.locator("#kpiPublished").inner_text()
    log("KPI 'Опубліковано' оновився", kpi_published == "1", kpi_published)

    page.locator("[data-action='delete']").click()
    page.wait_for_timeout(300)
    rows_after_delete = page.locator("#eventsBody tr").count()
    log("Видалення через DELETE /api/events/:id (CRUD: Delete)", rows_after_delete == 0)

    print("\nPage errors:", errs if errs else "none")
    real_console_errors = [e for e in console_errs if "Failed to load resource" not in e]
    print("Console errors (excluding blocked external font):", real_console_errors if real_console_errors else "none")

    browser.close()

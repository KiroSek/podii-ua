from playwright.sync_api import sync_playwright
import pathlib, json, urllib.request, random

BASE = "http://localhost:3000"
OUT = pathlib.Path("/home/claude/podii-ua/test/shots")
rand = random.randint(10000,99999)

with sync_playwright() as p:
    browser = p.chromium.launch()

    # 1. Головна з реальними даними з API
    page = browser.new_page(viewport={"width":1280,"height":900})
    page.goto(BASE + "/index.html")
    page.wait_for_selector("#eventsGrid .card")
    page.wait_for_timeout(200)
    page.screenshot(path=str(OUT/"01_index_api_data.png"))

    # 2. Реєстрація
    page.goto(BASE + "/login.html")
    page.locator("#authTabs a[data-tab='reg']").click()
    page.locator("#regName").fill("Олена Петренко")
    page.locator("#regEmail").fill(f"olena{rand}@example.com")
    page.locator("#regPassword").fill("password123")
    page.locator("#regPassword2").fill("password123")
    page.wait_for_timeout(100)
    page.screenshot(path=str(OUT/"02_register_form.png"))
    page.locator("#regForm button[type=submit]").click()
    page.wait_for_url("**/cabinet.html")
    page.wait_for_timeout(200)
    page.screenshot(path=str(OUT/"03_cabinet_after_register.png"))

    # 3. Обране -> кабінет
    page.goto(BASE + "/index.html")
    page.wait_for_selector("#eventsGrid .card")
    page.locator(".fav[data-event-id='2']").click()
    page.wait_for_timeout(200)
    page.goto(BASE + "/cabinet.html")
    page.wait_for_timeout(300)
    page.screenshot(path=str(OUT/"04_cabinet_favorites.png"))

    # 4. Checkout + оплата
    page.goto(BASE + "/event.html?slug=kaidashi")
    page.wait_for_selector(".price-big")
    page.locator(".panel a.btn--primary").click()
    page.wait_for_url("**/checkout.html*")
    page.wait_for_selector("#summaryTotal")
    page.locator("#promoInput").fill("PODII10")
    page.locator("#promoBtn").click()
    page.wait_for_timeout(200)
    page.screenshot(path=str(OUT/"05_checkout_promo.png"))
    page.locator('button[type=submit]').click()
    page.wait_for_url("**/ticket.html*")
    page.wait_for_timeout(300)
    page.screenshot(path=str(OUT/"06_ticket_from_api.png"))

    # 5. Кабінет організатора
    req = urllib.request.Request(BASE + "/api/auth/login", data=json.dumps({"email":"organizer@podii.ua","password":"organizer123"}).encode(), headers={"Content-Type":"application/json"})
    resp = json.loads(urllib.request.urlopen(req).read())
    page.goto(BASE + "/organizer.html")
    page.evaluate(f"""() => {{
        localStorage.setItem('podiiToken', {json.dumps(resp['token'])});
        localStorage.setItem('podiiUser', {json.dumps(json.dumps(resp['user']))});
    }}""")
    page.reload()
    page.wait_for_selector("#eventsBody", state="attached")
    page.wait_for_timeout(300)
    page.locator("#openCreateEvent").click()
    page.locator("#ceTitle").fill("Джаз-вечір у Львові")
    page.locator("#ceDate").fill("14 червня 2026")
    page.locator("#ceCategory").select_option("concert")
    page.wait_for_timeout(100)
    page.screenshot(path=str(OUT/"07_organizer_create_modal.png"))
    page.locator("#createEventForm button[type=submit]").click()
    page.wait_for_timeout(300)
    page.screenshot(path=str(OUT/"08_organizer_table_crud.png"))

    browser.close()
print("done")

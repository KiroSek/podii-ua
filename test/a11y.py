from playwright.sync_api import sync_playwright
import json, pathlib

AXE_JS = pathlib.Path("/home/claude/podii-ua/node_modules/axe-core/axe.min.js").read_text()
BASE = "http://localhost:3000"
PAGES = ["index.html","event.html?slug=onuka","login.html","cabinet.html","checkout.html?slug=onuka","organizer.html","ticket.html"]

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width":1280,"height":900})

    # залогінимось як організатор, щоб cabinet/organizer не редіректили на login
    page.goto(BASE + "/login.html")
    page.evaluate("""() => {
        localStorage.setItem('podiiToken', '');
    }""")
    import urllib.request, json as js
    req = urllib.request.Request(BASE + "/api/auth/login", data=js.dumps({"email":"organizer@podii.ua","password":"organizer123"}).encode(), headers={"Content-Type":"application/json"})
    resp = js.loads(urllib.request.urlopen(req).read())
    page.evaluate(f"""() => {{
        localStorage.setItem('podiiToken', {json.dumps(resp['token'])});
        localStorage.setItem('podiiUser', {json.dumps(json.dumps(resp['user']))});
    }}""")

    for pg in PAGES:
        page.goto(BASE + "/" + pg)
        page.wait_for_timeout(400)
        page.add_script_tag(content=AXE_JS)
        results = page.evaluate("async () => { return await axe.run(document, {runOnly: ['wcag2a','wcag2aa']}); }")
        violations = results["violations"]
        print(f"=== {pg} === violations: {len(violations)}")
        for v in violations:
            print(f"  [{v['impact']}] {v['id']}: {v['help']} (nodes: {len(v['nodes'])})")
    browser.close()

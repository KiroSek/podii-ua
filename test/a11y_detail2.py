from playwright.sync_api import sync_playwright
import json, pathlib, urllib.request

AXE_JS = pathlib.Path("/home/claude/podii-ua/node_modules/axe-core/axe.min.js").read_text()
BASE = "http://localhost:3000"

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width":1280,"height":900})
    req = urllib.request.Request(BASE + "/api/auth/login", data=json.dumps({"email":"organizer@podii.ua","password":"organizer123"}).encode(), headers={"Content-Type":"application/json"})
    resp = json.loads(urllib.request.urlopen(req).read())
    page.goto(BASE + "/organizer.html")
    page.evaluate(f"""() => {{
        localStorage.setItem('podiiToken', {json.dumps(resp['token'])});
        localStorage.setItem('podiiUser', {json.dumps(json.dumps(resp['user']))});
    }}""")
    for pg in ["organizer.html", "ticket.html", "index.html"]:
        page.goto(BASE + "/" + pg)
        page.wait_for_timeout(400)
        page.add_script_tag(content=AXE_JS)
        results = page.evaluate("async () => { return await axe.run(document, {runOnly: ['wcag2a','wcag2aa']}); }")
        print("===", pg, "violations:", len(results["violations"]))
        for v in results["violations"]:
            print(" #", v["id"])
            for n in v["nodes"]:
                print("   html:", n["html"][:150])
                print("   summary:", n.get("failureSummary","")[:250])
    browser.close()

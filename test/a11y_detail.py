from playwright.sync_api import sync_playwright
import json, pathlib

AXE_JS = pathlib.Path("/home/claude/podii-ua/node_modules/axe-core/axe.min.js").read_text()
BASE = "http://localhost:3000"

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width":1280,"height":900})
    page.goto(BASE + "/index.html")
    page.wait_for_timeout(400)
    page.add_script_tag(content=AXE_JS)
    results = page.evaluate("async () => { return await axe.run(document, {runOnly: ['wcag2a','wcag2aa']}); }")
    for v in results["violations"]:
        print("###", v["id"], v["help"])
        for n in v["nodes"]:
            print("  html:", n["html"][:200])
            print("  target:", n["target"])
            print("  summary:", n.get("failureSummary","")[:300])
            print()

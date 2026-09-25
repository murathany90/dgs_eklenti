from playwright.sync_api import sync_playwright
from pathlib import Path
import json, time
HTML=Path('/mnt/data/YTBS_PowerFactory_Sebeke_Goruntuleyici_v5_5.html').as_uri()
JSON15='/mnt/data/20260923_1500_SN3_TR0.json'
out='/mnt/data/ytbs_v55_delivery/TEST_KAYITLARI/v55_1500.json'
shot='/mnt/data/ytbs_v55_delivery/EKRAN_GORUNTULERI/v55_1500_map.png'
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={"width":1600,"height":950})
    errors=[]
    page.on('pageerror', lambda e: errors.append('PAGE:'+str(e)))
    page.on('console', lambda m: errors.append('CONSOLE:'+m.text) if m.type=='error' else None)
    page.set_content(Path('/mnt/data/YTBS_PowerFactory_Sebeke_Goruntuleyici_v5_5.html').read_text(), wait_until='load', timeout=120000)
    version=page.evaluate("()=>window.YTBS_V55_TEST?.version")
    page.set_input_files('#fileInput', JSON15)
    page.wait_for_function("()=>window.YTBS_V55_TEST && window.YTBS_V53_TEST && LineCapacityEngine.report()?.all===2382", timeout=180000)
    # Map tab
    page.click('[data-view="map"]')
    page.wait_for_timeout(2500)
    # enable P / flow
    page.evaluate("()=>{document.querySelector('[data-metric=\"P\"]')?.click(); const f=document.getElementById('mapFlow'); if(f&&!f.checked){f.checked=true;f.dispatchEvent(new Event('change'));}}")
    page.wait_for_timeout(2500)
    flow=page.evaluate("()=>YTBS_V55_TEST.flow()")
    # H4719 virtual energization analysis
    energ=page.evaluate("()=>YTBS_V55_TEST.energization('H4719')")
    # select line and inspect action status
    page.evaluate("()=>selectLine('H4719')")
    page.wait_for_timeout(800)
    action=page.evaluate("()=>YTBS_V54_TEST.actions()")
    page.screenshot(path=shot, full_page=False)
    data={"version":version,"flow":flow,"energization":energ,"actions":action,"errors":errors,
          "title":page.title(),"capacity":page.evaluate("()=>LineCapacityEngine.report()")}
    Path(out).write_text(json.dumps(data,ensure_ascii=False,indent=2))
    print(json.dumps(data,ensure_ascii=False,indent=2)[:12000])
    browser.close()

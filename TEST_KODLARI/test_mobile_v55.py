from playwright.sync_api import sync_playwright
from pathlib import Path
import json
HTML=Path('/mnt/data/YTBS_PowerFactory_Sebeke_Goruntuleyici_v5_5.html').read_text()
with sync_playwright() as p:
 b=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
 page=b.new_page(viewport={'width':390,'height':844},is_mobile=True);errs=[]
 page.on('pageerror',lambda e:errs.append(str(e)))
 page.set_content(HTML,wait_until='load',timeout=120000);page.set_input_files('#fileInput','/mnt/data/20260923_1500_SN3_TR0.json')
 page.wait_for_function("()=>LineCapacityEngine.report()?.all===2382",timeout=180000)
 page.click('[data-view="map"]');page.wait_for_timeout(600)
 dims=page.evaluate("()=>({vw:innerWidth,body:document.body.scrollWidth,map:document.getElementById('mapWrap')?.getBoundingClientRect().toJSON(),toolbar:document.getElementById('v54Toolbar')?.getBoundingClientRect().toJSON()})")
 page.screenshot(path='/mnt/data/ytbs_v55_delivery/EKRAN_GORUNTULERI/v55_mobile_390.png',full_page=False)
 Path('/mnt/data/ytbs_v55_delivery/TEST_KAYITLARI/mobile_390.json').write_text(json.dumps({'dims':dims,'errors':errs},ensure_ascii=False,indent=2))
 print(json.dumps({'dims':dims,'errors':errs},ensure_ascii=False,indent=2));b.close()

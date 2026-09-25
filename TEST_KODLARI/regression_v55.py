from playwright.sync_api import sync_playwright
from pathlib import Path
import json, os, time
HTML=Path('/mnt/data/YTBS_PowerFactory_Sebeke_Goruntuleyici_v5_5.html').read_text()
models=[
 '/mnt/data/20260923_1200_SN3_TR0.json',
 '/mnt/data/20260923_1500_SN3_TR0.json',
 '/mnt/data/20260923_1600_SN3_TR0.json',
 '/mnt/data/20260923_1600_SN3_TR0(1).json',
 '/mnt/data/20260923_1600_SN3_TR0(2).json']
out=[]
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
 for mi,m in enumerate(models):
  page=browser.new_page(viewport={"width":1600,"height":950})
  errs=[]
  page.on('pageerror',lambda e,errs=errs:errs.append('PAGE:'+str(e)))
  page.on('console',lambda msg,errs=errs:errs.append('CONSOLE:'+msg.text) if msg.type=='error' else None)
  page.set_content(HTML,wait_until='load',timeout=120000)
  page.set_input_files('#fileInput',m)
  page.wait_for_function("()=>window.LineCapacityEngine?.report()?.all===2382",timeout=180000)
  cap=page.evaluate("()=>LineCapacityEngine.report()")
  # tab regression
  tabs={}
  for v in ['upload','static','dynamic','map','sld','analysis','info','settings']:
   try:
    page.click(f'[data-view="{v}"]',timeout=10000)
    page.wait_for_timeout(250)
    tabs[v]=page.evaluate(f"()=>document.getElementById('view-{v}')?.classList.contains('active')")
   except Exception as e: tabs[v]=False; errs.append('TAB '+v+': '+str(e))
  # map checks
  page.click('[data-view="map"]'); page.wait_for_timeout(500)
  groups=page.evaluate("()=>YTBS_V54_TEST.groups()")
  flow=page.evaluate("()=>YTBS_V55_TEST.flow()")
  max_count=max([x['count'] for x in flow['visible']] or [0])
  out.append({'model':os.path.basename(m),'capacity':cap,'tabs':tabs,'groups':groups,'flowVisible':len(flow['visible']),'flowMaxPerLine':max_count,'errors':errs,'title':page.title()})
  if mi in (0,1,2):
   # ensure P and flow on for visual screenshot
   page.evaluate("()=>{document.querySelector('[data-metric=\"P\"]')?.click();const f=document.getElementById('mapFlow');if(f&&!f.checked){f.checked=true;f.dispatchEvent(new Event('change'));}}")
   page.wait_for_timeout(1200)
   page.screenshot(path=f'/mnt/data/ytbs_v55_delivery/EKRAN_GORUNTULERI/{os.path.basename(m).replace(".json","")}_map.png')
  page.close()
 browser.close()
Path('/mnt/data/ytbs_v55_delivery/TEST_KAYITLARI/regression_5_models.json').write_text(json.dumps(out,ensure_ascii=False,indent=2))
print(json.dumps(out,ensure_ascii=False,indent=2))

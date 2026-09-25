from playwright.sync_api import sync_playwright
from pathlib import Path
import json,os,sys
m=sys.argv[1]
HTML=Path('/mnt/data/YTBS_PowerFactory_Sebeke_Goruntuleyici_v5_5.html').read_text()
res={}
with sync_playwright() as p:
 b=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
 page=b.new_page(viewport={"width":1450,"height":850}); errs=[]
 page.on('pageerror',lambda e:errs.append('PAGE:'+str(e)))
 page.on('console',lambda msg:errs.append('CONSOLE:'+msg.text) if msg.type=='error' else None)
 page.set_content(HTML,wait_until='load',timeout=120000)
 page.set_input_files('#fileInput',m)
 page.wait_for_function("()=>window.LineCapacityEngine?.report()?.all===2382",timeout=240000)
 tabs={}
 for v in ['upload','static','dynamic','map','sld','analysis','info','settings']:
  try:
   page.click(f'[data-view="{v}"]',timeout=8000);page.wait_for_timeout(150);tabs[v]=page.evaluate(f"()=>document.getElementById('view-{v}')?.classList.contains('active')")
  except Exception as e:tabs[v]=False;errs.append('TAB '+v+': '+str(e))
 page.click('[data-view="map"]');page.wait_for_timeout(400)
 res={'model':os.path.basename(m),'capacity':page.evaluate('()=>LineCapacityEngine.report()'),'tabs':tabs,'groups':page.evaluate('()=>YTBS_V54_TEST.groups()'),'errors':errs,'title':page.title(),'flowMax':page.evaluate("()=>Math.max(0,...YTBS_V55_TEST.flow().visible.map(x=>x.count))")}
 b.close()
out=f'/mnt/data/ytbs_v55_delivery/TEST_KAYITLARI/model_{os.path.basename(m).replace(".json","").replace("(","_").replace(")","")}.json'
Path(out).write_text(json.dumps(res,ensure_ascii=False,indent=2));print(json.dumps(res,ensure_ascii=False,indent=2))

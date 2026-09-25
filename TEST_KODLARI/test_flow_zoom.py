from playwright.sync_api import sync_playwright
from pathlib import Path
import json
HTML=Path('/mnt/data/YTBS_PowerFactory_Sebeke_Goruntuleyici_v5_5.html').read_text()
with sync_playwright() as p:
 b=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
 page=b.new_page(viewport={'width':1600,'height':950});errs=[]
 page.on('pageerror',lambda e:errs.append(str(e)))
 page.set_content(HTML,wait_until='load',timeout=120000);page.set_input_files('#fileInput','/mnt/data/20260923_1500_SN3_TR0.json');page.wait_for_function("()=>LineCapacityEngine.report()?.all===2382",timeout=180000)
 page.click('[data-view="map"]');page.wait_for_timeout(500)
 page.evaluate("()=>{document.querySelector('[data-metric=\"P\"]')?.click(); const f=document.getElementById('mapFlow'); if(f&&!f.checked){f.checked=true;f.dispatchEvent(new Event('change'));} focusLine('H5846');}")
 page.wait_for_timeout(1800)
 res=page.evaluate("()=>({zoom:mapCam.zoom, rows:YTBS_V55_TEST.flow().visible.filter(x=>x.id==='H5846'), status:document.getElementById('v55FlowStatus')?.textContent})")
 page.screenshot(path='/mnt/data/ytbs_v55_delivery/EKRAN_GORUNTULERI/v55_flow_focus_H5846.png')
 Path('/mnt/data/ytbs_v55_delivery/TEST_KAYITLARI/flow_zoom_H5846.json').write_text(json.dumps({'result':res,'errors':errs},ensure_ascii=False,indent=2))
 print(json.dumps({'result':res,'errors':errs},ensure_ascii=False,indent=2));b.close()

from playwright.sync_api import sync_playwright
from pathlib import Path
import json
HTML=Path('/mnt/data/YTBS_PowerFactory_Sebeke_Goruntuleyici_v5_5.html').read_text()
with sync_playwright() as p:
 b=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
 page=b.new_page();errs=[];page.on('pageerror',lambda e:errs.append(str(e)))
 page.set_content(HTML,wait_until='load',timeout=120000);page.set_input_files('#fileInput','/mnt/data/20260923_1200_SN3_TR0.json')
 page.wait_for_function("()=>LineCapacityEngine.report()?.all===2382",timeout=240000)
 page.wait_for_function("()=>{const t=document.getElementById('solverStatus')?.textContent||'';return /deneysel AC-PQ hesabı:|yakınsamadı/i.test(t)}",timeout=180000)
 res=page.evaluate("()=>({solver:YTBS_V55_TEST.solver(),status:document.getElementById('solverStatus')?.textContent,diag:document.getElementById('solverDiagnostics')?.textContent?.slice(0,5000)})")
 Path('/mnt/data/ytbs_v55_delivery/TEST_KAYITLARI/solver_1200.json').write_text(json.dumps({'result':res,'errors':errs},ensure_ascii=False,indent=2));print(json.dumps({'result':res,'errors':errs},ensure_ascii=False,indent=2)[:15000]);b.close()

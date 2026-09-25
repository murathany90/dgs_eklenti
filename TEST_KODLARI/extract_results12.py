from playwright.sync_api import sync_playwright
from pathlib import Path
import json
HTML=Path('/mnt/data/YTBS_PowerFactory_Sebeke_Goruntuleyici_v5_5.html').read_text()
with sync_playwright() as p:
 b=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
 page=b.new_page();page.set_content(HTML,wait_until='load',timeout=120000);page.set_input_files('#fileInput','/mnt/data/20260923_1200_SN3_TR0.json')
 page.wait_for_function("()=>LineCapacityEngine.report()?.all===2382",timeout=240000)
 page.wait_for_function("()=>{const t=document.getElementById('solverStatus')?.textContent||'';return /deneysel AC-PQ hesabı:/i.test(t)}",timeout=180000)
 rows=page.evaluate("()=>YTBS_V52_TEST.results().flatMap(s=>s.rows||[]).filter(r=>(r.cls==='ElmLne'&&r.metric==='P')||(r.cls==='ElmTerm'&&r.metric==='V')||((r.cls==='ElmSym'||r.cls==='ElmGenStat')&&r.metric==='Q'))")
 Path('/mnt/data/ytbs_v55_delivery/TEST_KAYITLARI/results_1200_rows.json').write_text(json.dumps(rows,ensure_ascii=False))
 print('rows',len(rows));b.close()

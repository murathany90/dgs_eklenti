"""One-time lossless split of the supplied v5.5 page into CSP-safe assets."""
from pathlib import Path
import hashlib
import json
import re
import sys

root = Path(__file__).resolve().parents[1]
source = root / "YTBS_PowerFactory_Sebeke_Goruntuleyici_v5_5.html"
page = source.read_text(encoding="utf-8")
legacy = root / "src" / "legacy"
workers = root / "workers"
data = root / "assets" / "data"
if (legacy / "script-00.js").exists() and "--force" not in sys.argv:
    raise SystemExit("Extraction is one-time; pass --force only if you intend to replace the v6 legacy adapters")
for folder in (legacy, workers, data, root / "src" / "workspace"):
    folder.mkdir(parents=True, exist_ok=True)

capacity_match = re.search(r"const EMBEDDED=(\{.*?\});\s*const \$53=", page, re.S)
if not capacity_match:
    raise RuntimeError("v5.5 capacity table was not found")
capacity = json.loads(capacity_match.group(1))
dataset = json.dumps(capacity, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
(data / "line-capacity-v1.json").write_bytes(dataset)
(data / "line-capacity-v1.meta.json").write_text(json.dumps({
    "datasetVersion": "1", "generatedAt": "2026-09-25", "source": "v5.5 EMBEDDED table, derived from 315-line Excel match",
    "sha256": hashlib.sha256(dataset).hexdigest(), "lineCount": len(capacity),
}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

style_index = 0
def replace_style(match):
    global style_index
    index = style_index
    style_index += 1
    path = legacy / f"style-{index:02}.css"
    path.write_text(match.group(2), encoding="utf-8")
    identifier = re.search(r'\bid="([^"]+)"', match.group(1))
    extra = f' id="{identifier.group(1)}"' if identifier else ""
    return f'<link rel="stylesheet" href="legacy/{path.name}"{extra}>'
page = re.sub(r"<style([^>]*)>(.*?)</style>", replace_style, page, flags=re.S | re.I)

script_index = 0
def replace_script(match):
    global script_index
    body = match.group(2)
    if 'id="solverWorkerSource"' in match.group(1):
        (workers / "solver.worker.js").write_text(body, encoding="utf-8")
        return ""
    index = script_index
    script_index += 1
    if index == 0:
        start = body.index("async function parseJSONOffMain(")
        end = body.index("// Show the real result provenance", start)
        body = body[:start] + """async function parseJSONOffMain(text, step) {
  if (typeof Worker === 'undefined') throw Error('Parser worker kullanılamıyor.');
  const worker = new Worker(new URL('workers/parser.worker.js', document.baseURI));
  try {
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('Parser worker zaman aşımı')), 180000);
      worker.onmessage = event => {
        const data = event.data;
        if (data.type === 'PARSE_PROGRESS') { step?.(data.message); return; }
        clearTimeout(timer);
        if (data.type === 'PARSE_COMPLETE') resolve(data.model);
        else reject(Error(data.error || 'JSON ayrıştırılamadı'));
      };
      worker.onerror = event => { clearTimeout(timer); reject(Error(event.message || 'Parser worker hatası')); };
      worker.postMessage({type:'LOAD_MODEL', text});
    });
  } finally { worker.terminate(); }
}
""" + body[end:]
        old = "const src=$('solverWorkerSource').textContent,blobUrl=URL.createObjectURL(new Blob([src],{type:'text/javascript'}));let worker;\n try{worker=new Worker(blobUrl);}finally{URL.revokeObjectURL(blobUrl);}v3.worker=worker;"
        if old not in body:
            raise RuntimeError("v5.5 blob solver hook was not found")
        body = body.replace(old, "const worker=new Worker(new URL('workers/solver.worker.js',document.baseURI));v3.worker=worker;")
    if "const EMBEDDED=" in body:
        body = re.sub(r"const EMBEDDED=\{.*?\};(?=\s*const \$53=)", "const EMBEDDED=window.__LINE_CAPACITY_DATA__||{};", body, count=1, flags=re.S)
    path = legacy / f"script-{index:02}.js"
    path.write_text(body, encoding="utf-8")
    return f'<script src="legacy/{path.name}"></script>'
page = re.sub(r"<script([^>]*)>(.*?)</script>", replace_script, page, flags=re.S | re.I)
page = page.replace("<title>YTBS | PowerFactory Şebeke Görüntüleyici ve Analiz Sistemi v4.3</title>", "<title>YTBS | Şebeke Görüntüleyici v6.0</title>")
page = page.replace("</head>", '<script src="capacity-data.js"></script><link rel="stylesheet" href="workspace.css"></head>', 1)
page = page.replace("</body>", '<script type="module" src="workspace.js"></script></body>', 1)
(root / "src" / "workspace" / "workspace.html").write_text(page, encoding="utf-8")
print(f"Extracted {style_index} styles, {script_index} scripts, solver worker, {len(capacity)} capacity records")

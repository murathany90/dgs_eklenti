import { buildCanonicalNetwork } from '../model/canonical-network.ts';
import type { CanonicalNetwork, DgsDocument } from '../model/types.ts';
import { validateNetwork, type Integrity } from '../validation/validation.ts';
import { putRecord, getRecord, deleteRecord } from '../storage/db.ts';
import { BrowserApproxSolver } from '../solvers/browser-approx-solver.ts';
import { PandapowerSolver, HostNotInstalledError } from '../solvers/pandapower-solver.ts';
import { toLegacyRows, type ResultSet } from '../analysis/result-set.ts';
import { fromLegacyRows } from '../analysis/legacy-adapter.ts';
import type { ElectricalCanonicalNetwork } from '../model/electrical-types.ts';

interface LegacyModel { raw: DgsDocument; rid: string; name: string; stats: Record<string, number> }
interface LegacyBridge {
  getActive: () => LegacyModel | null;
  getSolver: () => { solved?: number; total?: number; summary?: unknown[] } | null;
  getResultSets: () => Array<{ rows?: Array<{ cls?: string; id?: string; metric?: string; terminal?: string; unit?: string; quality?: string; value?: number; source?: string }> }>;
  getScenario: () => { lines: unknown[]; switches: unknown[] };
  runAnalysis: () => Promise<void>;
  loadFiles: (files: File[]) => Promise<void>;
  openView: (name: string) => void;
  addCalculatedResult: (name: string, rows: ReturnType<typeof toLegacyRows>, metadata: unknown) => void;
}
interface ParsedModel { model: DgsDocument; modelHash: string; electrical: ElectricalCanonicalNetwork; timings: { readMs: number; hashMs: number; parseMs: number; mapMs: number } }
declare global { interface Window {
  V6Legacy: LegacyBridge;
  V6Bridge?: { modelLoaded: (model: LegacyModel, file: File, parsed: ParsedModel) => void; scenarioChanged: () => void };
} }

const legacy = window.V6Legacy;
let network: CanonicalNetwork | null = null;
let integrity: Integrity = 'COMPLETE_UNVALIDATED';
let modelHash = '';
let lastApprox: ResultSet | null = null;
let lastPandapower: ResultSet | null = null;
let lastReference: ResultSet | null = null;
const analysis = document.querySelector<HTMLElement>('#view-analysis');
const metadata = document.createElement('section');
metadata.className = 'panel';
metadata.id = 'v6Metadata';
metadata.setAttribute('aria-label', 'Analiz kaynağı ve model kapsamı');
analysis?.prepend(metadata);
function updateMetadata(): void {
  const solver = legacy.getSolver();
  const entries = [
    ['ENGINE', 'BrowserApproxSolver · v5.5 / pandapower'], ['MODEL', legacy.getActive()?.name ?? 'Model bekleniyor'],
    ['TOPOLOGY', 'BUS_BRANCH / NODE_BREAKER'], ['SCOPE', `TRANSMISSION_REDUCED / FULL ${network?.electrical?.completeness ?? 'Model bekleniyor'}`],
    ['CONVERGENCE', solver ? `${solver.solved ?? 0}/${solver.total ?? 0} ada` : 'Hesap bekleniyor'],
    ['VALIDATION', integrity],
  ];
  metadata.replaceChildren(...entries.map(([label, value]) => {
    const item = document.createElement('div');
    const caption = document.createElement('small'); caption.textContent = label;
    const text = document.createElement('strong'); text.textContent = value;
    item.append(caption, text); return item;
  }));
}
updateMetadata();
const solver = new BrowserApproxSolver(legacy.runAnalysis, legacy.getSolver);
Object.assign(window, { V6Solver: solver });

function topologyInWorker(model: CanonicalNetwork): void {
  const worker = new Worker(new URL('workers/topology.worker.js', document.baseURI));
  const nodes = model.terminals.map(item => item.id);
  const edges = [...model.lines, ...model.switches].filter(item => item.terminals.length >= 2).map(item => [item.terminals[0], item.terminals[1]] as [string, string]);
  worker.onmessage = (event: MessageEvent<{ type: string; components?: number }>) => {
    if (event.data.type === 'TOPOLOGY_COMPLETE') { metadata.dataset.components = String(event.data.components); worker.terminate(); }
    if (event.data.type === 'TOPOLOGY_ERROR') worker.terminate();
  };
  worker.postMessage({ type: 'BUILD_TOPOLOGY', nodes, edges });
}
async function onModelLoaded(model: LegacyModel, file: File, parsed: ParsedModel): Promise<void> {
  metadata.dataset.components = '';
  modelHash = parsed.modelHash;
  network = buildCanonicalNetwork(model.raw, model.rid, modelHash, 'FULL');
  parsed.electrical.modelId = model.rid;
  network.electrical = parsed.electrical;
  lastApprox = null; lastPandapower = null; lastReference = null;
  const check = validateNetwork(network, model.raw);
  integrity = check.integrity;
  await putRecord('models', { id: modelHash, name: file.name, file, savedAt: Date.now() });
  await putRecord('canonical', { id: modelHash, electrical: parsed.electrical, integrity, findings: check.findings, timings: parsed.timings, savedAt: Date.now() });
  topologyInWorker(network);
  updateMetadata();
  renderSolverPanel();
  persistCurrentResult();
  const existing = document.querySelector<HTMLElement>('#v6Validation');
  existing?.remove();
  const panel = document.createElement('section'); panel.id = 'v6Validation'; panel.className = 'panel'; panel.dataset.modelName = file.name;
  const heading = document.createElement('h3'); heading.textContent = `Model doğrulama · ${integrity}`;
  const summary = document.createElement('p'); summary.textContent = `${check.findings.length} genel, ${parsed.electrical.findings.length} elektriksel bulgu · ${parsed.electrical.completeness} · okuma ${parsed.timings.readMs.toFixed(0)} ms · hash ${parsed.timings.hashMs.toFixed(0)} ms · parse ${parsed.timings.parseMs.toFixed(0)} ms · elektriksel mapping ${parsed.timings.mapMs.toFixed(0)} ms.`;
  panel.append(heading, summary);
  document.querySelector('#view-upload')?.append(panel);
}
window.V6Bridge = {
  modelLoaded: (model, file, parsed) => { void onModelLoaded(model, file, parsed).catch(error => { console.error('V6 model cache:', error); updateMetadata(); }); },
  scenarioChanged: () => { if (modelHash) void putRecord('scenarios', { id: `${modelHash}:latest`, snapshot: legacy.getScenario(), savedAt: Date.now() }); },
};

const status = document.querySelector<HTMLElement>('#solverStatus');
let lastStoredSet: unknown = null;
function persistCurrentResult(): void {
  if (!network || !legacy.getSolver()) return;
  const source = legacy.getResultSets().at(-1);
  if (source === lastStoredSet && source) return;
  lastStoredSet = source;
  const rows = (source?.rows ?? []).filter(row => typeof row.value === 'number' && Number.isFinite(row.value));
  const state = legacy.getSolver();
  lastApprox = fromLegacyRows(network, rows, state?.solved === state?.total ? 'CONVERGED' : 'PARTIAL');
  renderSolverPanel();
  void putRecord('results', { id: `${modelHash}:browser-approx`, result: lastApprox });
}
const observer = new MutationObserver(() => { updateMetadata(); persistCurrentResult(); });
if (status) observer.observe(status, { childList: true, subtree: true, characterData: true });
for (const id of ['v54ScenarioRun', 'runSolver']) document.querySelector(`#${id}`)?.addEventListener('click', () => {
  if (!modelHash) return;
  setTimeout(() => { void putRecord('scenarios', { id: `${modelHash}:latest`, snapshot: legacy.getScenario(), savedAt: Date.now() }); }, 0);
});

const solverPanel = document.createElement('section');
solverPanel.className = 'panel';
solverPanel.id = 'v61SolverPanel';
solverPanel.innerHTML = `<h3>Hesap Motoru · v6.1</h3><div class="row"><div class="field"><label for="v61Engine">Hesap Motoru</label><select id="v61Engine"><option value="browser">Browser Approx. · 66 kV+ indirgenmiş</option><option value="pandapower">pandapower · elektriksel model</option></select></div><div class="field"><label for="v61Mode">Mod</label><select id="v61Mode"><option value="AC">AC</option><option value="DC">DC</option></select></div><button class="primary" id="v61Run">Hesapla</button></div><p id="v61Status" class="notice warn">Model bekleniyor.</p><div class="mini" id="v61Scope"></div><h3>Motor karşılaştırması</h3><p class="mini">PowerFactory referansı sağlanmadıysa referans hata sütunları boş kalır. Görünen fark iki motorun sonucudur.</p><div class="row"><label for="v61Reference">Bağımsız PowerFactory ResultSet V2 JSON</label><input id="v61Reference" type="file" accept=".json,application/json"></div><div class="mini" id="v61ReferenceStatus">Referans yüklenmedi.</div><div class="scrolltbl" id="v61Comparison">İki motor sonucu bekleniyor.</div>`;
analysis?.insertBefore(solverPanel, metadata.nextSibling);
const engineSelect = solverPanel.querySelector<HTMLSelectElement>('#v61Engine')!;
const modeSelect = solverPanel.querySelector<HTMLSelectElement>('#v61Mode')!;
const v61Status = solverPanel.querySelector<HTMLElement>('#v61Status')!;
const scope = solverPanel.querySelector<HTMLElement>('#v61Scope')!;
const comparison = solverPanel.querySelector<HTMLElement>('#v61Comparison')!;
const nativeSolver = new PandapowerSolver();
engineSelect.onchange = () => { if (engineSelect.value === 'browser') { modeSelect.value = 'AC'; modeSelect.disabled = true; } else modeSelect.disabled = false; };
modeSelect.disabled = true;
const escapeHtml = (value: unknown): string => String(value ?? '—').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
const formatNumber = (value: number | null | undefined): string => value === null || value === undefined ? '—' : Number.isFinite(value) ? value.toLocaleString('tr-TR', { maximumFractionDigits: 4 }) : '—';
function metrics(result: ResultSet | null): Map<string, number> {
  const map = new Map<string, number>();
  if (!result) return map;
  const add = (name: string, value: number | null): void => { if (value !== null && Number.isFinite(value)) map.set(name, value); };
  for (const bus of result.buses) { add(`Bus ${bus.id} V (kV)`, bus.vKv); add(`Bus ${bus.id} açı (°)`, bus.angleDeg); }
  for (const branch of result.branches) { add(`Line ${branch.id} P-from (MW)`, branch.from.pMw); add(`Line ${branch.id} Q-from (MVAr)`, branch.from.qMvar); }
  for (const trafo of result.transformers) { add(`Trafo ${trafo.id} P-HV (MW)`, trafo.hv.pMw); add(`Trafo ${trafo.id} Q-HV (MVAr)`, trafo.hv.qMvar); }
  for (const generator of result.generators) add(`Generator ${generator.id} Q (MVAr)`, generator.qMvar);
  add('System loss P (MW)', result.summary.activeLossMw);
  add('System loss Q (MVAr)', result.summary.reactiveLossMvar);
  return map;
}
function renderSolverPanel(): void {
  if (!solverPanel) return;
  scope.textContent = network?.electrical ? `Kapsam ${network.electrical.completeness} · ${network.electrical.buses.length} bara · ${network.electrical.lines.length} hat · ${network.electrical.transformers.length} trafo · ${Object.values(network.electrical.findingCounts).reduce((a, b) => a + b, 0)} eşleme bulgusu` : 'Elektriksel model bekleniyor.';
  const browser = metrics(lastApprox), pandapower = metrics(lastPandapower), reference = metrics(lastReference);
  const names = [...new Set([...browser.keys(), ...pandapower.keys(), ...reference.keys()])].sort();
  if (!names.length) { comparison.textContent = 'Sonuç bekleniyor.'; return; }
  const visible = names.slice(0, 300);
  comparison.innerHTML = `<table><thead><tr><th>Metric</th><th>PowerFactory Reference</th><th>Pandapower</th><th>Browser Approx</th><th>Absolute Error</th><th>Relative Error</th><th>Motorlar arası fark</th></tr></thead><tbody>${visible.map(name => {
    const p = pandapower.get(name), b = browser.get(name), r = reference.get(name);
    const error = r === undefined || p === undefined ? null : Math.abs(r - p);
    return `<tr><td>${escapeHtml(name)}</td><td>${formatNumber(r)}</td><td>${formatNumber(p)}</td><td>${formatNumber(b)}</td><td>${formatNumber(error)}</td><td>${error === null || r === 0 || r === undefined ? '—' : formatNumber(error / Math.abs(r) * 100) + '%'}</td><td>${p === undefined || b === undefined ? '—' : formatNumber(Math.abs(p - b))}</td></tr>`;
  }).join('')}</tbody></table>${names.length > visible.length ? `<p class="mini">İlk ${visible.length}/${names.length} metrik gösteriliyor.</p>` : ''}`;
}
solverPanel.querySelector<HTMLInputElement>('#v61Reference')!.onchange = async event => {
  const file = (event.target as HTMLInputElement).files?.[0];
  const referenceStatus = solverPanel.querySelector<HTMLElement>('#v61ReferenceStatus')!;
  if (!file || !network) return;
  try {
    if (file.size > 20 * 1024 * 1024) throw Error('Referans dosyası 20 MB sınırını aşıyor');
    const candidate = JSON.parse(await file.text()) as ResultSet;
    if (candidate.schemaVersion !== '2.0' || candidate.modelHash !== network.modelHash || candidate.engine !== 'PowerFactory' || !Array.isArray(candidate.buses) || !Array.isArray(candidate.branches) || !Array.isArray(candidate.transformers) || !Array.isArray(candidate.generators) || !candidate.summary || typeof candidate.summary !== 'object') throw Error('PowerFactory ResultSet V2 veya model hash uyuşmuyor');
    lastReference = candidate;
    referenceStatus.textContent = `${file.name} · bağımsız referans karşılaştırması gösteriliyor; tolerans ve kaynak doğrulaması yapılmadı.`;
    renderSolverPanel();
  } catch (error) { lastReference = null; referenceStatus.textContent = `Referans yüklenemedi: ${String(error)}`; }
};
solverPanel.querySelector<HTMLButtonElement>('#v61Run')!.onclick = async () => {
  if (!network) { v61Status.textContent = 'Önce DGS modelini yükleyin.'; return; }
  const button = solverPanel.querySelector<HTMLButtonElement>('#v61Run')!;
  button.disabled = true;
  try {
    if (engineSelect.value === 'browser') {
      v61Status.textContent = 'Browser Approx. çalışıyor…';
      await solver.runLoadFlow(network, { mode: modeSelect.value as 'AC' | 'DC' });
      persistCurrentResult();
      v61Status.textContent = `Browser Approx. · ${lastApprox?.convergence ?? 'NOT_RUN'} · TRANSMISSION_REDUCED`;
      v61Status.className = 'notice warn';
    } else {
      const scenario = legacy.getScenario();
      if (scenario.lines.length || scenario.switches.length) throw Error('Pandapower yalnız temel model üzerinde çalışır; aktif senaryo değişiklikleri uygulanmaz. Önce senaryoyu sıfırlayın.');
      v61Status.textContent = 'pandapower host bağlantısı kuruluyor…';
      const result = await nativeSolver.runLoadFlow(network, { mode: modeSelect.value as 'AC' | 'DC' }, phase => { v61Status.textContent = `pandapower · ${phase}`; });
      lastPandapower = result;
      await putRecord('results', { id: `${modelHash}:pandapower:${modeSelect.value}`, result });
      if (result.convergence === 'CONVERGED') legacy.addCalculatedResult(`pandapower ${modeSelect.value} · ${result.validation}`, toLegacyRows(result), { resultSetVersion: '2.0', validation: result.validation });
      v61Status.textContent = `pandapower ${modeSelect.value} · ${result.convergence} · ${result.validation} · ${result.buses.length} bara · ${result.unsupported.length} dönüşüm uyarısı${result.warnings.length ? ' · ' + result.warnings[0] : ''}`;
      v61Status.className = `notice ${result.convergence === 'CONVERGED' ? result.validation === 'PARTIAL' ? 'warn' : '' : 'bad'}`;
    }
    renderSolverPanel();
  } catch (error) {
    v61Status.textContent = error instanceof HostNotInstalledError ? `HOST NOT INSTALLED · ${error.message}` : `Hesap başarısız: ${String(error)}`;
    v61Status.className = 'notice bad';
  } finally { button.disabled = false; }
};

void getRecord<{ file: File; name: string }>('models', 'pending').then(async record => {
  if (!record?.file) return;
  await deleteRecord('models', 'pending');
  await legacy.loadFiles([new File([record.file], record.name, { type: 'application/json' })]);
}).catch(error => console.warn('Bekleyen model okunamadı:', error));

document.title = 'YTBS | Şebeke Görüntüleyici v6.1';
const appTitle = document.querySelector<HTMLElement>('.apphead h1');
if (appTitle) appTitle.textContent = 'YTBS Şebeke Görüntüleyici v6.1';
const footer = document.querySelector<HTMLElement>('#footerRight');
if (footer) footer.textContent = 'YTBS · Chrome MV3 · v6.1 · pandapower AC/DC';

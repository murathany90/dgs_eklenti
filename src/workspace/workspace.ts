import { buildCanonicalNetwork } from '../model/canonical-network.ts';
import type { CanonicalNetwork, DgsDocument } from '../model/types.ts';
import { validateNetwork, type Integrity } from '../validation/validation.ts';
import { putRecord, getRecord, deleteRecord } from '../storage/db.ts';
import { BrowserApproxSolver } from '../solvers/browser-approx-solver.ts';
import type { ResultSet, ResultValue } from '../analysis/result-set.ts';

interface LegacyModel { raw: DgsDocument; rid: string; name: string; stats: Record<string, number> }
interface LegacyBridge {
  getActive: () => LegacyModel | null;
  getSolver: () => { solved?: number; total?: number; summary?: unknown[] } | null;
  getResultSets: () => Array<{ rows?: Array<{ cls?: string; id?: string; metric?: string; terminal?: string; unit?: string; quality?: string; value?: number; source?: string }> }>;
  getScenario: () => { lines: unknown[]; switches: unknown[] };
  runAnalysis: () => Promise<void>;
  loadFiles: (files: File[]) => Promise<void>;
  openView: (name: string) => void;
}
declare global { interface Window {
  V6Legacy: LegacyBridge;
  V6Bridge?: { modelLoaded: (model: LegacyModel, file: File) => void; scenarioChanged: () => void };
} }

const legacy = window.V6Legacy;
let network: CanonicalNetwork | null = null;
let integrity: Integrity = 'COMPLETE_UNVALIDATED';
let modelHash = '';
const analysis = document.querySelector<HTMLElement>('#view-analysis');
const metadata = document.createElement('section');
metadata.className = 'panel';
metadata.id = 'v6Metadata';
metadata.setAttribute('aria-label', 'Analiz kaynağı ve model kapsamı');
analysis?.prepend(metadata);
function updateMetadata(): void {
  const solver = legacy.getSolver();
  const entries = [
    ['ENGINE', 'BrowserApproxSolver · v5.5'], ['MODEL', legacy.getActive()?.name ?? 'Model bekleniyor'],
    ['TOPOLOGY', 'BUS_BRANCH · v5.5 indirgeme'], ['SCOPE', 'REDUCED TRANSMISSION MODEL · 66 kV+'],
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

async function hashFile(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
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
async function onModelLoaded(model: LegacyModel, file: File): Promise<void> {
  metadata.dataset.components = '';
  modelHash = await hashFile(file);
  network = buildCanonicalNetwork(model.raw, model.rid, modelHash, 'FULL');
  const check = validateNetwork(network, model.raw);
  integrity = check.integrity;
  await putRecord('models', { id: modelHash, name: file.name, file, savedAt: Date.now() });
  await putRecord('canonical', { id: modelHash, network, integrity, findings: check.findings, savedAt: Date.now() });
  topologyInWorker(network);
  updateMetadata();
  persistCurrentResult();
  const existing = document.querySelector<HTMLElement>('#v6Validation');
  existing?.remove();
  const panel = document.createElement('section'); panel.id = 'v6Validation'; panel.className = 'panel'; panel.dataset.modelName = file.name;
  const heading = document.createElement('h3'); heading.textContent = `Model doğrulama · ${integrity}`;
  const summary = document.createElement('p'); summary.textContent = `${check.findings.length} bulgu · YTBS koordinat profili: 35–42° enlem, 24–45° boylam.`;
  panel.append(heading, summary);
  document.querySelector('#view-upload')?.append(panel);
}
window.V6Bridge = {
  modelLoaded: (model, file) => { void onModelLoaded(model, file).catch(error => { console.error('V6 model cache:', error); updateMetadata(); }); },
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
  const map = (classes: string[]): ResultValue[] => rows.filter(row => classes.includes(row.cls ?? '')).map(row => ({
    id: String(row.id), value: Number(row.value), quality: row.quality === 'MEASURED' ? 'MEASURED' : 'APPROXIMATE',
    source: row.source ?? solver.id, metric: row.metric, terminal: row.terminal, unit: row.unit,
  }));
  const result: ResultSet = {
    engine: solver.id, engineVersion: '5.5', modelId: network.modelId, modelHash,
    timestamp: new Date().toISOString(), topologyMode: 'BUS_BRANCH', electricalScope: 'TRANSMISSION_REDUCED',
    convergence: legacy.getSolver()?.solved === legacy.getSolver()?.total ? 'CONVERGED' : 'PARTIAL', validation: 'REDUCED',
    warnings: ['Deneysel yaklaşık AC-PQ; PowerFactory referansı değildir.'],
    buses: map(['ElmTerm']), branches: map(['ElmLne', 'ElmScap']),
    generators: map(['ElmSym', 'ElmGenStat']), transformers: map(['ElmTr2']),
    losses: rows.filter(row => /loss|kayıp/i.test(row.metric ?? '')).map(row => ({id: String(row.id), value: Number(row.value), quality: 'APPROXIMATE', source: row.source ?? solver.id, metric: row.metric})),
  };
  void putRecord('results', { id: `${modelHash}:latest`, result });
}
const observer = new MutationObserver(() => { updateMetadata(); persistCurrentResult(); });
if (status) observer.observe(status, { childList: true, subtree: true, characterData: true });
for (const id of ['v54ScenarioRun', 'runSolver']) document.querySelector(`#${id}`)?.addEventListener('click', () => {
  if (!modelHash) return;
  setTimeout(() => { void putRecord('scenarios', { id: `${modelHash}:latest`, snapshot: legacy.getScenario(), savedAt: Date.now() }); }, 0);
});

void getRecord<{ file: File; name: string }>('models', 'pending').then(async record => {
  if (!record?.file) return;
  await deleteRecord('models', 'pending');
  await legacy.loadFiles([new File([record.file], record.name, { type: 'application/json' })]);
}).catch(error => console.warn('Bekleyen model okunamadı:', error));

document.title = 'YTBS | Şebeke Görüntüleyici v6.0';
const appTitle = document.querySelector<HTMLElement>('.apphead h1');
if (appTitle) appTitle.textContent = 'YTBS Şebeke Görüntüleyici v6.0';
const footer = document.querySelector<HTMLElement>('#footerRight');
if (footer) footer.textContent = 'YTBS · Chrome MV3 · v6.0 · deneysel AC/DC';

import { buildCanonicalNetwork } from '../model/canonical-network.ts';
import type { CanonicalNetwork, DgsDocument } from '../model/types.ts';
import { validateNetwork, type Integrity } from '../validation/validation.ts';
import { putRecord, getRecord, deleteRecord, getCalculation, getCalculationHistory, saveCalculation, type PersistedCalculation } from '../storage/db.ts';
import { BrowserApproxSolver } from '../solvers/browser-approx-solver.ts';
import { NativeHostError, PandapowerSolver } from '../solvers/pandapower-solver.ts';
import { toLegacyRows, type ACPreflightDiagnostics, type ResultSet } from '../analysis/result-set.ts';
import { fromLegacyRows } from '../analysis/legacy-adapter.ts';
import type { ElectricalCanonicalNetwork } from '../model/electrical-types.ts';
import { displayEquipmentType, presentUserText, primaryDisplayName } from '../presentation/equipmentPresentation.ts';
import { calculationKeyId, createCalculationKey, scenarioIsActive, sha256, type CalculationKey, type CalculationMetadata, type ScenarioPayload } from '../analysis/calculation-key.ts';
import { createCalculationJob, transitionCalculationJob, type CalculationJob, type CalculationJobState } from '../analysis/calculation-job.ts';
import { availabilityText, busAvailability } from '../analysis/result-availability.ts';
import { calculationEngineLabel, calculationHistoryText, convergenceStatusLabel } from '../presentation/calculationPresentation.ts';

interface LegacyModel { raw: DgsDocument; rid: string; name: string; stats: Record<string, number> }
interface LegacyBridge {
  getActive: () => LegacyModel | null;
  getSolver: () => { solved?: number; total?: number; summary?: unknown[] } | null;
  getResultSets: () => Array<{ rows?: Array<{ cls?: string; id?: string; metric?: string; terminal?: string; unit?: string; quality?: string; value?: number; source?: string }> }>;
  getScenario: () => { lines: unknown[]; switches: unknown[]; restoredTerminals?: string[]; autoRestoreTerminals?: boolean; revision?: number };
  restoreScenario?: (snapshot: Partial<ScenarioPayload>) => void;
  runAnalysis: () => Promise<void>;
  loadFiles: (files: File[]) => Promise<void>;
  openView: (name: string) => void;
  addCalculatedResult: (name: string, rows: ReturnType<typeof toLegacyRows>, metadata: unknown) => void;
}
interface ParsedModel { model: DgsDocument; modelHash: string; electrical: ElectricalCanonicalNetwork; timings: { readMs: number; hashMs: number; parseMs: number; mapMs: number } }
type Engine = 'browser' | 'pandapower';
interface AnalysisState {
  activeEngine: Engine; activeMode: 'AC' | 'DC'; activeResult: ResultSet | null;
  activeCalculationKeyId: string | null; calculationsByKey: Map<string, PersistedCalculation<ResultSet>>;
  referenceResult: ResultSet | null; preflight: ACPreflightDiagnostics | null; integrity: Integrity;
  calculationJob: CalculationJob; calculationHistory: PersistedCalculation[];
}
declare global { interface Window {
  V6Legacy: LegacyBridge;
  V6Bridge?: { modelLoaded: (model: LegacyModel, file: File, parsed: ParsedModel) => void; scenarioChanged: () => void; scenarioCalculated: () => void };
  YTBS_AnalysisState?: AnalysisState;
} }

const legacy = window.V6Legacy;
let network: CanonicalNetwork | null = null;
let modelHash = '';
let activeKeyGeneration = 0;
let currentCalculationKey: CalculationKey | null = null;
let pendingCachedCalculation: PersistedCalculation<ResultSet> | null = null;
let jobTimer: ReturnType<typeof setInterval> | null = null;
let healthGeneration = 0;
let lastNativeHostError: NativeHostError | null = null;
const analysisState: AnalysisState = { activeEngine: 'browser', activeMode: 'AC', activeResult: null,
  activeCalculationKeyId: null, calculationsByKey: new Map(), referenceResult: null, preflight: null,
  calculationJob: createCalculationJob('idle'), calculationHistory: [], integrity: 'COMPLETE_UNVALIDATED' };
window.YTBS_AnalysisState = analysisState;
const analysis = document.querySelector<HTMLElement>('#view-analysis')!;
const upload = document.querySelector<HTMLElement>('#view-upload')!;
const scenarioView = document.querySelector<HTMLElement>('#view-scenario')!;
const scenarioMount = document.querySelector<HTMLElement>('#scenarioPanelMount')!;
const footer = document.querySelector<HTMLElement>('#footerRight');
const nf = new Intl.NumberFormat('tr-TR');
const fmt = (value: number | null | undefined, digits = 2): string => value === null || value === undefined || !Number.isFinite(value) ? '—' : value.toLocaleString('tr-TR', { maximumFractionDigits: digits });
const safe = (value: unknown): string => String(value ?? '—').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

// Keep the mature import, map, SLD and scenario features in place while putting their entry points into a simpler shell.
const heading = analysis.querySelector<HTMLElement>(':scope > .heading');
if (heading) {
  const headingTitle = heading.querySelector('h2'); if (headingTitle) headingTitle.textContent = 'Analiz Merkezi';
  const headingSub = heading.querySelector('.sub'); if (headingSub) headingSub.textContent = 'AC/DC yük akışı, model kapsamı ve referans karşılaştırması';
}
const oldScenario = document.querySelector<HTMLElement>('#v42ScenarioPanel') ?? document.querySelector<HTMLElement>('#v4ScenarioLine')?.closest<HTMLElement>('.panel') ?? null;
const oldScenarioWarning = document.querySelector<HTMLElement>('#v4ValidationAnalysis');
if (oldScenarioWarning) scenarioMount.append(oldScenarioWarning);
if (oldScenario) scenarioMount.append(oldScenario);
const legacyDetails = document.createElement('details');
legacyDetails.className = 'panel';
legacyDetails.id = 'legacyAnalysisDetails';
legacyDetails.innerHTML = '<summary>Eski sonuç görünümleri ve teknik ayrıntılar</summary>';
for (const child of Array.from(analysis.children)) if (child !== heading) legacyDetails.append(child);
analysis.append(legacyDetails);

const technicalInventory = document.querySelector<HTMLDetailsElement>('#technicalInventory');
if (technicalInventory) technicalInventory.open = false;
const settingsRoot = document.querySelector<HTMLElement>('.settinggrid > .panel');
const technicalToggleRow = document.createElement('label');
technicalToggleRow.className = 'check';
technicalToggleRow.style.marginTop = '12px';
technicalToggleRow.innerHTML = '<input type="checkbox" id="technicalDgsToggle"> Teknik DGS alanlarını göster';
settingsRoot?.append(technicalToggleRow);
technicalToggleRow.querySelector('input')!.id = 'technicalDetailsToggle';
technicalToggleRow.querySelector('input')!.parentElement!.lastChild!.textContent = ' Teknik ayrıntıları göster';
const technicalToggle = document.querySelector<HTMLInputElement>('#technicalDetailsToggle')!;
const legacyTechnicalToggle = document.querySelector<HTMLInputElement>('#v5ShowTech');
const legacyTechnicalRow = document.querySelector<HTMLElement>('#v5TechSetting');
if (legacyTechnicalRow) legacyTechnicalRow.hidden = true;
let technicalMode = localStorage.getItem('ytbs-technical-dgs') === 'true' || legacyTechnicalToggle?.checked === true;
technicalToggle.checked = technicalMode;
if (technicalInventory) technicalInventory.open = technicalMode;

const textOriginals = new WeakMap<Text, { raw: string; output: string }>();
const attributeOriginals = new WeakMap<Element, Map<string, { raw: string; output: string }>>();
function presentationSweep(): void {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const text = node as Text;
    const old = textOriginals.get(text);
    const raw = old && text.data === old.output ? old.raw : text.data;
    const output = technicalMode ? raw : presentUserText(raw).replace(/\bv[345](?:\.\d+)+\b/gi, '');
    if (output !== text.data) text.data = output;
    textOriginals.set(text, { raw, output });
  }
  for (const element of Array.from(document.body.querySelectorAll<HTMLElement>('[title],[placeholder],[aria-label]'))) {
    const records = attributeOriginals.get(element) ?? new Map<string, { raw: string; output: string }>();
    for (const attr of ['title', 'placeholder', 'aria-label']) {
      const current = element.getAttribute(attr); if (current === null) continue;
      const old = records.get(attr);
      const raw = old && current === old.output ? old.raw : current;
      const output = technicalMode ? raw : presentUserText(raw).replace(/\bv[345](?:\.\d+)+\b/gi, '');
      if (output !== current) element.setAttribute(attr, output);
      records.set(attr, { raw, output });
    }
    attributeOriginals.set(element, records);
  }
}
technicalToggle.onchange = () => {
  technicalMode = technicalToggle.checked;
  if (legacyTechnicalToggle) { legacyTechnicalToggle.checked = technicalMode; legacyTechnicalToggle.dispatchEvent(new Event('change')); }
  localStorage.setItem('ytbs-technical-dgs', String(technicalMode));
  if (technicalInventory) technicalInventory.open = technicalMode;
  presentationSweep();
};
const presentationObserver = new MutationObserver(() => presentationSweep());
presentationObserver.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['title', 'placeholder', 'aria-label'] });

function switchLegacyView(view: string): void {
  document.querySelector<HTMLButtonElement>(`.legacy-tabs .tab[data-view="${view}"]`)?.click();
}
let currentModelView = 'upload';
const mainTabs = Array.from(document.querySelectorAll<HTMLButtonElement>('#primaryTabs [data-primary]'));
const modelSubTabs = Array.from(document.querySelectorAll<HTMLButtonElement>('#modelSubTabs [data-model-view]'));
function activateScenarioView(): void {
  switchLegacyView('analysis');
  document.querySelectorAll('.view').forEach(view => view.classList.toggle('active', view === scenarioView));
  scenarioView.classList.add('active');
  document.querySelector('#modelSubTabs')?.setAttribute('hidden', '');
}
function navigate(primary: string): void {
  mainTabs.forEach(button => button.classList.toggle('active', button.dataset.primary === primary));
  document.querySelector('#modelSubTabs')?.toggleAttribute('hidden', primary !== 'model');
  if (primary === 'model') switchLegacyView(currentModelView);
  else if (primary === 'scenario') activateScenarioView();
  else if (primary === 'help') switchLegacyView('info');
  else if (primary === 'settings') switchLegacyView('settings');
  else switchLegacyView(primary);
}
mainTabs.forEach(button => button.addEventListener('click', () => navigate(button.dataset.primary!)));
document.querySelectorAll<HTMLButtonElement>('.helperActions [data-primary]').forEach(button => button.addEventListener('click', () => navigate(button.dataset.primary!)));
const mapCalculateButton = document.querySelector<HTMLButtonElement>('#v54ScenarioRun');
if (mapCalculateButton) { mapCalculateButton.id = 'v54GoAnalysis'; mapCalculateButton.textContent = 'Analize git'; mapCalculateButton.onclick = () => navigate('analysis'); }
const mapImpactButton = document.querySelector<HTMLButtonElement>('#v54Impact');
if (mapImpactButton) { mapImpactButton.id = 'v54GoScenario'; mapImpactButton.textContent = 'Senaryoya git'; mapImpactButton.onclick = () => navigate('scenario'); }
const legacyMapSolverToolbar = document.querySelector<HTMLElement>('#v51Toolbar');
if (legacyMapSolverToolbar) legacyMapSolverToolbar.hidden = true;
modelSubTabs.forEach(button => button.addEventListener('click', () => {
  currentModelView = button.dataset.modelView === 'quality' ? 'upload' : button.dataset.modelView!;
  modelSubTabs.forEach(item => item.classList.toggle('active', item === button));
  switchLegacyView(currentModelView);
  if (button.dataset.modelView === 'quality') document.querySelector('#qualitySummary')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}));

const metadata = document.createElement('section');
metadata.className = 'analysisStateCards';
metadata.id = 'v6Metadata';
metadata.setAttribute('aria-label', 'Etkin analiz durumu');
analysis.insertBefore(metadata, legacyDetails);

const solverPanel = document.createElement('section');
solverPanel.className = 'panel';
solverPanel.id = 'v61SolverPanel';
solverPanel.innerHTML = `<div class="heading"><div><h2>Elektriksel Analiz</h2><span class="sub">AC/DC yük akışı, model kapsamı ve referans karşılaştırması</span></div></div>
  <div class="analysisToolbar"><div class="field"><label for="v61Engine">Hesap motoru</label><select id="v61Engine"><option value="browser">Tarayıcı Yaklaşık Çözüm</option><option value="pandapower">Yerel Tam Şebeke Çözücüsü</option></select></div>
  <div class="field"><label for="v61Mode">Analiz</label><select id="v61Mode"><option value="AC">AC Yük Akışı</option><option value="DC">DC Aktif Güç Akışı</option></select></div>
  <button class="primary" id="v61Run">Hesapla</button><button type="button" id="v61HostHealthButton">Bağlantıyı test et</button><button id="v61ReferenceButton" type="button">PowerFactory referansı yükle</button><input id="v61Reference" type="file" accept=".json,application/json" hidden></div>
  <p id="v61HostHealth" class="notice warn" role="status">Grid Analyzer Yerel Hesap Motoru henüz test edilmedi.</p>
  <p id="v61ScenarioSolverNotice" class="notice warn" hidden>Bu hesap motoru bu sürümde sanal senaryoyu uygulamıyor. Senaryoyu sıfırlayın veya Tarayıcı Yaklaşık Çözüm seçin.</p>
  <div id="v61InstallationHelp" class="panel" hidden></div>
  <p id="v61Status" class="notice warn">Önce bir model yükleyin.</p>
  <p id="v61JobState" class="mini" role="status">Hesap bekleniyor.</p>
  <div class="row" id="v61HostActions" hidden><button type="button" id="v61InstallHelp">Kurulum Yardımı</button><button type="button" id="v61Retry">Bağlantıyı Tekrar Kontrol Et</button><details><summary>Teknik ayrıntılar</summary><pre id="v61TechnicalError"></pre></details></div>
  <section id="v61CachePrompt" class="panel" role="dialog" aria-labelledby="v61CacheTitle" hidden><div class="heading"><h3 id="v61CacheTitle">Önceki hesap bulundu</h3></div><p id="v61CacheDescription"></p><div class="row"><button id="v61ShowCached" type="button">Mevcut sonucu göster</button><button id="v61Recalculate" class="primary" type="button">Yeniden hesapla</button></div></section>
  <div id="v61Scope" class="mini"></div>
  <div class="row"><div class="field"><label for="v61BusSelect">Bara sonucu ve kullanılabilirlik nedeni</label><select id="v61BusSelect"><option value="">Bara seçin</option></select></div><div id="v61BusAvailability" class="notice" role="status">Bara seçilmedi.</div></div>
  <div id="v61Preflight" class="panel" hidden><div class="heading"><div><h3>AC Ön Kontrol Tanıları</h3><span class="sub">Model dönüştürmesinden alınan bağlantı ve kontrol özeti</span></div><details id="v61PreflightDetails"><summary>Yakınsamama Ayrıntıları</summary><div id="v61PreflightGrid" class="preflightGrid"></div><details><summary>Tanı JSON'u · teknik ayrıntı</summary><pre id="v61PreflightJson" class="rawpre"></pre></details></details></div></div>
  <section id="v61NonConvergence" class="notice bad" hidden></section><section id="v61DcSuccess" class="notice" hidden></section>
  <details id="v61HistoryDetails"><summary>Son hesaplamalar</summary><ol id="v61History"></ol></details>
  <div class="row" style="margin-top:16px"><div class="field"><label for="v61Filter">Sonuç kapsamı</label><select id="v61Filter"><option value="all">Tümü</option><option value="bus">Baralar</option><option value="line">Hatlar</option><option value="transformer">Transformatörler</option><option value="generator">Üretim</option><option value="system">Sistem</option></select></div><div class="field grow"><label for="v61Search">Ekipman adı veya kimliği</label><input id="v61Search" type="search" placeholder="Ekipman adı veya kimliği ile ara"></div><span class="mini" id="v61ReferenceStatus">PowerFactory referansı yüklenmedi.</span></div>
  <div class="scrolltbl" id="v61Comparison">Sonuç bekleniyor.</div><div class="pager" id="v61Pager"></div>`;
analysis.insertBefore(solverPanel, metadata);
solverPanel.insertBefore(metadata, solverPanel.querySelector('#v61Scope'));

const engineSelect = solverPanel.querySelector<HTMLSelectElement>('#v61Engine')!;
const modeSelect = solverPanel.querySelector<HTMLSelectElement>('#v61Mode')!;
const runButton = solverPanel.querySelector<HTMLButtonElement>('#v61Run')!;
const v61Status = solverPanel.querySelector<HTMLElement>('#v61Status')!;
const comparison = solverPanel.querySelector<HTMLElement>('#v61Comparison')!;
const scope = solverPanel.querySelector<HTMLElement>('#v61Scope')!;
const pageSize = 50;
let resultPage = 0;
const resultMetricCache = new WeakMap<ResultSet, MetricRecord[]>();
interface MetricRecord { key: string; category: string; id: string; name: string; type: string; metric: string; unit: string; value: number }
interface ComparisonRecord { key: string; category: string; id: string; name: string; type: string; metric: string; unit: string; reference?: number; pandapower?: number; browser?: number }

const equipmentNamesByElectricalModel = new WeakMap<object, Map<string, string>>();
function equipmentNameIndex(): Map<string, string> | null {
  const electrical = network?.electrical;
  if (!electrical) return null;
  let index = equipmentNamesByElectricalModel.get(electrical);
  if (!index) {
    index = new Map<string, string>();
    const groups = [electrical.buses, electrical.lines, electrical.transformers, electrical.generators,
      electrical.loads, electrical.shunts, electrical.seriesCompensators, electrical.externalGrids, electrical.switches];
    for (const group of groups) for (const item of group) if (item.name) index.set(item.id, item.name);
    equipmentNamesByElectricalModel.set(electrical, index);
  }
  return index;
}
function equipmentName(id: string, fallback?: string): string {
  return equipmentNameIndex()?.get(id) || fallback || id;
}
function metricRecords(result: ResultSet | null): MetricRecord[] {
  if (!result) return [];
  const cached = resultMetricCache.get(result); if (cached) return cached;
  const rows: MetricRecord[] = [];
  const add = (category: string, id: string, type: string, metric: string, unit: string, value: number | null, name?: string): void => {
    if (value === null || !Number.isFinite(value)) return;
    rows.push({ key: `${category}|${id}|${metric}`, category, id, name: equipmentName(id, name), type: displayEquipmentType(type), metric, unit, value });
  };
  for (const item of result.buses) { add('bus', item.id, 'ElmTerm', 'Gerilim', 'kV', item.vKv); add('bus', item.id, 'ElmTerm', 'Faz açısı', '°', item.angleDeg); }
  for (const item of result.branches) {
    const type = item.kind === 'LINE' ? 'ElmLne' : 'ElmScap';
    add('line', item.id, type, 'Aktif güç · ilk uç', 'MW', item.from.pMw);
    add('line', item.id, type, 'Reaktif güç · ilk uç', 'MVAr', item.from.qMvar);
    add('line', item.id, type, 'Yüklenme', '%', item.loadingPercent);
  }
  for (const item of result.transformers) {
    add('transformer', item.id, 'ElmTr2', 'Aktif güç · yüksek gerilim ucu', 'MW', item.hv.pMw);
    add('transformer', item.id, 'ElmTr2', 'Reaktif güç · yüksek gerilim ucu', 'MVAr', item.hv.qMvar);
    add('transformer', item.id, 'ElmTr2', 'Yüklenme', '%', item.loadingPercent);
  }
  for (const item of result.generators) {
    const type = item.powerFactoryClass ?? 'ElmSym';
    add('generator', item.id, type, 'Aktif güç', 'MW', item.pMw);
    add('generator', item.id, type, 'Reaktif güç', 'MVAr', item.qMvar);
  }
  for (const item of result.externalGrids) {
    add('system', item.id, 'ElmXnet', 'Dış kaynak aktif güç', 'MW', item.pMw);
    add('system', item.id, 'ElmXnet', 'Dış kaynak reaktif güç', 'MVAr', item.qMvar);
  }
  add('system', 'network', 'ElmNet', 'Aktif kayıp', 'MW', result.summary.activeLossMw, 'Şebeke toplamı');
  add('system', 'network', 'ElmNet', 'Reaktif kayıp', 'MVAr', result.summary.reactiveLossMvar, 'Şebeke toplamı');
  resultMetricCache.set(result, rows);
  return rows;
}
function engineLabel(engine: Engine): string { return calculationEngineLabel(engine === 'browser' ? 'browser-approx' : 'pandapower'); }
function convergenceLabel(result: ResultSet | null): string {
  if (!result) return 'Hesap bekleniyor';
  return convergenceStatusLabel(result.convergence);
}
function validationLabel(result: ResultSet | null): string {
  if (!result) return 'Referans ve çözüm bekleniyor';
  if (analysisState.referenceResult?.modelHash === result.modelHash) return 'PowerFactory referansı yüklendi; tolerans denetimi yapılmadı';
  if (result.validation === 'COMPLETE_UNVALIDATED') return 'Bağımsız PowerFactory referansı yok';
  if (result.validation === 'PARTIAL') return 'Eşleme kısmi; bağımsız referans yok';
  return 'Bağımsız referans bekleniyor';
}
function scenarioPayload(): ScenarioPayload {
  const scenario = legacy.getScenario();
  return { lines: scenario.lines, switches: scenario.switches, restoredTerminals: scenario.restoredTerminals ?? [], autoRestoreTerminals: scenario.autoRestoreTerminals === true };
}
function selectedMode(): 'AC' | 'DC' { return analysisState.activeEngine === 'browser' ? 'AC' : analysisState.activeMode; }
async function makeSelectedKey(): Promise<CalculationKey> {
  const engine = analysisState.activeEngine;
  const mode = selectedMode();
  const scenario = scenarioPayload();
  return createCalculationKey({
    modelHash,
    engine: engine === 'browser' ? 'browser-approx' : 'pandapower',
    mode,
    scenario,
    solverVersion: engine === 'browser' ? 'browser-approx-v5.5' : 'pandapower@3.5.5/protocol-1.0',
    options: engine === 'browser' ? { scope: 'TRANSMISSION_REDUCED' } : { algorithm: 'nr', enforce_q_lims: true, max_iteration: 30, numba: false },
  });
}
async function updateActiveResult(): Promise<void> {
  const generation = ++activeKeyGeneration;
  analysisState.activeResult = null;
  analysisState.activeCalculationKeyId = null;
  currentCalculationKey = null;
  pendingCachedCalculation = null;
  solverPanel.querySelector<HTMLElement>('#v61CachePrompt')!.hidden = true;
  if (!modelHash) { renderMetadata(); renderComparison(); renderBusAvailability(); return; }
  try {
    const key = await makeSelectedKey();
    if (generation !== activeKeyGeneration) return;
    currentCalculationKey = key;
    const id = calculationKeyId(key);
    analysisState.activeCalculationKeyId = id;
    analysisState.activeResult = null;
    renderMetadata(); renderComparison(); renderBusAvailability();
  } catch (error) { console.warn('Calculation key lookup failed:', error); }
}
function renderBusAvailability(): void {
  const picker = solverPanel.querySelector<HTMLSelectElement>('#v61BusSelect');
  const output = solverPanel.querySelector<HTMLElement>('#v61BusAvailability');
  if (!picker || !output) return;
  const sourceBuses = network?.terminals ?? [];
  const buses = network?.electrical?.buses ?? [];
  const selected = picker.value;
  picker.replaceChildren(new Option('Bara seçin', ''), ...sourceBuses.map(bus => {
    const mapped = buses.find(item => item.id === bus.id);
    return new Option(`${bus.name || bus.id} · ${mapped?.nominalKv ?? '?'} kV`, bus.id);
  }));
  if (sourceBuses.some(bus => bus.id === selected)) picker.value = selected;
  const sourceBus = sourceBuses.find(item => item.id === picker.value);
  if (!sourceBus) { output.textContent = 'Bara seçilmedi.'; return; }
  const bus = buses.find(item => item.id === sourceBus.id);
  const result = analysisState.activeResult;
  const row = result?.buses.find(item => item.id === sourceBus.id);
  const reason = busAvailability(result, {
    inService: bus?.inService ?? Number(sourceBus.source.outserv ?? 0) !== 1,
    mapped: !!bus,
    inScope: analysisState.activeEngine === 'pandapower' || (bus?.nominalKv ?? 0) >= 66,
    supplied: !result?.preflight?.unsuppliedBusIds?.includes(sourceBus.id),
    metric: 'voltage', numericValue: row?.vKv,
  });
  const voltage = reason === 'AVAILABLE' ? `${fmt(row?.vKv)} kV` : '—';
  const angle = Number.isFinite(row?.angleDeg) ? `${fmt(row?.angleDeg)}°` : '—';
  const angleReason = result?.summary.mode === 'DC' && angle !== '—' ? 'DC analizinde açı hesaplanır.' : '';
  output.textContent = `Gerilim: ${voltage}\nNeden: ${availabilityText[reason]}\nAçı: ${angle}${angleReason ? ` · ${angleReason}` : ''}`;
  output.dataset.reason = reason;
}
function renderMetadata(): void {
  const result = analysisState.activeResult;
  const electrical = network?.electrical;
  const coverage = electrical?.modelCoverage.pvGeneratorQLimits;
  const mappingText = !electrical ? 'Model bekleniyor' : `${electrical.completeness === 'COMPLETE' ? 'Eşleme hazır' : 'Kısmi eşleme'} · ${coverage?.available ?? 0}/${coverage?.total ?? 0} PV ünitesinde iki Q sınırı`;
  const scopeText = analysisState.activeEngine === 'browser' ? '66 kV+ indirgenmiş ağ' : electrical ? 'Tam gerilim kapsamı' : 'Model bekleniyor';
  const entries = [
    ['HESAP DURUMU', convergenceLabel(result), `${engineLabel(analysisState.activeEngine)} · ${analysisState.activeMode} yük akışı`],
    ['MODEL KAPSAMI', scopeText, analysisState.activeEngine === 'pandapower' ? `${electrical?.completeness === 'COMPLETE' ? 'Eşleme tam' : 'Eşleme kısmi'} · çözüm kapsamından ayrı` : 'Yaklaşık hesap kapsamı'],
    ['ELEKTRİKSEL EŞLEME', mappingText, `${electrical?.controls.filter(item => item.mappingStatus === 'MAPPED_BUT_NOT_SOLVED').length ?? 0} kaynak kontrolü eşlendi, çözülmedi`],
    ['REFERANS DOĞRULAMASI', validationLabel(result), 'Çözüm ile bağımsız sonuçların karşılaştırması'],
  ];
  metadata.replaceChildren(...entries.map(([label, value, detail]) => {
    const card = document.createElement('div'); card.className = 'analysisStateCard';
    const caption = document.createElement('small'); caption.textContent = label;
    const strong = document.createElement('strong'); strong.textContent = value;
    const note = document.createElement('span'); note.textContent = detail;
    card.append(caption, strong, note); return card;
  }));
  metadata.dataset.components = metadata.dataset.components || '';
}
function renderScope(): void {
  const electrical = network?.electrical;
  if (!electrical) { scope.textContent = 'Elektriksel model bekleniyor.'; return; }
  const coverage = electrical.modelCoverage;
  const selectedScope = analysisState.activeEngine === 'browser' ? 'Tarayıcı Yaklaşık Çözüm · 66 kV+ indirgenmiş ağ' : 'Yerel Tam Şebeke Çözücüsü · tam gerilim kapsamı';
  scope.textContent = `${selectedScope} · ${nf.format(electrical.buses.length)} bara · ${nf.format(electrical.lines.length)} hat · ${nf.format(electrical.transformers.length)} transformatör · eşleme ${electrical.completeness === 'COMPLETE' ? 'tam' : 'kısmi'} · ${nf.format(coverage.stationControls?.total ?? 0)} istasyon kontrol kaydı (çözücüye uygulanmıyor)`;
}

function preflightEntries(d: ACPreflightDiagnostics): Array<[string, string]> {
  return [
    ['Toplam / servisteki bara', `${nf.format(d.modelCounts.bus)} / ${nf.format(d.inServiceBusCount)}`],
    ['Elektriksel ada', `${nf.format(d.electricalIslandCount)} · kaynaklı ${nf.format(d.islandsWithSlackCount)} · kaynaksız ${nf.format(d.islandsWithoutSlackCount)}`],
    ['Kaynaksız bara', nf.format(d.unsuppliedBusCount)],
    ['Üretim − tüketim başlangıç farkı', `${fmt(d.initialPImbalanceMw)} MW`],
    ['PV / PQ bara', `${nf.format(d.pvBusCount)} / ${nf.format(d.pqBusCount)}`],
    ['Q sınırı eksik PV üretim ünitesi', `${nf.format(d.pvUnitsMissingQLimits)} / ${nf.format(d.pvUnitCount)}`],
    ['İstasyon kontrolü · serviste', `${nf.format(d.stationControlsInService ?? 0)} / ${nf.format(d.stationControlCount ?? 0)}`],
    ['Uzak gerilim kontrolü · reaktif paylaşım · droop', `${nf.format(d.remoteVoltageControllerCount ?? 0)} / ${nf.format(d.reactiveSharingRecordCount ?? 0)} / ${nf.format(d.droopRecordCount ?? 0)}`],
    ['Geçersiz gerilim ayarı', nf.format(d.pvUnitsInvalidVoltageSetpoint)],
    ['Gerilim ayarı aralığı', `${fmt(d.minVmSetpointPu, 4)}–${fmt(d.maxVmSetpointPu, 4)} p.u.`],
    ['Trafo sınır dışı / nötrden >10 kademe', `${nf.format(d.transformerTapOutsideDeclaredLimits)} / ${nf.format(d.transformerTapDeviationAbsGreaterThan10)}`],
    ['Faz açısı eksik transformatör', nf.format(d.transformerPhaseAngleMissing)],
    ['Trafo faz açısı · sargı bağlantısı kapsamı', `${nf.format(d.transformerPhaseAngleCoverage?.available ?? 0)}/${nf.format(d.transformerPhaseAngleCoverage?.total ?? d.modelCounts.transformer)} · ${nf.format(d.transformerWindingConnectionCoverage?.available ?? 0)}/${nf.format(d.transformerWindingConnectionCoverage?.total ?? d.modelCounts.transformer)}`],
    ['Desteklenmeyen / çözülmeyen kontrol', nf.format(d.unsupportedOrUnsolvedControlCount)],
    ['Açık / kapalı anahtar', `${nf.format(d.openSwitchCount)} / ${nf.format(d.closedSwitchCount)}`],
    ['Eşlenmeyen eleman', nf.format(d.elementsNotMapped)],
    ['Sıfır empedans / küçük X / negatif X', `${nf.format(d.zeroImpedanceCount)} / ${nf.format(d.verySmallReactanceCount)} / ${nf.format(d.negativeReactanceCount)}`],
    ['Kompanzasyonlu aday net X ≤ 0 yolu', nf.format(d.candidateNonPositiveCompensatedPathCount)],
    ['Dış şebeke kaynağı / dönüştürme bildirimi', `${nf.format(d.externalGridCount)} / ${nf.format(d.unsupportedConversionCount)}`],
  ];
}
function renderPreflight(diagnostics: ACPreflightDiagnostics | null): void {
  const container = solverPanel.querySelector<HTMLElement>('#v61Preflight')!;
  const grid = solverPanel.querySelector<HTMLElement>('#v61PreflightGrid')!;
  const json = solverPanel.querySelector<HTMLElement>('#v61PreflightJson')!;
  if (!diagnostics) { container.hidden = true; return; }
  container.hidden = false;
  grid.replaceChildren(...preflightEntries(diagnostics).map(([label, value]) => {
    const cell = document.createElement('div'); const title = document.createElement('small'); title.textContent = label;
    const strong = document.createElement('strong'); strong.textContent = value; cell.append(title, strong); return cell;
  }));
  json.textContent = JSON.stringify(diagnostics, null, 2);
}

function resultCategory(record: ComparisonRecord): string { return record.category; }
function renderComparison(): void {
  const result = analysisState.activeResult;
  const nonConverged = analysisState.activeEngine === 'pandapower' && analysisState.activeMode === 'AC' && result?.convergence === 'NON_CONVERGED';
  const nonConvergenceNotice = solverPanel.querySelector<HTMLElement>('#v61NonConvergence')!;
  const dcNotice = solverPanel.querySelector<HTMLElement>('#v61DcSuccess')!;
  nonConvergenceNotice.hidden = !nonConverged;
  dcNotice.hidden = !(analysisState.activeEngine === 'pandapower' && result?.summary.mode === 'DC' && result.convergence === 'CONVERGED');
  if (nonConverged && result) {
    const summary = result.summary;
    const p = result.preflight;
    const qMissing = p ? `${nf.format(p.pvUnitsWithQLimits)}/${nf.format(p.pvUnitCount)} PV ünitesinde tam Q sınırı` : 'Q sınırı kapsamı yok';
    const controls = p ? `${nf.format(p.unsupportedOrUnsolvedControlCount)} çözülmeyen gerilim kontrolü` : 'Kontrol kapsamı yok';
    const phase = p ? `${nf.format(p.transformerPhaseAngleCoverage?.available ?? Math.max(0, p.modelCounts.transformer - p.transformerPhaseAngleMissing))}/${nf.format(p.transformerPhaseAngleCoverage?.total ?? p.modelCounts.transformer)} trafoda faz bilgisi` : 'Trafo faz bilgisi yok';
    const reactance = p ? `${nf.format(p.negativeReactanceCount)} negatif X · ${nf.format(p.candidateNonPositiveCompensatedPathCount)} kompanzasyonlu X≤0 aday yolu` : 'Empedans tanısı yok';
    nonConvergenceNotice.innerHTML = `<strong>AC çözümü ${result.iterations ?? 30} Newton iterasyonunda yakınsamadı. Sayısal AC sonuçları gösterilmiyor.</strong><br>Model: ${nf.format(summary.modelBusCount ?? p?.modelCounts.bus ?? 0)} bara · ${nf.format(summary.modelLineCount ?? p?.modelCounts.line ?? 0)} hat · ${nf.format(summary.modelTransformerCount ?? p?.modelCounts.transformer ?? 0)} transformatör.<br><b>İncelenmesi gereken model/kontrol eksikleri:</b> ${safe(qMissing)}; ${safe(controls)}; ${safe(phase)}; ${safe(reactance)}.`;
    comparison.innerHTML = '';
    return;
  }
  if (!dcNotice.hidden) dcNotice.textContent = 'Hesap başarılı. Aktif güç akışı hazır. Gerilim büyüklüğü ve reaktif güç DC analizinde hesaplanmaz.';
  const sources = [['reference', analysisState.referenceResult], [analysisState.activeEngine, result]] as const;
  const merged = new Map<string, ComparisonRecord>();
  for (const [source, resultSet] of sources) for (const item of metricRecords(resultSet)) {
    const record = merged.get(item.key) ?? { key: item.key, category: item.category, id: item.id, name: item.name, type: item.type, metric: item.metric, unit: item.unit };
    if (source === 'reference') record.reference = item.value;
    else if (source === 'pandapower') record.pandapower = item.value;
    else if (source === 'browser') record.browser = item.value;
    merged.set(item.key, record);
  }
  const filter = solverPanel.querySelector<HTMLSelectElement>('#v61Filter')!.value;
  const query = solverPanel.querySelector<HTMLInputElement>('#v61Search')!.value.trim().toLocaleLowerCase('tr-TR');
  const rows = [...merged.values()].filter(row => (filter === 'all' || resultCategory(row) === filter) &&
    (!query || `${row.name} ${row.id} ${row.type} ${row.metric}`.toLocaleLowerCase('tr-TR').includes(query)))
    .sort((a, b) => a.name.localeCompare(b.name, 'tr') || a.id.localeCompare(b.id, 'tr') || a.metric.localeCompare(b.metric, 'tr'));
  if (!rows.length) {
    comparison.textContent = result ? 'Bu filtre için sayısal sonuç yok. DC çözümünde gerilim ve reaktif güç alanları boş bırakılır.' : 'Sonuç bekleniyor.';
    solverPanel.querySelector('#v61Pager')!.textContent = '';
    return;
  }
  const pages = Math.max(1, Math.ceil(rows.length / pageSize)); resultPage = Math.min(resultPage, pages - 1);
  const visible = rows.slice(resultPage * pageSize, (resultPage + 1) * pageSize);
  const body = visible.map(row => {
    const diff = row.reference === undefined || row.pandapower === undefined ? null : Math.abs(row.reference - row.pandapower);
    const relative = diff === null || row.reference === undefined || row.reference === 0 ? null : diff / Math.abs(row.reference) * 100;
    const identity = primaryDisplayName(row.name, row.id);
    return `<tr><td class="analysisEquipment"><b>${safe(identity.primary)}</b><small>${safe(displayEquipmentType(row.type))} · kimlik ${safe(identity.secondary)}</small></td><td>${safe(row.metric)}</td><td>${safe(row.unit)}</td><td class="numeric">${fmt(row.reference, 4)}</td><td class="numeric">${fmt(row.pandapower, 4)}</td><td class="numeric">${fmt(row.browser, 4)}</td><td class="numeric">${fmt(diff, 4)}</td><td class="numeric">${relative === null ? '—' : fmt(relative, 2) + '%'}</td></tr>`;
  }).join('');
  comparison.innerHTML = `<table class="analysisMetricTable"><thead><tr><th>Ekipman</th><th>Büyüklük</th><th>Birim</th><th>PowerFactory Referans</th><th>Yerel Tam Şebeke</th><th>Tarayıcı Yaklaşık</th><th>Mutlak Fark</th><th>Göreli Fark</th></tr></thead><tbody>${body}</tbody></table>`;
  const pager = solverPanel.querySelector<HTMLElement>('#v61Pager')!;
  pager.replaceChildren();
  const first = resultPage * pageSize + 1, last = Math.min(rows.length, first + pageSize - 1);
  const label = document.createElement('span'); label.className = 'mini'; label.textContent = `${nf.format(first)}–${nf.format(last)} / ${nf.format(rows.length)}`;
  const previous = document.createElement('button'); previous.textContent = 'Önceki'; previous.disabled = resultPage === 0; previous.onclick = () => { resultPage--; renderComparison(); };
  const next = document.createElement('button'); next.textContent = 'Sonraki'; next.disabled = resultPage >= pages - 1; next.onclick = () => { resultPage++; renderComparison(); };
  pager.append(previous, label, next);
}

function updateStatus(message: string, kind: 'info' | 'warn' | 'bad' = 'info'): void {
  v61Status.textContent = message; v61Status.className = `notice ${kind === 'info' ? '' : kind}`.trim();
}
function setJobState(state: CalculationJobState, message: string): void {
  try { analysisState.calculationJob = transitionCalculationJob(analysisState.calculationJob, state, message); }
  catch { if (analysisState.calculationJob.state !== state) console.debug('Ignored duplicate job transition', analysisState.calculationJob.state, state); }
  const job = analysisState.calculationJob;
  const output = solverPanel.querySelector<HTMLElement>('#v61JobState')!;
  const elapsed = (job.elapsedMs / 1000).toLocaleString('tr-TR', { maximumFractionDigits: 1 });
  output.textContent = `${message}${job.startedAt && !['COMPLETED', 'NON_CONVERGED', 'FAILED', 'CANCELLED'].includes(job.state) ? ` · Geçen süre: ${elapsed} s` : ''}`;
  if (jobTimer) clearInterval(jobTimer);
  if (job.startedAt && !['COMPLETED', 'NON_CONVERGED', 'FAILED', 'CANCELLED'].includes(job.state)) {
    jobTimer = setInterval(() => {
      job.elapsedMs = Math.max(0, Date.now() - Date.parse(job.startedAt!));
      output.textContent = `${job.message} · Geçen süre: ${(job.elapsedMs / 1000).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} s`;
    }, 500);
  }
  const busy = !['IDLE', 'COMPLETED', 'NON_CONVERGED', 'FAILED', 'CANCELLED'].includes(job.state);
  runButton.disabled = busy || (analysisState.activeEngine === 'pandapower' && scenarioIsActive(legacy.getScenario()));
  engineSelect.disabled = busy; modeSelect.disabled = busy || analysisState.activeEngine === 'browser';
}
async function saveResult(key: CalculationKey, result: ResultSet, startedAt: string, elapsedMs: number): Promise<PersistedCalculation<ResultSet>> {
  const calculationId = crypto.randomUUID();
  const finishedAt = new Date().toISOString();
  const scenarioHash = key.scenarioHash;
  const metadata: CalculationMetadata = {
    calculationId, calculationKey: key, startedAt, finishedAt, elapsedMs,
    modelHash: key.modelHash, engine: key.engine, engineVersion: result.engineVersion,
    mode: key.mode, scenarioHash, options: key.engine === 'pandapower'
      ? { algorithm: 'nr', enforce_q_lims: true, max_iteration: 30, numba: false }
      : { scope: 'TRANSMISSION_REDUCED' },
    convergence: result.convergence, validation: result.validation,
  };
  result.calculation = metadata;
  const record: PersistedCalculation<ResultSet> = { id: calculationId, kind: 'calculation', keyId: calculationKeyId(key), modelHash: key.modelHash, calculationId, savedAt: Date.now(), metadata, result };
  await saveCalculation(record, `latest:${await sha256(key)}`, 20);
  analysisState.calculationsByKey.set(record.keyId, record);
  analysisState.calculationHistory = await getCalculationHistory(modelHash, 20);
  renderHistory();
  return record;
}
function renderHistory(): void {
  const list = solverPanel.querySelector<HTMLOListElement>('#v61History');
  if (!list) return;
  list.replaceChildren(...analysisState.calculationHistory.map(record => {
    const item = document.createElement('li');
    const metadata = record.metadata as CalculationMetadata;
    item.textContent = calculationHistoryText(metadata);
    return item;
  }));
}
function setHostError(error: NativeHostError): void {
  lastNativeHostError = error;
  const messages: Record<NativeHostError['kind'], string> = {
    HOST_NOT_REGISTERED: 'Grid Analyzer Yerel Hesap Motoru Chrome’a kayıtlı değil.', HOST_ORIGIN_MISMATCH: 'Grid Analyzer Yerel Hesap Motoru bu Chrome Extension ID için izinli değil.',
    HOST_START_FAILED: 'Grid Analyzer Yerel Hesap Motoru başlatılamadı.', HOST_DISCONNECTED: 'Grid Analyzer Yerel Hesap Motoru bağlantısı kesildi.',
    HOST_CRASHED: 'Hesap motoru beklenmedik biçimde kapandı.', PROTOCOL_ERROR: 'Hesap motoru protokol sürümü uyumlu değil.', SOLVER_ERROR: 'Yerel çözücü hesap sırasında hata verdi.', TIMEOUT: 'Hesap zaman aşımına uğradı.',
  };
  updateStatus(messages[error.kind], 'bad');
  const actions = solverPanel.querySelector<HTMLElement>('#v61HostActions')!;
  const installationFailure = ['HOST_NOT_REGISTERED', 'HOST_ORIGIN_MISMATCH', 'HOST_START_FAILED'].includes(error.kind);
  actions.hidden = !installationFailure && !['HOST_DISCONNECTED', 'HOST_CRASHED', 'TIMEOUT'].includes(error.kind);
  solverPanel.querySelector<HTMLElement>('#v61TechnicalError')!.textContent = error.technicalMessage;
  const id = (globalThis as typeof globalThis & { chrome?: { runtime?: { id?: string } } }).chrome?.runtime?.id ?? 'EXTENSION_ID';
  const help = solverPanel.querySelector<HTMLElement>('#v61InstallationHelp')!;
  help.hidden = !installationFailure;
  help.innerHTML = `<b>Bu Chrome Extension ID için Grid Analyzer Yerel Hesap Motoru kurulumu</b><pre id="v61InstallCommand">.\\native-host\\python\\scripts\\install-windows.ps1 -ExtensionId ${safe(id)}</pre><button id="v61CopyInstall" type="button">Komutu kopyala</button><ol><li>PowerShell ile scripti çalıştırın.</li><li>Chrome’u tamamen kapatıp yeniden açın.</li><li>Bağlantıyı test edin.</li></ol>`;
  help.querySelector<HTMLButtonElement>('#v61CopyInstall')!.onclick = () => navigator.clipboard.writeText(`.\\native-host\\python\\scripts\\install-windows.ps1 -ExtensionId ${id}`);
}
function setEngine(engine: Engine): void {
  analysisState.activeEngine = engine;
  analysisState.activeMode = engine === 'browser' ? 'AC' : modeSelect.value as 'AC' | 'DC';
  modeSelect.disabled = engine === 'browser';
  if (engine === 'browser') modeSelect.value = 'AC';
  if (engine === 'browser') {
    solverPanel.querySelector<HTMLElement>('#v61HostActions')!.hidden = true;
    solverPanel.querySelector<HTMLElement>('#v61InstallationHelp')!.hidden = true;
  } else if (lastNativeHostError) setHostError(lastNativeHostError);
  void updateActiveResult(); renderMetadata(); renderComparison(); renderScope(); renderScenario();
}
engineSelect.onchange = () => setEngine(engineSelect.value as Engine);
modeSelect.onchange = () => { analysisState.activeMode = modeSelect.value as 'AC' | 'DC'; void updateActiveResult(); renderMetadata(); renderComparison(); };
solverPanel.querySelector<HTMLSelectElement>('#v61BusSelect')!.onchange = renderBusAvailability;
solverPanel.querySelector<HTMLSelectElement>('#v61Filter')!.onchange = () => { resultPage = 0; renderComparison(); };
solverPanel.querySelector<HTMLInputElement>('#v61Search')!.oninput = () => { resultPage = 0; renderComparison(); };
setEngine('browser');
solverPanel.querySelector<HTMLButtonElement>('#v61ReferenceButton')!.onclick = () => solverPanel.querySelector<HTMLInputElement>('#v61Reference')!.click();
solverPanel.querySelector<HTMLInputElement>('#v61Reference')!.onchange = async event => {
  const file = (event.target as HTMLInputElement).files?.[0]; if (!file || !network) return;
  const status = solverPanel.querySelector<HTMLElement>('#v61ReferenceStatus')!;
  try {
    if (file.size > 20 * 1024 * 1024) throw Error('Referans dosyası 20 MB sınırını aşıyor');
    const candidate = JSON.parse(await file.text()) as ResultSet;
    if (candidate.schemaVersion !== '2.0' || candidate.modelHash !== network.modelHash || candidate.engine !== 'PowerFactory' || !Array.isArray(candidate.buses) || !Array.isArray(candidate.branches) || !Array.isArray(candidate.transformers) || !Array.isArray(candidate.generators) || !candidate.summary) throw Error('ResultSet sürümü veya model kimliği uyuşmuyor');
    analysisState.referenceResult = candidate;
    status.textContent = `${file.name} · model kimliği eşleşti; tolerans doğrulaması yapılmadı.`;
    renderMetadata(); renderComparison();
  } catch (error) { analysisState.referenceResult = null; status.textContent = `Referans yüklenemedi: ${String(error)}`; renderMetadata(); renderComparison(); }
};

const nativeSolver = new PandapowerSolver();
const browserSolver = new BrowserApproxSolver(legacy.runAnalysis, legacy.getSolver);
Object.assign(window, { V6Solver: browserSolver });
async function runSelectedSolver(): Promise<void> {
  if (!network) { updateStatus('Önce DGS modelini yükleyin.', 'warn'); return; }
  const engine = engineSelect.value as Engine;
  const mode = (engine === 'browser' ? 'AC' : modeSelect.value) as 'AC' | 'DC';
  analysisState.activeEngine = engine; analysisState.activeMode = mode;
  if (analysisState.calculationJob.state !== 'IDLE' && !['COMPLETED', 'NON_CONVERGED', 'FAILED', 'CANCELLED'].includes(analysisState.calculationJob.state)) return;
  const scenario = scenarioPayload();
  if (engine === 'pandapower' && scenarioIsActive(scenario)) {
    renderScenario(); updateStatus('Bu hesap motoru bu sürümde sanal senaryoyu uygulamıyor. Senaryoyu sıfırlayın veya Tarayıcı Yaklaşık Çözüm seçin.', 'warn'); return;
  }
  const key = await makeSelectedKey();
  currentCalculationKey = key;
  const keyId = calculationKeyId(key);
  const prompt = solverPanel.querySelector<HTMLElement>('#v61CachePrompt')!;
  prompt.hidden = true;
  const cached = await getCalculation<ResultSet>(keyId, `latest:${await sha256(key)}`);
  if (cached) {
    pendingCachedCalculation = cached;
    const meta = cached.metadata as CalculationMetadata;
    solverPanel.querySelector<HTMLElement>('#v61CacheDescription')!.textContent = `Bu model aynı ayarlarla daha önce hesaplandı. Son hesap: ${new Date(meta.finishedAt).toLocaleString('tr-TR')} · ${engineLabel(engine)} ${meta.engineVersion} · ${convergenceStatusLabel(meta.convergence)}.`;
    prompt.hidden = false;
    return;
  }
  await executeSelectedCalculation(key, engine, mode);
}
async function executeSelectedCalculation(key: CalculationKey, engine: Engine, mode: 'AC' | 'DC'): Promise<void> {
  const startedAt = new Date().toISOString();
  const startedClock = Date.now();
  analysisState.calculationJob = createCalculationJob(crypto.randomUUID());
  analysisState.preflight = null; analysisState.activeResult = null;
  renderMetadata(); renderPreflight(null); renderComparison();
  solverPanel.querySelector<HTMLElement>('#v61HostActions')!.hidden = true;
  setJobState('PREPARING', 'Hesap hazırlanıyor…');
  updateStatus('Hesap başlatılıyor…');
  if (jobTimer) clearInterval(jobTimer);
  try {
    let result: ResultSet;
    if (engine === 'browser') {
      setJobState('SOLVING', 'Tarayıcı Yaklaşık Çözüm çalışıyor…');
      await browserSolver.runLoadFlow(network!, { mode: 'AC' });
      const source = legacy.getResultSets().at(-1);
      const rows = (source?.rows ?? []).filter(row => typeof row.value === 'number' && Number.isFinite(row.value));
      const legacyState = legacy.getSolver();
      result = fromLegacyRows(network!, rows, legacyState?.solved === legacyState?.total ? 'CONVERGED' : 'PARTIAL');
      setJobState('SERIALIZING', 'Tarayıcı sonucu kaydediliyor…');
    } else {
      result = await nativeSolver.runLoadFlow(network!, { mode }, phase => {
        const phases: Record<string, [CalculationJobState, string]> = {
          PREPARING: ['PREPARING', 'Model hazırlanıyor…'], CREATE_MODEL: ['TRANSFERRING', 'Model aktarımı hazırlanıyor…'],
          MODEL_CHUNK: ['TRANSFERRING', 'Model yerel motora aktarılıyor…'], MODEL_READY: ['TRANSFERRING', 'Model hazır…'],
          AC_PREFLIGHT: ['PREFLIGHT', 'AC ön kontrol yapılıyor…'], PREFLIGHT: ['PREFLIGHT', 'Ön kontrol tamamlandı…'],
          CONVERTING: ['SOLVING', 'Elektriksel model çözücüye aktarılıyor…'], SOLVING_AC: ['SOLVING', 'AC yük akışı çözülüyor…'],
          SOLVING_DC: ['SOLVING', 'DC yük akışı çözülüyor…'], SERIALIZING: ['SERIALIZING', 'Sonuçlar hazırlanıyor…'],
        };
        const [state, message] = phases[phase] ?? ['SOLVING', 'Hesap sürüyor…'];
        setJobState(state, message); updateStatus(message);
      }, diagnostics => { analysisState.preflight = diagnostics; renderPreflight(diagnostics); renderMetadata(); });
      analysisState.preflight = result.preflight ?? analysisState.preflight;
    }
    const saved = await saveResult(key, result, startedAt, Date.now() - startedClock);
    if (engine === 'pandapower') {
      lastNativeHostError = null;
      solverPanel.querySelector<HTMLElement>('#v61HostHealth')!.textContent = `Grid Analyzer Yerel Hesap Motoru · Bağlı · Protocol 1.0 · pandapower ${result.engineVersion}`;
      solverPanel.querySelector<HTMLElement>('#v61HostHealth')!.className = 'notice';
      solverPanel.querySelector<HTMLElement>('#v61HostActions')!.hidden = true;
      solverPanel.querySelector<HTMLElement>('#v61InstallationHelp')!.hidden = true;
    }
    analysisState.activeCalculationKeyId = saved.keyId;
    analysisState.activeResult = result;
    const terminalState = result.convergence === 'NON_CONVERGED' ? 'NON_CONVERGED' : 'COMPLETED';
    setJobState(terminalState, result.convergence === 'NON_CONVERGED' ? 'AC çözümü yakınsamadı.' : `${mode} hesap tamamlandı · ${convergenceLabel(result)}.`);
    const kind = result.convergence === 'CONVERGED' ? result.validation === 'COMPLETE_UNVALIDATED' ? 'warn' : 'info' : result.convergence === 'NON_CONVERGED' ? 'bad' : 'warn';
    updateStatus(result.convergence === 'NON_CONVERGED' ? 'AC çözümü 30 Newton iterasyonunda yakınsamadı; sayısal AC sonuçları gösterilmiyor.' : `${mode} yük akışı ${convergenceLabel(result).toLocaleLowerCase('tr-TR')}.`, kind);
    renderMetadata(); renderPreflight(analysisState.preflight); renderComparison(); renderBusAvailability(); renderScenario();
  } catch (error) {
    setJobState('FAILED', 'Hesap başarısız.');
    if (error instanceof NativeHostError) setHostError(error);
    else updateStatus(error instanceof Error ? error.message : String(error), 'bad');
  } finally {
    if (jobTimer) clearInterval(jobTimer);
    engineSelect.disabled = false; modeSelect.disabled = analysisState.activeEngine === 'browser';
    renderScenario();
  }
}
runButton.onclick = () => { void runSelectedSolver(); };
solverPanel.querySelector<HTMLButtonElement>('#v61ShowCached')!.onclick = () => {
  const record = pendingCachedCalculation; if (!record) return;
  analysisState.calculationsByKey.set(record.keyId, record);
  analysisState.activeCalculationKeyId = record.keyId; analysisState.activeResult = record.result;
  pendingCachedCalculation = null; solverPanel.querySelector<HTMLElement>('#v61CachePrompt')!.hidden = true;
  renderMetadata(); renderComparison(); renderBusAvailability(); updateStatus('Önceki hesap sonucu gösteriliyor.');
};
solverPanel.querySelector<HTMLButtonElement>('#v61Recalculate')!.onclick = () => {
  const key = currentCalculationKey; if (!key) return;
  pendingCachedCalculation = null; solverPanel.querySelector<HTMLElement>('#v61CachePrompt')!.hidden = true;
  void executeSelectedCalculation(key, analysisState.activeEngine, selectedMode());
};
solverPanel.querySelector<HTMLButtonElement>('#v61Retry')!.onclick = () => { void checkNativeHealth(); };
solverPanel.querySelector<HTMLButtonElement>('#v61InstallHelp')!.onclick = () => {
  navigate('help');
  document.querySelector<HTMLButtonElement>('#infoNav [data-info="help"]')?.click();
};
async function checkNativeHealth(): Promise<void> {
  const generation = ++healthGeneration;
  const status = solverPanel.querySelector<HTMLElement>('#v61HostHealth')!;
  status.textContent = 'Grid Analyzer Yerel Hesap Motoru bağlantısı sınanıyor…'; status.className = 'notice warn';
  try {
    const health = await nativeSolver.healthCheck();
    if (generation !== healthGeneration) return;
    const okay = health.status === 'CONNECTED';
    const statusLabels = { CONNECTED: 'Bağlı', PROTOCOL_MISMATCH: 'Protokol sürümü uyumsuz', ENGINE_MISMATCH: 'Hesap motoru uyumsuz', ENGINE_VERSION_MISMATCH: 'Hesap motoru sürümü uyumsuz' } as const;
    status.textContent = `Grid Analyzer Yerel Hesap Motoru · ${statusLabels[health.status]} · Protocol ${health.protocolVersion} · ${health.engine} ${health.engineVersion} · Extension ID ${health.extensionId}`;
    status.className = `notice ${okay ? '' : 'bad'}`;
    if (okay) { lastNativeHostError = null; solverPanel.querySelector<HTMLElement>('#v61HostActions')!.hidden = true; }
    solverPanel.querySelector<HTMLElement>('#v61InstallationHelp')!.hidden = true;
  } catch (error) {
    if (generation !== healthGeneration) return;
    if (error instanceof NativeHostError) {
      status.textContent = `Grid Analyzer Yerel Hesap Motoru · ${error.kind === 'HOST_NOT_REGISTERED' ? 'Kurulu değil' : error.kind === 'HOST_ORIGIN_MISMATCH' ? 'Kimlik uyuşmuyor' : error.kind === 'TIMEOUT' ? 'Zaman aşımı' : 'Başlatılamadı'} · Bağlantı kurulamadı.`;
      setHostError(error);
    } else status.textContent = `Grid Analyzer Yerel Hesap Motoru · Başlatılamadı · ${String(error)}`;
    status.className = 'notice bad';
  }
}
solverPanel.querySelector<HTMLButtonElement>('#v61HostHealthButton')!.onclick = () => { void checkNativeHealth(); };

function renderScenario(): void {
  const scenario = legacy.getScenario();
  const lines = scenario.lines.length, switches = scenario.switches.length, terminals = scenario.restoredTerminals?.length ?? 0;
  const summary = document.querySelector<HTMLElement>('#scenarioSummary');
  if (summary) summary.textContent = `${lines + switches + terminals} etkin değişiklik · ${lines} hat durumu · ${switches} anahtar durumu · ${terminals} sanal devreye alınan terminal. DGS kaynak modeli değiştirilmedi.`;
  const solverNote = document.querySelector<HTMLElement>('#v4ScenarioStatus');
  const active = scenarioIsActive(scenario);
  const blocked = engineSelect.value === 'pandapower' && active;
  const notice = solverPanel.querySelector<HTMLElement>('#v61ScenarioSolverNotice')!;
  notice.hidden = !blocked;
  if (solverNote) solverNote.dataset.solverNote = blocked ? 'Yerel Tam Şebeke Çözücüsü senaryo değişikliklerini uygulamaz.' : '';
  runButton.disabled = blocked || !['IDLE', 'COMPLETED', 'NON_CONVERGED', 'FAILED', 'CANCELLED'].includes(analysisState.calculationJob.state);
  if (!blocked && lines + switches + terminals) updateStatus('Etkin sanal senaryo · Tarayıcı Yaklaşık Çözüm kullanın veya senaryoyu sıfırlayın.', 'warn');
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
async function onModelLoaded(model: LegacyModel, file: File, parsed: ParsedModel): Promise<void> {
  modelHash = parsed.modelHash;
  network = buildCanonicalNetwork(model.raw, model.rid, modelHash, 'FULL');
  parsed.electrical.modelId = model.rid;
  network.electrical = parsed.electrical;
  analysisState.integrity = validateNetwork(network, model.raw).integrity;
  analysisState.calculationsByKey.clear(); analysisState.referenceResult = null;
  analysisState.activeResult = null; analysisState.activeCalculationKeyId = null; currentCalculationKey = null; analysisState.preflight = null;
  await putRecord('models', { id: modelHash, name: file.name, file, savedAt: Date.now() });
  const check = validateNetwork(network, model.raw);
  await putRecord('canonical', { id: modelHash, electrical: parsed.electrical, integrity: check.integrity, findings: check.findings, timings: parsed.timings, savedAt: Date.now() });
  analysisState.calculationHistory = await getCalculationHistory(modelHash, 20);
  renderHistory();
  const savedScenario = await getRecord<{ snapshot: Partial<ScenarioPayload> }>('scenarios', `${modelHash}:latest`);
  legacy.restoreScenario?.(savedScenario?.snapshot ?? { lines: [], switches: [], restoredTerminals: [], autoRestoreTerminals: false });
  topologyInWorker(network);
  void updateActiveResult(); renderMetadata(); renderScope(); renderComparison(); renderScenario();
  updateStatus(`${file.name} modeli hazır · ${nf.format(parsed.electrical.buses.length)} bara · AC/DC hesap bekliyor.`);
  document.querySelector('#v6Validation')?.remove();
  const panel = document.createElement('section'); panel.id = 'v6Validation'; panel.className = 'panel'; panel.dataset.modelName = file.name;
  const heading = document.createElement('h3'); heading.textContent = 'Model kontrolü';
  const summary = document.createElement('p');
  const station = parsed.electrical.modelCoverage.stationControls;
  const qCoverage = parsed.electrical.modelCoverage.elmGenStatQLimits;
  summary.textContent = `${check.findings.length} genel ve ${parsed.electrical.findings.length} elektriksel bildirim · ${parsed.electrical.completeness === 'COMPLETE' ? 'eşleme hazır' : 'kısmi eşleme'} · ${station.total} istasyon kontrolü korundu · statik üretimde Q sınırı ${qCoverage.available}/${qCoverage.total}.`;
  panel.append(heading, summary); upload.append(panel);
  const quality = document.querySelector<HTMLElement>('#qualitySummary');
  if (quality) quality.textContent = `${nf.format(model.stats.geo)} hat model güzergâhıyla; ${nf.format(model.stats.fallback)} hat temsili bağlantıyla gösterilebilir. ${nf.format(model.stats.rows)} kaynak kaydı denetlendi. Elektriksel eşleme: ${parsed.electrical.completeness === 'COMPLETE' ? 'tam' : 'kısmi'}.`;
}
window.V6Bridge = {
  modelLoaded: (model, file, parsed) => { void onModelLoaded(model, file, parsed).catch(error => { console.error('Model cache:', error); updateStatus('Model özeti kaydedilemedi.', 'warn'); }); },
  scenarioChanged: () => {
    analysisState.activeResult = null; analysisState.activeCalculationKeyId = null; currentCalculationKey = null;
    renderScenario(); renderMetadata(); renderComparison(); renderBusAvailability(); renderScope();
    void updateActiveResult();
    if (modelHash) void putRecord('scenarios', { id: `${modelHash}:latest`, snapshot: scenarioPayload(), savedAt: Date.now() });
  },
  scenarioCalculated: () => {
    if (!network || !scenarioIsActive(legacy.getScenario())) return;
    const model = network;
    const source = legacy.getResultSets().at(-1);
    const rows = (source?.rows ?? []).filter(row => typeof row.value === 'number' && Number.isFinite(row.value));
    if (!rows.length) return;
    const state = legacy.getSolver();
    const result = fromLegacyRows(model, rows, state?.solved === state?.total ? 'CONVERGED' : 'PARTIAL');
    void (async () => {
      const key = await createCalculationKey({ modelHash, engine: 'browser-approx', mode: 'AC', scenario: scenarioPayload(), solverVersion: 'browser-approx-v5.5', options: { scope: 'TRANSMISSION_REDUCED' } });
      const saved = await saveResult(key, result, new Date().toISOString(), result.summary.solveMs ?? 0);
      if (analysisState.activeEngine === 'browser' && calculationKeyId(await makeSelectedKey()) === saved.keyId) {
        analysisState.activeCalculationKeyId = saved.keyId; analysisState.activeResult = result;
        renderMetadata(); renderComparison(); renderBusAvailability();
      }
    })().catch(error => console.warn('Scenario result cache:', error));
  },
};

for (const id of ['v54GoAnalysis', 'runSolver']) document.querySelector(`#${id}`)?.addEventListener('click', () => navigate('analysis'));
document.querySelector('#v54GoScenario')?.addEventListener('click', () => navigate('scenario'));

document.title = 'Grid Analyzer | Şebeke Analiz Sistemi v6.1.3';
const appTitle = document.querySelector<HTMLElement>('.apphead h1');
if (appTitle) appTitle.textContent = 'Grid Analyzer';
const brandLogo = document.querySelector<HTMLElement>('.brandlogo');
if (brandLogo) brandLogo.textContent = 'GA';
const appVersion = document.querySelector<HTMLElement>('.brand small');
if (appVersion) appVersion.textContent = 'Şebeke Analiz Sistemi';
if (footer) footer.textContent = 'Grid Analyzer · Chrome MV3 · v6.1.3';
renderMetadata(); renderScope(); renderScenario(); presentationSweep();

void getRecord<{ file: File; name: string }>('models', 'pending').then(async record => {
  if (!record?.file) return;
  await deleteRecord('models', 'pending');
  await legacy.loadFiles([new File([record.file], record.name, { type: 'application/json' })]);
}).catch(error => console.warn('Bekleyen model açılamadı:', error));

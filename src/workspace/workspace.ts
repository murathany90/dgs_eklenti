import type { CanonicalNetwork, DgsDocument } from '../model/types.ts';
import type { Integrity } from '../validation/validation.ts';
import { putRecord, getRecord, deleteRecord, getCalculation, getCalculationHistory, saveCalculation, type PersistedCalculation } from '../storage/db.ts';
import { BrowserApproxSolver } from '../solvers/browser-approx-solver.ts';
import { NativeHostError, PandapowerSolver } from '../solvers/pandapower-solver.ts';
import { toLegacyRows, type ACPreflightDiagnostics, type ResultSet } from '../analysis/result-set.ts';
import { fromLegacyRows, type BrowserLegacyDiagnostics } from '../analysis/legacy-adapter.ts';
import type { ElectricalCanonicalNetwork } from '../model/electrical-types.ts';
import { displayEquipmentType, presentUserText } from '../presentation/equipmentPresentation.ts';
import { calculationKeyId, createCalculationKey, scenarioIsActive, sha256, type CalculationKey, type CalculationMetadata, type ScenarioPayload } from '../analysis/calculation-key.ts';
import { findComparableEngineResult } from '../analysis/engine-comparison.ts';
import { createCalculationJob, transitionCalculationJob, type CalculationJob, type CalculationJobState } from '../analysis/calculation-job.ts';
import { availabilityText, busAvailability } from '../analysis/result-availability.ts';
import { calculationEngineLabel, calculationHistoryText, convergenceStatusLabel } from '../presentation/calculationPresentation.ts';
import { EquipmentDisplayIndex, type StationLookup } from '../presentation/equipmentDisplayIndex.ts';
import { electricalResultRows, electricalResultIndexes, equipmentResults, displayKindFromCategory, type MapResultRow, type ResultGroup, type EquipmentResult } from '../presentation/mapElectricalResults.ts';

interface LegacyModel extends StationLookup { raw: DgsDocument; rid: string; name: string; stats: Record<string, number> }
interface LegacyBridge {
  getActive: () => LegacyModel | null;
  getSolver: () => { solved?: number; total?: number; summary?: unknown[]; findings?: BrowserLegacyDiagnostics } | null;
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
type HostState = 'NOT_CHECKED' | 'STARTING' | 'DISCONNECTED' | 'CONNECTED' | 'TIMEOUT' | 'ERROR';
type CalculationState = 'IDLE' | 'RUNNING' | 'CONVERGED' | 'NON_CONVERGED' | 'FAILED' | 'CANCELLED' | 'TIMEOUT';
interface AnalysisState {
  activeEngine: Engine; activeMode: 'AC' | 'DC'; activeResult: ResultSet | null;
  hostState: HostState; calculationState: CalculationState; displayedResultIsCached: boolean;
  activeCalculationKeyId: string | null; calculationsByKey: Map<string, PersistedCalculation<ResultSet>>;
  referenceResult: ResultSet | null; preflight: ACPreflightDiagnostics | null; integrity: Integrity;
  calculationJob: CalculationJob; calculationHistory: PersistedCalculation[];
}
declare global { interface Window {
  V6Legacy: LegacyBridge;
  V6Bridge?: { modelLoaded: (model: LegacyModel, file: File, parsed: ParsedModel) => void; scenarioChanged: () => void; scenarioCalculated: () => void };
  YTBS_AnalysisState?: AnalysisState;
  YTBS_ActiveMapResult?: { set: () => { modelId: string; name: string; kind: string; rows: MapResultRow[]; index: Map<string, MapResultRow[]> } | null; renderLightning: () => void; status: () => string; selectionHtml: (group: ResultGroup, id: string) => string };
} }

const legacy = window.V6Legacy;
let network: CanonicalNetwork | null = null;
let modelHash = '';
let busPickerModelHash = '';
let electricalBusesById = new Map<string, NonNullable<CanonicalNetwork['electrical']>['buses'][number]>();
let busSearchEntries: Array<{ bus: NonNullable<CanonicalNetwork['electrical']>['buses'][number]; search: string }> = [];
const unsuppliedBusIndexes = new WeakMap<ResultSet, Set<string>>();
let busSearchTimer: ReturnType<typeof setTimeout> | null = null;
let activeKeyGeneration = 0;
let currentCalculationKey: CalculationKey | null = null;
let pendingCachedCalculation: PersistedCalculation<ResultSet> | null = null;
let jobTimer: ReturnType<typeof setInterval> | null = null;
let healthGeneration = 0;
let lastNativeHostError: NativeHostError | null = null;
const analysisState: AnalysisState = { activeEngine: 'browser', activeMode: 'AC', activeResult: null,
  hostState: 'NOT_CHECKED', calculationState: 'IDLE', displayedResultIsCached: false,
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
function presentTextNode(text: Text): void {
  const old = textOriginals.get(text);
  const raw = old && text.data === old.output ? old.raw : text.data;
  const output = technicalMode ? raw : presentUserText(raw).replace(/\bv[345](?:\.\d+)+\b/gi, '');
  if (output !== text.data) text.data = output;
  textOriginals.set(text, { raw, output });
}
function presentAttributes(element: Element): void {
  if (!element.hasAttribute('title') && !element.hasAttribute('placeholder') && !element.hasAttribute('aria-label')) return;
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
function presentationSweep(root: Node = document.body): void {
  if (root.nodeType === Node.TEXT_NODE) { presentTextNode(root as Text); return; }
  if (root.nodeType === Node.ELEMENT_NODE) presentAttributes(root as Element);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (node.nodeType === Node.TEXT_NODE) presentTextNode(node as Text);
    else presentAttributes(node as Element);
  }
}
technicalToggle.onchange = () => {
  technicalMode = technicalToggle.checked;
  if (legacyTechnicalToggle) { legacyTechnicalToggle.checked = technicalMode; legacyTechnicalToggle.dispatchEvent(new Event('change')); }
  localStorage.setItem('ytbs-technical-dgs', String(technicalMode));
  if (technicalInventory) technicalInventory.open = technicalMode;
  presentationSweep();
};
const presentationObserver = new MutationObserver(records => {
  for (const record of records) {
    if (record.type === 'characterData') presentTextNode(record.target as Text);
    else if (record.type === 'attributes') presentAttributes(record.target as Element);
    else for (const node of Array.from(record.addedNodes)) presentationSweep(node);
  }
});
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
  <p id="v61DisplayedResult" class="notice" role="status" hidden></p>
  <p id="v61JobState" class="mini" role="status">Hesap bekleniyor.</p>
  <div class="row" id="v61HostActions" hidden><button type="button" id="v61InstallHelp">Kurulum Yardımı</button><button type="button" id="v61Retry">Bağlantıyı Tekrar Kontrol Et</button><details><summary>Teknik ayrıntılar</summary><pre id="v61TechnicalError"></pre></details></div>
  <section id="v61CachePrompt" class="panel" role="dialog" aria-labelledby="v61CacheTitle" hidden><div class="heading"><h3 id="v61CacheTitle">Önceki hesap bulundu</h3></div><p id="v61CacheDescription"></p><div class="row"><button id="v61ShowCached" type="button">Mevcut sonucu göster</button><button id="v61Recalculate" class="primary" type="button">Yeniden hesapla</button></div></section>
  <div id="v61Scope" class="mini"></div>
  <div class="row"><div class="field"><label for="v61BusSearch">Bara adı veya kimliği ile ara</label><input id="v61BusSearch" type="search" placeholder="Örn. H4025 / İSTANBUL"></div><div class="field"><label for="v61BusSelect">Bara sonucu ve kullanılabilirlik nedeni</label><select id="v61BusSelect"><option value="">Bara seçin</option></select></div><div id="v61BusAvailability" class="notice" role="status">Bara seçilmedi.</div></div>
  <div id="v61Preflight" class="panel" hidden><div class="heading"><div><h3>AC Ön Kontrol Tanıları</h3><span class="sub">Model dönüştürmesinden alınan bağlantı ve kontrol özeti</span></div><details id="v61PreflightDetails"><summary>Yakınsamama Ayrıntıları</summary><div id="v61PreflightGrid" class="preflightGrid"></div><details><summary>Tanı JSON'u · teknik ayrıntı</summary><pre id="v61PreflightJson" class="rawpre"></pre></details></details></div></div>
  <section id="v61NonConvergence" class="notice bad" hidden></section><section id="v61DcSuccess" class="notice" hidden></section>
  <section id="v61ConvergenceDiagnosis" class="panel" hidden><div class="heading"><div><h3>Yakınsama Tanısı</h3><span class="sub">Solver durumundan ayrı, tanı amaçlı ölçümler</span></div></div><div id="v61ConvergenceDiagnosisGrid" class="preflightGrid"></div><details><summary>Tanı JSON'u · teknik ayrıntı</summary><pre id="v61ConvergenceDiagnosisJson" class="rawpre"></pre></details></section>
  <details id="v61HistoryDetails"><summary>Son hesaplamalar</summary><ol id="v61History"></ol></details>
  <div class="row" style="margin-top:16px"><div class="field"><label for="v61Filter">Sonuç kapsamı</label><select id="v61Filter"><option value="all">Tümü</option><option value="bus">Baralar</option><option value="line">Hatlar</option><option value="transformer">Transformatörler</option><option value="generator">Üretim</option><option value="system">Sistem</option></select></div><div class="field grow"><label for="v61Search">Ekipman adı veya kimliği</label><input id="v61Search" type="search" placeholder="Ekipman adı veya kimliği ile ara"></div><span class="mini" id="v61ReferenceStatus">PowerFactory referansı yüklenmedi.</span></div>
  <div class="scrolltbl" id="v61Comparison">Sonuç bekleniyor.</div><div class="pager" id="v61Pager"></div>`;
analysis.insertBefore(solverPanel, metadata);
solverPanel.insertBefore(metadata, solverPanel.querySelector('#v61Scope'));

const runtimeExtensionId = (globalThis as typeof globalThis & { chrome?: { runtime?: { id?: string } } }).chrome?.runtime?.id ?? 'EXTENSION_ID';
const nativeInstallCommand = `.\\native-host\\python\\scripts\\install-windows.ps1 -ExtensionId "${runtimeExtensionId}"`;
const settingsInstallHelp = document.createElement('section');
settingsInstallHelp.className = 'panel';
settingsInstallHelp.id = 'v61SettingsInstallHelp';
settingsInstallHelp.innerHTML = `<h3>Yerel Hesap Motoru Kurulum Yardımı</h3><p>Extension ID: <code>${safe(runtimeExtensionId)}</code><br>Registry host adı: <code>com.ytbs.powerfactory.solver</code><br>Beklenen manifest: <code>native-host\\python\\com.ytbs.powerfactory.solver.json</code><br>Beklenen çalıştırılabilir dosya: <code>native-host\\python\\.venv\\Scripts\\ytbs-solver-host.exe</code></p><pre id="v61SettingsInstallCommand">${safe(nativeInstallCommand)}</pre><button id="v61SettingsCopyInstall" type="button">Komutu kopyala</button><p>Kurulumdan sonra Chrome'u tamamen kapatıp yeniden açın. Ardından Analiz Merkezi'nde bağlantıyı tekrar kontrol edin.</p>`;
document.querySelector<HTMLElement>('#view-settings .settinggrid')?.append(settingsInstallHelp);
settingsInstallHelp.querySelector<HTMLButtonElement>('#v61SettingsCopyInstall')!.onclick = () => navigator.clipboard.writeText(nativeInstallCommand);

const engineSelect = solverPanel.querySelector<HTMLSelectElement>('#v61Engine')!;
const modeSelect = solverPanel.querySelector<HTMLSelectElement>('#v61Mode')!;
const runButton = solverPanel.querySelector<HTMLButtonElement>('#v61Run')!;
const v61Status = solverPanel.querySelector<HTMLElement>('#v61Status')!;
const comparison = solverPanel.querySelector<HTMLElement>('#v61Comparison')!;
const scope = solverPanel.querySelector<HTMLElement>('#v61Scope')!;
const pageSize = 50;
let resultPage = 0;
const resultMetricCache = new WeakMap<ResultSet, MetricRecord[]>();
interface MetricRecord { key: string; category: string; id: string; name: string; displayName: string; secondaryLabel: string; station: string; nominalKv: number | null; type: string; metric: string; unit: string; value: number }
interface ComparisonRecord { key: string; category: string; id: string; name: string; displayName: string; secondaryLabel: string; station: string; nominalKv: number | null; type: string; metric: string; unit: string; reference?: number; pandapower?: number; browser?: number }

const equipmentDisplayByElectricalModel = new WeakMap<object, EquipmentDisplayIndex>();
function equipmentDisplayIndex(): EquipmentDisplayIndex | null {
  const electrical = network?.electrical;
  if (!electrical) return null;
  let index = equipmentDisplayByElectricalModel.get(electrical);
  if (!index) {
    index = new EquipmentDisplayIndex(electrical, legacy.getActive() ?? undefined);
    equipmentDisplayByElectricalModel.set(electrical, index);
  }
  return index;
}
function metricRecords(result: ResultSet | null): MetricRecord[] {
  if (!result) return [];
  const cached = resultMetricCache.get(result); if (cached) return cached;
  const rows: MetricRecord[] = [];
  const add = (category: string, id: string, type: string, metric: string, unit: string, value: number | null, name?: string): void => {
    if (value === null || !Number.isFinite(value)) return;
    const equipment = equipmentDisplayIndex()?.get(displayKindFromCategory(category), id);
    rows.push({ key: `${category}|${id}|${metric}|${unit}`, category, id, name: equipment?.name || name || id,
      displayName: equipment?.displayName || name || id, secondaryLabel: equipment?.secondaryLabel || name || id,
      station: equipment?.station || 'TM eşleşmedi', nominalKv: equipment?.nominalKv ?? null, type: displayEquipmentType(type), metric, unit, value });
  };
  for (const item of result.buses) {
    add('bus', item.id, 'ElmTerm', 'Gerilim', 'kV', item.vKv);
    const nominalKv = equipmentDisplayIndex()?.get('bus', item.id)?.nominalKv;
    add('bus', item.id, 'ElmTerm', 'Gerilim', 'pu', item.vPu ?? (item.vKv !== null && nominalKv ? item.vKv / nominalKv : null));
    add('bus', item.id, 'ElmTerm', 'Faz açısı', '°', item.angleDeg);
  }
  for (const item of result.branches) {
    const type = item.kind === 'LINE' ? 'ElmLne' : 'ElmScap';
    add('line', item.id, type, 'Aktif güç · ilk uç', 'MW', item.from.pMw);
    add('line', item.id, type, 'Reaktif güç · ilk uç', 'MVAr', item.from.qMvar);
    add('line', item.id, type, 'Akım · ilk uç', 'A', item.from.iA);
    add('line', item.id, type, 'Aktif güç · son uç', 'MW', item.to.pMw);
    add('line', item.id, type, 'Reaktif güç · son uç', 'MVAr', item.to.qMvar);
    add('line', item.id, type, 'Akım · son uç', 'A', item.to.iA);
    add('line', item.id, type, 'Yüklenme', '%', item.loadingPercent);
    add('line', item.id, type, 'Aktif kayıp', 'MW', item.pLossMw);
    add('line', item.id, type, 'Reaktif kayıp', 'MVAr', item.qLossMvar);
  }
  for (const item of result.transformers) {
    add('transformer', item.id, 'ElmTr2', 'Aktif güç · yüksek gerilim ucu', 'MW', item.hv.pMw);
    add('transformer', item.id, 'ElmTr2', 'Reaktif güç · yüksek gerilim ucu', 'MVAr', item.hv.qMvar);
    add('transformer', item.id, 'ElmTr2', 'Akım · yüksek gerilim ucu', 'A', item.hv.iA);
    add('transformer', item.id, 'ElmTr2', 'Aktif güç · alçak gerilim ucu', 'MW', item.lv.pMw);
    add('transformer', item.id, 'ElmTr2', 'Reaktif güç · alçak gerilim ucu', 'MVAr', item.lv.qMvar);
    add('transformer', item.id, 'ElmTr2', 'Akım · alçak gerilim ucu', 'A', item.lv.iA);
    add('transformer', item.id, 'ElmTr2', 'Yüklenme', '%', item.loadingPercent);
    add('transformer', item.id, 'ElmTr2', 'Aktif kayıp', 'MW', item.pLossMw);
    add('transformer', item.id, 'ElmTr2', 'Reaktif kayıp', 'MVAr', item.qLossMvar);
    add('transformer', item.id, 'ElmTr2', 'Kademe', '', item.tapPosition);
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
function resultMatchesSelection(result: ResultSet | null): result is ResultSet {
  return !!result && result.modelHash === modelHash &&
    (analysisState.activeEngine === 'browser' ? ['browser-approx', 'browser-approx-v5.5'].includes(result.engine) : result.engine === 'pandapower') &&
    result.summary.mode === selectedMode() &&
    (!result.calculation || calculationKeyId(result.calculation.calculationKey) === analysisState.activeCalculationKeyId);
}
const mapLegacySetCache = new WeakMap<ResultSet, { modelId: string; name: string; kind: string; rows: MapResultRow[]; index: Map<string, MapResultRow[]> }>();
let mapResultsInvalidated = false;
let mapShownResult: ResultSet | null = null;
let mapShownStale = false;
let mapResultPage = 0;
function selectedMapResult(): ResultSet | null {
  const result = analysisState.activeResult;
  return resultMatchesSelection(result) && result.convergence !== 'NON_CONVERGED' && result.convergence !== 'NOT_RUN' ? result : null;
}
function mapLegacySet(): ReturnType<NonNullable<Window['YTBS_ActiveMapResult']>['set']> {
  const result = selectedMapResult(); if (!result) return null;
  let set = mapLegacySetCache.get(result);
  if (!set) {
    const rows = [...electricalResultRows(result).values()];
    const index = new Map<string, MapResultRow[]>();
    for (const row of rows) index.set(`${row.cls}|${row.id}|${row.metric}|${row.terminal}`, [row]);
    set = { modelId: result.modelId, name: `${calculationEngineLabel(result.engine)} · ${result.summary.mode}`, kind: 'calculation', rows, index };
    mapLegacySetCache.set(result, set);
  }
  return set;
}
function mapMetricHtml(group: ResultGroup, items: EquipmentResult['values']): string {
  const amount = (item: EquipmentResult['values'][number]): string => `<b>${fmt(item.value, item.unit === 'pu' ? 4 : 2)}</b> ${safe(item.unit)}`;
  const common = items.slice(group === 'bus' ? 0 : 6).map(item => {
    const loading = item.label === 'Yüklenme' && item.value !== null;
    const severity = loading ? item.value! > 100 ? 'overloaded' : item.value! >= 80 ? 'warning' : 'normal' : '';
    const label = severity === 'overloaded' ? 'Aşırı yük' : severity === 'warning' ? 'Uyarı' : severity === 'normal' ? 'Normal' : '';
    return `<span class="mapResultMetric ${severity}"><small>${safe(item.label)}</small> ${amount(item)}${label ? ` <em>${label}</em>` : ''}</span>`;
  }).join('');
  if (group === 'bus') return `<div class="mapResultMetrics">${common}</div>`;
  const first = group === 'line' ? 'İlk uç' : 'YG ucu', last = group === 'line' ? 'Son uç' : 'AG ucu';
  return `<table class="mapResultEnds"><thead><tr><th>Büyüklük</th><th>${first}</th><th>${last}</th></tr></thead><tbody>${['P', 'Q', 'I'].map((label, i) => `<tr><th>${label}</th><td>${amount(items[i])}</td><td>${amount(items[i + 3])}</td></tr>`).join('')}</tbody></table><div class="mapResultMetrics">${common}</div>`;
}
let mapSelectedEquipment: { group: ResultGroup; id: string } | null = null;
function mapSelectionHtml(group: ResultGroup, id: string): string {
  mapSelectedEquipment = { group, id };
  const index = equipmentDisplayIndex(), equipment = index?.get(group, id), result = selectedMapResult();
  if (!equipment) return '';
  const title = `<h3>${safe(equipment.displayName)}</h3><p class="mapResultSecondary">${safe(equipment.secondaryLabel)} · ${safe(id)}</p>`;
  if (!result || !index) return `${title}<p class="notice warn">${safe(mapResultStatus())}</p>`;
  const record = equipmentResults(result, index, group, [equipment])[0];
  return `${title}${mapMetricHtml(group, record.values)}<p class="mini">${safe(calculationEngineLabel(result.engine))} · ${result.summary.mode}. ${result.engine.startsWith('browser') ? '—: Bu hesap motorunda üretilmiyor.' : '—: Hesaplanmayan değer.'}</p>`;
}
function renderMapElectricalResults(): void {
  const panel = document.querySelector<HTMLElement>('#v42LightningPanel');
  if (!panel || panel.classList.contains('hidden') || document.querySelector<HTMLElement>('#v51LightningDeltaBody')?.hidden === false) return;
  const note = panel.querySelector<HTMLElement>('#v42LNote')!;
  const tbody = panel.querySelector<HTMLElement>('#v42LBody')!;
  const pager = panel.querySelector<HTMLElement>('#v42LPager')!;
  const result = selectedMapResult();
  if (!result) {
    note.textContent = mapResultStatus();
    tbody.replaceChildren(); pager.replaceChildren(); return;
  }
  const index = equipmentDisplayIndex(); if (!index) return;
  const activeTab = panel.querySelector<HTMLButtonElement>('.v42Ltabs button.active')?.dataset.v42kind;
  const group: ResultGroup = activeTab === 'trafo' ? 'transformer' : activeTab === 'line' ? 'line' : 'bus';
  const query = (panel.querySelector<HTMLInputElement>('#v42Search')?.value || '').trim().toLocaleLowerCase('tr-TR');
  const entries = (group === 'bus' ? index.buses : group === 'transformer' ? index.transformers : index.lines).filter(equipment => !query ||
    `${equipment.displayName} ${equipment.secondaryLabel} ${equipment.id}`.toLocaleLowerCase('tr-TR').includes(query));
  const size = 40, pages = Math.max(1, Math.ceil(entries.length / size)); mapResultPage = Math.min(mapResultPage, pages - 1);
  const visible = equipmentResults(result, index, group, entries.slice(mapResultPage * size, (mapResultPage + 1) * size));
  tbody.innerHTML = visible.map(({ equipment, values: metrics }) =>
    `<tr><td><button type="button" class="mapResultEquipment" data-kind="${equipment.kind}" data-id="${safe(equipment.id)}"><b>${safe(equipment.displayName)}</b></button><small class="mapResultSecondary">${safe(equipment.secondaryLabel)} · ${safe(equipment.id)}</small>${mapMetricHtml(group, metrics)}</td></tr>`).join('') || '<tr><td>Eşleşen ekipman yok.</td></tr>';
  tbody.querySelectorAll<HTMLButtonElement>('[data-kind][data-id]').forEach(button => button.onclick = () => {
    const equipment = index.get(button.dataset.kind as ResultGroup, button.dataset.id || '');
    const api = window as unknown as { selectLine?: (id: string) => void; focusLine?: (id: string) => void; selectSite?: (id: string) => void; focusSite?: (id: string) => void };
    if (!equipment) return;
    if (equipment.kind === 'line') { api.selectLine?.(equipment.id); api.focusLine?.(equipment.id); }
    else if (equipment.stationId) { api.selectSite?.(equipment.stationId); api.focusSite?.(equipment.stationId); }
  });
  note.textContent = `${nf.format(entries.length)} ekipman · ${calculationEngineLabel(result.engine)} · ${result.summary.mode} · ${convergenceLabel(result)} · ${result.electricalScope === 'TRANSMISSION_REDUCED' ? '66 kV+ indirgenmiş ağ' : 'tam gerilim kapsamı'}. ` +
    (result.engine.startsWith('browser') ? '—: Bu hesap motorunda üretilmiyor. Kapsam dışındaki ekipmanlar da boş gösterilir.' : '—: Hesaplanmayan veya bu kapsamda bulunmayan değer.');
  pager.replaceChildren();
  const previous = document.createElement('button'); previous.textContent = 'Önceki'; previous.disabled = mapResultPage === 0; previous.onclick = () => { mapResultPage--; renderMapElectricalResults(); };
  const label = document.createElement('span'); label.textContent = `${nf.format(mapResultPage * size + (entries.length ? 1 : 0))}–${nf.format(Math.min(entries.length, (mapResultPage + 1) * size))} / ${nf.format(entries.length)}`;
  const next = document.createElement('button'); next.textContent = 'Sonraki'; next.disabled = mapResultPage >= pages - 1; next.onclick = () => { mapResultPage++; renderMapElectricalResults(); };
  pager.append(previous, label, next);
}
function mapResultStatus(): string {
  if (!network) return 'Önce bir model yükleyin.';
  if (selectedMapResult()) return '';
  return mapResultsInvalidated || (analysisState.activeResult && !resultMatchesSelection(analysisState.activeResult)) ?
    'Model veya senaryo değişti. Yeniden hesaplayın.' : 'Hesap sonucu bulunmuyor.';
}
window.YTBS_ActiveMapResult = { set: mapLegacySet, renderLightning: renderMapElectricalResults, status: mapResultStatus, selectionHtml: mapSelectionHtml };
const electricalPanel = document.querySelector<HTMLElement>('#v42LightningPanel');
const electricalTitle = electricalPanel?.querySelector('header strong');
if (electricalTitle) electricalTitle.textContent = '⚡ Elektriksel Sonuçlar';
electricalPanel?.setAttribute('aria-label', 'Elektriksel Sonuçlar');
const electricalTableHead = electricalPanel?.querySelector('.v42LScroll > table > thead');
if (electricalTableHead) electricalTableHead.innerHTML = '<tr><th>Ekipman ve elektriksel değerler</th></tr>';
const scenarioDeltaButton = document.querySelector<HTMLButtonElement>('#v51LightningDelta');
if (scenarioDeltaButton) {
  document.querySelector('#v54SideTabs')?.append(scenarioDeltaButton);
  scenarioDeltaButton.addEventListener('click', () => {
    electricalPanel?.classList.remove('v54Selected', 'v54Station');
    document.querySelectorAll('#v54SideTabs [data-side]').forEach(button => button.classList.remove('active'));
  });
}
const mapTabs = document.querySelector<HTMLElement>('#v42LightningPanel .v42Ltabs');
if (mapTabs) {
  for (const [kind, label] of [['line', 'Hatlar'], ['trafo', 'Transformatörler'], ['bus', 'Baralar']] as const) {
    const button = mapTabs.querySelector<HTMLButtonElement>(`[data-v42kind="${kind}"]`);
    if (button) { button.textContent = label; mapTabs.prepend(button); }
  }
  mapTabs.querySelector<HTMLButtonElement>('[data-v42kind="bus"]')?.click();
  mapTabs.addEventListener('click', () => { mapResultPage = 0; queueMicrotask(renderMapElectricalResults); });
}
document.querySelector('#v54SideTabs [data-side="list"]')?.addEventListener('click', () => {
  if (document.querySelector<HTMLElement>('#v51LightningDeltaBody')?.hidden === false)
    mapTabs?.querySelector<HTMLButtonElement>('[data-v42kind="bus"]')?.click();
});
for (const id of ['v42Metric', 'v42Sort', 'v42VisibleOnly']) document.querySelector<HTMLElement>(`#${id}`)?.closest('label')?.setAttribute('hidden', '');
document.querySelector<HTMLInputElement>('#v42Search')?.addEventListener('input', () => { mapResultPage = 0; renderMapElectricalResults(); });
function syncMapResults(): void {
  const result = selectedMapResult();
  if (result === mapShownResult && mapShownStale === mapResultsInvalidated) return;
  mapShownResult = result; mapShownStale = mapResultsInvalidated; mapResultPage = 0;
  if (result) mapResultsInvalidated = false;
  renderMapElectricalResults();
  const selected = document.querySelector('#v54CompactLine');
  if (selected && mapSelectedEquipment) selected.innerHTML = mapSelectionHtml(mapSelectedEquipment.group, mapSelectedEquipment.id);
  if (document.querySelector('#view-map')?.classList.contains('active'))
    document.querySelector<HTMLSelectElement>('#mapMetric')?.dispatchEvent(new Event('change'));
}
function renderDisplayedResult(): void {
  const output = solverPanel.querySelector<HTMLElement>('#v61DisplayedResult')!;
  const result = resultMatchesSelection(analysisState.activeResult) ? analysisState.activeResult : null;
  output.hidden = !result;
  if (!result) { output.textContent = ''; return; }
  const engine = calculationEngineLabel(result.engine);
  const age = analysisState.displayedResultIsCached ? 'önceki hesap' : 'güncel hesap';
  output.textContent = `Gösterilen sonuç: ${engine} · ${age} · ${convergenceLabel(result).toLocaleLowerCase('tr-TR')}.` +
    (analysisState.displayedResultIsCached && analysisState.activeEngine === 'browser' ? ' Önceki Tarayıcı Yaklaşık Çözüm sonucu gösteriliyor.' : '');
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
     solverVersion: engine === 'browser' ? 'browser-approx-v6.1.6' : 'pandapower@3.5.5/protocol-1.0',
    options: engine === 'browser' ? { scope: 'TRANSMISSION_REDUCED' } : { algorithm: 'nr', enforce_q_lims: true, max_iteration: 30, numba: false },
  });
}
async function updateActiveResult(): Promise<void> {
  const generation = ++activeKeyGeneration;
  analysisState.activeResult = null;
  analysisState.displayedResultIsCached = false;
  analysisState.preflight = null;
  analysisState.activeCalculationKeyId = null;
  currentCalculationKey = null;
  pendingCachedCalculation = null;
  solverPanel.querySelector<HTMLElement>('#v61CachePrompt')!.hidden = true;
  renderPreflight(null);
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
  const buses = network?.electrical?.buses ?? [];
  if (network && busPickerModelHash !== network.modelHash) {
    busPickerModelHash = network.modelHash;
    electricalBusesById = new Map();
    busSearchEntries = [];
    for (const bus of buses) {
      electricalBusesById.set(bus.id, bus);
      busSearchEntries.push({ bus, search: `${bus.id} ${bus.name ?? ''}`.toLocaleLowerCase('tr-TR') });
    }
    fillBusOptions('');
  }
  const bus = electricalBusesById.get(picker.value);
  if (!bus) { output.textContent = 'Bara seçilmedi.'; return; }
  const result = resultMatchesSelection(analysisState.activeResult) ? analysisState.activeResult : null;
  let row: ResultSet['buses'][number] | undefined;
  let supplied = true;
  if (result) {
    const busIndex = electricalResultIndexes(result).buses;
    row = busIndex.get(bus.id);
    let unsupplied = unsuppliedBusIndexes.get(result);
    if (!unsupplied) {
      unsupplied = new Set(result.preflight?.unsuppliedBusIds ?? []);
      unsuppliedBusIndexes.set(result, unsupplied);
    }
    supplied = !unsupplied.has(bus.id);
  }
  const reason = busAvailability(result, {
    inService: bus.inService,
    mapped: !!bus,
    inScope: analysisState.activeEngine === 'pandapower' || (bus.nominalKv ?? 0) >= 66,
    supplied,
    metric: 'voltage', numericValue: row?.vKv,
  });
  const voltage = reason === 'AVAILABLE' ? `${fmt(row?.vKv)} kV` : '—';
  const angle = Number.isFinite(row?.angleDeg) ? `${fmt(row?.angleDeg)}°` : '—';
  const angleReason = result?.summary.mode === 'DC' && angle !== '—' ? 'DC analizinde açı hesaplanır.' : '';
  output.textContent = `Gerilim: ${voltage}\nNeden: ${availabilityText[reason]}\nAçı: ${angle}${angleReason ? ` · ${angleReason}` : ''}`;
  output.dataset.reason = reason;
}
function fillBusOptions(query: string): void {
  const picker = solverPanel.querySelector<HTMLSelectElement>('#v61BusSelect');
  if (!picker) return;
  const needle = query.trim().toLocaleLowerCase('tr-TR');
  const selected = picker.value;
  const visible: typeof busSearchEntries = [];
  let count = 0;
  for (const entry of busSearchEntries) {
    if (needle && !entry.search.includes(needle)) continue;
    count++;
    if (visible.length < 100) visible.push(entry);
  }
  const label = needle ? `${nf.format(count)} eşleşme · ilk ${nf.format(visible.length)}` : `İlk ${nf.format(visible.length)} / ${nf.format(count)} bara · arama yazın`;
  const fragment = document.createDocumentFragment();
  fragment.append(new Option(`Bara seçin · ${label}`, ''));
  for (const { bus } of visible) fragment.append(new Option(`${bus.name || bus.id} · ${bus.nominalKv ?? '?'} kV`, bus.id));
  picker.replaceChildren(fragment);
  if (selected && visible.some(({ bus }) => bus.id === selected)) picker.value = selected;
}
solverPanel.querySelector<HTMLInputElement>('#v61BusSearch')!.addEventListener('input', event => {
  if (busSearchTimer) clearTimeout(busSearchTimer);
  const query = (event.currentTarget as HTMLInputElement).value;
  busSearchTimer = setTimeout(() => { fillBusOptions(query); renderBusAvailability(); }, 150);
});
function renderMetadata(): void {
  const result = resultMatchesSelection(analysisState.activeResult) ? analysisState.activeResult : null;
  renderDisplayedResult();
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
  const settings = d.loadFlowSettings ?? {};
  const setting = (key: string): string => {
    const item = settings[key] as { value?: unknown; source?: unknown; sourceValue?: unknown } | undefined;
    return item ? `${String(item.value ?? 'UNKNOWN')} · ${String(item.source ?? 'UNKNOWN')}${item.sourceValue === null || item.sourceValue === undefined ? '' : ` (${String(item.sourceValue)})`}` : 'UNKNOWN';
  };
  return [
    ['Toplam / servisteki bara', `${nf.format(d.modelCounts.bus)} / ${nf.format(d.inServiceBusCount)}`],
    ['Elektriksel ada', `${nf.format(d.electricalIslandCount)} · kaynaklı ${nf.format(d.islandsWithSlackCount)} · kaynaksız ${nf.format(d.islandsWithoutSlackCount)}`],
    ['Kaynaksız bara', nf.format(d.unsuppliedBusCount)],
    ['Üretim − tüketim başlangıç farkı', `${fmt(d.initialPImbalanceMw)} MW`],
    ['ElmVac · eşlenen / aktif / toplam', `${nf.format(d.internationalConnectionsMapped ?? 0)} / ${nf.format(d.internationalConnectionsInService ?? 0)} / ${nf.format(d.internationalConnectionCount ?? 0)}`],
    ['ElmVac Pload / Qload toplamı · yaklaşım', `${fmt(d.internationalPmw)} MW / ${fmt(d.internationalQmvar)} MVAr · ${d.internationalMappingMode ?? 'UNKNOWN'}`],
    ['PV / PQ bara', `${nf.format(d.pvBusCount)} / ${nf.format(d.pqBusCount)}`],
    ['Q sınırı eksik PV üretim ünitesi', `${nf.format(d.pvUnitsMissingQLimits)} / ${nf.format(d.pvUnitCount)}`],
    ['İstasyon kontrolü · serviste', `${nf.format(d.stationControlsInService ?? 0)} / ${nf.format(d.stationControlCount ?? 0)}`],
    ['Station · tam / yaklaşık / çözülmeyen', `${nf.format(Math.max(0, (d.stationControllersApplied ?? 0) - (d.stationControllersApproximate ?? 0)))} / ${nf.format(d.stationControllersApproximate ?? 0)} / ${nf.format(d.stationControllersUnsupported ?? 0)}`],
    ['Çok üniteli / droop kısmi', `${nf.format(d.multiUnitControllersApplied ?? 0)}/${nf.format(d.multiUnitControllersTotal ?? 0)} · ${nf.format(d.droopControllersPartial ?? 0)}/${nf.format(d.droopControllersTotal ?? 0)}`],
    ['ElmSecctrl / ElmBoundary', `${nf.format(d.secondaryControllersTotal ?? 0)} / ${nf.format(d.boundariesTotal ?? 0)}`],
    ['ComLdf iPbalancing', `${d.activePowerBalancingModeCode ?? 'UNKNOWN'} · ${d.activePowerBalancingBehavior ?? 'UNKNOWN'}`],
    ['Uzak kontrol toplam / uygulanan · paylaşım grubu uygulanan · droop uygulanan', `${nf.format(d.remoteVoltageControllerCount ?? 0)} / ${nf.format(d.remoteVoltageControllersApplied ?? 0)} · ${nf.format(d.reactiveSharingGroupsApplied ?? 0)} · ${nf.format(d.droopControllersApplied ?? 0)}`],
    ['ElmGenStat Q-limit kapsamı', `${nf.format(d.elmGenStatQLimitCoverage?.available ?? 0)} / ${nf.format(d.elmGenStatQLimitCoverage?.total ?? 0)}`],
    ['NR iterasyon üst sınırı', setting('maxNewtonIterations')],
    ['Dış kontrol iterasyonu üst sınırı', setting('maxOuterIterations')],
    ['Q-limit ayarı', setting('enforceReactiveLimits')],
    ['Geçersiz gerilim ayarı', nf.format(d.pvUnitsInvalidVoltageSetpoint)],
    ['Gerilim ayarı aralığı', `${fmt(d.minVmSetpointPu, 4)}–${fmt(d.maxVmSetpointPu, 4)} p.u.`],
    ['Trafo sınır dışı / nötrden >10 kademe', `${nf.format(d.transformerTapOutsideDeclaredLimits)} / ${nf.format(d.transformerTapDeviationAbsGreaterThan10)}`],
    ['Faz açısı eksik transformatör', nf.format(d.transformerPhaseAngleMissing)],
    ['Trafo faz açısı · sargı bağlantısı kapsamı', `${nf.format(d.transformerPhaseAngleCoverage?.available ?? 0)}/${nf.format(d.transformerPhaseAngleCoverage?.total ?? d.modelCounts.transformer)} · ${nf.format(d.transformerWindingConnectionCoverage?.available ?? 0)}/${nf.format(d.transformerWindingConnectionCoverage?.total ?? d.modelCounts.transformer)}`],
    ['Desteklenmeyen / çözülmeyen kontrol', nf.format(d.unsupportedOrUnsolvedControlCount)],
    ['Açık / kapalı anahtar', `${nf.format(d.openSwitchCount)} / ${nf.format(d.closedSwitchCount)}`],
    ['Eşlenmeyen eleman', nf.format(d.elementsNotMapped)],
    ['Sıfır empedans / küçük X / negatif X', `${nf.format(d.zeroImpedanceCount)} / ${nf.format(d.verySmallReactanceCount)} / ${nf.format(d.negativeReactanceCount)}`],
    ['Seri kompanzasyon yolu · hassas / çözümlenemeyen', `${nf.format(d.seriesCompensation?.sensitiveCount ?? 0)} / ${nf.format(d.seriesCompensation?.unresolvedCount ?? 0)}`],
    ['Dış şebeke kaynağı / dönüştürme bildirimi', `${nf.format(d.externalGridCount)} / ${nf.format(d.unsupportedConversionCount)}`],
  ];
}

function renderConvergenceDiagnosis(result: ResultSet | null): void {
  const section = solverPanel.querySelector<HTMLElement>('#v61ConvergenceDiagnosis')!;
  const grid = solverPanel.querySelector<HTMLElement>('#v61ConvergenceDiagnosisGrid')!;
  const json = solverPanel.querySelector<HTMLElement>('#v61ConvergenceDiagnosisJson')!;
  const d = result?.calculationDiagnostics;
  if (!d || result?.summary.mode !== 'AC') { section.hidden = true; grid.replaceChildren(); json.textContent = ''; return; }
  section.hidden = false;
  const outer = d.outerControl as { unsatisfiedGroups?: unknown[] } | null | undefined;
  const unavailable = 'Elde edilemedi';
  const entries: Array<[string, string]> = [
    ['Toplam iç Newton–Raphson iterasyonu', d.innerIterations === null ? unavailable : nf.format(d.innerIterations)],
    ['İç NR / dış kontrol durumu', `${d.innerSolverConverged === null || d.innerSolverConverged === undefined ? unavailable : d.innerSolverConverged ? 'yakınsadı' : 'yakınsamadı'} / ${d.controlSystemConverged === null || d.controlSystemConverged === undefined ? unavailable : d.controlSystemConverged ? 'karşılandı' : 'karşılanmadı'}`],
    ['Dış kontrol iterasyonu', d.outerIterations === null ? unavailable : nf.format(d.outerIterations)],
    ['PV → PQ dönüşümü', d.pvToPqCount === null ? unavailable : nf.format(d.pvToPqCount)],
    ['Qmin / Qmax sınırında', `${d.qMinHits === null || d.qMinHits === undefined ? unavailable : nf.format(d.qMinHits)} / ${d.qMaxHits === null || d.qMaxHits === undefined ? unavailable : nf.format(d.qMaxHits)}`],
    ['Sağlanmayan gerilim kontrol grubu', nf.format(outer?.unsatisfiedGroups?.length ?? 0)],
    ['En büyük |ΔP|', d.maxPMismatchMw === null ? unavailable : `${fmt(d.maxPMismatchMw, 6)} MW`],
    ['En büyük |ΔQ|', d.maxQMismatchMvar === null ? unavailable : `${fmt(d.maxQMismatchMvar, 6)} MVAr`],
    ['Gerilim aralığı', d.voltagePuMin === null || d.voltagePuMax === null ? unavailable : `${fmt(d.voltagePuMin, 5)}–${fmt(d.voltagePuMax, 5)} p.u.`],
    ['Artık hesabı', d.residualStatus === 'AVAILABLE' ? 'Tanı için kullanılabilir' : `Kullanılamıyor · ${d.residualReason ?? ''}`],
  ];
  grid.replaceChildren(...entries.map(([label, value]) => {
    const cell = document.createElement('div'); const title = document.createElement('small'); title.textContent = label;
    const strong = document.createElement('strong'); strong.textContent = value; cell.append(title, strong); return cell;
  }));
  json.textContent = JSON.stringify(d, null, 2);
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
  syncMapResults();
  const result = resultMatchesSelection(analysisState.activeResult) ? analysisState.activeResult : null;
  renderConvergenceDiagnosis(result);
  const nonConverged = analysisState.activeEngine === 'pandapower' && analysisState.activeMode === 'AC' && result?.convergence === 'NON_CONVERGED';
  const nonConvergenceNotice = solverPanel.querySelector<HTMLElement>('#v61NonConvergence')!;
  const dcNotice = solverPanel.querySelector<HTMLElement>('#v61DcSuccess')!;
  nonConvergenceNotice.hidden = !nonConverged;
  dcNotice.hidden = !(analysisState.activeEngine === 'pandapower' && result?.summary.mode === 'DC' && result.convergence === 'CONVERGED');
  if (nonConverged && result) {
    const summary = result.summary;
    const p = result.preflight;
    const qMissing = p ? `${nf.format(p.pvUnitsWithQLimits)}/${nf.format(p.pvUnitCount)} PV ünitesinde tam Q sınırı` : 'Q sınırı kapsamı yok';
    const controls = p ? `${nf.format(p.unsupportedOrUnsolvedControlCount)} çözülmeyen kontrol kaydı` : 'Kontrol kapsamı yok';
    const phase = p ? `${nf.format(p.transformerPhaseAngleCoverage?.available ?? Math.max(0, p.modelCounts.transformer - p.transformerPhaseAngleMissing))}/${nf.format(p.transformerPhaseAngleCoverage?.total ?? p.modelCounts.transformer)} trafoda faz bilgisi` : 'Trafo faz bilgisi yok';
    const reactance = p ? `${nf.format(p.negativeReactanceCount)} negatif X · ${nf.format(p.candidateNonPositiveCompensatedPathCount)} kompanzasyonlu X≤0 aday yolu` : 'Empedans tanısı yok';
    const iterations = result.iterations === null ? 'iç NR iterasyon sayısı elde edilemedi' : `${nf.format(result.iterations)} iç NR iterasyonu`;
    const unmet = (result.calculationDiagnostics?.outerControl as { unsatisfiedGroups?: unknown[] } | null | undefined)?.unsatisfiedGroups?.length ?? 0;
    const exhausted = result.calculationDiagnostics?.nonConvergenceReason === 'CONTROL_EXHAUSTED';
    const detail = exhausted
      ? `${nf.format(unmet)} station controller Q sınırlarında tükendi; gerilim hedefi karşılanmadı.`
      : result.calculationDiagnostics?.innerSolverConverged && result.calculationDiagnostics?.controlSystemConverged === false
      ? `İç AC denklemleri çözüldü; ${nf.format(unmet)} gerilim kontrol grubu hedefini karşılamadı.`
      : `İç AC çözümü yakınsamadı (${iterations}).`;
    nonConvergenceNotice.innerHTML = `<strong>${safe(detail)} Sayısal AC sonuçları gösterilmiyor.</strong><br>Model: ${nf.format(summary.modelBusCount ?? p?.modelCounts.bus ?? 0)} bara · ${nf.format(summary.modelLineCount ?? p?.modelCounts.line ?? 0)} hat · ${nf.format(summary.modelTransformerCount ?? p?.modelCounts.transformer ?? 0)} transformatör.<br><b>İncelenmesi gereken model/kontrol eksikleri:</b> ${safe(qMissing)}; ${safe(controls)}; ${safe(phase)}; ${safe(reactance)}.`;
    comparison.innerHTML = '';
    return;
  }
  if (!dcNotice.hidden) dcNotice.textContent = 'Hesap başarılı. Aktif güç akışı hazır. Gerilim büyüklüğü ve reaktif güç DC analizinde hesaplanmaz.';
  const compareKey = currentCalculationKey;
  const comparisonRecords = [...analysisState.calculationsByKey.values()].map(record => ({ savedAt: record.savedAt, result: record.result }));
  if (result?.calculation && resultMatchesSelection(result)) comparisonRecords.push({ savedAt: Date.now(), result });
  const pandapowerResult = compareKey ? findComparableEngineResult(comparisonRecords, {
    engine: 'pandapower', modelHash, mode: compareKey.mode, scenarioHash: compareKey.scenarioHash, solverVersion: 'pandapower@3.5.5/protocol-1.0',
  }) : null;
  const browserResult = compareKey ? findComparableEngineResult(comparisonRecords, {
    engine: 'browser-approx', modelHash, mode: compareKey.mode, scenarioHash: compareKey.scenarioHash, solverVersion: 'browser-approx-v6.1.6',
  }) : null;
  const sources = [['reference', analysisState.referenceResult], ['pandapower', pandapowerResult], ['browser', browserResult]] as const;
  const merged = new Map<string, ComparisonRecord>();
  for (const [source, resultSet] of sources) for (const item of metricRecords(resultSet)) {
    const record = merged.get(item.key) ?? { key: item.key, category: item.category, id: item.id, name: item.name, displayName: item.displayName, secondaryLabel: item.secondaryLabel, station: item.station, nominalKv: item.nominalKv, type: item.type, metric: item.metric, unit: item.unit };
    if (source === 'reference') record.reference = item.value;
    else if (source === 'pandapower') record.pandapower = item.value;
    else if (source === 'browser') record.browser = item.value;
    merged.set(item.key, record);
  }
  const filter = solverPanel.querySelector<HTMLSelectElement>('#v61Filter')!.value;
  const query = solverPanel.querySelector<HTMLInputElement>('#v61Search')!.value.trim().toLocaleLowerCase('tr-TR');
  const rows = [...merged.values()].filter(row => (filter === 'all' || resultCategory(row) === filter) &&
    (!query || `${row.name} ${row.displayName} ${row.secondaryLabel} ${row.id} ${row.type} ${row.metric}`.toLocaleLowerCase('tr-TR').includes(query)))
    .sort((a, b) => {
      const order: Record<string, number> = { bus: 0, transformer: 1, line: 2, generator: 3, system: 4 };
      return (order[a.category] ?? 9) - (order[b.category] ?? 9) || a.station.localeCompare(b.station, 'tr') ||
        (b.nominalKv ?? -1) - (a.nominalKv ?? -1) || a.name.localeCompare(b.name, 'tr') || a.id.localeCompare(b.id, 'tr') || a.metric.localeCompare(b.metric, 'tr');
    });
  if (!rows.length) {
    comparison.textContent = result ? 'Bu filtre için sayısal sonuç yok. DC çözümünde gerilim ve reaktif güç alanları boş bırakılır.' : 'Sonuç bekleniyor.';
    solverPanel.querySelector('#v61Pager')!.textContent = '';
    return;
  }
  const pages = Math.max(1, Math.ceil(rows.length / pageSize)); resultPage = Math.min(resultPage, pages - 1);
  const visible = rows.slice(resultPage * pageSize, (resultPage + 1) * pageSize);
  const body = visible.map(row => {
    const referenceDiff = row.reference === undefined || row.pandapower === undefined ? null : Math.abs(row.reference - row.pandapower);
    const referenceRelative = referenceDiff === null || row.reference === undefined || row.reference === 0 ? null : referenceDiff / Math.abs(row.reference) * 100;
    const engineDiff = row.pandapower === undefined || row.browser === undefined ? null : Math.abs(row.pandapower - row.browser);
    const engineRelative = engineDiff === null || row.pandapower === undefined || row.pandapower === 0 ? null : engineDiff / Math.abs(row.pandapower) * 100;
    return `<tr><td class="analysisEquipment"><b>${safe(row.displayName)}</b><small>${safe(displayEquipmentType(row.type))} · ${safe(row.secondaryLabel)} · kimlik ${safe(row.id)}</small></td><td>${safe(row.metric)}</td><td>${safe(row.unit)}</td><td class="numeric">${!analysisState.referenceResult ? 'Yüklenmedi' : fmt(row.reference, 4)}</td><td class="numeric">${fmt(row.pandapower, 4)}</td><td class="numeric">${fmt(row.browser, 4)}</td><td class="numeric">${fmt(referenceDiff, 4)}</td><td class="numeric">${referenceRelative === null ? '—' : fmt(referenceRelative, 2) + '%'}</td><td class="numeric">${fmt(engineDiff, 4)}</td><td class="numeric">${engineRelative === null ? '—' : fmt(engineRelative, 2) + '%'}</td></tr>`;
  }).join('');
  comparison.innerHTML = `<table class="analysisMetricTable"><thead><tr><th>Ekipman</th><th>Büyüklük</th><th>Birim</th><th>PowerFactory Referans</th><th>Yerel Tam Şebeke</th><th>Tarayıcı Yaklaşık</th><th>PF–Yerel mutlak fark</th><th>PF–Yerel göreli fark</th><th>Yerel–Yaklaşık mutlak fark</th><th>Yerel–Yaklaşık göreli fark</th></tr></thead><tbody>${body}</tbody></table>`;
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
  analysisState.calculationState = state === 'COMPLETED' ? 'CONVERGED' : state === 'NON_CONVERGED' ? 'NON_CONVERGED' :
    state === 'FAILED' ? 'FAILED' : state === 'CANCELLED' ? 'CANCELLED' : state === 'IDLE' ? 'IDLE' : 'RUNNING';
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
function resetCalculationStatus(): void {
  if (jobTimer) clearInterval(jobTimer);
  analysisState.calculationJob = createCalculationJob('idle');
  analysisState.calculationState = 'IDLE';
  engineSelect.disabled = false;
  modeSelect.disabled = analysisState.activeEngine === 'browser';
  solverPanel.querySelector<HTMLElement>('#v61JobState')!.textContent = 'Hesap bekleniyor.';
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
const nativeErrorMessages: Record<NativeHostError['kind'], string> = {
  HOST_NOT_REGISTERED: 'Grid Analyzer Yerel Hesap Motoru Chrome’a kayıtlı değil.',
  HOST_ORIGIN_MISMATCH: 'Grid Analyzer Yerel Hesap Motoru bu Chrome Extension ID için izinli değil.',
  HOST_START_FAILED: 'Grid Analyzer Yerel Hesap Motoru başlatılamadı.',
  HOST_START_TIMEOUT: 'Yerel hesap motoru zamanında başlamadı.',
  HELLO_TIMEOUT: 'Yerel hesap motoru bağlantı isteğine zamanında yanıt vermedi.',
  CAPABILITIES_TIMEOUT: 'Yerel hesap motoru yetenek bilgisini zamanında göndermedi.',
  HOST_DISCONNECTED: 'Grid Analyzer Yerel Hesap Motoru bağlantısı kesildi.',
  HOST_CRASHED: 'Hesap motoru beklenmedik biçimde kapandı.',
  PROTOCOL_ERROR: 'Hesap motoru protokol sürümü uyumlu değil.',
  PANDAPOWER_IMPORT_ERROR: 'Yerel hesap motoru pandapower kütüphanesini yükleyemedi.',
  SOLVER_ERROR: 'Yerel çözücü hesap sırasında hata verdi.',
  TIMEOUT: 'Hesap zaman aşımına uğradı.',
};
function setHostError(error: NativeHostError, source: 'health' | 'calculation' | 'replay' = 'health'): void {
  lastNativeHostError = error;
  if (source === 'health') analysisState.hostState = error.kind.endsWith('_TIMEOUT') || error.kind === 'TIMEOUT' ? 'TIMEOUT' : ['PANDAPOWER_IMPORT_ERROR', 'PROTOCOL_ERROR'].includes(error.kind) ? 'ERROR' : 'DISCONNECTED';
  else if (source === 'calculation' && error.kind === 'SOLVER_ERROR') analysisState.hostState = 'CONNECTED';
  else if (source === 'calculation' && error.kind !== 'TIMEOUT') analysisState.hostState = error.kind === 'PANDAPOWER_IMPORT_ERROR' ? 'ERROR' : 'DISCONNECTED';
  const actions = solverPanel.querySelector<HTMLElement>('#v61HostActions')!;
  const installationFailure = ['HOST_NOT_REGISTERED', 'HOST_ORIGIN_MISMATCH', 'HOST_START_FAILED'].includes(error.kind);
  actions.hidden = !installationFailure && !['HOST_DISCONNECTED', 'HOST_CRASHED', 'TIMEOUT', 'HOST_START_TIMEOUT', 'HELLO_TIMEOUT', 'CAPABILITIES_TIMEOUT', 'PANDAPOWER_IMPORT_ERROR', 'PROTOCOL_ERROR'].includes(error.kind);
  solverPanel.querySelector<HTMLElement>('#v61TechnicalError')!.textContent = error.technicalMessage;
  const help = solverPanel.querySelector<HTMLElement>('#v61InstallationHelp')!;
  help.hidden = !installationFailure;
  help.innerHTML = `<b>Bu Chrome Extension ID için Grid Analyzer Yerel Hesap Motoru kurulumu</b><pre id="v61InstallCommand">${safe(nativeInstallCommand)}</pre><button id="v61CopyInstall" type="button">Komutu kopyala</button><ol><li>PowerShell ile scripti çalıştırın.</li><li>Chrome’u tamamen kapatıp yeniden açın.</li><li>Bağlantıyı test edin.</li></ol>`;
  help.querySelector<HTMLButtonElement>('#v61CopyInstall')!.onclick = () => navigator.clipboard.writeText(nativeInstallCommand);
}
function setEngine(engine: Engine): void {
  analysisState.activeEngine = engine;
  analysisState.activeMode = engine === 'browser' ? 'AC' : modeSelect.value as 'AC' | 'DC';
  modeSelect.disabled = engine === 'browser';
  if (engine === 'browser') modeSelect.value = 'AC';
  if (engine === 'browser') {
    solverPanel.querySelector<HTMLElement>('#v61HostActions')!.hidden = true;
    solverPanel.querySelector<HTMLElement>('#v61InstallationHelp')!.hidden = true;
  } else if (lastNativeHostError) setHostError(lastNativeHostError, 'replay');
  resetCalculationStatus();
  updateStatus(network ? `${engineLabel(engine)} · ${analysisState.activeMode} hesap bekleniyor.` : 'Önce bir model yükleyin.', 'warn');
  void updateActiveResult(); renderMetadata(); renderComparison(); renderScope(); renderScenario();
}
engineSelect.onchange = () => setEngine(engineSelect.value as Engine);
modeSelect.onchange = () => { analysisState.activeMode = modeSelect.value as 'AC' | 'DC'; resetCalculationStatus(); updateStatus(`${engineLabel(analysisState.activeEngine)} · ${analysisState.activeMode} hesap bekleniyor.`, 'warn'); void updateActiveResult(); renderMetadata(); renderComparison(); };
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
const browserSolver = new BrowserApproxSolver(legacy.runAnalysis, legacy.getSolver, () => legacy.getResultSets().at(-1)?.rows ?? []);
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
  const selectionGeneration = activeKeyGeneration;
  const key = await makeSelectedKey();
  if (selectionGeneration !== activeKeyGeneration) return;
  currentCalculationKey = key;
  const keyId = calculationKeyId(key);
  const prompt = solverPanel.querySelector<HTMLElement>('#v61CachePrompt')!;
  prompt.hidden = true;
  const cached = await getCalculation<ResultSet>(keyId, `latest:${await sha256(key)}`);
  if (selectionGeneration !== activeKeyGeneration) return;
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
  const calculationNetwork = network;
  const selectionGeneration = activeKeyGeneration;
  if (!calculationNetwork) return;
  const startedAt = new Date().toISOString();
  const startedClock = Date.now();
  analysisState.calculationJob = createCalculationJob(crypto.randomUUID());
  const jobId = analysisState.calculationJob.id;
  const selectionIsCurrent = () => network === calculationNetwork && selectionGeneration === activeKeyGeneration &&
    analysisState.activeEngine === engine && selectedMode() === mode && analysisState.calculationJob.id === jobId;
  analysisState.preflight = null; analysisState.activeResult = null;
  analysisState.displayedResultIsCached = false;
  renderMetadata(); renderPreflight(null); renderComparison();
  solverPanel.querySelector<HTMLElement>('#v61HostActions')!.hidden = true;
  setJobState('PREPARING', 'Hesap hazırlanıyor…');
  updateStatus('Hesap başlatılıyor…');
  if (jobTimer) clearInterval(jobTimer);
  try {
    let result: ResultSet;
    if (engine === 'browser') {
      setJobState('SOLVING', 'Tarayıcı Yaklaşık Çözüm çalışıyor…');
      result = await browserSolver.runLoadFlow(calculationNetwork, { mode: 'AC' });
      if (!selectionIsCurrent()) return;
      setJobState('SERIALIZING', 'Tarayıcı sonucu kaydediliyor…');
    } else {
      result = await nativeSolver.runLoadFlow(calculationNetwork, { mode }, phase => {
        if (!selectionIsCurrent()) return;
        const phases: Record<string, [CalculationJobState, string]> = {
          PREPARING: ['PREPARING', 'Model hazırlanıyor…'], CREATE_MODEL: ['TRANSFERRING', 'Model aktarımı hazırlanıyor…'],
          MODEL_CHUNK: ['TRANSFERRING', 'Model yerel motora aktarılıyor…'], MODEL_READY: ['TRANSFERRING', 'Model hazır…'],
          AC_PREFLIGHT: ['PREFLIGHT', 'AC ön kontrol yapılıyor…'], PREFLIGHT: ['PREFLIGHT', 'Ön kontrol tamamlandı…'],
          CONVERTING: ['SOLVING', 'Elektriksel model çözücüye aktarılıyor…'], SOLVING_AC: ['SOLVING', 'AC yük akışı çözülüyor…'],
          SOLVING_DC: ['SOLVING', 'DC yük akışı çözülüyor…'], SERIALIZING: ['SERIALIZING', 'Sonuçlar hazırlanıyor…'],
        };
        const [state, message] = phases[phase] ?? ['SOLVING', 'Hesap sürüyor…'];
        setJobState(state, message); updateStatus(message);
      }, diagnostics => { if (selectionIsCurrent()) { analysisState.preflight = diagnostics; renderPreflight(diagnostics); renderMetadata(); } });
      if (!selectionIsCurrent()) return;
      analysisState.preflight = result.preflight ?? analysisState.preflight;
    }
    const saved = await saveResult(key, result, startedAt, Date.now() - startedClock);
    if (!selectionIsCurrent()) return;
    if (engine === 'pandapower') {
      lastNativeHostError = null;
      analysisState.hostState = 'CONNECTED';
      solverPanel.querySelector<HTMLElement>('#v61HostHealth')!.textContent = `Grid Analyzer Yerel Hesap Motoru · Yerel hesap motoru: BAĞLI · Protocol 1.0 · pandapower ${result.engineVersion}`;
      solverPanel.querySelector<HTMLElement>('#v61HostHealth')!.className = 'notice';
      solverPanel.querySelector<HTMLElement>('#v61HostActions')!.hidden = true;
      solverPanel.querySelector<HTMLElement>('#v61InstallationHelp')!.hidden = true;
    }
    analysisState.activeCalculationKeyId = saved.keyId;
    analysisState.activeResult = result;
    const terminalState = result.convergence === 'NON_CONVERGED' ? 'NON_CONVERGED' : 'COMPLETED';
    setJobState(terminalState, result.convergence === 'NON_CONVERGED' ? 'AC çözümü yakınsamadı.' : `${mode} hesap tamamlandı · ${convergenceLabel(result)}.`);
    if (result.convergence !== 'CONVERGED') analysisState.calculationState = 'NON_CONVERGED';
    const kind = result.convergence === 'CONVERGED' ? result.validation === 'COMPLETE_UNVALIDATED' ? 'warn' : 'info' : result.convergence === 'NON_CONVERGED' ? 'bad' : 'warn';
    updateStatus(result.convergence === 'NON_CONVERGED' ? 'AC çözümü yakınsamadı; sayısal AC sonuçları gösterilmiyor. Ayrıntılar Yakınsama Tanısı bölümünde.' : `${mode} yük akışı ${convergenceLabel(result).toLocaleLowerCase('tr-TR')}.`, kind);
    renderMetadata(); renderPreflight(analysisState.preflight); renderComparison(); renderBusAvailability(); renderScenario();
  } catch (error) {
    if (!selectionIsCurrent()) return;
    setJobState('FAILED', 'Hesap başarısız.');
    if (error instanceof NativeHostError) {
      setHostError(error, 'calculation');
      const host = solverPanel.querySelector<HTMLElement>('#v61HostHealth')!;
      if (error.kind !== 'TIMEOUT') {
        host.textContent = `Grid Analyzer Yerel Hesap Motoru · Yerel hesap motoru: ${analysisState.hostState === 'CONNECTED' ? 'BAĞLI' : analysisState.hostState === 'ERROR' ? 'HATA' : 'BAĞLANTI YOK'} · ${error.kind === 'SOLVER_ERROR' ? 'Hesap motoru yanıt verdi' : error.kind}`;
        host.className = `notice ${analysisState.hostState === 'CONNECTED' ? '' : 'bad'}`.trim();
      }
      if (error.kind === 'TIMEOUT') analysisState.calculationState = 'TIMEOUT';
      updateStatus(nativeErrorMessages[error.kind], 'bad');
    }
    else updateStatus(error instanceof Error ? error.message : String(error), 'bad');
    renderMetadata(); renderComparison(); renderBusAvailability();
  } finally {
    if (selectionIsCurrent()) {
      if (jobTimer) clearInterval(jobTimer);
      engineSelect.disabled = false; modeSelect.disabled = analysisState.activeEngine === 'browser';
      renderScenario();
    }
  }
}
runButton.onclick = () => { void runSelectedSolver(); };
solverPanel.querySelector<HTMLButtonElement>('#v61ShowCached')!.onclick = () => {
  const record = pendingCachedCalculation; if (!record || record.keyId !== analysisState.activeCalculationKeyId || !resultMatchesSelection(record.result)) return;
  analysisState.calculationsByKey.set(record.keyId, record);
  analysisState.activeCalculationKeyId = record.keyId; analysisState.activeResult = record.result;
  analysisState.displayedResultIsCached = true;
  analysisState.calculationState = record.result.convergence === 'CONVERGED' ? 'CONVERGED' : 'NON_CONVERGED';
  pendingCachedCalculation = null; solverPanel.querySelector<HTMLElement>('#v61CachePrompt')!.hidden = true;
  renderMetadata(); renderComparison(); renderBusAvailability(); updateStatus(`Önceki ${calculationEngineLabel(record.result.engine)} sonucu gösteriliyor. ${convergenceLabel(record.result)}.`);
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
  const startedClock = performance.now();
  const status = solverPanel.querySelector<HTMLElement>('#v61HostHealth')!;
  analysisState.hostState = 'STARTING';
  status.textContent = 'Grid Analyzer Yerel Hesap Motoru bağlantısı sınanıyor…'; status.className = 'notice warn';
  try {
    const health = await nativeSolver.healthCheck();
    if (generation !== healthGeneration) return;
    const okay = health.status === 'CONNECTED';
    analysisState.hostState = okay ? 'CONNECTED' : 'ERROR';
    const statusLabels = { CONNECTED: 'Bağlı', PROTOCOL_MISMATCH: 'Protokol sürümü uyumsuz', ENGINE_MISMATCH: 'Hesap motoru uyumsuz', ENGINE_VERSION_MISMATCH: 'Hesap motoru sürümü uyumsuz' } as const;
    status.textContent = `Grid Analyzer Yerel Hesap Motoru · Yerel hesap motoru: ${okay ? 'BAĞLI' : 'HATA'} · ${statusLabels[health.status]} · Protokol: ${health.protocolVersion} · Motor: ${health.engine} · Sürüm: ${health.engineVersion} · Extension ID: ${health.extensionId} · Bağlantı: ${Math.round(performance.now() - startedClock)} ms`;
    status.className = `notice ${okay ? '' : 'bad'}`;
    if (okay) { lastNativeHostError = null; solverPanel.querySelector<HTMLElement>('#v61HostActions')!.hidden = true; }
    solverPanel.querySelector<HTMLElement>('#v61InstallationHelp')!.hidden = true;
  } catch (error) {
    if (generation !== healthGeneration) return;
    if (error instanceof NativeHostError) {
      setHostError(error);
      status.textContent = `Grid Analyzer Yerel Hesap Motoru · Yerel hesap motoru: ${error.kind.endsWith('_TIMEOUT') || error.kind === 'TIMEOUT' ? 'ZAMAN AŞIMI' : ['PANDAPOWER_IMPORT_ERROR', 'PROTOCOL_ERROR'].includes(error.kind) ? 'HATA' : 'BAĞLANTI YOK'} · ${error.kind} · ${nativeErrorMessages[error.kind]} · Bağlantı: ${Math.round(performance.now() - startedClock)} ms`;
    } else { analysisState.hostState = 'DISCONNECTED'; status.textContent = `Grid Analyzer Yerel Hesap Motoru · Yerel hesap motoru: BAĞLANTI YOK · Başlatılamadı · ${String(error)}`; }
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
  const electrical = model.electrical;
  const nodes = electrical?.buses.map(item => item.id) ?? [];
  const edges = [
    ...(electrical?.lines ?? []).map(item => [item.fromBus, item.toBus]),
    ...(electrical?.switches ?? []).map(item => [item.fromBus, item.toBus]),
    ...(electrical?.transformers ?? []).map(item => [item.hvBus, item.lvBus]),
    ...(electrical?.seriesCompensators ?? []).map(item => [item.fromBus, item.toBus]),
  ].filter((edge): edge is [string, string] => !!edge[0] && !!edge[1]);
  worker.onmessage = (event: MessageEvent<{ type: string; components?: number }>) => {
    if (event.data.type === 'TOPOLOGY_COMPLETE') { metadata.dataset.components = String(event.data.components); worker.terminate(); }
    if (event.data.type === 'TOPOLOGY_ERROR') worker.terminate();
  };
  worker.postMessage({ type: 'BUILD_TOPOLOGY', nodes, edges });
}
async function onModelLoaded(model: LegacyModel, file: File, parsed: ParsedModel): Promise<void> {
  const loadedModelHash = parsed.modelHash;
  mapResultsInvalidated = !!modelHash && modelHash !== loadedModelHash;
  modelHash = loadedModelHash;
  // Keep one electrical representation on the analysis path. The full DGS remains in the legacy model;
  // constructing a second all-equipment registry here duplicated hundreds of thousands of records.
  network = {
    modelId: model.rid, modelHash: loadedModelHash, scope: 'FULL', electrical: undefined,
    substations: [], voltageLevels: [], buses: [], terminals: [], switches: [], lines: [], transformers: [],
    generators: [], loads: [], shunts: [], seriesCompensators: [], externalGrids: [], measurements: [], controls: [],
  };
  parsed.electrical.modelId = model.rid;
  network.electrical = parsed.electrical;
  const integrity: Integrity = parsed.electrical.completeness === 'PARTIAL' ? 'PARTIAL' : 'COMPLETE_UNVALIDATED';
  const check = { integrity, findings: parsed.electrical.findings };
  analysisState.integrity = integrity;
  analysisState.calculationsByKey.clear(); analysisState.referenceResult = null;
  resetCalculationStatus();
  analysisState.activeResult = null; analysisState.activeCalculationKeyId = null; currentCalculationKey = null; analysisState.preflight = null;
  document.querySelector('#v6Validation')?.remove();
  const panel = document.createElement('section'); panel.id = 'v6Validation'; panel.className = 'panel'; panel.dataset.modelName = file.name;
  const heading = document.createElement('h3'); heading.textContent = 'Model kontrolü';
  const summary = document.createElement('p'); summary.textContent = 'Model kontrolleri tamamlanıyor…';
  panel.append(heading, summary); upload.append(panel);
  analysisState.calculationHistory = await getCalculationHistory(loadedModelHash, 20);
  if (modelHash !== loadedModelHash) return;
  renderHistory();
  const savedScenario = await getRecord<{ snapshot: Partial<ScenarioPayload> }>('scenarios', `${loadedModelHash}:latest`);
  if (modelHash !== loadedModelHash) return;
  legacy.restoreScenario?.(savedScenario?.snapshot ?? { lines: [], switches: [], restoredTerminals: [], autoRestoreTerminals: false });
  topologyInWorker(network);
  void updateActiveResult(); renderMetadata(); renderScope(); renderComparison(); renderScenario();
  updateStatus(`${file.name} modeli hazır · ${nf.format(parsed.electrical.buses.length)} bara · AC/DC hesap bekliyor.`);
  const station = parsed.electrical.modelCoverage.stationControls;
  const qCoverage = parsed.electrical.modelCoverage.elmGenStatQLimits;
  summary.textContent = `${nf.format(model.stats.rows)} kaynak kaydı incelendi · ${parsed.electrical.findings.length} elektriksel bildirim · ${parsed.electrical.completeness === 'COMPLETE' ? 'eşleme hazır' : 'kısmi eşleme'} · ${station.total} istasyon kontrolü korundu · statik üretimde Q sınırı ${qCoverage.available}/${qCoverage.total}.`;
  const quality = document.querySelector<HTMLElement>('#qualitySummary');
  if (quality) quality.textContent = `${nf.format(model.stats.geo)} hat model güzergâhıyla; ${nf.format(model.stats.fallback)} hat temsili bağlantıyla gösterilebilir. ${nf.format(model.stats.rows)} kaynak kaydı denetlendi. Elektriksel eşleme: ${parsed.electrical.completeness === 'COMPLETE' ? 'tam' : 'kısmi'}.`;
  setTimeout(() => {
    void Promise.all([
      putRecord('models', { id: loadedModelHash, name: file.name, file, savedAt: Date.now() }),
      putRecord('canonical', { id: loadedModelHash, electrical: parsed.electrical, integrity: check.integrity, findings: check.findings, timings: parsed.timings, savedAt: Date.now() })
    ]).catch(error => { console.warn('Model cache:', error); if (modelHash === loadedModelHash) updateStatus('Model açıldı; yerel önbellek yazılamadı.', 'warn'); });
  }, 0);
}
window.V6Bridge = {
  modelLoaded: (model, file, parsed) => { void onModelLoaded(model, file, parsed).catch(error => { console.error('Model cache:', error); updateStatus('Model özeti kaydedilemedi.', 'warn'); }); },
  scenarioChanged: () => {
    mapResultsInvalidated = true;
    resetCalculationStatus();
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
      const key = await createCalculationKey({ modelHash, engine: 'browser-approx', mode: 'AC', scenario: scenarioPayload(), solverVersion: 'browser-approx-v6.1.6', options: { scope: 'TRANSMISSION_REDUCED' } });
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

document.title = 'Grid Analyzer | Şebeke Analiz Sistemi v6.1.6';
const appTitle = document.querySelector<HTMLElement>('.apphead h1');
if (appTitle) appTitle.textContent = 'Grid Analyzer';
const brandLogo = document.querySelector<HTMLElement>('.brandlogo');
if (brandLogo) brandLogo.textContent = 'GA';
const appVersion = document.querySelector<HTMLElement>('.brand small');
if (appVersion) appVersion.textContent = 'Şebeke Analiz Sistemi';
if (footer) footer.textContent = 'Grid Analyzer · Chrome MV3 · v6.1.6';
renderMetadata(); renderScope(); renderScenario(); presentationSweep();

void getRecord<{ file: File; name: string }>('models', 'pending').then(async record => {
  if (!record?.file) return;
  await legacy.loadFiles([record.file]);
  if (legacy.getActive()?.name === record.name) await deleteRecord('models', 'pending');
}).catch(error => console.warn('Bekleyen model açılamadı:', error));

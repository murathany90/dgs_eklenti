import { buildCanonicalNetwork } from '../model/canonical-network.ts';
import type { CanonicalNetwork, DgsDocument } from '../model/types.ts';
import { validateNetwork, type Integrity } from '../validation/validation.ts';
import { putRecord, getRecord, deleteRecord } from '../storage/db.ts';
import { BrowserApproxSolver } from '../solvers/browser-approx-solver.ts';
import { NativeHostError, PandapowerSolver } from '../solvers/pandapower-solver.ts';
import { toLegacyRows, type ACPreflightDiagnostics, type ResultSet } from '../analysis/result-set.ts';
import { fromLegacyRows } from '../analysis/legacy-adapter.ts';
import type { ElectricalCanonicalNetwork } from '../model/electrical-types.ts';
import { displayEquipmentType, presentUserText, primaryDisplayName } from '../presentation/equipmentPresentation.ts';

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
type Engine = 'browser' | 'pandapower';
interface AnalysisState {
  activeEngine: Engine; activeMode: 'AC' | 'DC'; activeResult: ResultSet | null;
  lastBrowserResult: ResultSet | null; lastPandapowerResult: ResultSet | null; referenceResult: ResultSet | null;
  preflight: ACPreflightDiagnostics | null; integrity: Integrity;
}
declare global { interface Window {
  V6Legacy: LegacyBridge;
  V6Bridge?: { modelLoaded: (model: LegacyModel, file: File, parsed: ParsedModel) => void; scenarioChanged: () => void };
  YTBS_AnalysisState?: AnalysisState;
} }

const legacy = window.V6Legacy;
let network: CanonicalNetwork | null = null;
let modelHash = '';
let lastStoredSignature = '';
const analysisState: AnalysisState = { activeEngine: 'browser', activeMode: 'AC', activeResult: null,
  lastBrowserResult: null, lastPandapowerResult: null, referenceResult: null, preflight: null, integrity: 'COMPLETE_UNVALIDATED' };
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
let technicalMode = localStorage.getItem('ytbs-technical-dgs') === 'true';
const technicalToggle = document.querySelector<HTMLInputElement>('#technicalDgsToggle')!;
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
solverPanel.innerHTML = `<div class="heading"><div><h2>Elektriksel Analiz</h2><span class="sub">Tam şebeke ve iletim ağına indirgenmiş yaklaşık çözüm</span></div></div>
  <div class="analysisToolbar"><div class="field"><label for="v61Engine">Hesap motoru</label><select id="v61Engine"><option value="browser">Tarayıcı Yaklaşık Çözüm</option><option value="pandapower">Yerel Tam Şebeke Çözücüsü</option></select></div>
  <div class="field"><label for="v61Mode">Analiz</label><select id="v61Mode"><option value="AC">AC Yük Akışı</option><option value="DC">DC Aktif Güç Akışı</option></select></div>
  <button class="primary" id="v61Run">Hesapla</button><button id="v61ReferenceButton" type="button">PowerFactory referansı yükle</button><input id="v61Reference" type="file" accept=".json,application/json" hidden></div>
  <p id="v61Status" class="notice warn">Önce bir model yükleyin.</p>
  <div class="row" id="v61HostActions" hidden><button type="button" id="v61InstallHelp">Kurulum Yardımı</button><button type="button" id="v61Retry">Bağlantıyı Tekrar Kontrol Et</button><details><summary>Teknik ayrıntılar</summary><pre id="v61TechnicalError"></pre></details></div>
  <div id="v61Scope" class="mini"></div>
  <div id="v61Preflight" class="panel" hidden><div class="heading"><div><h3>AC Ön Kontrol Tanıları</h3><span class="sub">Model dönüştürmesinden alınan bağlantı ve kontrol özeti</span></div><details id="v61PreflightDetails"><summary>Yakınsamama Ayrıntıları</summary><div id="v61PreflightGrid" class="preflightGrid"></div><details><summary>Tanı JSON'u · teknik ayrıntı</summary><pre id="v61PreflightJson" class="rawpre"></pre></details></details></div></div>
  <section id="v61NonConvergence" class="notice bad" hidden></section><section id="v61DcSuccess" class="notice" hidden></section>
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
let previousRun: (() => void) | null = null;
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
function engineLabel(engine: Engine): string { return engine === 'browser' ? 'Tarayıcı Yaklaşık Çözüm' : 'Yerel Tam Şebeke Çözücüsü'; }
function convergenceLabel(result: ResultSet | null): string {
  if (!result) return 'Hesap bekleniyor';
  if (result.convergence === 'CONVERGED') return 'Yakınsadı';
  if (result.convergence === 'NON_CONVERGED') return 'Yakınsamadı';
  if (result.convergence === 'PARTIAL') return 'Kısmi çözüm';
  return 'Hesaplanmadı';
}
function validationLabel(result: ResultSet | null): string {
  if (!result) return 'Referans ve çözüm bekleniyor';
  if (analysisState.referenceResult?.modelHash === result.modelHash) return 'PowerFactory referansı yüklendi; tolerans denetimi yapılmadı';
  if (result.validation === 'COMPLETE_UNVALIDATED') return 'Bağımsız PowerFactory referansı yok';
  if (result.validation === 'PARTIAL') return 'Eşleme kısmi; bağımsız referans yok';
  return 'Bağımsız referans bekleniyor';
}
function activeResult(): ResultSet | null { return analysisState.activeEngine === 'browser' ? analysisState.lastBrowserResult : analysisState.lastPandapowerResult; }
function updateActiveResult(): void { analysisState.activeResult = activeResult(); }
function renderMetadata(): void {
  updateActiveResult();
  const result = analysisState.activeResult;
  const electrical = network?.electrical;
  const coverage = electrical?.modelCoverage.pvGeneratorQLimits;
  const mappingText = !electrical ? 'Model bekleniyor' : `${electrical.completeness === 'COMPLETE' ? 'Eşleme hazır' : 'Kısmi eşleme'} · ${coverage?.available ?? 0}/${coverage?.total ?? 0} PV ünitesinde iki Q sınırı`;
  const scopeText = result?.electricalScope === 'TRANSMISSION_REDUCED' ? '66 kV+ indirgenmiş ağ' : electrical ? 'Tam gerilim kapsamı' : 'Model bekleniyor';
  const entries = [
    ['HESAP DURUMU', convergenceLabel(result), `${engineLabel(analysisState.activeEngine)} · ${analysisState.activeMode} yük akışı`],
    ['MODEL KAPSAMI', scopeText, result ? `${result.topologyMode === 'BUS_BRANCH' ? 'Bara-kol gösterimi' : 'Düğüm-kesici gösterimi'}` : 'Model ve çözüm kapsamı'],
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
  scope.textContent = `Tam model · ${nf.format(electrical.buses.length)} bara · ${nf.format(electrical.lines.length)} hat · ${nf.format(electrical.transformers.length)} transformatör · ${nf.format(coverage.stationControls?.total ?? 0)} istasyon kontrol kaydı (çözücüye uygulanmıyor)`;
}

function preflightEntries(d: ACPreflightDiagnostics): Array<[string, string]> {
  return [
    ['Toplam / servisteki bara', `${nf.format(d.modelCounts.bus)} / ${nf.format(d.inServiceBusCount)}`],
    ['Elektriksel ada', `${nf.format(d.electricalIslandCount)} · kaynaklı ${nf.format(d.islandsWithSlackCount)} · kaynaksız ${nf.format(d.islandsWithoutSlackCount)}`],
    ['Kaynaksız bara', nf.format(d.unsuppliedBusCount)],
    ['Üretim − tüketim başlangıç farkı', `${fmt(d.initialPImbalanceMw)} MW`],
    ['PV / PQ bara', `${nf.format(d.pvBusCount)} / ${nf.format(d.pqBusCount)}`],
    ['Q sınırı eksik PV üretim ünitesi', `${nf.format(d.pvUnitsMissingQLimits)} / ${nf.format(d.pvUnitCount)}`],
    ['Geçersiz gerilim ayarı', nf.format(d.pvUnitsInvalidVoltageSetpoint)],
    ['Gerilim ayarı aralığı', `${fmt(d.minVmSetpointPu, 4)}–${fmt(d.maxVmSetpointPu, 4)} p.u.`],
    ['Trafo sınır dışı / nötrden >10 kademe', `${nf.format(d.transformerTapOutsideDeclaredLimits)} / ${nf.format(d.transformerTapDeviationAbsGreaterThan10)}`],
    ['Faz açısı eksik transformatör', nf.format(d.transformerPhaseAngleMissing)],
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
    nonConvergenceNotice.innerHTML = `<strong>AC yük akışı yakınsamadı.</strong><br>Model: ${nf.format(summary.modelBusCount ?? result.preflight?.modelCounts.bus ?? 0)} bara · ${nf.format(summary.modelLineCount ?? result.preflight?.modelCounts.line ?? 0)} hat · ${nf.format(summary.modelTransformerCount ?? result.preflight?.modelCounts.transformer ?? 0)} transformatör · Newton yinelemesi: ${result.iterations ?? 30}.<br><span>Sayısal AC sonuçları oluşturulmadı.</span>`;
    comparison.innerHTML = '';
    return;
  }
  if (!dcNotice.hidden) dcNotice.textContent = 'Hesap başarılı. Aktif güç akışı hazır. Gerilim büyüklüğü ve reaktif güç DC analizinde hesaplanmaz.';
  const sources = [
    ['reference', analysisState.referenceResult], ['pandapower', analysisState.lastPandapowerResult], ['browser', analysisState.lastBrowserResult],
  ] as const;
  const merged = new Map<string, ComparisonRecord>();
  for (const [source, resultSet] of sources) for (const item of metricRecords(resultSet)) {
    const record = merged.get(item.key) ?? { key: item.key, category: item.category, id: item.id, name: item.name, type: item.type, metric: item.metric, unit: item.unit };
    if (source === 'reference') record.reference = item.value;
    else if (source === 'pandapower') record.pandapower = item.value;
    else record.browser = item.value;
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
function setHostError(error: NativeHostError): void {
  const messages: Record<NativeHostError['kind'], string> = {
    HOST_NOT_INSTALLED: 'Yerel hesap motoru kurulu değil.', HOST_DISCONNECTED: 'Yerel hesap motoruyla bağlantı kesildi.',
    HOST_CRASHED: 'Hesap motoru beklenmedik biçimde kapandı.', PROTOCOL_ERROR: 'Hesap motoru sürümü uyumlu değil.', TIMEOUT: 'Hesap zaman aşımına uğradı.',
  };
  updateStatus(messages[error.kind], 'bad');
  const actions = solverPanel.querySelector<HTMLElement>('#v61HostActions')!;
  actions.hidden = true;
  if (error.kind === 'HOST_NOT_INSTALLED' || error.kind === 'HOST_DISCONNECTED' || error.kind === 'HOST_CRASHED') actions.hidden = false;
  solverPanel.querySelector<HTMLElement>('#v61TechnicalError')!.textContent = error.technicalMessage;
}
function setEngine(engine: Engine): void {
  analysisState.activeEngine = engine;
  analysisState.activeMode = engine === 'browser' ? 'AC' : modeSelect.value as 'AC' | 'DC';
  modeSelect.disabled = engine === 'browser';
  if (engine === 'browser') modeSelect.value = 'AC';
  updateActiveResult(); renderMetadata(); renderComparison();
}
engineSelect.onchange = () => setEngine(engineSelect.value as Engine);
modeSelect.onchange = () => { analysisState.activeMode = modeSelect.value as 'AC' | 'DC'; updateActiveResult(); renderMetadata(); renderComparison(); };
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
  analysisState.preflight = null; renderMetadata(); renderPreflight(null);
  runButton.disabled = true; solverPanel.querySelector<HTMLElement>('#v61HostActions')!.hidden = true;
  const run = (): void => { void runSelectedSolver(); };
  previousRun = run;
  try {
    if (engine === 'browser') {
      updateStatus('Tarayıcı Yaklaşık Çözüm çalışıyor…');
      await browserSolver.runLoadFlow(network, { mode: 'AC' });
      persistCurrentResult();
      analysisState.activeResult = analysisState.lastBrowserResult;
      updateStatus(`Tarayıcı Yaklaşık Çözüm tamamlandı · ${convergenceLabel(analysisState.activeResult)} · iletim ağına indirgenmiş sonuç`, 'warn');
    } else {
      const scenario = legacy.getScenario();
      if (scenario.lines.length || scenario.switches.length) throw Error('Bu motor henüz senaryo değişikliklerini desteklemiyor. Senaryo çözümü için Tarayıcı Yaklaşık Çözüm seçin.');
      updateStatus('Yerel hesap motoru bağlanıyor…');
      const result = await nativeSolver.runLoadFlow(network, { mode }, phase => {
        const phases: Record<string, string> = { CREATE_MODEL: 'Model hazırlanıyor', MODEL_CHUNK: 'Model yerel motora aktarılıyor', MODEL_READY: 'Model hazır', AC_PREFLIGHT: 'Ön kontrol yapılıyor', CONVERTING: 'Elektriksel model çözücüye aktarılıyor', SERIALIZING: 'Sonuçlar hazırlanıyor' };
        updateStatus(phases[phase] ?? 'Hesap sürüyor…');
      }, diagnostics => { analysisState.preflight = diagnostics; renderPreflight(diagnostics); renderMetadata(); });
      analysisState.lastPandapowerResult = result;
      analysisState.preflight = result.preflight ?? analysisState.preflight;
      await putRecord('results', { id: `${modelHash}:pandapower:${mode}`, result });
      if (result.convergence === 'CONVERGED') legacy.addCalculatedResult(`Yerel ${mode} çözümü · ${result.validation}`, toLegacyRows(result), { resultSetVersion: '2.0', validation: result.validation });
      const kind = result.convergence === 'CONVERGED' ? result.validation === 'COMPLETE_UNVALIDATED' ? 'warn' : 'info' : 'bad';
      updateStatus(result.convergence === 'NON_CONVERGED' ? 'AC yük akışı yakınsamadı; sayısal AC sonuçları üretilmedi.' : `${mode} yük akışı ${convergenceLabel(result).toLocaleLowerCase('tr-TR')}.`, kind);
    }
    analysisState.activeResult = activeResult();
    renderMetadata(); renderPreflight(analysisState.preflight); renderComparison();
  } catch (error) {
    if (error instanceof NativeHostError) setHostError(error);
    else updateStatus(error instanceof Error ? error.message : String(error), 'bad');
  } finally { runButton.disabled = false; }
}
runButton.onclick = () => { void runSelectedSolver(); };
solverPanel.querySelector<HTMLButtonElement>('#v61Retry')!.onclick = () => previousRun?.();
solverPanel.querySelector<HTMLButtonElement>('#v61InstallHelp')!.onclick = () => {
  navigate('help');
  document.querySelector<HTMLButtonElement>('#infoNav [data-info="help"]')?.click();
};

function renderScenario(): void {
  const scenario = legacy.getScenario();
  const lines = scenario.lines.length, switches = scenario.switches.length;
  const summary = document.querySelector<HTMLElement>('#scenarioSummary');
  if (summary) summary.textContent = `${lines + switches} etkin değişiklik · ${lines} hat durumu · ${switches} anahtar durumu. DGS kaynak modeli değiştirilmedi.`;
  const solverNote = document.querySelector<HTMLElement>('#v4ScenarioStatus');
  if (solverNote && engineSelect.value === 'pandapower' && (lines || switches)) solverNote.dataset.solverNote = 'Yerel Tam Şebeke Çözücüsü senaryo değişikliklerini uygulamaz.';
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
  analysisState.lastBrowserResult = null; analysisState.lastPandapowerResult = null; analysisState.referenceResult = null;
  analysisState.activeResult = null; analysisState.preflight = null; lastStoredSignature = '';
  await putRecord('models', { id: modelHash, name: file.name, file, savedAt: Date.now() });
  const check = validateNetwork(network, model.raw);
  await putRecord('canonical', { id: modelHash, electrical: parsed.electrical, integrity: check.integrity, findings: check.findings, timings: parsed.timings, savedAt: Date.now() });
  topologyInWorker(network);
  renderMetadata(); renderScope(); renderComparison(); renderScenario();
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
  scenarioChanged: () => { renderScenario(); if (modelHash) void putRecord('scenarios', { id: `${modelHash}:latest`, snapshot: legacy.getScenario(), savedAt: Date.now() }); },
};

function persistCurrentResult(): void {
  if (!network) return;
  const source = legacy.getResultSets().at(-1);
  const rows = (source?.rows ?? []).filter(row => typeof row.value === 'number' && Number.isFinite(row.value));
  const signature = `${rows.length}:${rows.reduce((sum, row) => sum + (row.value ?? 0), 0)}:${JSON.stringify(rows.slice(-1))}`;
  if (!source || signature === lastStoredSignature) return;
  lastStoredSignature = signature;
  const state = legacy.getSolver();
  analysisState.lastBrowserResult = fromLegacyRows(network, rows, state?.solved === state?.total ? 'CONVERGED' : 'PARTIAL');
  if (analysisState.activeEngine === 'browser') analysisState.activeResult = analysisState.lastBrowserResult;
  renderMetadata(); renderComparison();
  void putRecord('results', { id: `${modelHash}:browser-approx`, result: analysisState.lastBrowserResult });
}
const oldSolverStatus = document.querySelector<HTMLElement>('#solverStatus');
if (oldSolverStatus) new MutationObserver(() => persistCurrentResult()).observe(oldSolverStatus, { childList: true, subtree: true, characterData: true });
for (const id of ['v54ScenarioRun', 'runSolver']) document.querySelector(`#${id}`)?.addEventListener('click', () => { analysisState.activeEngine = 'browser'; analysisState.activeMode = 'AC'; engineSelect.value = 'browser'; modeSelect.value = 'AC'; renderMetadata(); });

document.title = 'YTBS Şebeke Analiz ve Görüntüleme v6.1.1';
const appTitle = document.querySelector<HTMLElement>('.apphead h1');
if (appTitle) appTitle.textContent = 'YTBS Şebeke Analiz ve Görüntüleme v6.1.1';
const appVersion = document.querySelector<HTMLElement>('.brand small');
if (appVersion) appVersion.textContent = 'Yerel model ve şebeke inceleme';
if (footer) footer.textContent = 'YTBS · Chrome MV3 · v6.1.1';
renderMetadata(); renderScope(); renderScenario(); presentationSweep();

void getRecord<{ file: File; name: string }>('models', 'pending').then(async record => {
  if (!record?.file) return;
  await deleteRecord('models', 'pending');
  await legacy.loadFiles([new File([record.file], record.name, { type: 'application/json' })]);
}).catch(error => console.warn('Bekleyen model açılamadı:', error));

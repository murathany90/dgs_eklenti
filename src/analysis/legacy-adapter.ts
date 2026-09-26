import type { CanonicalNetwork } from '../model/types.ts';
import type { BranchEndResult, BranchResult, BusResult, GeneratorResult, InternationalConnectionResult, ResultSet, TransformerResult } from './result-set.ts';
import { resultAvailabilityFor } from './result-availability.ts';

export interface LegacyRow { cls?: string; id?: string; metric?: string; terminal?: string; value?: number; quality?: string; source?: string }
export interface BrowserElmVacDiagnostics {
  total?: number; inService?: number; mapped?: number; mappedIds?: string[]; notMappedIds?: string[];
  pLoadMw?: number; qLoadMvar?: number; mode?: string;
}
export interface BrowserLegacyDiagnostics { internationalConnections?: BrowserElmVacDiagnostics }
const emptyEnd = (): BranchEndResult => ({ pMw: null, qMvar: null, sMva: null, iA: null });
export function fromLegacyRows(network: CanonicalNetwork, rows: LegacyRow[], convergence: ResultSet['convergence'], diagnostics?: BrowserLegacyDiagnostics): ResultSet {
  const values = new Map<string, number>();
  const classIds = new Map<string, Set<string>>();
  const rowKey = (cls: string, id: string, metric: string, terminal = '') => JSON.stringify([cls, id, metric, terminal]);
  for (const row of rows) {
    if (!row.cls || !row.id) continue;
    if (!classIds.has(row.cls)) classIds.set(row.cls, new Set());
    classIds.get(row.cls)!.add(row.id);
    if (row.metric && typeof row.value === 'number' && Number.isFinite(row.value)) {
      const key = rowKey(row.cls, row.id, row.metric, row.terminal ?? '');
      if (!values.has(key)) values.set(key, row.value);
    }
  }
  const value = (cls: string, id: string, metric: string, terminal = ''): number | null => values.get(rowKey(cls, id, metric, terminal)) ?? null;
  const ids = (cls: string): string[] => [...(classIds.get(cls) ?? [])];
  const electrical = network.electrical;
  const busById = new Map((electrical?.buses ?? []).map(bus => [bus.id, bus]));
  const lineById = new Map((electrical?.lines ?? []).map(line => [line.id, line]));
  const transformerById = new Map((electrical?.transformers ?? []).map(transformer => [transformer.id, transformer]));
  const buses: BusResult[] = ids('ElmTerm').map(id => {
    const kv = value('ElmTerm', id, 'V'), nominal = busById.get(id)?.nominalKv;
    return { id, vPu: kv !== null && nominal && nominal > 0 ? kv / nominal : null, vKv: kv, angleDeg: value('ElmTerm', id, 'angle'), quality: 'APPROXIMATE', source: 'browser-approx-v5.5' };
  });
  const branches: BranchResult[] = ids('ElmLne').map(id => {
    const fromP = value('ElmLne', id, 'P', 'from'), toP = value('ElmLne', id, 'P', 'to');
    const fromQ = value('ElmLne', id, 'Q', 'from'), toQ = value('ElmLne', id, 'Q', 'to');
    return { id, kind: 'LINE', fromBus: lineById.get(id)?.fromBus ?? null, toBus: lineById.get(id)?.toBus ?? null,
      from: { ...emptyEnd(), pMw: fromP, qMvar: fromQ, iA: value('ElmLne', id, 'I', 'from') },
      to: { ...emptyEnd(), pMw: toP, qMvar: toQ, iA: value('ElmLne', id, 'I', 'to') },
      loadingPercent: value('ElmLne', id, 'loading'), pLossMw: fromP !== null && toP !== null ? fromP + toP : null,
      qLossMvar: fromQ !== null && toQ !== null ? fromQ + toQ : null, quality: 'APPROXIMATE', source: 'browser-approx-v5.5' };
  });
  const transformers: TransformerResult[] = ids('ElmTr2').map(id => {
    const hvP = value('ElmTr2', id, 'P', 'hv') ?? value('ElmTr2', id, 'P', 'from');
    const lvP = value('ElmTr2', id, 'P', 'lv') ?? value('ElmTr2', id, 'P', 'to');
    const hvQ = value('ElmTr2', id, 'Q', 'hv') ?? value('ElmTr2', id, 'Q', 'from');
    const lvQ = value('ElmTr2', id, 'Q', 'lv') ?? value('ElmTr2', id, 'Q', 'to');
    return { id, hvBus: transformerById.get(id)?.hvBus ?? null, lvBus: transformerById.get(id)?.lvBus ?? null,
    // The legacy browser solver emits transformer ends as from/to; the graph's first end is bushv.
      hv: { ...emptyEnd(), pMw: hvP, qMvar: hvQ }, lv: { ...emptyEnd(), pMw: lvP, qMvar: lvQ },
      loadingPercent: null, pLossMw: hvP !== null && lvP !== null ? hvP + lvP : null,
      qLossMvar: hvQ !== null && lvQ !== null ? hvQ + lvQ : null, tapPosition: null, quality: 'APPROXIMATE', source: 'browser-approx-v5.5' };
  });
  const generators: GeneratorResult[] = ['ElmSym', 'ElmGenStat'].flatMap(cls => ids(cls).map(id => ({ id, bus: null, pMw: value(cls, id, 'P'), qMvar: value(cls, id, 'Q'), vPu: null, limitState: 'UNKNOWN' as const, quality: 'APPROXIMATE' as const, source: 'browser-approx-v5.5' })));
  const elmVac = diagnostics?.internationalConnections;
  const mappedElmVacIds = new Set(elmVac?.mappedIds ?? []);
  const notMappedElmVacIds = new Set(elmVac?.notMappedIds ?? []);
  const internationalConnections: InternationalConnectionResult[] = (electrical?.internationalConnections ?? [])
    .filter(item => item.inService && mappedElmVacIds.has(item.id))
    .map(item => ({ id: item.id, quality: 'APPROXIMATE', source: 'BrowserApprox fixed-PQ demand approximation',
      pMw: item.pLoadMw, qMvar: item.qLoadMvar, mappingMode: 'FIXED_PQ_LOAD_APPROXIMATION' }));
  const unresolvedElmVac = (electrical?.internationalConnections ?? []).filter(item => item.inService && !mappedElmVacIds.has(item.id));
  const pLoss = [...branches, ...transformers].reduce((sum, item) => item.pLossMw === null ? sum : sum + item.pLossMw, 0);
  const qLoss = [...branches, ...transformers].reduce((sum, item) => item.qLossMvar === null ? sum : sum + item.qLossMvar, 0);
  const hasPLoss = [...branches, ...transformers].some(item => item.pLossMw !== null);
  const hasQLoss = [...branches, ...transformers].some(item => item.qLossMvar !== null);
  const result: ResultSet = { schemaVersion: '2.0', engine: 'browser-approx', engineVersion: '6.1.6', modelId: network.modelId, modelHash: network.modelHash,
    timestamp: new Date().toISOString(), topologyMode: 'BUS_BRANCH', electricalScope: 'TRANSMISSION_REDUCED', convergence,
    iterations: null, maxMismatch: null, validation: 'REDUCED', warnings: ['66 kV+ yaklaşık sonuç; tam ağ değildir.', 'Bu sonuç PowerFactory referansı değildir.',
      ...(internationalConnections.length ? [`ElmVac ${internationalConnections.length}/${elmVac?.inService ?? internationalConnections.length} kaydı sabit-PQ talebi olarak yaklaşık modele eklendi.`] : []),
      ...(unresolvedElmVac.length ? [`${unresolvedElmVac.length} etkin ElmVac kaydı BrowserApprox grafiğine yönlendirilemedi.`] : [])],
    unsupported: [
      ...unresolvedElmVac.map(item => ({ kind: 'ElmVac', id: item.id, reason: notMappedElmVacIds.has(item.id)
        ? 'ElmVac bus could not be routed into the reduced BrowserApprox graph'
        : elmVac ? 'Legacy BrowserApprox diagnostics did not confirm this ElmVac row as mapped' : 'ElmVac fixed-PQ mapping was not reported by the legacy solver' })),
      ...(electrical?.controls ?? []).filter(item => item.kind === 'STATION' && item.inService).map(item => ({ kind: 'ElmStactrl', id: item.id, reason: 'Legacy browser solve does not consume canonical station-controller/droop semantics' })),
      ...(electrical?.secondaryControllers ?? []).map(item => ({ kind: 'ElmSecctrl', id: item.id, reason: 'Legacy browser solve does not consume secondary balancing controls' })),
      ...(electrical?.boundaries ?? []).map(item => ({ kind: 'ElmBoundary', id: item.id, reason: 'Legacy browser solve does not enforce boundary interchange' })),
    ],
    buses, branches, transformers, generators, externalGrids: [], internationalConnections,
    losses: [{ id: 'browser-reduced', pMw: hasPLoss ? pLoss : null, qMvar: hasQLoss ? qLoss : null }],
    summary: { generationMw: null, generationMvar: null, loadMw: null, loadMvar: null, activeLossMw: hasPLoss ? pLoss : null, reactiveLossMvar: hasQLoss ? qLoss : null,
      busCount: buses.length, lineCount: branches.length, transformerCount: transformers.length, solveMs: null, mode: 'AC' },
    resultAvailability: { mode: 'AC', convergence, reasons: {} } };
  result.resultAvailability = resultAvailabilityFor(result);
  result.solverOptions = { algorithm: 'legacy-reduced AC-PQ with optional experimental NR correction',
    canonicalElectricalNetworkConsumed: false, inputScope: 'legacy 66 kV+ reduced graph', warmStart: false,
    internationalConnectionMapping: elmVac ?? null,
    unsupportedCanonicalFeatures: ['ElmVac source mode/impedance behavior', 'station Q sharing', 'droop', 'ElmSecctrl/ElmBoundary', 'full transformer tap control', 'canonical Q limits beyond the legacy direct high-voltage subset'] };
  return result;
}

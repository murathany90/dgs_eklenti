import type { CanonicalNetwork } from '../model/types.ts';
import type { BranchEndResult, BranchResult, BusResult, GeneratorResult, ResultSet, TransformerResult } from './result-set.ts';
import { resultAvailabilityFor } from './result-availability.ts';

export interface LegacyRow { cls?: string; id?: string; metric?: string; terminal?: string; value?: number; quality?: string; source?: string }
const emptyEnd = (): BranchEndResult => ({ pMw: null, qMvar: null, sMva: null, iA: null });
export function fromLegacyRows(network: CanonicalNetwork, rows: LegacyRow[], convergence: ResultSet['convergence']): ResultSet {
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
  const buses: BusResult[] = ids('ElmTerm').map(id => ({ id, vPu: null, vKv: value('ElmTerm', id, 'V'), angleDeg: value('ElmTerm', id, 'angle'), quality: 'APPROXIMATE', source: 'browser-approx-v5.5' }));
  const branches: BranchResult[] = ids('ElmLne').map(id => ({ id, kind: 'LINE', fromBus: null, toBus: null,
    from: { ...emptyEnd(), pMw: value('ElmLne', id, 'P', 'from'), qMvar: value('ElmLne', id, 'Q', 'from'), iA: value('ElmLne', id, 'I', 'from') },
    to: { ...emptyEnd(), pMw: value('ElmLne', id, 'P', 'to'), qMvar: value('ElmLne', id, 'Q', 'to'), iA: value('ElmLne', id, 'I', 'to') },
    loadingPercent: value('ElmLne', id, 'loading'), pLossMw: null, qLossMvar: null, quality: 'APPROXIMATE', source: 'browser-approx-v5.5' }));
  const transformers: TransformerResult[] = ids('ElmTr2').map(id => ({ id, hvBus: null, lvBus: null,
    // The legacy browser solver emits transformer ends as from/to; the graph's first end is bushv.
    hv: { ...emptyEnd(), pMw: value('ElmTr2', id, 'P', 'hv') ?? value('ElmTr2', id, 'P', 'from'),
      qMvar: value('ElmTr2', id, 'Q', 'hv') ?? value('ElmTr2', id, 'Q', 'from') },
    lv: { ...emptyEnd(), pMw: value('ElmTr2', id, 'P', 'lv') ?? value('ElmTr2', id, 'P', 'to'),
      qMvar: value('ElmTr2', id, 'Q', 'lv') ?? value('ElmTr2', id, 'Q', 'to') },
    loadingPercent: null, pLossMw: null, qLossMvar: null, tapPosition: null, quality: 'APPROXIMATE', source: 'browser-approx-v5.5' }));
  const generators: GeneratorResult[] = ['ElmSym', 'ElmGenStat'].flatMap(cls => ids(cls).map(id => ({ id, bus: null, pMw: value(cls, id, 'P'), qMvar: value(cls, id, 'Q'), vPu: null, limitState: 'UNKNOWN' as const, quality: 'APPROXIMATE' as const, source: 'browser-approx-v5.5' })));
  const result: ResultSet = { schemaVersion: '2.0', engine: 'browser-approx', engineVersion: '5.5', modelId: network.modelId, modelHash: network.modelHash,
    timestamp: new Date().toISOString(), topologyMode: 'BUS_BRANCH', electricalScope: 'TRANSMISSION_REDUCED', convergence,
    iterations: null, maxMismatch: null, validation: 'REDUCED', warnings: ['66 kV+ yaklaşık sonuç; tam ağ değildir.'], unsupported: [],
    buses, branches, transformers, generators, externalGrids: [], losses: [],
    summary: { generationMw: null, generationMvar: null, loadMw: null, loadMvar: null, activeLossMw: null, reactiveLossMvar: null,
      busCount: buses.length, lineCount: branches.length, transformerCount: transformers.length, solveMs: null, mode: 'AC' },
    resultAvailability: { mode: 'AC', convergence, reasons: {} } };
  result.resultAvailability = resultAvailabilityFor(result);
  return result;
}

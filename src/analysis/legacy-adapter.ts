import type { CanonicalNetwork } from '../model/types.ts';
import type { BranchEndResult, BranchResult, BusResult, GeneratorResult, ResultSet, TransformerResult } from './result-set.ts';

export interface LegacyRow { cls?: string; id?: string; metric?: string; terminal?: string; value?: number; quality?: string; source?: string }
const emptyEnd = (): BranchEndResult => ({ pMw: null, qMvar: null, sMva: null, iA: null });
export function fromLegacyRows(network: CanonicalNetwork, rows: LegacyRow[], convergence: ResultSet['convergence']): ResultSet {
  const value = (cls: string, id: string, metric: string, terminal = ''): number | null => rows.find(row => row.cls === cls && row.id === id && row.metric === metric && (row.terminal ?? '') === terminal && Number.isFinite(row.value))?.value ?? null;
  const ids = (cls: string): string[] => [...new Set(rows.filter(row => row.cls === cls && row.id).map(row => row.id!))];
  const buses: BusResult[] = ids('ElmTerm').map(id => ({ id, vPu: null, vKv: value('ElmTerm', id, 'V'), angleDeg: value('ElmTerm', id, 'angle'), quality: 'APPROXIMATE', source: 'browser-approx-v5.5' }));
  const branches: BranchResult[] = ids('ElmLne').map(id => ({ id, kind: 'LINE', fromBus: null, toBus: null,
    from: { ...emptyEnd(), pMw: value('ElmLne', id, 'P', 'from'), qMvar: value('ElmLne', id, 'Q', 'from'), iA: value('ElmLne', id, 'I', 'from') },
    to: { ...emptyEnd(), pMw: value('ElmLne', id, 'P', 'to'), qMvar: value('ElmLne', id, 'Q', 'to'), iA: value('ElmLne', id, 'I', 'to') },
    loadingPercent: value('ElmLne', id, 'loading'), pLossMw: null, qLossMvar: null, quality: 'APPROXIMATE', source: 'browser-approx-v5.5' }));
  const transformers: TransformerResult[] = ids('ElmTr2').map(id => ({ id, hvBus: null, lvBus: null,
    hv: { ...emptyEnd(), pMw: value('ElmTr2', id, 'P', 'hv'), qMvar: value('ElmTr2', id, 'Q', 'hv') }, lv: emptyEnd(),
    loadingPercent: null, pLossMw: null, qLossMvar: null, tapPosition: null, quality: 'APPROXIMATE', source: 'browser-approx-v5.5' }));
  const generators: GeneratorResult[] = ['ElmSym', 'ElmGenStat'].flatMap(cls => ids(cls).map(id => ({ id, bus: null, pMw: value(cls, id, 'P'), qMvar: value(cls, id, 'Q'), vPu: null, limitState: 'UNKNOWN' as const, quality: 'APPROXIMATE' as const, source: 'browser-approx-v5.5' })));
  return { schemaVersion: '2.0', engine: 'browser-approx-v5.5', engineVersion: '5.5', modelId: network.modelId, modelHash: network.modelHash,
    timestamp: new Date().toISOString(), topologyMode: 'BUS_BRANCH', electricalScope: 'TRANSMISSION_REDUCED', convergence,
    iterations: null, maxMismatch: null, validation: 'REDUCED', warnings: ['66 kV+ yaklaşık sonuç; tam ağ değildir.'], unsupported: [],
    buses, branches, transformers, generators, externalGrids: [], losses: [],
    summary: { generationMw: null, generationMvar: null, loadMw: null, loadMvar: null, activeLossMw: null, reactiveLossMvar: null,
      busCount: buses.length, lineCount: branches.length, transformerCount: transformers.length, solveMs: null, mode: 'AC' } };
}

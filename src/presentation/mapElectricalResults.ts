import type { ResultSet } from '../analysis/result-set.ts';
import type { EquipmentDisplay, EquipmentDisplayIndex, DisplayKind } from './equipmentDisplayIndex.ts';

export interface MapResultRow { cls: string; id: string; metric: string; terminal: string; value: number; unit: string; usable: true; orientation: string; quality: string; source: string; timestamp: string }
export type ResultGroup = 'bus' | 'transformer' | 'line';
export interface EquipmentResult { equipment: EquipmentDisplay; values: Array<{ label: string; value: number | null; unit: string }> }
const numeric = (value: number | null | undefined): number | null => typeof value === 'number' && Number.isFinite(value) ? value : null;
interface ResultIndexes {
  buses: Map<string, ResultSet['buses'][number]>;
  branches: Map<string, ResultSet['branches'][number]>;
  transformers: Map<string, ResultSet['transformers'][number]>;
}
const indexesByResult = new WeakMap<ResultSet, ResultIndexes>();
export function electricalResultIndexes(result: ResultSet): ResultIndexes {
  let indexes = indexesByResult.get(result);
  if (!indexes) {
    indexes = { buses: new Map(result.buses.map(item => [item.id, item])), branches: new Map(result.branches.map(item => [item.id, item])),
      transformers: new Map(result.transformers.map(item => [item.id, item])) };
    indexesByResult.set(result, indexes);
  }
  return indexes;
}

export function electricalResultRows(result: ResultSet): Map<string, MapResultRow> {
  const rows = new Map<string, MapResultRow>();
  const add = (cls: string, id: string, metric: string, terminal: string, value: number | null, unit: string): void => {
    const v = numeric(value); if (v === null) return;
    rows.set(`${cls}|${id}|${metric}|${terminal}`, { cls, id, metric, terminal, value: v, unit, usable: true,
      orientation: metric === 'P' || metric === 'Q' ? 'positive_into_element' : '', quality: result.engine === 'pandapower' ? 'CALCULATED' : 'APPROXIMATE', source: result.engine, timestamp: result.timestamp });
  };
  for (const bus of result.buses) { add('ElmTerm', bus.id, 'V', '', bus.vKv, 'kV'); add('ElmTerm', bus.id, 'angle', '', bus.angleDeg, '°'); }
  for (const branch of result.branches) {
    const cls = branch.kind === 'LINE' ? 'ElmLne' : 'ElmScap';
    for (const [end, values] of [['from', branch.from], ['to', branch.to]] as const) {
      add(cls, branch.id, 'P', end, values.pMw, 'MW'); add(cls, branch.id, 'Q', end, values.qMvar, 'MVAr'); add(cls, branch.id, 'I', end, values.iA, 'A');
    }
    add(cls, branch.id, 'loading', '', branch.loadingPercent, '%');
  }
  for (const transformer of result.transformers) {
    for (const [end, values] of [['hv', transformer.hv], ['lv', transformer.lv]] as const) {
      add('ElmTr2', transformer.id, 'P', end, values.pMw, 'MW'); add('ElmTr2', transformer.id, 'Q', end, values.qMvar, 'MVAr'); add('ElmTr2', transformer.id, 'I', end, values.iA, 'A');
    }
    add('ElmTr2', transformer.id, 'loading', '', transformer.loadingPercent, '%');
  }
  return rows;
}

export function equipmentResults(result: ResultSet, index: EquipmentDisplayIndex, group: ResultGroup, visible?: EquipmentDisplay[]): EquipmentResult[] {
  const entries = visible ?? (group === 'bus' ? index.buses : group === 'transformer' ? index.transformers : index.lines);
  const indexes = electricalResultIndexes(result);
  const byId = group === 'bus' ? indexes.buses : group === 'transformer' ? indexes.transformers : indexes.branches;
  const value = (label: string, amount: number | null | undefined, unit: string) => ({ label, value: numeric(amount), unit });
  return entries.map(equipment => {
    const item = byId.get(equipment.id);
    if (group === 'bus') {
      const bus = item as ResultSet['buses'][number] | undefined;
      const pu = numeric(bus?.vPu) ?? (numeric(bus?.vKv) !== null && equipment.nominalKv ? bus!.vKv! / equipment.nominalKv : null);
      return { equipment, values: [value('Gerilim', bus?.vKv, 'kV'), value('Gerilim', pu, 'pu'), value('Açı', bus?.angleDeg, '°')] };
    }
    if (group === 'transformer') {
      const transformer = item as ResultSet['transformers'][number] | undefined;
      return { equipment, values: [value('YG P', transformer?.hv.pMw, 'MW'), value('YG Q', transformer?.hv.qMvar, 'MVAr'), value('YG I', transformer?.hv.iA, 'A'),
        value('AG P', transformer?.lv.pMw, 'MW'), value('AG Q', transformer?.lv.qMvar, 'MVAr'), value('AG I', transformer?.lv.iA, 'A'),
        value('Yüklenme', transformer?.loadingPercent, '%'), value('P kaybı', transformer?.pLossMw, 'MW'), value('Q kaybı', transformer?.qLossMvar, 'MVAr'), value('Kademe', transformer?.tapPosition, '')] };
    }
    const line = item as ResultSet['branches'][number] | undefined;
    return { equipment, values: [value('İlk uç P', line?.from.pMw, 'MW'), value('İlk uç Q', line?.from.qMvar, 'MVAr'), value('İlk uç I', line?.from.iA, 'A'),
      value('Son uç P', line?.to.pMw, 'MW'), value('Son uç Q', line?.to.qMvar, 'MVAr'), value('Son uç I', line?.to.iA, 'A'),
      value('Yüklenme', line?.loadingPercent, '%'), value('P kaybı', line?.pLossMw, 'MW'), value('Q kaybı', line?.qLossMvar, 'MVAr')] };
  });
}

export function displayKindFromCategory(category: string): DisplayKind {
  return category === 'transformer' || category === 'line' || category === 'bus' || category === 'generator' ? category : 'system';
}

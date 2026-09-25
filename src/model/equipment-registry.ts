import type { DgsDocument, DgsRow, Equipment, EquipmentKind } from './types.ts';

export const CLASS_KIND: Record<string, EquipmentKind> = {
  ElmSite: 'substation', ElmSubstat: 'voltageLevel', ElmTerm: 'bus', StaCubic: 'terminal',
  ElmCoup: 'switch', StaSwitch: 'switch', ElmLne: 'line', ElmTr2: 'transformer',
  ElmSym: 'generator', ElmGenStat: 'generator', ElmLod: 'load', ElmShnt: 'shunt',
  ElmScap: 'seriesCompensator', ElmXnet: 'externalGrid', StaExtvmea: 'measurement',
  StaExtpmea: 'measurement', StaExtqmea: 'measurement', ElmDsl: 'control',
};
const terminalKeys = ['bus1', 'bus2', 'bushv', 'buslv', 'obj_id'];
const retainedKeys = ['FID', 'loc_name', 'typ_id', 'GPSlat', 'GPSlon', 'uknom', 'cQ_min', 'cQ_max', 'bus1', 'bus2', 'bushv', 'buslv', 'fold_id', 'obj_id', 'outserv'];
export class EquipmentRegistry {
  readonly byId = new Map<string, Equipment>();
  readonly duplicates: string[] = [];
  constructor(readonly document: DgsDocument) {
    for (const [cls, table] of Object.entries(document)) {
      if (!CLASS_KIND[cls] || !Array.isArray(table?.Attributes) || !Array.isArray(table?.Values)) continue;
      const keys = table.Attributes;
      const idIndex = keys.indexOf('FID'), nameIndex = keys.indexOf('loc_name');
      const sourceIndexes = retainedKeys.map(key => [key, keys.indexOf(key)] as const).filter(([, index]) => index >= 0);
      const relationIndexes = terminalKeys.map(key => keys.indexOf(key)).filter(index => index >= 0);
      for (const values of table.Values) {
        const id = String(values[idIndex] ?? '');
        if (!id) continue;
        if (this.byId.has(id)) this.duplicates.push(id);
        const row = Object.fromEntries(sourceIndexes.map(([key, index]) => [key, values[index]])) as DgsRow;
        this.byId.set(id, {
          id, name: String(values[nameIndex] ?? id), powerFactoryClass: cls, kind: CLASS_KIND[cls],
          terminals: relationIndexes.map(index => values[index]).filter(value => value != null && value !== '').map(String), source: row,
        });
      }
    }
  }
  get(id: string): Equipment | undefined { return this.byId.get(id); }
  kind(id: string): EquipmentKind | undefined { return this.get(id)?.kind; }
}

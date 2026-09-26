import type { ElectricalCanonicalNetwork } from '../model/electrical-types.ts';

export type DisplayKind = 'bus' | 'transformer' | 'line' | 'generator' | 'system';
export interface EquipmentDisplay {
  id: string;
  kind: DisplayKind;
  name: string;
  busName: string | null;
  stationId: string | null;
  station: string;
  fromStationName: string | null;
  toStationName: string | null;
  nominalKv: number | null;
  hvKv: number | null;
  lvKv: number | null;
  displayName: string;
  secondaryLabel: string;
}
export interface StationLookup {
  resolveSiteByClass?: (powerFactoryClass: string, id: string) => string | null;
  siteById?: (id: string) => { loc_name?: string } | null;
}

const kindClass: Record<DisplayKind, string> = {
  bus: 'ElmTerm', transformer: 'ElmTr2', line: 'ElmLne', generator: 'ElmSym', system: 'ElmXnet',
};
const key = (kind: DisplayKind, id: string): string => `${kind}|${id}`;
const finiteKv = (value: number | null | undefined): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;

export class EquipmentDisplayIndex {
  private readonly entries = new Map<string, EquipmentDisplay>();
  readonly buses: EquipmentDisplay[] = [];
  readonly transformers: EquipmentDisplay[] = [];
  readonly lines: EquipmentDisplay[] = [];

  constructor(electrical: ElectricalCanonicalNetwork, stations?: StationLookup) {
    const add = (kind: DisplayKind, id: string, name: string, kv: number | null, fallbackBus?: string | null,
      farBus?: string | null, lvKv?: number | null): void => {
      const resolved = stations?.resolveSiteByClass?.(kindClass[kind], id) ||
        (fallbackBus ? stations?.resolveSiteByClass?.('ElmTerm', fallbackBus) : null) || null;
      const station = resolved ? stations?.siteById?.(resolved)?.loc_name?.trim() || resolved : 'TM eşleşmedi';
      const farId = farBus ? stations?.resolveSiteByClass?.('ElmTerm', farBus) : null;
      const farStation = farId ? stations?.siteById?.(farId)?.loc_name?.trim() || farId : null;
      const nominalKv = finiteKv(kv), farKv = finiteKv(lvKv);
      const cleanName = name?.trim() || id;
      const item: EquipmentDisplay = { id, kind, name: cleanName, busName: kind === 'bus' ? cleanName : null,
        stationId: resolved, station, fromStationName: fallbackBus ? station : null, toStationName: farStation,
        nominalKv, hvKv: kind === 'transformer' ? nominalKv : null, lvKv: kind === 'transformer' ? farKv : null,
        displayName: (kind === 'bus' || kind === 'transformer') && resolved ? station : cleanName,
        secondaryLabel: kind === 'bus' ? `${cleanName} · ${nominalKv ?? '—'} kV` :
          kind === 'line' ? `${station} → ${farStation ?? 'TM eşleşmedi'} · ${nominalKv ?? '—'} kV` :
          kind === 'transformer' ? `${cleanName} · ${nominalKv ?? '—'}/${farKv ?? '—'} kV` : station };
      this.entries.set(key(kind, id), item);
      if (kind === 'bus') this.buses.push(item);
      else if (kind === 'transformer') this.transformers.push(item);
      else if (kind === 'line') this.lines.push(item);
    };
    for (const bus of electrical.buses) add('bus', bus.id, bus.name, bus.nominalKv);
    for (const transformer of electrical.transformers) add('transformer', transformer.id, transformer.name, transformer.vnHvKv, transformer.hvBus, transformer.lvBus, transformer.vnLvKv);
    for (const line of electrical.lines) add('line', line.id, line.name, line.nominalKv, line.fromBus, line.toBus);
    for (const generator of electrical.generators) add('generator', generator.id, generator.name, null, generator.bus);
    for (const grid of electrical.externalGrids) add('system', grid.id, grid.name, null, grid.bus);
    for (const group of [this.buses, this.transformers, this.lines]) group.sort(compareEquipmentDisplay);
  }

  get(kind: DisplayKind, id: string): EquipmentDisplay | undefined { return this.entries.get(key(kind, id)); }
  name(kind: DisplayKind, id: string, fallback?: string): string { return this.get(kind, id)?.name || fallback || id; }
}

const order: Record<DisplayKind, number> = { bus: 0, transformer: 1, line: 2, generator: 3, system: 4 };
export function compareEquipmentDisplay(a: EquipmentDisplay, b: EquipmentDisplay): number {
  return order[a.kind] - order[b.kind] || a.station.localeCompare(b.station, 'tr') ||
    (b.nominalKv ?? -1) - (a.nominalKv ?? -1) || a.name.localeCompare(b.name, 'tr') || a.id.localeCompare(b.id, 'tr');
}

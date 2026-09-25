export type DgsRow = Record<string, unknown>;
export type DgsTable = { Attributes: string[]; Values: unknown[][] };
export type DgsDocument = Record<string, DgsTable>;
export type EquipmentKind = 'substation' | 'voltageLevel' | 'bus' | 'terminal' | 'switch' | 'line' | 'transformer' | 'generator' | 'load' | 'shunt' | 'seriesCompensator' | 'externalGrid' | 'measurement' | 'control';
export type ElectricalScope = 'FULL' | 'TRANSMISSION_REDUCED';
export interface Equipment { id: string; name: string; powerFactoryClass: string; kind: EquipmentKind; terminals: string[]; source: DgsRow }
export interface CanonicalNetwork {
  modelId: string; modelHash: string; scope: ElectricalScope;
  substations: Equipment[]; voltageLevels: Equipment[]; buses: Equipment[]; terminals: Equipment[];
  switches: Equipment[]; lines: Equipment[]; transformers: Equipment[]; generators: Equipment[];
  loads: Equipment[]; shunts: Equipment[]; seriesCompensators: Equipment[]; externalGrids: Equipment[];
  measurements: Equipment[]; controls: Equipment[];
}

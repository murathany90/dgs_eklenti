import { EquipmentRegistry } from './equipment-registry.ts';
import type { CanonicalNetwork, DgsDocument, ElectricalScope, Equipment, EquipmentKind } from './types.ts';

const buckets: Record<EquipmentKind, keyof CanonicalNetwork> = {
  substation: 'substations', voltageLevel: 'voltageLevels', bus: 'buses', terminal: 'terminals',
  switch: 'switches', line: 'lines', transformer: 'transformers', generator: 'generators',
  load: 'loads', shunt: 'shunts', seriesCompensator: 'seriesCompensators', externalGrid: 'externalGrids',
  measurement: 'measurements', control: 'controls',
};
export function buildCanonicalNetwork(document: DgsDocument, modelId: string, modelHash: string, scope: ElectricalScope = 'FULL'): CanonicalNetwork {
  const network: CanonicalNetwork = {
    modelId, modelHash, scope, substations: [], voltageLevels: [], buses: [], terminals: [], switches: [],
    lines: [], transformers: [], generators: [], loads: [], shunts: [], seriesCompensators: [], externalGrids: [], measurements: [], controls: [],
  };
  const registry = new EquipmentRegistry(document);
  for (const equipment of registry.byId.values()) {
    (network[buckets[equipment.kind]] as Equipment[]).push(equipment);
  }
  return network;
}

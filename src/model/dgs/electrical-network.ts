import type { DgsDocument } from '../types.ts';
import type { ElectricalCanonicalNetwork } from '../electrical-types.ts';
import { DgsContext } from './context.ts';
import { mapBuses } from './bus-mapper.ts';
import { mapLines } from './line-mapper.ts';
import { mapTransformers } from './transformer-mapper.ts';
import { mapGenerators, mapExternalGrids } from './generator-mapper.ts';
import { mapLoads } from './load-mapper.ts';
import { mapShunts } from './shunt-mapper.ts';
import { mapSwitches, mapSeriesCompensators } from './topology-mapper.ts';
import { CAPABILITY_MATRIX, mapControls } from './controls-mapper.ts';

export function mapElectricalNetwork(document: DgsDocument, modelId: string, modelHash: string): ElectricalCanonicalNetwork {
  const ctx = new DgsContext(document);
  const buses = mapBuses(ctx);
  const busKv = new Map(buses.map(bus => [bus.id, bus.nominalKv]));
  const lines = mapLines(ctx, busKv), transformers = mapTransformers(ctx);
  const generators = mapGenerators(ctx), loads = mapLoads(ctx), shunts = mapShunts(ctx);
  const seriesCompensators = mapSeriesCompensators(ctx), externalGrids = mapExternalGrids(ctx), switches = mapSwitches(ctx);
  const controls = mapControls(generators, transformers, shunts);
  const incomplete = ctx.incompleteCount > 0;
  return { modelId, modelHash, scope: 'FULL', completeness: incomplete ? 'PARTIAL' : 'COMPLETE', buses, lines, transformers, generators, loads, shunts, seriesCompensators, externalGrids, switches, controls,
    findings: ctx.findings, findingCounts: ctx.findingCounts, capabilityMatrix: { ...CAPABILITY_MATRIX } };
}

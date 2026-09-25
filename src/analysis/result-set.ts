import type { ElectricalScope } from '../model/types.ts';
import type { Integrity } from '../validation/validation.ts';
import type { CalculationMetadata } from './calculation-key.ts';
import type { ResultAvailability } from './result-availability.ts';

export type Quality = 'MEASURED' | 'CALCULATED' | 'ESTIMATED' | 'FORECAST' | 'APPROXIMATE' | 'REFERENCE';
export interface ResultValue { id: string; value: number; quality: Quality; source: string; metric?: string; terminal?: string; unit?: string }
export interface ResultBase { id: string; quality: Quality; source: string }
export interface BusResult extends ResultBase { vPu: number | null; vKv: number | null; angleDeg: number | null }
export interface BranchEndResult { pMw: number | null; qMvar: number | null; sMva: number | null; iA: number | null }
export interface BranchResult extends ResultBase { kind: 'LINE' | 'SERIES_COMPENSATOR'; fromBus: string | null; toBus: string | null; from: BranchEndResult; to: BranchEndResult; loadingPercent: number | null; pLossMw: number | null; qLossMvar: number | null }
export interface TransformerResult extends ResultBase { hvBus: string | null; lvBus: string | null; hv: BranchEndResult; lv: BranchEndResult; loadingPercent: number | null; pLossMw: number | null; qLossMvar: number | null; tapPosition: number | null }
export interface GeneratorResult extends ResultBase { bus: string | null; powerFactoryClass?: 'ElmSym' | 'ElmGenStat'; pMw: number | null; qMvar: number | null; vPu: number | null; limitState: 'WITHIN' | 'AT_MIN' | 'AT_MAX' | 'UNKNOWN' }
export interface ExternalGridResult extends ResultBase { bus: string | null; pMw: number | null; qMvar: number | null }
export interface NetworkSummary {
  generationMw: number | null; generationMvar: number | null; loadMw: number | null; loadMvar: number | null;
  activeLossMw: number | null; reactiveLossMvar: number | null; busCount: number; lineCount: number; transformerCount: number;
  modelBusCount?: number; modelLineCount?: number; modelTransformerCount?: number;
  mappedBusCount?: number; mappedLineCount?: number; mappedTransformerCount?: number;
  solveMs: number | null; mode: 'AC' | 'DC';
}
export interface ACPreflightDiagnostics {
  modelCounts: { bus: number; line: number; transformer: number; generator: number };
  mappedCounts: { bus: number; line: number; transformer: number; generator: number };
  elementsNotMapped: number; notMappedByKind: Array<{ kind: string; model: number; mapped: number; notMapped: number }>;
  electricalIslandCount: number; islandsWithSlackCount: number; islandsWithoutSlackCount: number; unsuppliedBusCount: number; unsuppliedBusIds?: string[];
  inServiceBusCount: number; externalGridCount: number; generationMw: number; loadMw: number; initialPImbalanceMw: number;
  pvBusCount: number; pqBusCount: number; pvUnitCount: number; pvUnitsMissingQLimits: number; pvUnitsWithQLimits: number;
  pvUnitsInvalidVoltageSetpoint: number; minVmSetpointPu: number | null; maxVmSetpointPu: number | null;
  transformerTapOutsideDeclaredLimits: number; transformerTapDeviationAbsGreaterThan10: number;
  transformerPhaseAngleMissing: number; transformerWindingConnectionMissing: number;
  unsupportedOrUnsolvedControlCount: number; openSwitchCount: number; closedSwitchCount: number;
  stationControlCount?: number; stationControlsInService?: number; remoteVoltageControllerCount?: number;
  reactiveSharingRecordCount?: number; droopRecordCount?: number;
  transformerPhaseAngleCoverage?: { total: number; available: number };
  transformerWindingConnectionCoverage?: { total: number; available: number };
  zeroImpedanceCount: number; nonFiniteValueCount: number; negativeReactanceCount: number; verySmallReactanceCount: number;
  candidateNonPositiveCompensatedPathCount: number; candidatePathRule: string; unsupportedConversionCount: number;
}
export interface UnsupportedResult { kind: string; id: string; reason: string }
export interface ResultSet {
  schemaVersion: '2.0'; engine: string; engineVersion: string; modelId: string; modelHash: string; timestamp: string;
  topologyMode: 'NODE_BREAKER' | 'BUS_BRANCH'; electricalScope: ElectricalScope;
  convergence: 'CONVERGED' | 'PARTIAL' | 'NON_CONVERGED' | 'NOT_RUN'; iterations: number | null; maxMismatch: number | null;
  validation: Integrity; warnings: string[]; unsupported: UnsupportedResult[];
  buses: BusResult[]; branches: BranchResult[]; transformers: TransformerResult[]; generators: GeneratorResult[];
  externalGrids: ExternalGridResult[]; losses: Array<{ id: string; pMw: number | null; qMvar: number | null }>;
  summary: NetworkSummary; preflight?: ACPreflightDiagnostics;
  performance?: { conversionMs: number; solveMs: number; serializationMs?: number };
  resultAvailability: ResultAvailability;
  calculation?: CalculationMetadata;
}

export function toLegacyRows(set: ResultSet): Array<{ cls: string; id: string; metric: string; value: number; unit: string; terminal: string; quality: Quality; source: string; timestamp: string; orientation?: string }> {
  const rows: ReturnType<typeof toLegacyRows> = [];
  const push = (cls: string, id: string, metric: string, value: number | null, unit: string, terminal = '', orientation?: string): void => {
    if (value !== null && Number.isFinite(value)) rows.push({ cls, id, metric, value, unit, terminal, quality: 'CALCULATED', source: set.engine, timestamp: set.timestamp, orientation });
  };
  for (const bus of set.buses) { push('ElmTerm', bus.id, 'V', bus.vKv, 'kV'); push('ElmTerm', bus.id, 'angle', bus.angleDeg, '°'); }
  for (const branch of set.branches) {
    const cls = branch.kind === 'LINE' ? 'ElmLne' : 'ElmScap';
    for (const [terminal, end] of [['from', branch.from], ['to', branch.to]] as const) {
      push(cls, branch.id, 'P', end.pMw, 'MW', terminal, 'positive_into_element');
      push(cls, branch.id, 'Q', end.qMvar, 'MVAr', terminal, 'positive_into_element');
      push(cls, branch.id, 'I', end.iA, 'A', terminal, 'current_magnitude');
    }
    push(cls, branch.id, 'loading', branch.loadingPercent, '%');
  }
  for (const trafo of set.transformers) {
    push('ElmTr2', trafo.id, 'P', trafo.hv.pMw, 'MW', 'hv', 'positive_into_element');
    push('ElmTr2', trafo.id, 'Q', trafo.hv.qMvar, 'MVAr', 'hv', 'positive_into_element');
  }
  for (const generator of set.generators) push(generator.powerFactoryClass ?? 'ElmSym', generator.id, 'Q', generator.qMvar, 'MVAr');
  return rows;
}

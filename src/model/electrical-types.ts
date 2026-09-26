import type { ElectricalScope } from './types.ts';

export type Support = 'SUPPORTED' | 'PARTIAL' | 'UNSUPPORTED';
export type MappingSeverity = 'ERROR' | 'WARNING' | 'APPROXIMATION' | 'INFO';
export interface MappingFinding { severity: MappingSeverity; code: string; equipmentId?: string; message: string }
export interface SourceRefs { powerFactoryClass: string; fid: string; typeFid?: string; sectionFids?: string[]; controlledBusRaw?: string }
export interface ElectricalBase { id: string; name: string; sourceRefs: SourceRefs; inService: boolean }
export interface CanonicalBus extends ElectricalBase { nominalKv: number | null }
export interface LineSection { id: string; lengthKm: number | null; rOhmPerKm: number | null; xOhmPerKm: number | null; bSiemensPerKm: number | null; ratedCurrentKa: number | null }
export interface CanonicalLine extends ElectricalBase {
  fromBus: string | null; toBus: string | null; nominalKv: number | null; lengthKm: number | null;
  rOhm: number | null; xOhm: number | null; bSiemens: number | null; ratedCurrentKa: number | null;
  thermalLimits: { nominalKa: number | null; summerMva?: number | null; winterMva?: number | null };
  sections: LineSection[];
}
export interface CanonicalTransformer extends ElectricalBase {
  hvBus: string | null; lvBus: string | null; snMva: number | null; vnHvKv: number | null; vnLvKv: number | null;
  vkPercent: number | null; vkrPercent: number | null; pfeKw: number | null; i0Percent: number | null;
  tapPosition: number | null; tapNeutral: number | null; tapMin: number | null; tapMax: number | null;
  tapStepPercent: number | null; tapSide: 'hv' | 'lv' | null; phaseShiftDeg: number | null; oltc: boolean | null;
  hvWindingConnection: string | null; lvWindingConnection: string | null; vectorGroup: string | null;
}
export interface CanonicalGenerator extends ElectricalBase {
  bus: string | null; pMw: number | null; qMvar: number | null; vmPu: number | null;
  pMinMw: number | null; pMaxMw: number | null; qMinMvar: number | null; qMaxMvar: number | null;
  controlMode: 'PV' | 'PQ' | 'UNKNOWN'; remoteControlBus: string | null;
  participationFactor: number | null; droop: number | null; qLimitSource: string | null; parallelUnits: number;
  referenceMachine: boolean | null;
}
export interface CanonicalLoad extends ElectricalBase { bus: string | null; pMw: number | null; qMvar: number | null }
export interface CanonicalShunt extends ElectricalBase {
  bus: string | null; nominalKv: number | null; qMvarPerStep: number | null; totalQAtCurrentStepMvar: number | null;
  tapTableQmvar: number[]; tapTableLossDataAvailable: boolean; steps: number | null; currentStep: number | null;
  usesTapTable: boolean | null; shuntType: 'REACTOR' | 'CAPACITOR' | 'UNKNOWN';
}
export interface CanonicalSeriesCompensator extends ElectricalBase { fromBus: string | null; toBus: string | null; nominalKv: number | null; susceptanceSiemens: number | null; xOhm: number | null }
export interface CanonicalExternalGrid extends ElectricalBase { bus: string | null; vmPu: number | null; angleDeg: number | null; pMinMw: number | null; pMaxMw: number | null; qMinMvar: number | null; qMaxMvar: number | null }
export interface CanonicalInternationalConnection extends ElectricalBase {
  bus: string | null; nominalKv: number | null; voltageSetpointPu: number | null;
  r1Ohm: number | null; x1Ohm: number | null; r2Ohm: number | null; x2Ohm: number | null; r0Ohm: number | null; x0Ohm: number | null;
  sourceType: number | null; pLoadMw: number | null; qLoadMvar: number | null;
  /** DGS Pload/Qload represented as a fixed-PQ load; ElmVac electrical-source behavior is not reproduced. */
  mappingMode: 'FIXED_PQ_LOAD_APPROXIMATION' | 'SOURCE_ONLY';
}
export interface CanonicalBoundaryCubicle { reference: string; bus: string | null; orientation: number | null }
export interface CanonicalBoundary extends ElectricalBase {
  cubicles: CanonicalBoundaryCubicle[]; interchangeEnabled: boolean | null; targetActivePowerMw: number | null;
}
export interface CanonicalSecondaryController extends ElectricalBase {
  referenceBus: string | null; measuredBoundaryId: string | null; measuredBoundaryRaw: string | null;
  targetActivePowerMw: number | null; frequencyBias: number | null; distributionModeCode: number | null;
  participantIds: string[]; controlledGeneratorIds: string[]; balancingSupport: 'SOURCE_ONLY';
}
export interface CanonicalSwitch extends ElectricalBase { fromBus: string | null; toBus: string | null; closed: boolean; usage: string | null }
export interface CanonicalControl {
  id: string; kind: 'VOLTAGE' | 'TAP' | 'SHUNT' | 'STATION'; targetId: string;
  sourceRefs?: SourceRefs; inService?: boolean; controlledBus?: string | null;
  controlledGeneratorIds?: string[]; controlledGeneratorShares?: number[]; controlledShuntIds?: string[]; setpoint: number | null;
  mode: string | null; controlModeCode?: number | null; reactiveSharingModeCode?: number | null;
  selectedBusModeCode?: number | null; droopEnabled?: boolean | null; droopRatedMvar?: number | null;
  droopPercent?: number | null; droopRawValue?: number | null; droopRatedRaw?: number | null;
  controllerMode?: 'VOLTAGE' | 'REACTIVE_POWER' | 'POWER_FACTOR' | 'TAN_PHI' | 'UNKNOWN';
  mappingStatus?: 'SOLVED' | 'APPROXIMATE' | 'MAPPED_BUT_NOT_SOLVED' | 'SOURCE_ONLY';
  distributionMode?: 'SINGLE_UNIT' | 'SOURCE_CVQQ' | 'ACTIVE_POWER_WEIGHTED_APPROXIMATION' | 'UNRESOLVED';
  support: Support;
}
export interface CanonicalLoadFlowSettings {
  sourceRefs: SourceRefs;
  enforceReactiveLimits: boolean | null; maxNewtonIterations: number | null; maxOuterIterations: number | null;
  nodalToleranceRaw: number | null; modelEquationToleranceRaw: number | null;
  activePowerBalancingModeCode: number | null; activePowerBalancingMode: 'UNKNOWN';
  rawValues: Record<'iopt_lim' | 'itrlx' | 'ictrlx' | 'errlf' | 'erreq' | 'iPbalancing' | 'iopt_chctr' | 'iShowOutLoopMsg' | 'iopt_initOPF' | 'iItAlgStag' | 'iInterChg' | 'iInterType', number | null>;
}
export interface ModelCoverage { available: number; total: number; percent: number | null; status: Support; note?: string }
export interface ElectricalCanonicalNetwork {
  modelId: string; modelHash: string; scope: ElectricalScope; completeness: 'COMPLETE' | 'PARTIAL' | 'REDUCED';
  buses: CanonicalBus[]; lines: CanonicalLine[]; transformers: CanonicalTransformer[];
  generators: CanonicalGenerator[]; loads: CanonicalLoad[]; shunts: CanonicalShunt[];
  seriesCompensators: CanonicalSeriesCompensator[]; externalGrids: CanonicalExternalGrid[];
  switches: CanonicalSwitch[]; controls: CanonicalControl[]; internationalConnections: CanonicalInternationalConnection[];
  secondaryControllers: CanonicalSecondaryController[]; boundaries: CanonicalBoundary[]; loadFlowSettings: CanonicalLoadFlowSettings;
  findings: MappingFinding[]; findingCounts: Record<string, number>;
  engineCapabilities: Record<string, Support>; modelCoverage: Record<string, ModelCoverage>;
}

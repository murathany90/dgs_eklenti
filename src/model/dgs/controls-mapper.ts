import type { CanonicalControl, CanonicalGenerator, CanonicalShunt, CanonicalTransformer, Support } from '../electrical-types.ts';

export const CAPABILITY_MATRIX: Record<string, Support> = {
  slackBus: 'SUPPORTED', multipleExternalGrids: 'PARTIAL', pvPqBuses: 'SUPPORTED', generatorVoltageSetpoint: 'SUPPORTED',
  qLimitsPvToPq: 'SUPPORTED', pLimits: 'PARTIAL', parallelGeneratorReactiveSharing: 'PARTIAL',
  remoteVoltageControl: 'UNSUPPORTED', reactiveParticipation: 'UNSUPPORTED', droop: 'UNSUPPORTED',
  transformerStaticTap: 'SUPPORTED', transformerOltcAutomatic: 'UNSUPPORTED', switchedShuntStaticStep: 'SUPPORTED',
  seriesCompensation: 'PARTIAL', transformerPhaseShift: 'PARTIAL',
};
export function mapControls(generators: CanonicalGenerator[], transformers: CanonicalTransformer[], shunts: CanonicalShunt[]): CanonicalControl[] {
  const controls: CanonicalControl[] = [];
  for (const gen of generators) if (gen.controlMode === 'PV') controls.push({ id: `voltage:${gen.id}`, kind: 'VOLTAGE', targetId: gen.id, setpoint: gen.vmPu, mode: 'constv', support: 'SUPPORTED' });
  for (const trafo of transformers) if (trafo.tapPosition !== null) controls.push({ id: `tap:${trafo.id}`, kind: 'TAP', targetId: trafo.id, setpoint: trafo.tapPosition, mode: trafo.oltc ? 'oltc' : 'static', support: trafo.oltc ? 'PARTIAL' : 'SUPPORTED' });
  for (const shunt of shunts) if (shunt.currentStep !== null) controls.push({ id: `shunt:${shunt.id}`, kind: 'SHUNT', targetId: shunt.id, setpoint: shunt.currentStep, mode: 'static-step', support: 'SUPPORTED' });
  return controls;
}

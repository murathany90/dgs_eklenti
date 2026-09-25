import type { CanonicalControl, CanonicalGenerator, CanonicalShunt, CanonicalTransformer, Support } from '../electrical-types.ts';
import { DgsContext, inService, numeric, reference } from './context.ts';

export const ENGINE_CAPABILITIES: Record<string, Support> = {
  slackBus: 'SUPPORTED', multipleExternalGrids: 'PARTIAL', pvPqBuses: 'SUPPORTED', generatorVoltageSetpoint: 'SUPPORTED',
  qLimitsPvToPq: 'SUPPORTED', pLimits: 'PARTIAL', parallelGeneratorReactiveSharing: 'PARTIAL',
  remoteVoltageControl: 'UNSUPPORTED', reactiveParticipation: 'UNSUPPORTED', droop: 'UNSUPPORTED',
  transformerStaticTap: 'SUPPORTED', transformerOltcAutomatic: 'UNSUPPORTED', switchedShuntStaticStep: 'SUPPORTED',
  seriesCompensation: 'PARTIAL', transformerPhaseShift: 'SUPPORTED',
};
export function mapControls(ctx: DgsContext, generators: CanonicalGenerator[], transformers: CanonicalTransformer[], shunts: CanonicalShunt[]): CanonicalControl[] {
  const controls: CanonicalControl[] = [];
  for (const gen of generators) if (gen.controlMode === 'PV') controls.push({ id: `voltage:${gen.id}`, kind: 'VOLTAGE', targetId: gen.id, setpoint: gen.vmPu, mode: 'constv', support: 'SUPPORTED', mappingStatus: 'SOLVED' });
  for (const trafo of transformers) if (trafo.tapPosition !== null) controls.push({ id: `tap:${trafo.id}`, kind: 'TAP', targetId: trafo.id, setpoint: trafo.tapPosition, mode: trafo.oltc ? 'oltc' : 'static', support: trafo.oltc ? 'PARTIAL' : 'SUPPORTED', mappingStatus: trafo.oltc ? 'MAPPED_BUT_NOT_SOLVED' : 'SOLVED' });
  for (const shunt of shunts) if (shunt.currentStep !== null) controls.push({ id: `shunt:${shunt.id}`, kind: 'SHUNT', targetId: shunt.id, setpoint: shunt.currentStep, mode: 'static-step', support: 'SUPPORTED', mappingStatus: 'SOLVED' });

  for (const row of ctx.rows('ElmStactrl')) {
    const id = reference(row.FID); if (!id) continue;
    const controlledBusRef = reference(row.rembar);
    const controlledBus = controlledBusRef ? ctx.busFromCubic(controlledBusRef) : null;
    if (controlledBusRef && !controlledBus) ctx.finding('UNRESOLVED_STATION_CONTROL_BUS', 'WARNING', id, 'Kontrol edilen bara kaynağı çözümlenemedi; ham referans korunuyor');
    const count = numeric(row['psym:SIZEROW']);
    const controlledGeneratorIds = Object.keys(row).filter(key => /^psym:\d+$/.test(key)).sort((a, b) => Number(a.slice(5)) - Number(b.slice(5)))
      .filter(key => count === null || Number(key.slice(5)) < count)
      .map(key => reference(row[key])).filter((value): value is string => Boolean(value));
    const mappedGenerators = new Set(generators.map(generator => generator.id));
    const unresolved = controlledGeneratorIds.filter(generatorId => !mappedGenerators.has(generatorId));
    if (unresolved.length) ctx.finding('UNRESOLVED_STATION_CONTROL_GENERATOR', 'WARNING', id, `${unresolved.length} kontrol edilen üretim referansı eşlenmiş üretimde bulunamadı`);
    const droopEnabled = numeric(row.i_droop) === null ? null : numeric(row.i_droop) !== 0;
    const droopPercent = numeric(row.ddroop);
    controls.push({
      id: `station:${id}`, kind: 'STATION', targetId: id,
      sourceRefs: { powerFactoryClass: 'ElmStactrl', fid: id }, inService: inService(row.outserv),
      controlledBus: controlledBus ?? controlledBusRef, controlledGeneratorIds, controlledShuntIds: [],
      setpoint: numeric(row.usetp), mode: 'kaynak-kodlu',
      controlModeCode: numeric(row.i_ctrl), reactiveSharingModeCode: numeric(row.imode), selectedBusModeCode: numeric(row.selBus),
      droopEnabled, droopRatedMvar: numeric(row.Srated), droopPercent,
      mappingStatus: 'MAPPED_BUT_NOT_SOLVED', support: 'UNSUPPORTED',
    });
    ctx.finding('STATION_CONTROL_MAPPED_NOT_SOLVED', 'APPROXIMATION', id, 'İstasyon kontrol kaynağı korundu; uzak kontrol, reaktif paylaşım ve droop çözücü tarafından uygulanmıyor');
  }
  return controls;
}

export function modelCoverage(generators: CanonicalGenerator[], transformers: CanonicalTransformer[], controls: CanonicalControl[]) {
  const coverage = (available: number, total: number, note?: string) => ({
    available, total, percent: total ? available / total * 100 : null,
    status: total === 0 || available === 0 ? 'UNSUPPORTED' as const : available === total ? 'SUPPORTED' as const : 'PARTIAL' as const,
    ...(note ? { note } : {}),
  });
  const pv = generators.filter(item => item.inService && item.controlMode === 'PV');
  const staticGenerator = generators.filter(item => item.sourceRefs.powerFactoryClass === 'ElmGenStat');
  const station = controls.filter(item => item.kind === 'STATION');
  return {
    pvGeneratorQLimits: coverage(pv.filter(item => item.qMinMvar !== null && item.qMaxMvar !== null).length, pv.length, 'Her iki sınır da sayısal olmalıdır'),
    elmGenStatQLimits: coverage(staticGenerator.filter(item => item.qMinMvar !== null && item.qMaxMvar !== null).length, staticGenerator.length, 'OPF seçenek kodları reaktif güç sınırı olarak yorumlanmadı'),
    stationControls: coverage(station.length, station.length, 'Kaynak kaydı eşlendi; kontrol eylemi çözülmüyor'),
    stationControlBus: coverage(station.filter(item => item.controlledBus !== null).length, station.length),
    stationControlGenerators: coverage(station.filter(item => (item.controlledGeneratorIds?.length ?? 0) > 0).length, station.length),
    transformerPhaseAngle: coverage(transformers.filter(item => item.phaseShiftDeg !== null).length, transformers.length, 'DGS açı/clock verisi yoksa vektör bağlantısından açı türetilmez'),
    transformerWindingConnection: coverage(transformers.filter(item => item.hvWindingConnection !== null && item.lvWindingConnection !== null).length, transformers.length),
  };
}

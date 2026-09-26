import type { CanonicalControl, CanonicalGenerator, CanonicalShunt, CanonicalTransformer, Support } from '../electrical-types.ts';
import { DgsContext, inService, numeric, reference } from './context.ts';

export const ENGINE_CAPABILITIES: Record<string, Support> = {
  slackBus: 'SUPPORTED', multipleExternalGrids: 'PARTIAL', pvPqBuses: 'SUPPORTED', generatorVoltageSetpoint: 'SUPPORTED',
  qLimitsPvToPq: 'SUPPORTED', pLimits: 'PARTIAL', parallelGeneratorReactiveSharing: 'PARTIAL',
  remoteVoltageControl: 'PARTIAL', reactiveParticipation: 'PARTIAL', droop: 'UNSUPPORTED',
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
    const selectedBusCode = numeric(row.selBus);
    const controlledBusRef = reference(row.rembar);
    const controlledBus = selectedBusCode === 0 && controlledBusRef ? ctx.busFromCubic(controlledBusRef) : null;
    if (controlledBusRef && !controlledBus) ctx.finding('UNRESOLVED_STATION_CONTROL_BUS', 'WARNING', id, 'Kontrol edilen bara kaynağı çözümlenemedi; ham referans korunuyor');
    const count = numeric(row['psym:SIZEROW']);
    const memberSlots = Object.keys(row).filter(key => /^psym:\d+$/.test(key)).sort((a, b) => Number(a.slice(5)) - Number(b.slice(5)))
      .filter(key => count === null || Number(key.slice(5)) < count);
    const memberIds = memberSlots.map(key => reference(row[key]));
    const controlledGeneratorIds = memberIds.filter((value): value is string => Boolean(value));
    const mappedGenerators = new Set(generators.map(generator => generator.id));
    const unresolved = controlledGeneratorIds.filter(generatorId => !mappedGenerators.has(generatorId));
    if (unresolved.length) ctx.finding('UNRESOLVED_STATION_CONTROL_GENERATOR', 'WARNING', id, `${unresolved.length} kontrol edilen üretim referansı eşlenmiş üretimde bulunamadı`);
    const shareSlots = memberSlots.map((slot, index) => ({
      generatorId: memberIds[index],
      share: numeric(row[`cvqq:${slot.slice(5)}`]),
    }));
    const allSourceShares = shareSlots.length > 0 && shareSlots.every(item => Boolean(item.generatorId) && item.share !== null && item.share > 0);
    const controlledGeneratorShares = allSourceShares ? shareSlots.map(item => item.share! / 100) : undefined;
    const membershipComplete = memberSlots.length > 0 && controlledGeneratorIds.length === memberSlots.length;
    const controlModeCode = numeric(row.i_ctrl);
    const controllerMode = controlModeCode === 0 ? 'VOLTAGE' : controlModeCode === 1 ? 'REACTIVE_POWER'
      : controlModeCode === 2 ? 'POWER_FACTOR' : controlModeCode === 3 ? 'TAN_PHI' : 'UNKNOWN';
    const droopCode = numeric(row.i_droop);
    const droopEnabled = droopCode === 0 ? false : droopCode === 1 ? true : null;
    const reactiveSharingModeCode = numeric(row.imode);
    const candidates = generators.filter(generator => controlledGeneratorIds.includes(generator.id));
    const limitsAvailable = candidates.length === controlledGeneratorIds.length && candidates.every(generator => generator.inService
      && generator.referenceMachine !== true && generator.qMinMvar !== null && generator.qMaxMvar !== null && generator.qMinMvar <= generator.qMaxMvar);
    const sharesAvailable = controlledGeneratorIds.length === 1 || (reactiveSharingModeCode !== null && reactiveSharingModeCode <= 2 && allSourceShares);
    const eligibleForOuterLoop = inService(row.outserv) && controllerMode === 'VOLTAGE' && selectedBusCode === 0
      && controlledBus !== null && numeric(row.usetp) !== null && controlledGeneratorIds.length > 0
      && membershipComplete && droopEnabled === false && limitsAvailable && sharesAvailable;
    if (controllerMode === 'UNKNOWN') ctx.finding('STATION_CONTROL_MODE_UNKNOWN', 'WARNING', id, `ElmStactrl.i_ctrl=${String(row.i_ctrl ?? '')} çözümlenmedi`);
    if (selectedBusCode !== null && selectedBusCode !== 0) ctx.finding('STATION_CONTROL_BUS_MODE_UNSUPPORTED', 'WARNING', id, `ElmStactrl.selBus=${selectedBusCode}; yalnız doğrulanmış selBus=0/rembar eşlemesi kullanılır`);
    if (controlledGeneratorIds.length > 1 && !allSourceShares) ctx.finding('REACTIVE_SHARING_DATA_INCOMPLETE', 'WARNING', id, 'Birden fazla kontrollü üretim var fakat kaynak cvqq katılım payı dışa aktarılmamış; eşit paylaşım yapılmadı');
    if (droopEnabled === true) ctx.finding('DROOP_MAPPING_UNRESOLVED', 'WARNING', id, 'Droop bayrağı ve alanları korundu; işaret, taban ve ölü bant bu DGS için doğrulanmadı');
    controls.push({
      id: `station:${id}`, kind: 'STATION', targetId: id,
      sourceRefs: { powerFactoryClass: 'ElmStactrl', fid: id, ...(controlledBusRef ? { controlledBusRaw: controlledBusRef } : {}) }, inService: inService(row.outserv),
      controlledBus, controlledGeneratorIds, controlledShuntIds: [],
      ...(controlledGeneratorShares ? { controlledGeneratorShares } : {}),
      setpoint: numeric(row.usetp), mode: `ElmStactrl.i_ctrl=${String(row.i_ctrl ?? 'UNKNOWN')}`, controllerMode,
      controlModeCode, reactiveSharingModeCode, selectedBusModeCode: selectedBusCode,
      droopEnabled, droopPercent: null, droopRatedMvar: null, droopRawValue: numeric(row.ddroop), droopRatedRaw: numeric(row.Srated),
      mappingStatus: eligibleForOuterLoop ? 'SOLVED' : 'MAPPED_BUT_NOT_SOLVED', support: eligibleForOuterLoop ? 'SUPPORTED' : 'PARTIAL',
    });
    if (!eligibleForOuterLoop) ctx.finding('STATION_CONTROL_MAPPED_NOT_SOLVED', 'APPROXIMATION', id, 'Kontrol kaynağı korundu; eksik veya belirsiz alanlar çözücü eylemi dışında bırakıldı');
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
    stationControls: coverage(station.filter(item => item.mappingStatus === 'SOLVED').length, station.length, 'Yalnız kaynak anlamı ve sınır/paylaşım koşulları çözülen kontroller uygulanır'),
    stationControlBus: coverage(station.filter(item => item.controlledBus !== null).length, station.length),
    stationControlGenerators: coverage(station.filter(item => (item.controlledGeneratorIds?.length ?? 0) > 0).length, station.length),
    transformerPhaseAngle: coverage(transformers.filter(item => item.phaseShiftDeg !== null).length, transformers.length, 'DGS açı/clock verisi yoksa vektör bağlantısından açı türetilmez'),
    transformerWindingConnection: coverage(transformers.filter(item => item.hvWindingConnection !== null && item.lvWindingConnection !== null).length, transformers.length),
  };
}

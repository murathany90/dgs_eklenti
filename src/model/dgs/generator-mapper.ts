import type { CanonicalExternalGrid, CanonicalGenerator } from '../electrical-types.ts';
import { DgsContext, inService, numeric, reference } from './context.ts';

export function mapGenerators(ctx: DgsContext): CanonicalGenerator[] {
  const result: CanonicalGenerator[] = [];
  for (const cls of ['ElmSym', 'ElmGenStat']) for (const row of ctx.rows(cls)) {
    const id = reference(row.FID); if (!id) continue;
    const bus = ctx.busFromCubic(row.bus1);
    const type = cls === 'ElmSym' ? ctx.get('TypSym', row.typ_id) : null;
    const qMinMvar = numeric(row.cQ_min) ?? numeric(type?.Q_min);
    const qMaxMvar = numeric(row.cQ_max) ?? numeric(type?.Q_max);
    if (cls === 'ElmSym' && numeric(row.cQ_min) === null && qMinMvar !== null) ctx.finding('GENERATOR_TYPE_Q_LIMIT', 'INFO', id, 'ElmSym Q alt sınırı TypSym.Q_min tür alanından alındı');
    if (cls === 'ElmSym' && numeric(row.cQ_max) === null && qMaxMvar !== null) ctx.finding('GENERATOR_TYPE_Q_LIMIT', 'INFO', id, 'ElmSym Q üst sınırı TypSym.Q_max tür alanından alındı');
    const mode = String(row.av_mode ?? '').toLowerCase();
    const controlMode = mode === 'constv' ? 'PV' : mode === 'constq' ? 'PQ' : 'UNKNOWN';
    if (!bus) ctx.finding('MISSING_GENERATOR_BUS', 'ERROR', id, `${cls}.bus1 çözümlenemedi`);
    if (numeric(row.pgini) === null) ctx.finding('MISSING_GENERATOR_P', 'ERROR', id, `${cls}.pgini eksik`);
    if (controlMode === 'PV' && numeric(row.usetp) === null) ctx.finding('MISSING_GENERATOR_SETPOINT', 'ERROR', id, 'PV gerilim ayarı eksik');
    if (controlMode === 'PV' && (qMinMvar === null || qMaxMvar === null)) ctx.finding('MISSING_GENERATOR_Q_LIMITS', 'WARNING', id, 'PV Q sınırları eksik');
    if (controlMode === 'PQ' && numeric(row.qgini) === null) ctx.finding('MISSING_GENERATOR_Q', 'ERROR', id, 'PQ reaktif güç girdisi eksik');
    if (numeric(row.ip_ctrl) && numeric(row.ip_ctrl) !== 0) ctx.finding('REMOTE_VOLTAGE_CONTROL_UNRESOLVED', 'APPROXIMATION', id, 'Uzak kontrol barası referansı çözülmedi');
    result.push({ id, name: String(row.loc_name ?? id), sourceRefs: { powerFactoryClass: cls, fid: id, typeFid: reference(row.typ_id) ?? undefined }, inService: inService(row.outserv), bus,
      pMw: numeric(row.pgini), qMvar: numeric(row.qgini), vmPu: numeric(row.usetp), pMinMw: numeric(row.Pmin_uc), pMaxMw: numeric(row.Pmax_uc),
      qMinMvar, qMaxMvar, controlMode, remoteControlBus: null, participationFactor: null, droop: null });
  }
  return result;
}

export function mapExternalGrids(ctx: DgsContext): CanonicalExternalGrid[] {
  const result: CanonicalExternalGrid[] = [];
  for (const row of ctx.rows('ElmXnet')) {
    const id = reference(row.FID); if (!id) continue;
    const bus = ctx.busFromCubic(row.bus1);
    if (!bus) ctx.finding('MISSING_SLACK_BUS', 'ERROR', id, 'ElmXnet.bus1 çözümlenemedi');
    const angleDeg = numeric(row.va_degree ?? row.angleDeg);
    if (angleDeg === null) ctx.finding('SLACK_ANGLE_REFERENCE', 'INFO', id, 'Açı DGS içinde yok; solver referans açısını 0° seçer');
    result.push({ id, name: String(row.loc_name ?? id), sourceRefs: { powerFactoryClass: 'ElmXnet', fid: id }, inService: inService(row.outserv),
      bus, vmPu: numeric(row.usetp), angleDeg, pMinMw: numeric(row.Pmin_uc), pMaxMw: numeric(row.Pmax_uc), qMinMvar: numeric(row.cQ_min), qMaxMvar: numeric(row.cQ_max) });
  }
  if (result.filter(grid => grid.inService).length > 1) ctx.finding('MULTIPLE_SLACK_PARTICIPATION_UNKNOWN', 'APPROXIMATION', undefined, 'Çoklu dış şebeke güç paylaşımı DGS içinde belirlenmedi');
  return result;
}

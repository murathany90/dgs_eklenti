import type { CanonicalExternalGrid, CanonicalGenerator } from '../electrical-types.ts';
import { DgsContext, inService, numeric, reference } from './context.ts';

export function mapGenerators(ctx: DgsContext): CanonicalGenerator[] {
  const result: CanonicalGenerator[] = [];
  for (const cls of ['ElmSym', 'ElmGenStat']) for (const row of ctx.rows(cls)) {
    const id = reference(row.FID); if (!id) continue;
    const bus = ctx.busFromCubic(row.bus1);
    const type = cls === 'ElmSym' ? ctx.get('TypSym', row.typ_id) : null;
    const rowQMin = numeric(row.cQ_min), rowQMax = numeric(row.cQ_max);
    const typeQMin = cls === 'ElmSym' ? numeric(type?.Q_min) : null;
    const typeQMax = cls === 'ElmSym' ? numeric(type?.Q_max) : null;
    const qMinMvar = rowQMin ?? typeQMin, qMaxMvar = rowQMax ?? typeQMax;
    const qLimitSource = rowQMin !== null && rowQMax !== null ? `${cls}.cQ_min/cQ_max`
      : typeQMin !== null && typeQMax !== null ? 'TypSym.Q_min/Q_max' : null;
    if (cls === 'ElmSym' && rowQMin === null && typeQMin !== null) ctx.finding('GENERATOR_TYPE_Q_LIMIT', 'INFO', id, 'Alt Q sınırı TipSenkrMak.Q_min alanından alındı');
    if (cls === 'ElmSym' && rowQMax === null && typeQMax !== null) ctx.finding('GENERATOR_TYPE_Q_LIMIT', 'INFO', id, 'Üst Q sınırı TipSenkrMak.Q_max alanından alındı');
    if (cls === 'ElmGenStat' && (qMinMvar === null || qMaxMvar === null)) {
      // iOPFCQmin/iOPFCQmax are option fields in this export; they do not carry Mvar limits.
      ctx.finding('STATIC_GENERATOR_Q_LIMITS_UNAVAILABLE', 'WARNING', id, 'Üretim ekipmanı Q sınırı bulunmuyor; iOPFCQmin/iOPFCQmax seçenek alanları Mvar sınırı olarak yorumlanmadı');
    }
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
      qMinMvar, qMaxMvar, controlMode, remoteControlBus: null, participationFactor: null, droop: null, qLimitSource });
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

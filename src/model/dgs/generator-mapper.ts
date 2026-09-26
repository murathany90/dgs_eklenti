import type { CanonicalExternalGrid, CanonicalGenerator } from '../electrical-types.ts';
import { DgsContext, inService, numeric, reference } from './context.ts';

function qCapabilityAtPower(ctx: DgsContext, ref: unknown, pMw: number): { min: number; max: number } | null {
  const curve = ctx.get('IntQlim', ref);
  if (!curve) return null;
  const count = numeric(curve['cap_P:SIZEROW']);
  if (count === null || !Number.isInteger(count) || count < 2) return null;
  const points = Array.from({ length: count }, (_, index) => ({
    p: numeric(curve[`cap_P:${index}`]), min: numeric(curve[`cap_Qmn:${index}`]), max: numeric(curve[`cap_Qmx:${index}`]),
  }));
  if (points.some(point => point.p === null || point.min === null || point.max === null)) return null;
  const valid = points as Array<{ p: number; min: number; max: number }>;
  if (valid.some((point, index) => index > 0 && point.p <= valid[index - 1]!.p)) return null;
  if (pMw < valid[0]!.p || pMw > valid.at(-1)!.p) return null;
  const upper = valid.findIndex(point => point.p >= pMw);
  if (upper <= 0) return { min: valid[0]!.min, max: valid[0]!.max };
  const low = valid[upper - 1]!, high = valid[upper]!;
  const fraction = (pMw - low.p) / (high.p - low.p);
  return { min: low.min + (high.min - low.min) * fraction, max: low.max + (high.max - low.max) * fraction };
}

export function mapGenerators(ctx: DgsContext): CanonicalGenerator[] {
  const result: CanonicalGenerator[] = [];
  for (const cls of ['ElmSym', 'ElmGenStat']) for (const row of ctx.rows(cls)) {
    const id = reference(row.FID); if (!id) continue;
    const bus = ctx.busFromCubic(row.bus1);
    const type = cls === 'ElmSym' ? ctx.get('TypSym', row.typ_id) : null;
    const parallelUnits = numeric(row.ngnum);
    const units = parallelUnits !== null && Number.isInteger(parallelUnits) && parallelUnits > 0 ? parallelUnits : 1;
    const pMw = numeric(row.pgini) === null ? null : numeric(row.pgini)! * units;
    const qMvar = numeric(row.qgini) === null ? null : numeric(row.qgini)! * units;
    const iqtype = numeric(row.iqtype);
    const useTypeLimits = cls === 'ElmSym' && iqtype === 1;
    const directQMin = numeric(row.cQ_min), directQMax = numeric(row.cQ_max);
    const typeQMin = useTypeLimits ? numeric(type?.Q_min) : null;
    const typeQMax = useTypeLimits ? numeric(type?.Q_max) : null;
    if (useTypeLimits && directQMin === null && typeQMin !== null) ctx.finding('GENERATOR_TYPE_Q_LIMIT', 'INFO', id, 'Alt Q sınırı iqtype=1 kaynağıyla TypSym.Q_min alanından alındı');
    if (useTypeLimits && directQMax === null && typeQMax !== null) ctx.finding('GENERATOR_TYPE_Q_LIMIT', 'INFO', id, 'Üst Q sınırı iqtype=1 kaynağıyla TypSym.Q_max alanından alındı');
    const curve = qCapabilityAtPower(ctx, row.pQlimType, pMw ?? 0);
    let qMinMvar = useTypeLimits ? typeQMin : directQMin;
    let qMaxMvar = useTypeLimits ? typeQMax : directQMax;
    let qLimitSource = useTypeLimits && typeQMin !== null && typeQMax !== null ? 'TypSym.Q_min/Q_max'
      : directQMin !== null && directQMax !== null ? `${cls}.cQ_min/cQ_max` : null;
    if ((qMinMvar === null || qMaxMvar === null) && curve) {
      qMinMvar = curve.min; qMaxMvar = curve.max; qLimitSource = 'IntQlim.cap_Qmn/cap_Qmx@pgini';
    }
    if (cls === 'ElmGenStat' && (qMinMvar === null || qMaxMvar === null)) {
      ctx.finding('STATIC_GENERATOR_Q_LIMITS_UNAVAILABLE', 'WARNING', id, 'Q sınırı bulunmuyor; iOPFCQmin/iOPFCQmax alanları seçenek kodu olarak korunur');
    }
    const mode = String(row.av_mode ?? '').toLowerCase();
    let controlMode: 'PV' | 'PQ' | 'UNKNOWN' = mode === 'constv' && qMinMvar !== null && qMaxMvar !== null ? 'PV'
      : mode === 'constq' && qMvar !== null ? 'PQ' : 'UNKNOWN';
    if (!bus) ctx.finding('MISSING_GENERATOR_BUS', 'ERROR', id, `${cls}.bus1 çözümlenemedi`);
    if (pMw === null) ctx.finding('MISSING_GENERATOR_P', 'ERROR', id, `${cls}.pgini eksik`);
    if (controlMode === 'PV' && numeric(row.usetp) === null) ctx.finding('MISSING_GENERATOR_SETPOINT', 'ERROR', id, 'PV gerilim ayarı eksik');
    if (qLimitSource === 'IntQlim.cap_Qmn/cap_Qmx@pgini') ctx.finding('GENERATOR_Q_CAPABILITY_CURVE', 'INFO', id, 'Q sınırları IntQlim eğrisinden pgini noktasında doğrusal olarak alındı');
    if (mode === 'constv' && controlMode !== 'PV') {
      ctx.finding('CONTROL_MODE_UNRESOLVED', 'WARNING', id, 'Gerilim kontrolü için iki sonlu Q sınırı bulunmadığından sınırsız PV yapılmadı; varsa qgini çalışma noktası korunur');
      controlMode = 'UNKNOWN';
    }
    if (controlMode === 'UNKNOWN') ctx.finding('CONTROL_MODE_UNRESOLVED', 'WARNING', id, 'DGS kontrol modu çözümlenemedi; kaynak kodu ve çalışma Q değeri korunur');
    if (controlMode === 'PQ' && qMvar === null) ctx.finding('MISSING_GENERATOR_Q', 'ERROR', id, 'PQ reaktif güç girdisi eksik');
    result.push({ id, name: String(row.loc_name ?? id), sourceRefs: { powerFactoryClass: cls, fid: id, typeFid: reference(row.typ_id) ?? undefined }, inService: inService(row.outserv), bus,
      pMw, qMvar, vmPu: numeric(row.usetp), pMinMw: numeric(row.Pmin_uc), pMaxMw: numeric(row.Pmax_uc),
      qMinMvar, qMaxMvar, controlMode, remoteControlBus: null, participationFactor: null, droop: null, qLimitSource,
      parallelUnits: units, referenceMachine: numeric(row.ip_ctrl) === null ? null : numeric(row.ip_ctrl) === 1 });
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

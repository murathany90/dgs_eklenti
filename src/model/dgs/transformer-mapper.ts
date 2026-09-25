import type { CanonicalTransformer } from '../electrical-types.ts';
import { DgsContext, inService, numeric, reference } from './context.ts';

export function mapTransformers(ctx: DgsContext): CanonicalTransformer[] {
  const result: CanonicalTransformer[] = [];
  for (const row of ctx.rows('ElmTr2')) {
    const id = reference(row.FID); if (!id) continue;
    const type = ctx.get('TypTr2', row.typ_id);
    const hvBus = ctx.busFromCubic(row.bushv), lvBus = ctx.busFromCubic(row.buslv);
    const snMva = numeric(type?.strn), copperKw = numeric(type?.pcutr);
    const vkPercent = numeric(type?.uktr);
    const vkrPercent = snMva && copperKw !== null ? copperKw / (10 * snMva) : null;
    // The supplied YTBS TypTr2 export contains winding connections but no clock number or
    // phase-shift angle. Keep winding metadata; never infer an angle from YN/D alone.
    const phaseShiftDeg = numeric(type?.shift_degree);
    const hvWindingConnection = type?.tr2cn_h == null ? null : String(type.tr2cn_h);
    const lvWindingConnection = type?.tr2cn_l == null ? null : String(type.tr2cn_l);
    if (!hvBus || !lvBus) ctx.finding('MISSING_TRANSFORMER_TERMINAL', 'ERROR', id, 'Trafo uçları çözümlenemedi');
    if (!type || !snMva || !vkPercent || vkrPercent === null) ctx.finding('MISSING_TRANSFORMER_IMPEDANCE', 'ERROR', id, 'TypTr2 strn/uktr/pcutr eksik');
    if (phaseShiftDeg === null) ctx.finding('UNKNOWN_TRANSFORMER_PHASE_SHIFT', 'APPROXIMATION', id, 'DGS TypTr2 içinde faz kayması açısı bulunmuyor');
    const tapSide = numeric(type?.tap_side);
    result.push({
      id, name: String(row.loc_name ?? id), sourceRefs: { powerFactoryClass: 'ElmTr2', fid: id, typeFid: reference(row.typ_id) ?? undefined }, inService: inService(row.outserv),
      hvBus, lvBus, snMva, vnHvKv: numeric(type?.utrn_h), vnLvKv: numeric(type?.utrn_l), vkPercent, vkrPercent,
      pfeKw: numeric(type?.pfe), i0Percent: numeric(type?.curmg),
      tapPosition: numeric(row.nntap), tapNeutral: numeric(type?.nntap0), tapMin: numeric(type?.ntpmn), tapMax: numeric(type?.ntpmx),
      tapStepPercent: numeric(type?.dutap), tapSide: tapSide === 0 ? 'hv' : tapSide === 1 ? 'lv' : null,
      phaseShiftDeg, oltc: numeric(type?.oltc) === null ? null : numeric(type?.oltc) === 1,
      hvWindingConnection, lvWindingConnection, vectorGroup: null,
    });
  }
  return result;
}

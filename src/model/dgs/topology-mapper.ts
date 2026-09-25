import type { CanonicalSeriesCompensator, CanonicalSwitch } from '../electrical-types.ts';
import { DgsContext, inService, numeric, reference } from './context.ts';

export function mapSwitches(ctx: DgsContext): CanonicalSwitch[] {
  const result: CanonicalSwitch[] = [];
  if (ctx.table('ElmCoup') && ctx.fieldIndex('ElmCoup', 'outserv') < 0) ctx.finding('MISSING_SWITCH_OUTSERV', 'APPROXIMATION', undefined, 'ElmCoup servis alanı yok; on_off durumu kullanılır');
  for (const row of ctx.rows('ElmCoup')) {
    const id = reference(row.FID); if (!id) continue;
    const fromBus = ctx.busFromCubic(row.bus1), toBus = ctx.busFromCubic(row.bus2);
    if (!fromBus || !toBus) ctx.finding('MISSING_SWITCH_TERMINAL', 'ERROR', id, 'ElmCoup uçları çözümlenemedi');
    if (numeric(row.on_off) === null) ctx.finding('MISSING_SWITCH_STATE', 'ERROR', id, 'ElmCoup.on_off eksik');
    result.push({ id, name: String(row.loc_name ?? id), sourceRefs: { powerFactoryClass: 'ElmCoup', fid: id, typeFid: reference(row.typ_id) ?? undefined },
      inService: inService(row.outserv), fromBus, toBus, closed: numeric(row.on_off) === 1, usage: reference(row.aUsage) });
  }
  for (const row of ctx.rows('StaSwitch')) ctx.finding('UNSUPPORTED_STA_SWITCH', 'APPROXIMATION', reference(row.FID) ?? undefined, 'StaSwitch bağlantı modeli henüz eşlenmedi');
  return result;
}

export function mapSeriesCompensators(ctx: DgsContext): CanonicalSeriesCompensator[] {
  const result: CanonicalSeriesCompensator[] = [];
  for (const row of ctx.rows('ElmScap')) {
    const id = reference(row.FID); if (!id) continue;
    const fromBus = ctx.busFromCubic(row.bus1), toBus = ctx.busFromCubic(row.bus2);
    const susceptanceSiemens = numeric(row.bcap);
    const xOhm = susceptanceSiemens && susceptanceSiemens > 0 ? -1 / susceptanceSiemens : null;
    if (!fromBus || !toBus) ctx.finding('MISSING_SERIES_TERMINAL', 'ERROR', id, 'ElmScap uçları çözümlenemedi');
    if (xOhm === null) ctx.finding('MISSING_SERIES_SUSCEPTANCE', 'ERROR', id, 'ElmScap.bcap eksik/geçersiz');
    result.push({ id, name: String(row.loc_name ?? id), sourceRefs: { powerFactoryClass: 'ElmScap', fid: id }, inService: inService(row.outserv),
      fromBus, toBus, nominalKv: numeric(row.ucn), susceptanceSiemens, xOhm });
  }
  return result;
}

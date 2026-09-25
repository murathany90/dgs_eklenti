import type { CanonicalShunt } from '../electrical-types.ts';
import { DgsContext, inService, numeric, reference } from './context.ts';

export function mapShunts(ctx: DgsContext): CanonicalShunt[] {
  const result: CanonicalShunt[] = [];
  for (const row of ctx.rows('ElmShnt')) {
    const id = reference(row.FID); if (!id) continue;
    const bus = ctx.busFromCubic(row.bus1), type = numeric(row.shtype);
    const shuntType = type === 1 ? 'REACTOR' : type === 2 ? 'CAPACITOR' : 'UNKNOWN';
    const magnitude = type === 1 ? numeric(row.qrean) : type === 2 ? numeric(row.qcapn) : null;
    const qMvarPerStep = magnitude === null ? null : type === 1 ? magnitude : -magnitude;
    if (!bus) ctx.finding('MISSING_SHUNT_BUS', 'ERROR', id, 'ElmShnt.bus1 çözümlenemedi');
    if (qMvarPerStep === null) ctx.finding('MISSING_SHUNT_Q', 'ERROR', id, 'Şönt reaktif güç alanı eksik veya tür desteklenmiyor');
    result.push({ id, name: String(row.loc_name ?? id), sourceRefs: { powerFactoryClass: 'ElmShnt', fid: id }, inService: inService(row.outserv),
      bus, qMvarPerStep, steps: numeric(row.ncapx), currentStep: numeric(row.ncapa), shuntType });
  }
  return result;
}

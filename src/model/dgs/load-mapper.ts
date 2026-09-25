import type { CanonicalLoad } from '../electrical-types.ts';
import { DgsContext, inService, numeric, reference } from './context.ts';

export function mapLoads(ctx: DgsContext): CanonicalLoad[] {
  const result: CanonicalLoad[] = [];
  for (const row of ctx.rows('ElmLod')) {
    const id = reference(row.FID); if (!id) continue;
    const bus = ctx.busFromCubic(row.bus1), pMw = numeric(row.plini), qMvar = numeric(row.qlini);
    if (!bus) ctx.finding('MISSING_LOAD_BUS', 'ERROR', id, 'ElmLod.bus1 çözümlenemedi');
    if (pMw === null || qMvar === null) ctx.finding('MISSING_LOAD_POWER', 'ERROR', id, 'ElmLod plini/qlini eksik');
    result.push({ id, name: String(row.loc_name ?? id), sourceRefs: { powerFactoryClass: 'ElmLod', fid: id }, inService: inService(row.outserv), bus, pMw, qMvar });
  }
  return result;
}

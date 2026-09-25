import type { CanonicalBus } from '../electrical-types.ts';
import { DgsContext, inService, numeric, reference } from './context.ts';

export function mapBuses(ctx: DgsContext): CanonicalBus[] {
  const buses: CanonicalBus[] = [];
  for (const row of ctx.rows('ElmTerm')) {
    const id = reference(row.FID); if (!id) continue;
    const nominalKv = numeric(row.uknom);
    if (nominalKv === null || nominalKv <= 0) ctx.finding('INVALID_BUS_VOLTAGE', 'ERROR', id, 'ElmTerm.uknom eksik veya geçersiz');
    buses.push({ id, name: String(row.loc_name ?? id), sourceRefs: { powerFactoryClass: 'ElmTerm', fid: id }, inService: inService(row.outserv), nominalKv: nominalKv && nominalKv > 0 ? nominalKv : null });
  }
  return buses;
}

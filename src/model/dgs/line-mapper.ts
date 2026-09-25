import type { CanonicalLine, LineSection } from '../electrical-types.ts';
import { DgsContext, inService, numeric, reference } from './context.ts';

function section(ctx: DgsContext, row: Record<string, unknown>, typeRef: unknown, id: string): LineSection {
  const type = ctx.get('TypLne', typeRef);
  const lengthKm = numeric(row.dline);
  const rOhmPerKm = numeric(type?.rline), xOhmPerKm = numeric(type?.xline);
  const microSiemensPerKm = numeric(type?.bline), ratedCurrentKa = numeric(type?.sline);
  if (!type) ctx.finding('MISSING_LINE_TYPE', 'ERROR', id, `TypLne ${String(typeRef ?? '')} çözümlenemedi`);
  if (lengthKm === null || lengthKm <= 0) ctx.finding('INVALID_LINE_LENGTH', 'ERROR', id, 'Hat uzunluğu eksik/geçersiz');
  if (rOhmPerKm === null || xOhmPerKm === null) ctx.finding('MISSING_LINE_IMPEDANCE', 'ERROR', id, 'TypLne R/X eksik');
  if (microSiemensPerKm === null) ctx.finding('MISSING_LINE_CHARGING', 'WARNING', id, 'TypLne bline eksik');
  if (ratedCurrentKa === null || ratedCurrentKa <= 0) ctx.finding('MISSING_LINE_RATING', 'WARNING', id, 'TypLne sline eksik/geçersiz');
  return { id, lengthKm, rOhmPerKm, xOhmPerKm, bSiemensPerKm: microSiemensPerKm === null ? null : microSiemensPerKm * 1e-6, ratedCurrentKa };
}

export function mapLines(ctx: DgsContext, buses: Map<string, number | null>): CanonicalLine[] {
  const sectionsByLine = new Map<string, Array<Record<string, unknown>>>();
  for (const row of ctx.rows('ElmLnesec')) {
    const parent = reference(row.fold_id); if (!parent) continue;
    const list = sectionsByLine.get(parent) ?? []; list.push(row); sectionsByLine.set(parent, list);
  }
  const result: CanonicalLine[] = [];
  for (const row of ctx.rows('ElmLne')) {
    const id = reference(row.FID); if (!id) continue;
    const fromBus = ctx.busFromCubic(row.bus1), toBus = ctx.busFromCubic(row.bus2);
    if (!fromBus || !toBus) ctx.finding('MISSING_LINE_TERMINAL', 'ERROR', id, 'ElmLne bus1/bus2 → StaCubic → ElmTerm ilişkisi çözümlenemedi');
    const type = ctx.get('TypLne', row.typ_id);
    const sectionRows = sectionsByLine.get(id)?.sort((a, b) => (numeric(a.index) ?? 0) - (numeric(b.index) ?? 0));
    const parts = sectionRows?.length ? sectionRows.map(part => section(ctx, part, part.typ_id, String(part.FID))) : [section(ctx, row, row.typ_id, id)];
    const values = (key: 'rOhmPerKm' | 'xOhmPerKm' | 'bSiemensPerKm'): number | null => parts.every(p => p.lengthKm !== null && p[key] !== null) ? parts.reduce((total, p) => total + p.lengthKm! * p[key]!, 0) : null;
    const lengthKm = numeric(row.dline);
    const sectionLength = parts.every(p => p.lengthKm !== null) ? parts.reduce((sum, p) => sum + p.lengthKm!, 0) : null;
    if (sectionRows?.length && lengthKm !== null && sectionLength !== null && Math.abs(lengthKm - sectionLength) > Math.max(0.01, lengthKm * 0.01)) ctx.finding('LINE_SECTION_LENGTH_MISMATCH', 'WARNING', id, 'ElmLnesec toplam uzunluğu ana ElmLne.dline ile uyuşmuyor');
    const rated = parts.every(p => p.ratedCurrentKa !== null) ? Math.min(...parts.map(p => p.ratedCurrentKa!)) : null;
    const fromKv = fromBus ? buses.get(fromBus) : null, toKv = toBus ? buses.get(toBus) : null;
    const nominalKv = numeric(type?.uline) ?? fromKv ?? toKv ?? null;
    if (nominalKv === null) ctx.finding('MISSING_LINE_VOLTAGE', 'ERROR', id, 'Hat nominal gerilimi çözümlenemedi');
    result.push({ id, name: String(row.loc_name ?? id), sourceRefs: { powerFactoryClass: 'ElmLne', fid: id, typeFid: reference(row.typ_id) ?? undefined, sectionFids: sectionRows?.map(part => String(part.FID)) }, inService: inService(row.outserv), fromBus, toBus, nominalKv, lengthKm: sectionLength ?? lengthKm, rOhm: values('rOhmPerKm'), xOhm: values('xOhmPerKm'), bSiemens: values('bSiemensPerKm'), ratedCurrentKa: rated, thermalLimits: { nominalKa: rated }, sections: parts });
  }
  return result;
}

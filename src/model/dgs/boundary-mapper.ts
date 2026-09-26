import type { CanonicalBoundary } from '../electrical-types.ts';
import { DgsContext, inService, numeric, reference } from './context.ts';

function indexed(row: Record<string, unknown>, prefix: string): string[] {
  const count = numeric(row[`${prefix}:SIZEROW`]);
  const entries = Object.keys(row).filter(key => new RegExp(`^${prefix}:\\d+$`).test(key))
    .sort((a, b) => Number(a.slice(prefix.length + 1)) - Number(b.slice(prefix.length + 1)));
  return entries.filter(key => count === null || Number(key.slice(prefix.length + 1)) < count)
    .map(key => reference(row[key])).filter((value): value is string => value !== null);
}

export function mapBoundaries(ctx: DgsContext): CanonicalBoundary[] {
  return [...ctx.rows('ElmBoundary')].flatMap(row => {
    const id = reference(row.FID);
    if (!id) return [];
    const cubicles = indexed(row, 'cubicles');
    const orientations = indexed(row, 'ciorient').map(Number);
    const boundary: CanonicalBoundary = {
      id, name: String(row.loc_name ?? id), sourceRefs: { powerFactoryClass: 'ElmBoundary', fid: id },
      inService: inService(row.outserv),
      cubicles: cubicles.map((ref, index) => ({ reference: ref, bus: ctx.busFromCubic(ref), orientation: Number.isFinite(orientations[index]) ? orientations[index]! : null })),
      interchangeEnabled: numeric(row.iInterChg) === null ? null : numeric(row.iInterChg) !== 0,
      targetActivePowerMw: numeric(row.InterPset),
    };
    if (boundary.cubicles.some(item => item.bus === null)) ctx.finding('BOUNDARY_CUBICLE_UNRESOLVED', 'WARNING', id, 'Boundary cubicle referanslarından en az biri bara bağlantısına çözümlenemedi');
    return [boundary];
  });
}

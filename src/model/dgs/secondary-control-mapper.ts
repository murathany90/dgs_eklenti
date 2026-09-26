import type { CanonicalBoundary, CanonicalGenerator, CanonicalSecondaryController } from '../electrical-types.ts';
import { DgsContext, inService, numeric, reference } from './context.ts';

function members(row: Record<string, unknown>): string[] {
  const count = numeric(row['psym:SIZEROW']);
  return Object.keys(row).filter(key => /^psym:\d+$/.test(key)).sort((a, b) => Number(a.slice(5)) - Number(b.slice(5)))
    .filter(key => count === null || Number(key.slice(5)) < count).map(key => reference(row[key]))
    .filter((value): value is string => value !== null);
}

export function mapSecondaryControllers(ctx: DgsContext, boundaries: CanonicalBoundary[], generators: CanonicalGenerator[]): CanonicalSecondaryController[] {
  return [...ctx.rows('ElmSecctrl')].flatMap(row => {
    const id = reference(row.FID);
    if (!id) return [];
    const measuredBoundaryRaw = reference(row.pPmeas);
    const boundary = boundaries.find(item => item.id === measuredBoundaryRaw || item.name === measuredBoundaryRaw);
    const participantIds = members(row);
    const generatorIds = new Set(generators.map(item => item.id));
    const controlledGeneratorIds = participantIds.filter(participantId => generatorIds.has(participantId));
    const item: CanonicalSecondaryController = {
      id, name: String(row.loc_name ?? id), sourceRefs: { powerFactoryClass: 'ElmSecctrl', fid: id }, inService: inService(row.outserv),
      referenceBus: ctx.busFromCubic(row.rembar), measuredBoundaryId: boundary?.id ?? null, measuredBoundaryRaw,
      targetActivePowerMw: numeric(row.psetp), frequencyBias: numeric(row.Kpf), distributionModeCode: numeric(row.imode),
      participantIds, controlledGeneratorIds, balancingSupport: 'SOURCE_ONLY',
    };
    if (measuredBoundaryRaw && !boundary) ctx.finding('SECONDARY_BOUNDARY_UNRESOLVED', 'WARNING', id, `ElmSecctrl.pPmeas=${measuredBoundaryRaw} ElmBoundary'ye çözümlenemedi`);
    if (participantIds.some(participantId => !generatorIds.has(participantId))) ctx.finding('SECONDARY_PARTICIPANT_NOT_GENERATOR', 'INFO', id, 'psym katılımcıları generator canonical listesinde olmayan kaynak kimlikleri içeriyor; rol ham kimlikle korundu');
    ctx.finding('SECONDARY_CONTROL_SOURCE_ONLY', 'WARNING', id, 'Steady-state active-power target/katılımcılar korundu; iPbalancing semantiği doğrulanmadığından AGC setpoint solver davranışına uygulanmadı');
    return [item];
  });
}

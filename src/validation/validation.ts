import type { CanonicalNetwork, DgsDocument } from '../model/types.ts';

export type Integrity = 'VALIDATED' | 'COMPLETE_UNVALIDATED' | 'REDUCED' | 'PARTIAL' | 'INVALID' | 'NON_CONVERGED';
export type Severity = 'ERROR' | 'WARNING' | 'APPROXIMATION' | 'INFO';
export interface Finding { severity: Severity; code: string; equipmentId?: string; message: string }
export interface CoordinateProfile { name: string; latitude: [number, number]; longitude: [number, number] }
export const YTBS_COORDINATES: CoordinateProfile = { name: 'YTBS', latitude: [35, 42], longitude: [24, 45] };
export function validCoordinate(latitude: number, longitude: number, profile: CoordinateProfile = YTBS_COORDINATES): boolean {
  return Number.isFinite(latitude) && Number.isFinite(longitude) && latitude >= profile.latitude[0] && latitude <= profile.latitude[1] && longitude >= profile.longitude[0] && longitude <= profile.longitude[1];
}
export function validateNetwork(network: CanonicalNetwork, document: DgsDocument, profile: CoordinateProfile = YTBS_COORDINATES): { integrity: Integrity; findings: Finding[] } {
  const findings: Finding[] = [];
  const all = new Set<string>();
  for (const [cls, table] of Object.entries(document)) {
    if (cls === 'Matrix') continue; // Matrix FID groups many coordinate rows by design.
    const index = table?.Attributes?.indexOf('FID') ?? -1;
    if (index < 0) continue;
    for (const row of table.Values) {
      const id = String(row[index] ?? '');
      if (all.has(id)) findings.push({ severity: 'ERROR', code: 'DUPLICATE_ID', equipmentId: id, message: `Tekrarlı FID: ${id}` });
      all.add(id);
    }
  }
  for (const group of [network.lines, network.transformers, network.switches]) for (const item of group) {
    for (const ref of item.terminals.filter(ref => /^[A-Za-z]+\d+$/.test(ref))) {
      if (!all.has(ref) && !document[ref]) findings.push({ severity: 'WARNING', code: 'UNRESOLVED_REFERENCE', equipmentId: item.id, message: `${ref} çözümlenemedi` });
    }
    if (item.kind === 'line' && !item.source.typ_id) findings.push({ severity: 'APPROXIMATION', code: 'MISSING_IMPEDANCE', equipmentId: item.id, message: 'Hat türü/empedans referansı eksik' });
    if (item.terminals.length === 0) findings.push({ severity: 'WARNING', code: 'MISSING_TERMINAL', equipmentId: item.id, message: 'Terminal referansı eksik' });
  }
  for (const item of network.voltageLevels) {
    const lat = Number(item.source.GPSlat), lon = Number(item.source.GPSlon);
    if ((item.source.GPSlat != null || item.source.GPSlon != null) && !validCoordinate(lat, lon, profile)) findings.push({ severity: 'WARNING', code: 'IMPOSSIBLE_COORDINATE', equipmentId: item.id, message: `${lat}, ${lon}: ${profile.name} dışında` });
  }
  for (const item of network.buses) {
    const kv = Number(item.source.uknom);
    if (!Number.isFinite(kv) || kv <= 0) findings.push({ severity: 'WARNING', code: 'INVALID_VOLTAGE', equipmentId: item.id, message: 'Nominal gerilim geçersiz' });
  }
  for (const item of network.generators) if (item.source.cQ_min == null || item.source.cQ_max == null) findings.push({ severity: 'INFO', code: 'MISSING_Q_LIMITS', equipmentId: item.id, message: 'Q sınırları eksik' });
  if (network.scope === 'TRANSMISSION_REDUCED') findings.push({ severity: 'APPROXIMATION', code: 'REDUCED_SCOPE', message: '66 kV altı enjeksiyonlar indirgenmiş iletim modeline yansıtılabilir' });
  const integrity: Integrity = findings.some(x => x.severity === 'ERROR') ? 'INVALID' : network.scope === 'TRANSMISSION_REDUCED' ? 'REDUCED' : findings.some(x => x.severity === 'WARNING') ? 'PARTIAL' : 'COMPLETE_UNVALIDATED';
  return { integrity, findings };
}

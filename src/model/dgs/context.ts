import type { DgsDocument, DgsRow, DgsTable } from '../types.ts';
import type { MappingFinding, MappingSeverity } from '../electrical-types.ts';

export function numeric(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
export function reference(value: unknown): string | null { return value === null || value === undefined || value === '' ? null : String(value); }
export function inService(value: unknown): boolean { return numeric(value) !== 1; }

export class DgsContext {
  readonly findings: MappingFinding[] = [];
  readonly findingCounts: Record<string, number> = {};
  incompleteCount = 0;
  private readonly indexes = new Map<string, Map<string, number>>();
  private readonly attributes = new Map<string, Map<string, number>>();
  constructor(readonly document: DgsDocument) {}
  table(cls: string): DgsTable | undefined { return this.document[cls]; }
  fieldIndex(cls: string, field: string): number {
    let map = this.attributes.get(cls);
    if (!map) { map = new Map(this.table(cls)?.Attributes.map((name, index) => [name, index]) ?? []); this.attributes.set(cls, map); }
    return map.get(field) ?? -1;
  }
  value(cls: string, row: unknown[], field: string): unknown { const index = this.fieldIndex(cls, field); return index < 0 ? undefined : row[index]; }
  row(cls: string, values: unknown[]): DgsRow { const attrs = this.table(cls)?.Attributes ?? []; return Object.fromEntries(attrs.map((key, index) => [key, values[index]])); }
  *rows(cls: string): Iterable<DgsRow> { for (const values of this.table(cls)?.Values ?? []) yield this.row(cls, values); }
  get(cls: string, fid: unknown): DgsRow | null {
    const id = reference(fid); if (!id) return null;
    let index = this.indexes.get(cls);
    if (!index) {
      index = new Map(); const column = this.fieldIndex(cls, 'FID');
      if (column >= 0) this.table(cls)?.Values.forEach((row, i) => { if (row[column] != null) index!.set(String(row[column]), i); });
      this.indexes.set(cls, index);
    }
    const position = index.get(id);
    return position === undefined ? null : this.row(cls, this.table(cls)!.Values[position]);
  }
  busFromCubic(cubic: unknown): string | null {
    const ref = reference(cubic); if (!ref) return null;
    if (this.get('ElmTerm', ref)) return ref;
    const bus = reference(this.get('StaCubic', ref)?.fold_id);
    return bus && this.get('ElmTerm', bus) ? bus : null;
  }
  finding(code: string, severity: MappingSeverity, equipmentId: string | undefined, message: string): void {
    this.findingCounts[code] = (this.findingCounts[code] ?? 0) + 1;
    if (severity !== 'INFO') this.incompleteCount++;
    if (this.findings.length < 2000) this.findings.push({ code, severity, equipmentId, message });
  }
}

import type { CanonicalInternationalConnection } from '../electrical-types.ts';
import { DgsContext, inService, numeric, reference } from './context.ts';

export function mapElmVac(ctx: DgsContext): CanonicalInternationalConnection[] {
  return [...ctx.rows('ElmVac')].flatMap(row => {
    const id = reference(row.FID);
    if (!id) return [];
    const type = numeric(row.itype);
    const bus = ctx.busFromCubic(row.bus1);
    const item: CanonicalInternationalConnection = {
      id, name: String(row.loc_name ?? id), sourceRefs: { powerFactoryClass: 'ElmVac', fid: id },
      inService: inService(row.outserv), bus, nominalKv: numeric(row.Unom), voltageSetpointPu: numeric(row.usetp),
      r1Ohm: numeric(row.R1), x1Ohm: numeric(row.X1), r2Ohm: numeric(row.R2), x2Ohm: numeric(row.X2),
      r0Ohm: numeric(row.R0), x0Ohm: numeric(row.X0), sourceType: type,
      pLoadMw: numeric(row.Pload), qLoadMvar: numeric(row.Qload),
      // Pload/Qload are explicitly labeled as load values in the DGS export. Model them as a
      // fixed-PQ approximation; do not reinterpret itype as a PowerFactory load-flow enum or ext_grid.
      mappingMode: numeric(row.Pload) !== null && numeric(row.Qload) !== null ? 'FIXED_PQ_LOAD_APPROXIMATION' : 'SOURCE_ONLY',
    };
    if (!bus) ctx.finding('ELMVAC_BUS_UNRESOLVED', 'WARNING', id, 'ElmVac bus1/fold_id çözümlenemedi; kaynak alanları korunuyor');
    if (type !== null) ctx.finding('ELMVAC_TYPE_SEMANTICS_UNKNOWN', 'INFO', id, `ElmVac.itype=${type} ham kod olarak korundu; DGS enum anlamı doğrulanmadı`);
    if (item.mappingMode === 'FIXED_PQ_LOAD_APPROXIMATION') ctx.finding('ELMVAC_FIXED_PQ_APPROXIMATION', 'APPROXIMATION', id, 'Pload/Qload işaretleri tüketim-pozitif sabit-PQ olarak aktarılacak; ElmVac kaynak ve empedans davranışı çözülmüyor');
    else ctx.finding('ELMVAC_PQ_MISSING', 'WARNING', id, 'Pload/Qload eksik; ElmVac sayısal sabit-PQ eşlemesine alınmadı');
    return [item];
  });
}

import type { CanonicalLoadFlowSettings } from '../electrical-types.ts';
import { DgsContext, numeric, reference } from './context.ts';

const integer = (value: number | null): number | null => value !== null && Number.isInteger(value) && value > 0 ? value : null;

export function mapLoadFlowSettings(ctx: DgsContext): CanonicalLoadFlowSettings {
  const rows = [...ctx.rows('ComLdf')];
  const row = rows[0];
  if (!row || rows.length !== 1) {
    ctx.finding('LOAD_FLOW_SETTINGS_UNAVAILABLE', 'WARNING', undefined, 'DGS içinde tekil ComLdf satırı bulunamadı; çözücü fallback ayarları kullanır');
  }
  const values = {
    iopt_lim: numeric(row?.iopt_lim), itrlx: numeric(row?.itrlx), ictrlx: numeric(row?.ictrlx),
    errlf: numeric(row?.errlf), erreq: numeric(row?.erreq), iPbalancing: numeric(row?.iPbalancing),
  };
  const limitCode = values.iopt_lim;
  const enforceReactiveLimits = limitCode === 0 ? false : limitCode === 1 ? true : null;
  if (limitCode !== null && enforceReactiveLimits === null) {
    ctx.finding('COMLDF_REACTIVE_LIMIT_CODE_UNKNOWN', 'WARNING', reference(row?.FID) ?? undefined, `ComLdf.iopt_lim=${limitCode} enum dışı; reaktif sınırlar tahmin edilmedi`);
  }
  if (values.itrlx !== null && integer(values.itrlx) === null) {
    ctx.finding('COMLDF_INNER_ITERATION_LIMIT_INVALID', 'WARNING', reference(row?.FID) ?? undefined, 'ComLdf.itrlx pozitif tam sayı değil; fallback kullanılacak');
  }
  if (values.ictrlx !== null && integer(values.ictrlx) === null) {
    ctx.finding('COMLDF_OUTER_ITERATION_LIMIT_INVALID', 'WARNING', reference(row?.FID) ?? undefined, 'ComLdf.ictrlx pozitif tam sayı değil; fallback kullanılacak');
  }
  if (values.iPbalancing !== null) {
    ctx.finding('COMLDF_ACTIVE_BALANCING_MODE_UNKNOWN', 'WARNING', reference(row?.FID) ?? undefined, `ComLdf.iPbalancing=${values.iPbalancing} ham kod olarak korundu; dağıtım anlamı doğrulanmadı`);
  }
  if (values.errlf !== null || values.erreq !== null) {
    ctx.finding('COMLDF_TOLERANCE_UNITS_UNKNOWN', 'INFO', reference(row?.FID) ?? undefined, 'errlf/erreq ham değerleri korundu; DGS birim dönüşümü doğrulanmadığından pandapower toleransına çevrilmedi');
  }
  return {
    sourceRefs: { powerFactoryClass: 'ComLdf', fid: reference(row?.FID) ?? 'UNKNOWN' },
    enforceReactiveLimits,
    maxNewtonIterations: integer(values.itrlx),
    maxOuterIterations: integer(values.ictrlx),
    nodalToleranceRaw: values.errlf,
    modelEquationToleranceRaw: values.erreq,
    activePowerBalancingModeCode: values.iPbalancing,
    activePowerBalancingMode: 'UNKNOWN',
    rawValues: values,
  };
}

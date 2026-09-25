import type { ResultSet } from './result-set.ts';

export type ResultAvailabilityReason = 'AVAILABLE' | 'ANALYSIS_NOT_RUN' | 'AC_NON_CONVERGED' |
  'DC_MODE_NO_VOLTAGE_MAGNITUDE' | 'DC_MODE_NO_REACTIVE_POWER' | 'OUT_OF_SERVICE' | 'OUT_OF_SCOPE' |
  'NOT_MAPPED' | 'UNSUPPLIED' | 'NO_NUMERIC_RESULT';

export type BusMetric = 'voltage' | 'angle' | 'activePower' | 'reactivePower';

export interface ResultAvailability {
  mode: 'AC' | 'DC';
  convergence: ResultSet['convergence'];
  reasons: Partial<Record<BusMetric, ResultAvailabilityReason>>;
}

export interface BusAvailabilityInput {
  inService: boolean;
  mapped: boolean;
  inScope: boolean;
  supplied: boolean;
  metric: BusMetric;
  numericValue: number | null | undefined;
}

export const availabilityText: Record<ResultAvailabilityReason, string> = {
  AVAILABLE: 'Sonuç mevcut.',
  ANALYSIS_NOT_RUN: 'Hesap bekleniyor.',
  AC_NON_CONVERGED: 'AC yük akışı yakınsamadığı için sayısal sonuç üretilmedi.',
  DC_MODE_NO_VOLTAGE_MAGNITUDE: 'DC yük akışı gerilim büyüklüğü hesaplamaz.',
  DC_MODE_NO_REACTIVE_POWER: 'DC yük akışı reaktif güç hesaplamaz.',
  OUT_OF_SERVICE: 'Bu bara kaynak modelde servis dışıdır.',
  OUT_OF_SCOPE: 'Bu bara seçili hesap motorunun kapsamı dışındadır.',
  NOT_MAPPED: 'Bu bara seçili hesap motoruna eşlenmemiştir.',
  UNSUPPLIED: 'Bu bara kaynak veya besleme yolu bulunmadığı için enerjisizdir.',
  NO_NUMERIC_RESULT: 'Bu ekipman için sayısal sonuç bulunmuyor.',
};

export function busAvailability(result: ResultSet | null, input: BusAvailabilityInput): ResultAvailabilityReason {
  if (!input.inService) return 'OUT_OF_SERVICE';
  if (!result || result.convergence === 'NOT_RUN') return 'ANALYSIS_NOT_RUN';
  if (result.convergence === 'NON_CONVERGED' && result.summary.mode === 'AC') return 'AC_NON_CONVERGED';
  if (result.summary.mode === 'DC' && input.metric === 'voltage') return 'DC_MODE_NO_VOLTAGE_MAGNITUDE';
  if (result.summary.mode === 'DC' && input.metric === 'reactivePower') return 'DC_MODE_NO_REACTIVE_POWER';
  if (!input.inScope) return 'OUT_OF_SCOPE';
  if (!input.mapped) return 'NOT_MAPPED';
  if (!input.supplied) return 'UNSUPPLIED';
  return input.numericValue !== null && input.numericValue !== undefined && Number.isFinite(input.numericValue)
    ? 'AVAILABLE' : 'NO_NUMERIC_RESULT';
}

export function resultAvailabilityFor(result: ResultSet): ResultAvailability {
  const mode = result.summary.mode;
  if (result.convergence === 'NON_CONVERGED' && mode === 'AC') {
    return { mode, convergence: result.convergence, reasons: { voltage: 'AC_NON_CONVERGED', angle: 'AC_NON_CONVERGED', activePower: 'AC_NON_CONVERGED', reactivePower: 'AC_NON_CONVERGED' } };
  }
  if (mode === 'DC') {
    return { mode, convergence: result.convergence, reasons: { voltage: 'DC_MODE_NO_VOLTAGE_MAGNITUDE', reactivePower: 'DC_MODE_NO_REACTIVE_POWER' } };
  }
  return { mode, convergence: result.convergence, reasons: {} };
}

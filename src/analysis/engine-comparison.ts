import type { CalculationEngine, CalculationMode } from './calculation-key.ts';
import type { ResultSet } from './result-set.ts';

export interface EngineComparisonRecord { savedAt: number; result: ResultSet }

/** Select a same-model, same-mode and same-scenario result for the comparison column. */
export function findComparableEngineResult(records: Iterable<EngineComparisonRecord>, input: {
  engine: CalculationEngine; modelHash: string; mode: CalculationMode; scenarioHash: string; solverVersion: string;
}): ResultSet | null {
  const matching = [...records].filter(({ result }) => {
    const key = result.calculation?.calculationKey;
    return result.engine === input.engine && result.modelHash === input.modelHash && result.summary.mode === input.mode &&
      key?.engine === input.engine && key.modelHash === input.modelHash && key.mode === input.mode &&
      key.scenarioHash === input.scenarioHash && key.solverVersion === input.solverVersion;
  });
  matching.sort((a, b) => b.savedAt - a.savedAt);
  return matching[0]?.result ?? null;
}

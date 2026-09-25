import type { CanonicalNetwork } from '../model/types.ts';
import type { ResultSet } from '../analysis/result-set.ts';
export interface SolverCapabilities { ac: boolean; dc: boolean; fullNetwork: boolean; scenarios: boolean }
export interface LoadFlowOptions { mode: 'AC' | 'DC'; scenarioId?: string }
export interface PowerSystemSolver {
  id: string; capabilities: SolverCapabilities;
  runLoadFlow(network: CanonicalNetwork, options: LoadFlowOptions): Promise<ResultSet>;
}

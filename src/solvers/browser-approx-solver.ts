import type { CanonicalNetwork } from '../model/types.ts';
import type { ResultSet } from '../analysis/result-set.ts';
import type { LoadFlowOptions, PowerSystemSolver } from './solver-interface.ts';
import { fromLegacyRows, type BrowserLegacyDiagnostics, type LegacyRow } from '../analysis/legacy-adapter.ts';

export class BrowserApproxSolver implements PowerSystemSolver {
  readonly id = 'browser-approx';
  readonly capabilities = { ac: true, dc: false, fullNetwork: false, scenarios: true };
  constructor(private readonly runLegacy: () => Promise<void>, private readonly getLegacyResult: () => { solved?: number; total?: number; summary?: unknown[]; findings?: BrowserLegacyDiagnostics } | null,
    private readonly getLegacyRows: () => LegacyRow[] = () => []) {}
  async runLoadFlow(network: CanonicalNetwork, options: LoadFlowOptions): Promise<ResultSet> {
    const started = performance.now();
    await this.runLegacy();
    const result = this.getLegacyResult();
    const rows = this.getLegacyRows().filter(row => typeof row.value === 'number' && Number.isFinite(row.value));
    const convergence = !result || result.total === 0 || result.solved === 0 || rows.length === 0 ? 'NON_CONVERGED'
      : result.solved === result.total ? 'CONVERGED' : 'PARTIAL';
    const mapped = fromLegacyRows(network, rows, convergence, result?.findings);
    mapped.engine = this.id;
    mapped.engineVersion = '6.1.6';
    mapped.summary.mode = options.mode;
    mapped.summary.solveMs = performance.now() - started;
    mapped.solverOptions = { ...mapped.solverOptions, mode: options.mode, solvedIslands: result?.solved ?? null,
      totalIslands: result?.total ?? null, islandSummary: result?.summary ?? [], fallbackUsed: (result?.summary ?? []).some(entry => Boolean((entry as { nrFallback?: boolean })?.nrFallback)),
      internationalConnections: result?.findings?.internationalConnections ?? null };
    return mapped;
  }
}

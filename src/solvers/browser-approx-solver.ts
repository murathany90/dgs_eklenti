import type { CanonicalNetwork } from '../model/types.ts';
import type { ResultSet } from '../analysis/result-set.ts';
import type { LoadFlowOptions, PowerSystemSolver } from './solver-interface.ts';

export class BrowserApproxSolver implements PowerSystemSolver {
  readonly id = 'browser-approx-v5.5';
  readonly capabilities = { ac: true, dc: true, fullNetwork: false, scenarios: true };
  constructor(private readonly runLegacy: () => Promise<void>, private readonly getLegacyResult: () => { solved?: number; total?: number; summary?: unknown[] } | null) {}
  async runLoadFlow(network: CanonicalNetwork, _options: LoadFlowOptions): Promise<ResultSet> {
    await this.runLegacy();
    const result = this.getLegacyResult();
    return {
      schemaVersion: '2.0', engine: this.id, engineVersion: '5.5', modelId: network.modelId, modelHash: network.modelHash,
      timestamp: new Date().toISOString(), topologyMode: 'BUS_BRANCH', electricalScope: 'TRANSMISSION_REDUCED',
      convergence: !result ? 'NON_CONVERGED' : result.solved === result.total ? 'CONVERGED' : 'PARTIAL',
      iterations: null, maxMismatch: null, validation: 'REDUCED', warnings: ['Deneysel 66 kV+ yaklaşık AC-PQ çözümü; PowerFactory sonucu değildir.'], unsupported: [],
      buses: [], branches: [], generators: [], transformers: [], externalGrids: [], losses: [],
      summary: { generationMw: null, generationMvar: null, loadMw: null, loadMvar: null, activeLossMw: null, reactiveLossMvar: null, busCount: 0, lineCount: 0, transformerCount: 0, solveMs: null, mode: _options.mode },
      resultAvailability: { mode: _options.mode, convergence: !result ? 'NON_CONVERGED' : result.solved === result.total ? 'CONVERGED' : 'PARTIAL', reasons: {} },
    };
  }
}

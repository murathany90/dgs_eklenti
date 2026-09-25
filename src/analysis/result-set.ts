import type { ElectricalScope } from '../model/types.ts';
import type { Integrity } from '../validation/validation.ts';
export type Quality = 'MEASURED' | 'CALCULATED' | 'ESTIMATED' | 'FORECAST' | 'APPROXIMATE' | 'REFERENCE';
export interface ResultValue { id: string; value: number; quality: Quality; source: string; metric?: string; terminal?: string; unit?: string }
export interface ResultSet {
  engine: string; engineVersion: string; modelId: string; modelHash: string; timestamp: string;
  topologyMode: 'NODE_BREAKER' | 'BUS_BRANCH'; electricalScope: ElectricalScope;
  convergence: 'CONVERGED' | 'PARTIAL' | 'NON_CONVERGED' | 'NOT_RUN'; validation: Integrity;
  warnings: string[]; buses: ResultValue[]; branches: ResultValue[]; generators: ResultValue[];
  transformers: ResultValue[]; losses: ResultValue[];
}

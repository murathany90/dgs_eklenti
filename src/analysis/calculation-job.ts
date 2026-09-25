export type CalculationJobState = 'IDLE' | 'PREPARING' | 'TRANSFERRING' | 'PREFLIGHT' | 'SOLVING' |
  'SERIALIZING' | 'COMPLETED' | 'NON_CONVERGED' | 'FAILED' | 'CANCELLED';

export interface CalculationJob {
  id: string;
  state: CalculationJobState;
  startedAt: string | null;
  finishedAt: string | null;
  elapsedMs: number;
  message: string;
}

const terminal = new Set<CalculationJobState>(['COMPLETED', 'NON_CONVERGED', 'FAILED', 'CANCELLED']);
const allowed: Record<CalculationJobState, CalculationJobState[]> = {
  IDLE: ['PREPARING'], PREPARING: ['TRANSFERRING', 'SOLVING', 'FAILED', 'CANCELLED'],
  TRANSFERRING: ['PREFLIGHT', 'FAILED', 'CANCELLED'], PREFLIGHT: ['SOLVING', 'FAILED', 'CANCELLED'],
  SOLVING: ['SERIALIZING', 'COMPLETED', 'NON_CONVERGED', 'FAILED', 'CANCELLED'],
  SERIALIZING: ['COMPLETED', 'NON_CONVERGED', 'FAILED', 'CANCELLED'],
  COMPLETED: [], NON_CONVERGED: [], FAILED: [], CANCELLED: [],
};

export function createCalculationJob(id: string): CalculationJob {
  return { id, state: 'IDLE', startedAt: null, finishedAt: null, elapsedMs: 0, message: '' };
}

export function transitionCalculationJob(job: CalculationJob, state: CalculationJobState, message: string, now = new Date()): CalculationJob {
  if (!allowed[job.state].includes(state)) throw new Error(`Invalid calculation job transition: ${job.state} -> ${state}`);
  const startedAt = job.startedAt ?? (state === 'PREPARING' ? now.toISOString() : null);
  const finishedAt = terminal.has(state) ? now.toISOString() : null;
  const elapsedMs = startedAt ? Math.max(0, now.getTime() - Date.parse(startedAt)) : 0;
  return { ...job, state, startedAt, finishedAt, elapsedMs, message };
}

export function isCalculationJobTerminal(state: CalculationJobState): boolean { return terminal.has(state); }

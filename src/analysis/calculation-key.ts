export type CalculationEngine = 'pandapower' | 'browser-approx';
export type CalculationMode = 'AC' | 'DC';

export interface ScenarioPayload {
  lines: unknown[];
  switches: unknown[];
  restoredTerminals: string[];
  autoRestoreTerminals: boolean;
}

export interface CalculationKey {
  modelHash: string;
  engine: CalculationEngine;
  mode: CalculationMode;
  scenarioHash: string;
  solverVersion: string;
  optionsHash: string;
}

export interface CalculationMetadata {
  calculationId: string;
  calculationKey: CalculationKey;
  startedAt: string;
  finishedAt: string;
  elapsedMs: number;
  modelHash: string;
  engine: CalculationEngine;
  engineVersion: string;
  mode: CalculationMode;
  scenarioHash: string;
  options: Record<string, unknown>;
  convergence: 'CONVERGED' | 'PARTIAL' | 'NON_CONVERGED' | 'NOT_RUN';
  validation: string;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, stableValue(item)]));
  }
  return value;
}

export function stableJson(value: unknown): string { return JSON.stringify(stableValue(value)); }

function stableArray(items: unknown[] | undefined): unknown[] {
  return (items ?? []).map(stableValue).sort((left, right) => {
    const a = stableJson(left), b = stableJson(right);
    return a < b ? -1 : a > b ? 1 : 0;
  });
}

export function normalizeScenarioPayload(scenario: Partial<ScenarioPayload>): ScenarioPayload {
  const restoredTerminals = [...new Set((scenario.restoredTerminals ?? [])
    .map(terminal => String(terminal ?? '').trim()).filter(Boolean))].sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
  return {
    lines: stableArray(scenario.lines),
    switches: stableArray(scenario.switches),
    restoredTerminals,
    autoRestoreTerminals: scenario.autoRestoreTerminals === true,
  };
}

export async function sha256(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(typeof value === 'string' ? value : stableJson(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function createCalculationKey(input: {
  modelHash: string;
  engine: CalculationEngine;
  mode: CalculationMode;
  scenario: Partial<ScenarioPayload>;
  solverVersion: string;
  options: Record<string, unknown>;
}): Promise<CalculationKey> {
  return {
    modelHash: input.modelHash,
    engine: input.engine,
    mode: input.mode,
    scenarioHash: await sha256(normalizeScenarioPayload(input.scenario)),
    solverVersion: input.solverVersion,
    optionsHash: await sha256(input.options),
  };
}

export function calculationKeyId(key: CalculationKey): string {
  return `key:${stableJson(key)}`;
}

export function scenarioIsActive(scenario: Partial<ScenarioPayload>): boolean {
  return Boolean(scenario.lines?.length || scenario.switches?.length || scenario.restoredTerminals?.length);
}

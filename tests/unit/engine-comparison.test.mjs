import test from 'node:test';
import assert from 'node:assert/strict';
import { findComparableEngineResult } from '../../src/analysis/engine-comparison.ts';

function record(engine, { modelHash = 'model-a', mode = 'AC', scenarioHash = 'base', savedAt = 1 } = {}) {
  const solverVersion = engine === 'pandapower' ? 'pandapower@3.5.5/protocol-1.0' : 'browser-approx-v6.1.6';
  const result = {
    engine, modelHash, summary: { mode },
    calculation: { calculationKey: { engine, modelHash, mode, scenarioHash, solverVersion } },
  };
  return { savedAt, result };
}

test('comparison chooses only the requested engine for the same model, mode, and scenario', () => {
  const full = record('pandapower', { savedAt: 10 });
  const browser = record('browser-approx', { savedAt: 20 });
  const wrongScenario = record('browser-approx', { scenarioHash: 'line-outage', savedAt: 30 });
  const wrongModel = record('browser-approx', { modelHash: 'model-b', savedAt: 40 });
  assert.equal(findComparableEngineResult([browser, full, wrongScenario, wrongModel], {
    engine: 'pandapower', modelHash: 'model-a', mode: 'AC', scenarioHash: 'base', solverVersion: 'pandapower@3.5.5/protocol-1.0',
  }), full.result);
  assert.equal(findComparableEngineResult([full, browser, wrongScenario, wrongModel], {
    engine: 'browser-approx', modelHash: 'model-a', mode: 'AC', scenarioHash: 'base', solverVersion: 'browser-approx-v6.1.6',
  }), browser.result);
});

test('comparison selects the latest matching result and rejects a mismatched engine key', () => {
  const older = record('pandapower', { savedAt: 10 });
  const latest = record('pandapower', { savedAt: 20 });
  const mismatchedKey = record('pandapower');
  mismatchedKey.result.calculation.calculationKey.engine = 'browser-approx';
  assert.equal(findComparableEngineResult([older, latest, mismatchedKey], {
    engine: 'pandapower', modelHash: 'model-a', mode: 'AC', scenarioHash: 'base', solverVersion: 'pandapower@3.5.5/protocol-1.0',
  }), latest.result);
  assert.equal(findComparableEngineResult([mismatchedKey], {
    engine: 'pandapower', modelHash: 'model-a', mode: 'AC', scenarioHash: 'base', solverVersion: 'pandapower@3.5.5/protocol-1.0',
  }), null);
});

test('comparison does not reuse a result from an older solver version', () => {
  const old = record('browser-approx');
  old.result.calculation.calculationKey.solverVersion = 'browser-approx-v5.5';
  assert.equal(findComparableEngineResult([old], {
    engine: 'browser-approx', modelHash: 'model-a', mode: 'AC', scenarioHash: 'base', solverVersion: 'browser-approx-v6.1.6',
  }), null);
});

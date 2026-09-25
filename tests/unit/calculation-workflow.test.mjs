import test from 'node:test';
import assert from 'node:assert/strict';
import { calculationKeyId, createCalculationKey, scenarioIsActive } from '../../src/analysis/calculation-key.ts';
import { createCalculationJob, transitionCalculationJob } from '../../src/analysis/calculation-job.ts';
import { busAvailability, resultAvailabilityFor } from '../../src/analysis/result-availability.ts';
import { calculationHistoryText } from '../../src/presentation/calculationPresentation.ts';

const baseKey = input => createCalculationKey({ modelHash: 'model', engine: 'pandapower', mode: 'AC', scenario: { lines: [], switches: [] }, solverVersion: '3.5.5', options: { nr: true }, ...input });

test('calculation keys isolate engine, mode, scenario, solver and options', async () => {
  const original = await baseKey({});
  const changed = await Promise.all([
    baseKey({ engine: 'browser-approx' }), baseKey({ mode: 'DC' }), baseKey({ scenario: { lines: [['L', 1]], switches: [] } }),
    baseKey({ solverVersion: '3.5.6' }), baseKey({ options: { nr: false } }),
  ]);
  for (const key of changed) assert.notEqual(calculationKeyId(key), calculationKeyId(original));
  assert.equal(calculationKeyId(original), calculationKeyId(await baseKey({ options: { nr: true }, scenario: { switches: [], lines: [] } })));
});

test('virtual energization terminals are part of canonical scenario identity', async () => {
  const scenario = (restoredTerminals, revision) => ({
    lines: [['H5846', 1]], switches: [], restoredTerminals, autoRestoreTerminals: false, revision,
  });
  const a = await baseKey({ scenario: scenario(['B1', 'B2'], 1) });
  const b = await baseKey({ scenario: scenario(['B1', 'B2', 'B3'], 2) });
  const sortedA = await baseKey({ scenario: scenario([' B2 ', 'B1', 'B2'], 999) });
  const restoredA = await baseKey({ scenario: scenario(['B1', 'B2'], 3) });
  assert.notEqual(a.scenarioHash, b.scenarioHash);
  assert.equal(a.scenarioHash, sortedA.scenarioHash);
  assert.equal(a.scenarioHash, restoredA.scenarioHash, 'revision-only A -> B -> undo -> A must reuse A');
  assert.equal(scenarioIsActive({ restoredTerminals: ['B1'] }), true);
  assert.equal(scenarioIsActive({ lines: [], switches: [], restoredTerminals: [], autoRestoreTerminals: true }), false);
  assert.notEqual(
    (await baseKey({ scenario: { lines: [], switches: [], autoRestoreTerminals: false } })).scenarioHash,
    (await baseKey({ scenario: { lines: [], switches: [], autoRestoreTerminals: true } })).scenarioHash,
  );
});

test('calculation history uses user-facing labels instead of internal enums', () => {
  const history = calculationHistoryText({
    finishedAt: '2026-09-25T10:00:00.000Z', engine: 'browser-approx', engineVersion: 'v5.5', mode: 'AC',
    convergence: 'NON_CONVERGED', validation: 'COMPLETE_UNVALIDATED', elapsedMs: 1200,
  });
  assert.match(history, /Tarayıcı Yaklaşık Çözüm/);
  assert.match(history, /Yakınsamadı/);
  assert.match(history, /Bağımsız referansla doğrulanmadı/);
  for (const internal of ['browser-approx', 'NON_CONVERGED', 'COMPLETE_UNVALIDATED']) assert.equal(history.includes(internal), false);
});

test('calculation job follows preparation, solve, serialization and completion', () => {
  let job = createCalculationJob('job');
  const now = new Date('2026-01-01T00:00:00Z');
  for (const state of ['PREPARING', 'TRANSFERRING', 'PREFLIGHT', 'SOLVING', 'SERIALIZING', 'COMPLETED']) {
    job = transitionCalculationJob(job, state, state, now);
  }
  assert.equal(job.state, 'COMPLETED');
  assert.equal(job.elapsedMs, 0);
  assert.throws(() => transitionCalculationJob(job, 'SOLVING', 'late'));
});

test('bus availability explains DC and non-converged AC results', () => {
  const result = mode => ({ convergence: 'CONVERGED', summary: { mode } });
  assert.equal(busAvailability(result('DC'), { inService: true, mapped: true, inScope: true, supplied: true, metric: 'voltage', numericValue: null }), 'DC_MODE_NO_VOLTAGE_MAGNITUDE');
  assert.equal(busAvailability(result('DC'), { inService: true, mapped: true, inScope: true, supplied: true, metric: 'reactivePower', numericValue: null }), 'DC_MODE_NO_REACTIVE_POWER');
  const failedAc = { convergence: 'NON_CONVERGED', summary: { mode: 'AC' } };
  assert.equal(busAvailability(failedAc, { inService: true, mapped: true, inScope: true, supplied: true, metric: 'voltage', numericValue: null }), 'AC_NON_CONVERGED');
  assert.equal(busAvailability(failedAc, { inService: false, mapped: true, inScope: true, supplied: true, metric: 'voltage', numericValue: null }), 'OUT_OF_SERVICE');
  const ac = result('AC');
  const base = { inService: true, mapped: true, inScope: true, supplied: true, metric: 'voltage', numericValue: null };
  assert.equal(busAvailability(ac, { ...base, inScope: false }), 'OUT_OF_SCOPE');
  assert.equal(busAvailability(ac, { ...base, mapped: false }), 'NOT_MAPPED');
  assert.equal(busAvailability(ac, { ...base, supplied: false }), 'UNSUPPLIED');
  assert.equal(busAvailability(ac, { ...base, numericValue: 110 }), 'AVAILABLE');
  assert.equal(busAvailability(ac, base), 'NO_NUMERIC_RESULT');
  assert.equal(resultAvailabilityFor({ convergence: 'NON_CONVERGED', summary: { mode: 'AC' } }).reasons.voltage, 'AC_NON_CONVERGED');
});

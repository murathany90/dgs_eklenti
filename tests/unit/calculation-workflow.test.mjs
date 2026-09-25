import test from 'node:test';
import assert from 'node:assert/strict';
import { calculationKeyId, createCalculationKey } from '../../src/analysis/calculation-key.ts';
import { createCalculationJob, transitionCalculationJob } from '../../src/analysis/calculation-job.ts';
import { busAvailability, resultAvailabilityFor } from '../../src/analysis/result-availability.ts';

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

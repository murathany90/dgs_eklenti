import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { EquipmentRegistry } from '../../src/model/equipment-registry.ts';
import { buildCanonicalNetwork } from '../../src/model/canonical-network.ts';
import { validCoordinate, validateNetwork } from '../../src/validation/validation.ts';
import { BrowserApproxSolver } from '../../src/solvers/browser-approx-solver.ts';

const fixture = JSON.parse(await readFile('docs/fixtures/dgs-smoke-from-20260923.json', 'utf8'));
test('registry resolves PowerFactory class rather than FID prefix', () => {
  const doc = { ElmLne: { Attributes: ['FID', 'loc_name', 'bus1', 'bus2'], Values: [['X100', 'Hat', 'C1', 'C2']] } };
  const registry = new EquipmentRegistry(doc);
  assert.equal(registry.kind('X100'), 'line');
  assert.deepEqual(registry.get('X100').terminals, ['C1', 'C2']);
});
test('YTBS coordinate profile is separate and customizable', () => {
  assert.equal(validCoordinate(35, 24), true);
  assert.equal(validCoordinate(42, 45), true);
  assert.equal(validCoordinate(34.9, 30), false);
  assert.equal(validCoordinate(36, 23.9), false);
  assert.equal(validCoordinate(34.9, 30, {name:'custom', latitude:[30,46], longitude:[20,50]}), true);
});
test('canonical model keeps core equipment classes from real DGS excerpt', () => {
  const network = buildCanonicalNetwork(fixture, 'smoke', 'hash');
  for (const key of ['substations','buses','terminals','lines','transformers','generators','loads','switches']) assert.ok(network[key].length > 0, key);
  const check = validateNetwork(network, fixture);
  assert.ok(check.findings.length > 0);
  assert.ok(['PARTIAL','INVALID','COMPLETE_UNVALIDATED'].includes(check.integrity));
});
test('capacity dataset matches recorded SHA-256 and row count', async () => {
  const raw = await readFile('assets/data/line-capacity-v1.json');
  const meta = JSON.parse(await readFile('assets/data/line-capacity-v1.meta.json', 'utf8'));
  assert.equal(createHash('sha256').update(raw).digest('hex'), meta.sha256);
  assert.equal(Object.keys(JSON.parse(raw)).length, meta.lineCount);
  assert.equal(meta.lineCount, 315);
});
test('legacy solver adapter labels approximations and reduced scope', async () => {
  let ran = false;
  const solver = new BrowserApproxSolver(async () => {ran=true;}, () => ({solved:1,total:1}));
  const result = await solver.runLoadFlow({modelId:'m',modelHash:'h'}, {mode:'AC'});
  assert.equal(ran, true);
  assert.equal(result.electricalScope, 'TRANSMISSION_REDUCED');
  assert.equal(result.convergence, 'CONVERGED');
  assert.match(result.warnings[0], /PowerFactory/);
});

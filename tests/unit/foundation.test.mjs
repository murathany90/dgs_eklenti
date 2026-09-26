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
  const solver = new BrowserApproxSolver(async () => {ran=true;}, () => ({solved:1,total:1}), () => [
    { cls: 'ElmTerm', id: 'B1', metric: 'V', value: 110 },
  ]);
  const result = await solver.runLoadFlow({modelId:'m',modelHash:'h'}, {mode:'AC'});
  assert.equal(ran, true);
  assert.equal(result.electricalScope, 'TRANSMISSION_REDUCED');
  assert.equal(result.convergence, 'CONVERGED');
  assert.ok(result.warnings.some(warning => /PowerFactory/.test(warning)));
});
test('browser adapter returns legacy rows and names canonical features it does not consume', async () => {
  const electrical = { buses: [{ id: 'B1', nominalKv: 110 }], lines: [{ id: 'L1', fromBus: 'B1', toBus: 'B2' }],
    transformers: [], internationalConnections: [{ id: 'VAC1', inService: true, pLoadMw: 12, qLoadMvar: -2 }], controls: [{ id: 'station:1', kind: 'STATION', inService: true }],
    secondaryControllers: [{ id: 'AGC' }], boundaries: [{ id: 'BND' }] };
  const solver = new BrowserApproxSolver(async () => {}, () => ({ solved: 1, total: 1, findings: { internationalConnections: {
    total: 1, inService: 1, mapped: 1, mappedIds: ['VAC1'], notMappedIds: [], pLoadMw: 12, qLoadMvar: -2, mode: 'FIXED_PQ_LOAD_APPROXIMATION',
  } } }), () => [
    { cls: 'ElmTerm', id: 'B1', metric: 'V', value: 111 },
    { cls: 'ElmLne', id: 'L1', metric: 'P', terminal: 'from', value: 10 },
    { cls: 'ElmLne', id: 'L1', metric: 'P', terminal: 'to', value: -9 },
  ]);
  const result = await solver.runLoadFlow({ modelId: 'm', modelHash: 'h', electrical }, { mode: 'AC' });
  assert.equal(result.buses[0].vPu, 111 / 110);
  assert.equal(result.branches[0].fromBus, 'B1');
  assert.equal(result.branches[0].pLossMw, 1);
  assert.equal(result.internationalConnections?.length, 1);
  assert.equal(result.internationalConnections?.[0].pMw, 12);
  assert.equal(result.internationalConnections?.[0].qMvar, -2);
  assert.equal(result.internationalConnections?.[0].mappingMode, 'FIXED_PQ_LOAD_APPROXIMATION');
  assert.ok(!result.unsupported.some(item => item.kind === 'ElmVac' && item.id === 'VAC1'));
  assert.ok(result.solverOptions.internationalConnectionMapping);
  assert.ok(result.unsupported.some(item => item.kind === 'ElmStactrl'));
  assert.equal(result.solverOptions.canonicalElectricalNetworkConsumed, false);
  assert.equal(result.electricalScope, 'TRANSMISSION_REDUCED');
});

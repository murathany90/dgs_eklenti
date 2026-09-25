import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { mapElectricalNetwork } from '../../src/model/dgs/electrical-network.ts';

for (const [file, buses, trafos] of [
  ['kontrol1/20260923_1200_SN3_TR0.json', 86479, 3682],
  ['kontrol1/20260925_1000_SN5_TR0.json', 86499, 3684],
]) {
  test(`full electrical DGS mapping: ${file}`, { skip: existsSync(file) ? false : 'SOURCE_UNAVAILABLE' }, () => {
    const raw = JSON.parse(readFileSync(file, 'utf8'));
    const mapped = mapElectricalNetwork(raw, file, 'local-regression');
    assert.equal(mapped.buses.length, buses);
    assert.equal(mapped.lines.length, 2382);
    assert.equal(mapped.transformers.length, trafos);
    assert.equal(mapped.switches.length > 95000, true);
    assert.equal(mapped.externalGrids.length, 1);
    assert.equal(mapped.findingCounts.UNKNOWN_TRANSFORMER_PHASE_SHIFT, trafos);
    assert.equal(mapped.completeness, 'PARTIAL');
  });
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { buildCanonicalNetwork } from '../../src/model/canonical-network.ts';
import { validateNetwork } from '../../src/validation/validation.ts';

const fixture = 'docs/fixtures/dgs-smoke-from-20260923.json';
test('checked-in real DGS excerpt parses into canonical network', async () => {
  const document = JSON.parse(await readFile(fixture, 'utf8'));
  const network = buildCanonicalNetwork(document, 'smoke', 'fixture');
  assert.equal(network.lines.length, document.ElmLne.Values.length);
  assert.equal(network.transformers.length, document.ElmTr2.Values.length);
  assert.equal(network.substations.length, document.ElmSite.Values.length);
  assert.equal(validateNetwork(network, document).findings.some(f => f.code === 'IMPOSSIBLE_COORDINATE'), true);
});
for (const name of ['20260923_1200_SN3_TR0.json', '20260925_1000_SN5_TR0.json']) {
  const path = `kontrol1/${name}`;
  let exists = false;
  try { exists = (await stat(path)).isFile(); } catch { /* CI has only the checked-in excerpt. */ }
  test(`full local DGS regression: ${name}`, { skip: !exists }, async () => {
    const document = JSON.parse(await readFile(path, 'utf8'));
    const network = buildCanonicalNetwork(document, name, 'local');
    const expected = name.startsWith('20260923') ? {tr:3682,site:1612,gen:2841,load:2523} : {tr:3684,site:1613,gen:2840,load:2525};
    assert.equal(network.lines.length, 2382);
    assert.equal(network.transformers.length, expected.tr);
    assert.equal(network.substations.length, expected.site);
    assert.equal(network.generators.length, expected.gen);
    assert.equal(network.loads.length, expected.load);
    assert.equal(network.seriesCompensators.length, 15);
    const quality = validateNetwork(network, document);
    assert.ok(quality.findings.length > 0);
  });
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { mapElectricalNetwork } from '../../src/model/dgs/electrical-network.ts';

for (const [file, buses, trafos, pv, controllers, activeControllers, solvedControllers, genStatQLimits] of [
  ['kontrol1/20260923_1200_SN3_TR0.json', 86479, 3682, 451, 488, 356, 39, 229],
  ['kontrol1/20260925_1000_SN5_TR0.json', 86499, 3684, 352, 479, 263, 30, 219],
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
    assert.equal(mapped.transformers.filter(item => item.phaseShiftDeg !== null).length, 0);
    assert.equal(mapped.transformers.filter(item => item.hvWindingConnection && item.lvWindingConnection).length, trafos);
    assert.equal(mapped.modelCoverage.pvGeneratorQLimits.total, pv);
    assert.equal(mapped.modelCoverage.pvGeneratorQLimits.available, pv);
    assert.equal(mapped.modelCoverage.elmGenStatQLimits.available, genStatQLimits);
    const stationControls = mapped.controls.filter(item => item.kind === 'STATION');
    assert.equal(stationControls.length, controllers);
    assert.equal(stationControls.filter(item => item.inService).length, activeControllers);
    assert.equal(stationControls.filter(item => item.mappingStatus === 'SOLVED').length, solvedControllers);
    assert.equal(stationControls.filter(item => item.mappingStatus === 'MAPPED_BUT_NOT_SOLVED').length, controllers - solvedControllers);
    assert.equal(mapped.findingCounts.UNRESOLVED_STATION_CONTROL_GENERATOR ?? 0, 0);
    assert.equal(mapped.findingCounts.UNRESOLVED_STATION_CONTROL_BUS ?? 0, 0);
    assert.equal(mapped.completeness, 'PARTIAL');
  });
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { mapElectricalNetwork } from '../../src/model/dgs/electrical-network.ts';

for (const [file, buses, trafos, pv, controllers, activeControllers, solvedControllers, genStatQLimits, activeElmVac] of [
  ['kontrol1/20260923_1200_SN3_TR0.json', 86479, 3682, 451, 488, 356, 39, 229, 7],
  ['kontrol1/20260925_1000_SN5_TR0.json', 86499, 3684, 352, 479, 263, 30, 219, 8],
]) {
  test(`full electrical DGS mapping: ${file}`, { skip: existsSync(file) ? false : 'SOURCE_UNAVAILABLE' }, () => {
    const bytes = readFileSync(file);
    const raw = JSON.parse(bytes.toString('utf8'));
    const sourceHash = createHash('sha256').update(bytes).digest('hex');
    const mapped = mapElectricalNetwork(raw, file, sourceHash);
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
    assert.equal(stationControls.filter(item => item.mappingStatus === 'MAPPED_BUT_NOT_SOLVED' || item.mappingStatus === 'APPROXIMATE').length, controllers - solvedControllers);
    const international = mapped.internationalConnections;
    assert.equal(international.length, 12);
    assert.equal(international.filter(item => item.inService).length, activeElmVac);
    assert.equal(international.filter(item => item.inService && item.mappingMode === 'FIXED_PQ_LOAD_APPROXIMATION').length, activeElmVac);
    if (file.includes('20260925')) {
      assert.ok(Math.abs(international.filter(item => item.inService).reduce((sum, item) => sum + item.pLoadMw, 0) - 785.98) < 1e-8);
      assert.ok(Math.abs(international.filter(item => item.inService).reduce((sum, item) => sum + item.qLoadMvar, 0) + 137.49) < 1e-8);
      const active = stationControls.filter(item => item.inService);
      assert.equal(active.filter(item => item.droopEnabled && item.controlledGeneratorIds.length === 1).length, 133);
      const multi = active.filter(item => !item.droopEnabled && item.controlledGeneratorIds.length > 1);
      assert.equal(multi.length, 100);
      assert.ok(multi.every(item => item.controlledGeneratorIds.length > 1));
      assert.equal(multi.filter(item => item.mappingStatus === 'APPROXIMATE').length, 34);
      assert.equal(active.filter(item => !item.droopEnabled && item.controlledGeneratorIds.length === 1).length, 30);
      assert.equal(sourceHash, 'fbb660ffb68df328defeb39b207c42afe9aef76f84be66a1afd0e68dfd76f781');
    }
    assert.equal(mapped.boundaries.length, 1);
    assert.equal(mapped.secondaryControllers.length, 1);
    assert.equal(mapped.secondaryControllers[0].measuredBoundaryId, 'BOUNDARY');
    assert.equal(mapped.loadFlowSettings.rawValues.iPbalancing, 3);
    assert.deepEqual(mapped.loadFlowSettings.rawValues, {
      iopt_lim: 1, itrlx: 100, ictrlx: 50, errlf: 5, erreq: 0.2, iPbalancing: 3,
      iopt_chctr: 0, iShowOutLoopMsg: 0, iopt_initOPF: 1, iItAlgStag: 20, iInterChg: 0, iInterType: 0,
    });
    assert.equal(mapped.findingCounts.UNRESOLVED_STATION_CONTROL_GENERATOR ?? 0, 0);
    assert.equal(mapped.findingCounts.UNRESOLVED_STATION_CONTROL_BUS ?? 0, 0);
    assert.equal(mapped.completeness, 'PARTIAL');
  });
}

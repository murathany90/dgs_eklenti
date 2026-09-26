import test from 'node:test';
import assert from 'node:assert/strict';
import { mapElectricalNetwork } from '../../src/model/dgs/electrical-network.ts';

function table(rows) {
  const attributes = [...new Set(rows.flatMap(row => Object.keys(row)))];
  return { Attributes: attributes, Values: rows.map(row => attributes.map(key => row[key] ?? null)) };
}
function fixture() {
  return {
    ElmTerm: table([{ FID: 'B1', uknom: 110 }, { FID: 'B2', uknom: 110 }, { FID: 'B3', uknom: 10 }]),
    StaCubic: table(['B1', 'B2', 'B3'].map((bus, i) => ({ FID: `C${i + 1}`, fold_id: bus }))),
    TypLne: table([{ FID: 'LT', uline: 110, rline: 0.1, xline: 0.4, bline: 5, sline: 0.8 }]),
    ElmLne: table([{ FID: 'L', bus1: 'C1', bus2: 'C2', typ_id: 'LT', dline: 10, outserv: 0 }]),
    ElmLnesec: table([]),
    TypTr2: table([{ FID: 'TT', strn: 100, utrn_h: 110, utrn_l: 10, uktr: 10, pcutr: 500,
      pfe: 10, curmg: 0.1, tap_side: 0, dutap: 1.25, nntap0: 0, ntpmn: -5, ntpmx: 5, shift_degree: 5 }]),
    ElmTr2: table([{ FID: 'T', bushv: 'C2', buslv: 'C3', typ_id: 'TT', nntap: 1, outserv: 0 }]),
    ElmSym: table([{ FID: 'G', bus1: 'C2', pgini: 20, qgini: 1, usetp: 1.02, cQ_min: -10, cQ_max: 10, av_mode: 'constv', outserv: 0 }]),
    ElmGenStat: table([{ FID: 'SG', bus1: 'C3', pgini: 5, qgini: 2, av_mode: 'constq', outserv: 0 }]),
    ElmLod: table([{ FID: 'D', bus1: 'C3', plini: 10, qlini: 3, outserv: 0 }]),
    ElmShnt: table([{ FID: 'S', bus1: 'C3', ushnm: 10, shtype: 2, qcapn: 2, ncapa: 1, ncapx: 1, iTaps: 0, outserv: 0 }]),
    ElmScap: table([{ FID: 'SC', bus1: 'C1', bus2: 'C2', ucn: 110, bcap: 0.5, outserv: 0 }]),
    ElmXnet: table([{ FID: 'X', bus1: 'C1', usetp: 1, va_degree: 0, outserv: 0 }]),
    ElmCoup: table([{ FID: 'SW', bus1: 'C1', bus2: 'C2', on_off: 1, outserv: 0 }]),
  };
}
const map = doc => mapElectricalNetwork(doc, 'fixture', 'hash');

test('ElmTerm and StaCubic resolve electrical buses', () => {
  const net = map(fixture());
  assert.deepEqual(net.buses.map(bus => bus.nominalKv), [110, 110, 10]);
  assert.equal(net.lines[0].fromBus, 'B1');
  assert.equal(net.lines[0].toBus, 'B2');
});
test('line R/X/B and current units map without inferred measurements', () => {
  const line = map(fixture()).lines[0];
  assert.equal(line.rOhm, 1);
  assert.equal(line.xOhm, 4);
  assert.ok(Math.abs(line.bSiemens - 50e-6) < 1e-12);
  assert.equal(line.ratedCurrentKa, 0.8);
});
test('line sections are aggregated and retain bottleneck rating', () => {
  const doc = fixture();
  doc.ElmLnesec = table([{ FID: 'LS1', fold_id: 'L', typ_id: 'LT', index: 1, dline: 4 },
    { FID: 'LS2', fold_id: 'L', typ_id: 'LT', index: 2, dline: 6 }]);
  const line = map(doc).lines[0];
  assert.equal(line.sections.length, 2);
  assert.equal(line.rOhm, 1);
  assert.deepEqual(line.sourceRefs.sectionFids, ['LS1', 'LS2']);
});
test('transformer impedance, tap and shift come from TypTr2 and ElmTr2', () => {
  const trafo = map(fixture()).transformers[0];
  assert.equal(trafo.vkPercent, 10);
  assert.equal(trafo.vkrPercent, 0.5);
  assert.equal(trafo.tapPosition, 1);
  assert.equal(trafo.phaseShiftDeg, 5);
});
test('generator PV/PQ, load and external grid retain source fields', () => {
  const net = map(fixture());
  assert.deepEqual(net.generators.map(generator => generator.controlMode), ['PV', 'PQ']);
  assert.equal(net.generators[0].qMaxMvar, 10);
  assert.equal(net.loads[0].pMw, 10);
  assert.equal(net.externalGrids[0].angleDeg, 0);
});
test('TypSym Q limits fill absent ElmSym limits with source finding', () => {
  const doc = fixture();
  doc.TypSym = table([{ FID: 'GT', Q_min: -6, Q_max: 7 }]);
  doc.ElmSym = table([{ FID: 'G', bus1: 'C2', pgini: 20, qgini: 1, usetp: 1.02, av_mode: 'constv', typ_id: 'GT', iqtype: 1, outserv: 0 }]);
  const net = map(doc);
  assert.equal(net.generators[0].qMinMvar, -6);
  assert.equal(net.generators[0].qMaxMvar, 7);
  assert.equal(net.findingCounts.GENERATOR_TYPE_Q_LIMIT, 2);
  assert.equal(net.generators[0].qLimitSource, 'TypSym.Q_min/Q_max');
});
test('ElmStactrl source data is retained as mapped but not solved', () => {
  const doc = fixture();
  doc.ElmStactrl = table([{ FID: 'CTRL', loc_name: 'Station controller', outserv: 0, rembar: 'B2', selBus: 0,
    usetp: 1.03, i_ctrl: 2, 'psym:SIZEROW': 1, 'psym:0': 'G', i_droop: 1, Srated: 80, ddroop: 4,
    imode: 1, qsetp: 12, pQmeas: 'QPOINT' }]);
  const net = map(doc);
  const control = net.controls.find(item => item.kind === 'STATION');
  assert.ok(control);
  assert.equal(control.controlledBus, 'B2');
  assert.deepEqual(control.controlledGeneratorIds, ['G']);
  assert.equal(control.setpoint, 1.03);
  assert.equal(control.controlModeCode, 2);
  assert.equal(control.reactiveSharingModeCode, 1);
  assert.equal(control.droopEnabled, true);
  assert.equal(control.droopRatedMvar, null);
  assert.equal(control.droopPercent, null);
  assert.equal(control.droopRatedRaw, 80);
  assert.equal(control.droopRawValue, 4);
  assert.equal(control.mappingStatus, 'MAPPED_BUT_NOT_SOLVED');
  assert.equal(net.modelCoverage.stationControlBus.available, 1);
});
test('ElmGenStat OPF option codes are not misread as numeric Q limits', () => {
  const doc = fixture();
  doc.ElmGenStat = table([{ FID: 'SG', bus1: 'C3', pgini: 5, qgini: 2, av_mode: 'constv', usetp: 1.02,
    iOPFCQmin: 1, iOPFCQmax: 1, outserv: 0 }]);
  doc.ElmSym = table([]);
  const net = map(doc);
  const staticGenerator = net.generators.find(item => item.id === 'SG');
  assert.equal(staticGenerator.qMinMvar, null);
  assert.equal(staticGenerator.qMaxMvar, null);
  assert.equal(net.modelCoverage.pvGeneratorQLimits.available, 0);
  assert.equal(net.modelCoverage.elmGenStatQLimits.available, 0);
  assert.equal(net.findingCounts.STATIC_GENERATOR_Q_LIMITS_UNAVAILABLE, 1);
});
test('shunt, series compensation, switch and controls map explicitly', () => {
  const net = map(fixture());
  assert.equal(net.shunts[0].qMvarPerStep, -2);
  assert.equal(net.seriesCompensators[0].xOhm, -2);
  assert.equal(net.switches[0].closed, true);
  assert.ok(net.controls.some(control => control.kind === 'VOLTAGE'));
  assert.ok(net.controls.some(control => control.kind === 'TAP'));
  assert.ok(net.controls.some(control => control.kind === 'SHUNT'));
});
test('missing parameter yields null and finding', () => {
  const doc = fixture();
  doc.TypTr2 = table([{ FID: 'TT', strn: 100, utrn_h: 110, utrn_l: 10, uktr: 10, pcutr: 500 }]);
  const net = map(doc);
  assert.equal(net.transformers[0].phaseShiftDeg, null);
  assert.equal(net.completeness, 'PARTIAL');
  assert.equal(net.findingCounts.UNKNOWN_TRANSFORMER_PHASE_SHIFT, 1);
});
test('transformer winding connections are retained without inventing vector-group angle', () => {
  const doc = fixture();
  doc.TypTr2.Attributes.push('tr2cn_h', 'tr2cn_l');
  doc.TypTr2.Values[0].push('YN', 'D');
  const shiftIndex = doc.TypTr2.Attributes.indexOf('shift_degree');
  if (shiftIndex >= 0) { doc.TypTr2.Attributes.splice(shiftIndex, 1); doc.TypTr2.Values[0].splice(shiftIndex, 1); }
  const net = map(doc);
  assert.equal(net.transformers[0].hvWindingConnection, 'YN');
  assert.equal(net.transformers[0].lvWindingConnection, 'D');
  assert.equal(net.transformers[0].vectorGroup, null);
  assert.equal(net.transformers[0].phaseShiftDeg, null);
  assert.equal(net.modelCoverage.transformerWindingConnection.available, 1);
  assert.equal(net.modelCoverage.transformerPhaseAngle.available, 0);
});

test('PV limits, station controller, ComLdf and tapped shunt use verified source values', () => {
  const doc = fixture();
  doc.ElmSym = table([]);
  doc.ElmGenStat = table([
    { FID: 'SG1', bus1: 'C1', ngnum: 2, pgini: 20, qgini: 3, av_mode: 'constv', usetp: 1.02, outserv: 0, pQlimType: 'QL1' },
    { FID: 'SG2', bus1: 'C2', ngnum: 1, pgini: 5, qgini: 4, av_mode: 'constv', usetp: 1.01, outserv: 0 },
  ]);
  doc.IntQlim = table([{ FID: 'QL1', 'cap_P:SIZEROW': 3, 'cap_P:0': 0, 'cap_P:1': 40, 'cap_P:2': 100,
    'cap_Qmn:SIZEROW': 3, 'cap_Qmn:0': -10, 'cap_Qmn:1': -20, 'cap_Qmn:2': -40,
    'cap_Qmx:SIZEROW': 3, 'cap_Qmx:0': 10, 'cap_Qmx:1': 20, 'cap_Qmx:2': 40 }]);
  doc.ElmStactrl = table([{ FID: 'CTRL', outserv: 0, rembar: 'B2', selBus: 0, usetp: 1.03, i_ctrl: 0,
    'psym:SIZEROW': 1, 'psym:0': 'SG1', i_droop: 0, imode: 0 }]);
  doc.ElmShnt = table([{ FID: 'R', bus1: 'C3', ushnm: 420, shtype: 1, qrean: 250, ncapa: 2, ncapx: 2,
    iTaps: 1, 'mTaps:SIZEROW': 3, 'mTaps:SIZECOL': 2, 'mTaps:0': 0, 'mTaps:1': 50, 'mTaps:2': 100 }]);
  doc.ComLdf = table([{ FID: 'LDF', iopt_lim: 1, itrlx: 100, ictrlx: 50, errlf: 5, erreq: 0.2, iPbalancing: 3 }]);
  const net = map(doc);
  const controlledGenerator = net.generators.find(item => item.id === 'SG1');
  const unresolvedPv = net.generators.find(item => item.id === 'SG2');
  const controller = net.controls.find(item => item.kind === 'STATION');
  assert.equal(controlledGenerator.pMw, 40);
  assert.equal(controlledGenerator.qMvar, 6);
  assert.equal(controlledGenerator.qMinMvar, -20);
  assert.equal(controlledGenerator.qMaxMvar, 20);
  assert.equal(controlledGenerator.qLimitSource, 'IntQlim.cap_Qmn/cap_Qmx@pgini');
  assert.equal(unresolvedPv.controlMode, 'UNKNOWN');
  assert.equal(unresolvedPv.qMvar, 4);
  assert.equal(controller.controlledBus, 'B2');
  assert.equal(controller.controllerMode, 'VOLTAGE');
  assert.equal(controller.mappingStatus, 'SOLVED');
  assert.equal(net.shunts[0].nominalKv, 420);
  assert.equal(net.shunts[0].totalQAtCurrentStepMvar, 100);
  assert.equal(net.shunts[0].qMvarPerStep, 50);
  assert.equal(net.shunts[0].tapTableLossDataAvailable, false);
  assert.equal(net.loadFlowSettings.enforceReactiveLimits, true);
  assert.equal(net.loadFlowSettings.maxNewtonIterations, 100);
  assert.equal(net.loadFlowSettings.maxOuterIterations, 50);
  assert.equal(net.loadFlowSettings.activePowerBalancingMode, 'UNKNOWN');
});

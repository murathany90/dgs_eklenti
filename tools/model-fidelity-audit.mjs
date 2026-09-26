import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { mapElectricalNetwork } from '../src/model/dgs/electrical-network.ts';

const path = process.argv[2] ?? 'kontrol1/20260925_1000_SN5_TR0.json';
const bytes = await readFile(path);
const hash = createHash('sha256').update(bytes).digest('hex');
const dgs = JSON.parse(bytes.toString('utf8'));
const network = mapElectricalNetwork(dgs, path.split(/[\\/]/).at(-1), hash);
const attrs = cls => dgs[cls]?.Attributes ?? [];
const rows = cls => dgs[cls]?.Values ?? [];
const index = (cls, field) => attrs(cls).indexOf(field);
const value = (cls, row, field) => { const at = index(cls, field); return at < 0 ? null : row[at]; };
const active = cls => rows(cls).filter(row => Number(value(cls, row, 'outserv')) !== 1);
const elmVac = active('ElmVac');
const stationRows = active('ElmStactrl');
const station = network.controls.filter(item => item.kind === 'STATION');
const activeStation = station.filter(item => item.inService);
const joint = { droopSingle: 0, droopMulti: 0, nonDroopSingle: 0, nonDroopMulti: 0 };
for (const row of stationRows) {
  const droop = Number(value('ElmStactrl', row, 'i_droop')) === 1;
  const n = Number(value('ElmStactrl', row, 'psym:SIZEROW')) || 0;
  joint[`${droop ? 'droop' : 'nonDroop'}${n > 1 ? 'Multi' : 'Single'}`]++;
}
const pLoad = elmVac.reduce((sum, row) => sum + (Number(value('ElmVac', row, 'Pload')) || 0), 0);
const qLoad = elmVac.reduce((sum, row) => sum + (Number(value('ElmVac', row, 'Qload')) || 0), 0);
const rawExpectedHash = 'fbb660ffb68df328defeb39b207c42afe9aef76f84be66a1afd0e68dfd76f781';
const report = {
  source: { path, bytes: bytes.length, sha256: hash, expectedSha256: rawExpectedHash, hashMatchesExpected: hash === rawExpectedHash },
  classes: Object.fromEntries(['ElmTerm', 'StaCubic', 'ElmCoup', 'StaSwitch', 'ElmLne', 'ElmLnesec', 'TypLne', 'ElmTr2', 'TypTr2',
    'ElmSym', 'TypSym', 'ElmGenStat', 'ElmLod', 'ElmShnt', 'ElmScap', 'ElmXnet', 'ElmVac', 'ElmStactrl', 'ElmSecctrl', 'ElmBoundary', 'ComLdf']
    .map(cls => [cls, { rows: rows(cls).length, attributes: attrs(cls) }])),
  internationalConnections: {
    total: rows('ElmVac').length, inService: elmVac.length,
    canonicalTotal: network.internationalConnections.length,
    canonicalFixedPqApproximation: network.internationalConnections.filter(item => item.mappingMode === 'FIXED_PQ_LOAD_APPROXIMATION').length,
    activePloadMw: pLoad, activeQloadMvar: qLoad,
  },
  stationControllers: {
    total: rows('ElmStactrl').length, inService: stationRows.length, jointDistribution: joint,
    activeMappedExactly: activeStation.filter(item => item.mappingStatus === 'SOLVED').length,
    activeMappedApproximately: activeStation.filter(item => item.mappingStatus === 'APPROXIMATE').length,
    activeUnsolved: activeStation.filter(item => item.mappingStatus === 'MAPPED_BUT_NOT_SOLVED').length,
    activeDroopPartial: activeStation.filter(item => item.droopEnabled === true).length,
    activeMultiApproximate: activeStation.filter(item => item.controlledGeneratorIds.length > 1 && item.mappingStatus === 'APPROXIMATE').length,
    cvqqAttributesPresent: attrs('ElmStactrl').filter(name => /^cvqq:\d+$/.test(name)),
  },
  secondaryControl: {
    secondaryControllerCount: network.secondaryControllers.length,
    boundaryCount: network.boundaries.length,
    measuredBoundaryIds: network.secondaryControllers.map(item => item.measuredBoundaryId),
    targetActivePowerMw: network.secondaryControllers.map(item => item.targetActivePowerMw),
    boundaryTargetActivePowerMw: network.boundaries.map(item => item.targetActivePowerMw),
  },
  comLdfRawValues: network.loadFlowSettings.rawValues,
  powerFactoryReference: 'NOT AVAILABLE',
};
await writeFile('docs/v6.1.6-model-audit.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));

import { readFile, writeFile, stat, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { basename, resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { mapElectricalNetwork } from '../src/model/dgs/electrical-network.ts';

const inputs = process.argv.slice(2).length ? process.argv.slice(2) : [
  'kontrol1/20260923_1200_SN3_TR0.json', 'kontrol1/20260925_1000_SN5_TR0.json',
];
const python = process.env.PYTHON_EXECUTABLE || 'python';
const tempRoot = await mkdtemp(join(tmpdir(), 'ytbs-full-validation-'));
const reports = [];
const pythonProgram = String.raw`
import collections, json, sys, time
from ytbs_solver_host.network_mapper import convert, prepare
from ytbs_solver_host.pandapower_adapter import run
path = sys.argv[1]
with open(path, encoding='utf-8') as stream: model = json.load(stream)
t0 = time.perf_counter(); prepared, diagnostic = prepare(model); preflight_ms = (time.perf_counter()-t0)*1000
output = {"preflightMs": preflight_ms, "diagnostics": diagnostic, "solves": []}
for mode in ("AC", "DC"):
    if mode == "AC": state = prepared
    else: state = convert(model)
    t0 = time.perf_counter(); result = run(model, mode, state, diagnostic); elapsed = (time.perf_counter()-t0)*1000
    output["solves"].append({"mode": mode, "elapsedMs": elapsed, "convergence": result["convergence"], "iterations": result["iterations"],
        "validation": result["validation"], "summary": result["summary"], "numericResultCounts": {"buses": len(result["buses"]), "branches": len(result["branches"]),
        "transformers": len(result["transformers"]), "generators": len(result["generators"])},
        "unsupportedCount": len(result["unsupported"]), "unsupportedByKind": dict(collections.Counter(item["kind"] for item in result["unsupported"])),
        "warnings": result["warnings"][:3]})
print(json.dumps(output, allow_nan=False, separators=(",", ":")))
`;

try {
  for (const input of inputs) {
    try { await stat(input); } catch { reports.push({ file: input, status: 'SKIP/SOURCE_UNAVAILABLE' }); console.log(`${input}: SKIP/SOURCE_UNAVAILABLE`); continue; }
    const readStart = performance.now();
    const bytes = await readFile(input);
    const readMs = performance.now() - readStart;
    const modelHash = createHash('sha256').update(bytes).digest('hex');
    const model = JSON.parse(bytes.toString('utf8'));
    const mapStart = performance.now();
    const electrical = mapElectricalNetwork(model, basename(input), modelHash);
    const mapMs = performance.now() - mapStart;
    electrical.modelId = basename(input);
    const networkPath = join(tempRoot, basename(input) + '.electrical.json');
    await writeFile(networkPath, JSON.stringify(electrical));
    const child = spawnSync(python, ['-c', pythonProgram, networkPath], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
    if (child.error || child.status !== 0) throw child.error ?? Error(`Python solver exited ${child.status}: ${child.stderr}`);
    const native = JSON.parse(child.stdout.trim());
    const stationControls = electrical.controls.filter(control => control.kind === 'STATION');
    const pv = electrical.generators.filter(generator => generator.inService && generator.controlMode === 'PV');
    const staticGenerators = electrical.generators.filter(generator => generator.sourceRefs.powerFactoryClass === 'ElmGenStat');
    const report = {
      file: input, status: 'PASS', sourceBytes: bytes.length, modelHash, readMs, electricalMappingMs: mapMs,
      electricalCounts: Object.fromEntries(['buses', 'lines', 'transformers', 'generators', 'loads', 'shunts', 'seriesCompensators', 'externalGrids', 'switches'].map(key => [key, electrical[key].length])),
      findings: electrical.findingCounts,
      qLimitCoverage: { pvUnits: pv.length, pvUnitsWithBothLimits: pv.filter(item => item.qMinMvar !== null && item.qMaxMvar !== null).length,
        elmGenStatUnits: staticGenerators.length, elmGenStatWithBothLimits: staticGenerators.filter(item => item.qMinMvar !== null && item.qMaxMvar !== null).length,
        iOPFCQminMaxUsedAsMvar: false },
      stationControls: { total: stationControls.length, inService: stationControls.filter(item => item.inService).length,
        controlledBus: stationControls.filter(item => item.controlledBus).length,
        withGeneratorReferences: stationControls.filter(item => item.controlledGeneratorIds?.length).length,
        mappedButNotSolved: stationControls.filter(item => item.mappingStatus === 'MAPPED_BUT_NOT_SOLVED').length,
        controlModeCodes: Object.fromEntries(stationControls.reduce((counts, item) => counts.set(String(item.controlModeCode), (counts.get(String(item.controlModeCode)) ?? 0) + 1), new Map())),
        reactiveSharingModeCodes: Object.fromEntries(stationControls.reduce((counts, item) => counts.set(String(item.reactiveSharingModeCode), (counts.get(String(item.reactiveSharingModeCode)) ?? 0) + 1), new Map())) },
      transformerPhaseCoverage: { total: electrical.transformers.length, phaseAngle: electrical.transformers.filter(item => item.phaseShiftDeg !== null).length,
        windingConnections: electrical.transformers.filter(item => item.hvWindingConnection && item.lvWindingConnection).length,
        vectorGroup: electrical.transformers.filter(item => item.vectorGroup !== null).length },
      engineCapabilities: electrical.engineCapabilities, modelCoverage: electrical.modelCoverage,
      preflightMs: native.preflightMs, preflight: native.diagnostics, solves: native.solves,
    };
    reports.push(report);
    console.log(`${basename(input)}: ${JSON.stringify({ status: report.status, electricalCounts: report.electricalCounts, qLimitCoverage: report.qLimitCoverage,
      stationControls: report.stationControls, transformerPhaseCoverage: report.transformerPhaseCoverage, preflightMs: report.preflightMs,
      preflight: report.preflight, solves: report.solves })}`);
  }
  await mkdir('artifacts', { recursive: true });
  await writeFile('artifacts/full-model-validation.json', JSON.stringify(reports, null, 2));
} finally { await rm(tempRoot, { recursive: true, force: true }); }

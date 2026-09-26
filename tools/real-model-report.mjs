#!/usr/bin/env node
// Runs actual local DGS models through the current canonical mapper and native solver.
// The Python side prints only compact reports, never full result payloads.
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { mapElectricalNetwork } from '../src/model/dgs/electrical-network.ts';
import { DgsContext, inService } from '../src/model/dgs/context.ts';

const mapOnly = process.argv.includes('--map-only');
const runDiagnostics = process.argv.includes('--diagnose');
const models = process.argv.slice(2).filter(argument => !['--map-only', '--diagnose'].includes(argument));
if (!models.length) throw new Error('Pass one or more DGS JSON paths.');
const python = resolve('native-host/python/.venv/Scripts/python.exe');
const pythonCode = String.raw`
import json, sys, collections, math, copy
from ytbs_solver_host.network_mapper import prepare
from ytbs_solver_host.pandapower_adapter import run, diagnose_ac

def compact_calc(data):
    if not isinstance(data, dict): return data
    control = data.get("outerControl") or {}
    controllers = control.get("controllers", [])
    counts = collections.Counter(item.get("status", "UNKNOWN") for item in controllers)
    return {key: data.get(key) for key in ("innerIterations", "outerIterations", "maxPMismatchMw", "maxQMismatchMvar",
        "voltagePuMin", "voltagePuMax", "pvToPqCount", "qMinHits", "qMaxHits", "residualStatus", "residualReason", "error")}

model = json.load(sys.stdin)
prepared, diagnostics = prepare(model)
raw_diagnosis = diagnose_ac(model, prepared=copy.deepcopy(prepared), diagnostics=diagnostics) if "--diagnose" in sys.argv else None
out = {"modelId": model.get("modelId"), "completeness": model.get("completeness"),
       "counts": {k: len(model.get(k, [])) for k in ("buses", "lines", "transformers", "generators", "loads", "externalGrids", "controls", "seriesCompensators")},
       "mappedGeneratorTables": {"gen": len(prepared[0].gen), "activeGen": int(prepared[0].gen.get("in_service", []).sum()) if len(prepared[0].gen) else 0,
          "sgen": len(prepared[0].sgen), "activeSgen": int(prepared[0].sgen.get("in_service", []).sum()) if len(prepared[0].sgen) else 0},
       "generatorModes": dict(collections.Counter(g.get("controlMode") for g in model.get("generators", []))),
       "preflight": {k: diagnostics[k] for k in ("inServiceBusCount", "initialPImbalanceMw", "pvUnitCount", "pvUnitsWithQLimitsCount",
          "pvBusCount", "pqBusCount", "elmGenStatQLimitCoverage", "stationControlCount", "stationControlsInService",
          "remoteVoltageControllersApplied", "reactiveSharingGroupsApplied", "droopControllersApplied", "transformerPhaseAngleCoverage",
          "candidateNonPositiveCompensatedPathCount", "unsupportedConversionCount")},
       "loadFlowSettings": diagnostics.get("loadFlowSettings")}
for mode in ("AC", "DC"):
    result = run(model, mode, prepared=copy.deepcopy(prepared), diagnostics=diagnostics)
    out[mode] = {"convergence": result["convergence"], "iterations": result.get("iterations"),
                 "solveMs": result.get("performance", {}).get("solveMs"), "summary": result.get("summary"),
                 "warnings": result.get("warnings", [])[:3], "calculationDiagnostics": compact_calc(result.get("calculationDiagnostics"))}
    if mode == "AC" and result["convergence"] == "CONVERGED":
        vals = [b.get("vPu") for b in result["buses"] if isinstance(b.get("vPu"), (int,float))]
        angles = [b.get("angleDeg") for b in result["buses"] if isinstance(b.get("angleDeg"), (int,float))]
        out[mode]["voltagePuRange"] = [min(vals), max(vals)] if vals else None
        out[mode]["angleDegRange"] = [min(angles), max(angles)] if angles else None
        out[mode]["maxLineLoadingPercent"] = max((b.get("loadingPercent") or 0 for b in result["branches"] if b.get("kind") == "LINE"), default=None)
        out[mode]["maxTransformerLoadingPercent"] = max((b.get("loadingPercent") or 0 for b in result["transformers"]), default=None)
if raw_diagnosis is not None:
    out["diagnoseAC"] = {"productionSettings": raw_diagnosis.get("productionSettings"),
        "engineeringHints": raw_diagnosis.get("engineeringHints"),
        "seriesCompensation": {"total": raw_diagnosis.get("seriesCompensation", {}).get("count"),
            "sensitiveCount": raw_diagnosis.get("seriesCompensation", {}).get("sensitiveCount")},
        "profiles": [{key: item.get(key) for key in ("profile", "initialization", "enforceQLimits", "convergence", "elapsedMs",
            "innerIterations", "outerIterations", "maxPMismatchMw", "maxQMismatchMvar", "voltagePuRange", "error", "userResult")}
            | {"control": {"appliedGroups": (item.get("control") or {}).get("appliedGroups"),
                "outerIterations": (item.get("control") or {}).get("outerIterations"),
                "qMinHits": (item.get("control") or {}).get("qMinHits"),
                "qMaxHits": (item.get("control") or {}).get("qMaxHits"),
                "unsatisfiedCount": len((item.get("control") or {}).get("unsatisfiedGroups", [])),
                "statusCounts": dict(collections.Counter(group.get("status", "UNKNOWN") for group in (item.get("control") or {}).get("controllers", [])))}}
            for item in raw_diagnosis.get("profiles", [])]}
print(json.dumps(out, allow_nan=False))
`;

for (const inputPath of models) {
  const absolute = resolve(inputPath);
  const raw = await readFile(absolute, 'utf8');
  const document = JSON.parse(raw);
  const modelHash = createHash('sha256').update(raw).digest('hex');
  const electrical = mapElectricalNetwork(document, absolute, modelHash);
  const sourceContext = new DgsContext(document);
  const activeSourceGenerators = ['ElmSym', 'ElmGenStat'].flatMap(cls => [...sourceContext.rows(cls)].filter(row => inService(row.outserv)));
  const sourceModeCounts = Object.fromEntries(['constv', 'constq', 'other'].map(mode => [mode, activeSourceGenerators.filter(row => {
    const rawMode = String(row.av_mode ?? '').toLowerCase();
    return mode === 'other' ? rawMode !== 'constv' && rawMode !== 'constq' : rawMode === mode;
  }).length]));
  const sourcePvBuses = new Set(activeSourceGenerators.filter(row => String(row.av_mode ?? '').toLowerCase() === 'constv')
    .map(row => sourceContext.busFromCubic(row.bus1)).filter(Boolean));
  const mappedActiveModes = Object.fromEntries(['PV','PQ','UNKNOWN'].map(mode => [mode,
    electrical.generators.filter(item => item.inService && item.controlMode === mode).length]));
  if (mapOnly) {
    const controls = electrical.controls.filter(item => item.kind === 'STATION');
    process.stdout.write(`${JSON.stringify({ file: absolute, dgsBytes: Buffer.byteLength(raw), modelHash,
      sourceModeCountsBefore: sourceModeCounts, sourcePvBusCountBefore: sourcePvBuses.size,
      generatorModesAfter: mappedActiveModes,
      qLimitCoverage: electrical.modelCoverage, stationMappingStatus: Object.fromEntries(['SOLVED','MAPPED_BUT_NOT_SOLVED','SOURCE_ONLY'].map(status => [status, controls.filter(item => item.mappingStatus === status).length])),
      stationControlsInService: controls.filter(item => item.inService).length,
      settings: electrical.loadFlowSettings,
      shunts: { total: electrical.shunts.length, table: electrical.shunts.filter(item => item.usesTapTable).length,
        tableQAvailable: electrical.shunts.filter(item => item.usesTapTable && item.totalQAtCurrentStepMvar !== null).length,
        activeTotalQmvar: electrical.shunts.filter(item => item.inService).reduce((sum, item) => sum + (item.totalQAtCurrentStepMvar ?? 0), 0) },
      seriesCompensators: electrical.seriesCompensators.filter(item => item.inService).length,
      findings: electrical.findingCounts })}\n`);
    continue;
  }
  const child = spawn(python, ['-c', pythonCode, ...(runDiagnostics ? ['--diagnose'] : [])], {
    cwd: resolve('native-host/python'), windowsHide: true,
    env: { ...process.env, PYTHONPATH: resolve('native-host/python') },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stdout = '', stderr = '';
  child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });
  child.stdin.on('error', () => {}); // Preserve child stderr when it exits before consuming a large model.
  child.stdin.end(JSON.stringify(electrical));
  const code = await new Promise((resolveExit, reject) => {
    child.once('error', reject);
    child.once('close', resolveExit);
  });
  if (code !== 0) throw new Error(`${absolute}: Python exit ${code}\n${stderr.slice(-6000)}\n${stdout.slice(-2000)}`);
  process.stdout.write(`${JSON.stringify({ file: absolute, dgsBytes: Buffer.byteLength(raw), modelHash, report: JSON.parse(stdout) })}\n`);
}

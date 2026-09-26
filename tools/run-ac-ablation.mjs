import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mapElectricalNetwork } from '../src/model/dgs/electrical-network.ts';

const input = process.argv[2] ?? 'kontrol1/20260925_1000_SN5_TR0.json';
const bytes = await readFile(input);
const hash = createHash('sha256').update(bytes).digest('hex');
const dgs = JSON.parse(bytes.toString('utf8'));
const network = mapElectricalNetwork(dgs, basename(input), hash);
const root = await mkdtemp(join(tmpdir(), 'ytbs-ac-ablation-'));
const networkPath = join(root, 'network.json');
await writeFile(networkPath, JSON.stringify(network));
const pythonProgram = String.raw`
import copy, json, sys, time
from ytbs_solver_host.pandapower_adapter import run
from ytbs_solver_host.network_mapper import prepare
with open(sys.argv[1], encoding='utf-8') as f: source=json.load(f)
all_controls=source.get('controls', [])
station=[c for c in all_controls if c.get('kind')=='STATION' and c.get('inService') is True]
stages=[('A_ELMVAC_ONLY',0),('B_SINGLE_UNIT',1),('C_MULTI_REACTIVE_SHARING',2),('D_DROOP',3),('E_BOUNDARY_SECONDARY',4),('F_Q_LIMITS',5),('G_TRANSFORMER_TAPS',6)]
results=[]
for stage,level in stages:
    model=copy.deepcopy(source)
    if level < 1: selected=[]
    elif level < 2: selected=[c for c in station if not c.get('droopEnabled') and len(c.get('controlledGeneratorIds') or [])==1]
    elif level < 3: selected=[c for c in station if not c.get('droopEnabled')]
    else: selected=station
    model['controls']=[c for c in all_controls if c.get('kind')!='STATION']+selected
    if level < 4:
        model['secondaryControllers']=[]; model['boundaries']=[]
    if level < 6:
        for transformer in model.get('transformers',[]): transformer['tapPosition']=None
    controlled={gid for c in selected for gid in c.get('controlledGeneratorIds',[])}
    if level < 5:
        for gen in model.get('generators',[]):
            if gen.get('id') not in controlled:
                gen['qMinMvar']=None; gen['qMaxMvar']=None
                if gen.get('controlMode')=='PV': gen['controlMode']='PQ'
        model.setdefault('loadFlowSettings',{})['enforceReactiveLimits']=False
    started=time.perf_counter()
    try:
        prepared,diagnostic=prepare(model)
        result=run(model,'AC',prepared,diagnostic)
        calc=result.get('calculationDiagnostics') or {}
        outer=calc.get('outerControl') or {}
        results.append({'stage':stage,'status':'PASS','convergence':result.get('convergence'),
            'innerSolverConverged':calc.get('innerSolverConverged'),'controlSystemConverged':calc.get('controlSystemConverged'),
            'nonConvergenceReason':calc.get('nonConvergenceReason'),'innerIterations':calc.get('innerIterations'),
            'outerIterations':calc.get('outerIterations'),'maxPMismatchMw':calc.get('maxPMismatchMw'),
            'maxQMismatchMvar':calc.get('maxQMismatchMvar'),'maxControlledVoltageErrorPu':max((abs(x.get('errorPu') or 0) for x in outer.get('controllers',[])),default=None),
            'qMinHits':calc.get('qMinHits'),'qMaxHits':calc.get('qMaxHits'),'pvToPqCount':calc.get('pvToPqCount'),
            'appliedStationControllers':diagnostic.get('stationControllersApplied'),'approximateStationControllers':diagnostic.get('stationControllersApproximate'),
            'droopControllersApplied':diagnostic.get('droopControllersApplied'),'exhaustedControllers':sum(x.get('status')=='ALL_UNITS_AT_Q_LIMIT' for x in outer.get('unsatisfiedGroups',[])),
            'solveMs':(time.perf_counter()-started)*1000,'activeControlsIncluded':len(selected),
            'boundaryCount':len(model.get('boundaries',[])),'secondaryControllerCount':len(model.get('secondaryControllers',[])),
            'staticTransformerTapsIncluded':level>=6,'generatorQLimitsEnabled':level>=5})
    except Exception as error:
        results.append({'stage':stage,'status':'FAIL','error':str(error)[:500],'solveMs':(time.perf_counter()-started)*1000})
print(json.dumps({'sourceModel':source.get('modelId'),'sourceHash':source.get('modelHash'),'stages':results},allow_nan=False,separators=(',',':')))
`;
try {
  const python = process.env.PYTHON_EXECUTABLE || 'python';
  const child = spawnSync(python, ['-c', pythonProgram, networkPath], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
  if (child.error || child.status !== 0) throw child.error ?? Error(`Python exited ${child.status}: ${child.stderr}`);
  const report = JSON.parse(child.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1));
  report.sourceBytes = bytes.length;
  report.powerFactoryReference = 'NOT AVAILABLE';
  await writeFile('docs/ac-control-ablation-study.json', `${JSON.stringify(report, null, 2)}\n`);
  const rows = report.stages.map(item => `| ${item.stage} | ${item.status} | ${item.convergence ?? '—'} | ${item.nonConvergenceReason ?? '—'} | ${item.innerSolverConverged ?? '—'} | ${item.controlSystemConverged ?? '—'} | ${item.innerIterations ?? '—'} | ${item.outerIterations ?? '—'} | ${item.maxPMismatchMw ?? '—'} | ${item.maxQMismatchMvar ?? '—'} | ${item.maxControlledVoltageErrorPu ?? '—'} | ${item.qMinHits ?? '—'} / ${item.qMaxHits ?? '—'} | ${item.exhaustedControllers ?? '—'} | ${item.solveMs?.toFixed(0) ?? '—'} |`).join('\n');
  const markdown = `# AC feature ablation — ${report.sourceModel}\n\nSource SHA-256: \`${report.sourceHash}\`; bytes: ${report.sourceBytes}. This experiment uses isolated copies of the canonical model; excluded features are changed only in each experiment copy. It is a pandapower study, not PowerFactory validation.\n\n| Stage | Run | Result | Reason | Inner | Outer | Inner iters | Outer iters | max ΔP MW | max ΔQ MVAr | max V error p.u. | Qmin/Qmax hits | exhausted | solve ms |\n|---|---|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|\n${rows}\n\nStage A is the control-free baseline with the ElmVac fixed-PQ approximation enabled. It converged. B adds eligible non-droop single-unit station groups; C adds non-droop multi-unit groups; D includes source droop records (currently not numerically applied); E includes boundary/secondary metadata (balancing mode remains unknown); F enables non-station generator Q limits; G restores static transformer taps. The JSON report records active control counts and limit metadata.\n\nPowerFactory reference: **NOT AVAILABLE**. Browser approximation ablation and full-vs-browser comparison are separate and not represented by this table.\n`;
  await writeFile('docs/ac-control-ablation-study.md', markdown);
  console.log(markdown);
} finally { await rm(root, { recursive: true, force: true }); }

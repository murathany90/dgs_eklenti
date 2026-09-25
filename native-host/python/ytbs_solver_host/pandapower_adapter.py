"""AC/DC entry point. Reports non convergence explicitly."""
import time
from datetime import datetime, timezone
import pandapower as pp
from pandapower.auxiliary import LoadflowNotConverged
from .network_mapper import convert, preflight
from .results import extract


def run(model, mode, prepared=None, diagnostics=None):
    if mode not in ("AC", "DC"):
        raise ValueError("mode must be AC or DC")
    if prepared is None:
        prepared = convert(model)
    net, ids, unsupported, conversion_ms = prepared
    diagnostics = diagnostics if diagnostics is not None else preflight(model, net, ids, unsupported)
    if net.ext_grid.empty:
        raise ValueError("no mapped external grid; cannot solve load flow")
    started = time.perf_counter()
    try:
        if mode == "AC":
            pp.runpp(net, algorithm="nr", calculate_voltage_angles=True, enforce_q_lims=True,
                     check_connectivity=True, init="auto", max_iteration=30, numba=False)
        else:
            pp.rundcpp(net, check_connectivity=True, numba=False)
    except LoadflowNotConverged as error:
        solve_ms = (time.perf_counter() - started) * 1000
        ppc = net.get("_ppc") or {}
        iteration_value = ppc.get("iterations")
        iterations = int(iteration_value) if isinstance(iteration_value, (int, float)) and iteration_value >= 0 else (30 if mode == "AC" else None)
        return {"schemaVersion": "2.0", "engine": "pandapower", "engineVersion": pp.__version__,
            "modelId": model.get("modelId"), "modelHash": model.get("modelHash"), "timestamp": datetime.now(timezone.utc).isoformat(),
            "topologyMode": "NODE_BREAKER", "electricalScope": "FULL", "convergence": "NON_CONVERGED",
            "iterations": iterations, "maxMismatch": None, "validation": "NON_CONVERGED", "warnings": [str(error)], "unsupported": unsupported,
            "buses": [], "branches": [], "transformers": [], "generators": [], "externalGrids": [], "losses": [],
            "summary": {"generationMw": None, "generationMvar": None, "loadMw": None, "loadMvar": None,
                "activeLossMw": None, "reactiveLossMvar": None, "busCount": 0, "lineCount": 0,
                "transformerCount": 0, "modelBusCount": diagnostics["modelCounts"]["bus"],
                "modelLineCount": diagnostics["modelCounts"]["line"], "modelTransformerCount": diagnostics["modelCounts"]["transformer"],
                "mappedBusCount": diagnostics["mappedCounts"]["bus"], "mappedLineCount": diagnostics["mappedCounts"]["line"],
                "mappedTransformerCount": diagnostics["mappedCounts"]["transformer"], "solveMs": solve_ms, "mode": mode},
            "preflight": diagnostics,
            "performance": {"conversionMs": conversion_ms, "solveMs": solve_ms}}
    solve_ms = (time.perf_counter() - started) * 1000
    result = extract(net, ids, model, mode, unsupported, solve_ms)
    result["preflight"] = diagnostics
    result["performance"] = {"conversionMs": conversion_ms, "solveMs": solve_ms}
    return result

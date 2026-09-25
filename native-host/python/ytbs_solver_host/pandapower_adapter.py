"""AC/DC entry point. Reports non convergence explicitly."""
import copy
import time
from datetime import datetime, timezone
import pandapower as pp
from pandapower.auxiliary import LoadflowNotConverged
from .network_mapper import convert, preflight
from .results import extract, result_availability


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
            "resultAvailability": result_availability(mode, "NON_CONVERGED"),
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
    result["resultAvailability"] = result_availability(mode, result["convergence"])
    result["preflight"] = diagnostics
    result["performance"] = {"conversionMs": conversion_ms, "solveMs": solve_ms}
    return result


def diagnose_ac(model, prepared=None, diagnostics=None):
    """Run isolated convergence profiles for engineering diagnosis only; never return a ResultSet."""
    if prepared is None:
        prepared, diagnostics = prepare(model)
    profiles = [
        {"id": "standard_nr", "algorithm": "nr", "init": "auto", "enforce_q_lims": True},
        {"id": "nr_without_q_limits", "algorithm": "nr", "init": "auto", "enforce_q_lims": False},
        # pandapower documents Iwamoto NR as more robust; it does not support Q-limit enforcement.
        {"id": "iwamoto_nr_diagnostic", "algorithm": "iwamoto_nr", "init": "dc", "enforce_q_lims": False},
    ]
    outcomes = []
    for profile in profiles:
        candidate, _, _, _ = copy.deepcopy(prepared)
        started = time.perf_counter()
        try:
            pp.runpp(candidate, algorithm=profile["algorithm"], calculate_voltage_angles=True,
                     enforce_q_lims=profile["enforce_q_lims"], check_connectivity=True,
                     init=profile["init"], max_iteration=30, numba=False)
            convergence, error = "CONVERGED", None
        except LoadflowNotConverged as exception:
            convergence, error = "NON_CONVERGED", str(exception)
        except Exception as exception:
            convergence, error = "ERROR", str(exception)
        outcomes.append({"profile": profile["id"], "algorithm": profile["algorithm"], "initialization": profile["init"],
                         "enforceQLimits": profile["enforce_q_lims"], "convergence": convergence,
                         "elapsedMs": (time.perf_counter() - started) * 1000, "error": error,
                         "userResult": False})
    by_profile = {item["profile"]: item["convergence"] for item in outcomes}
    hints = []
    if by_profile.get("standard_nr") == "NON_CONVERGED" and by_profile.get("nr_without_q_limits") == "CONVERGED":
        hints.append("Yakınsama problemi Q-limit enforcement ile ilişkili olabilir; bu profil kullanıcı sonucu değildir.")
    if by_profile.get("iwamoto_nr_diagnostic") == "CONVERGED":
        hints.append("Iwamoto NR tanı profili yakınsadı; alternatif profil PowerFactory referansı veya doğrulanmış çözüm değildir.")

    pairs = {}
    for item in model.get("lines", []):
        a, b = item.get("fromBus"), item.get("toBus")
        if item.get("inService") is not True or not isinstance(a, str) or not isinstance(b, str): continue
        key = tuple(sorted((a, b)))
        entry = pairs.setdefault(key, {"lineX": 0.0, "seriesX": 0.0, "lineIds": [], "compensatorIds": []})
        entry["lineX"] += float(item.get("xOhm") or 0.0); entry["lineIds"].append(item.get("id"))
    for item in model.get("seriesCompensators", []):
        a, b = item.get("fromBus"), item.get("toBus")
        if item.get("inService") is not True or not isinstance(a, str) or not isinstance(b, str): continue
        key = tuple(sorted((a, b)))
        entry = pairs.setdefault(key, {"lineX": 0.0, "seriesX": 0.0, "lineIds": [], "compensatorIds": []})
        entry["seriesX"] += float(item.get("xOhm") or 0.0); entry["compensatorIds"].append(item.get("id"))
    candidates = [{"buses": list(key), **entry, "netXOhm": entry["lineX"] + entry["seriesX"]}
                  for key, entry in pairs.items() if entry["compensatorIds"] and entry["lineX"] + entry["seriesX"] <= 0]
    return {"profiles": outcomes, "engineeringHints": hints,
            "seriesCompensationCandidates": {"count": len(candidates), "paths": candidates[:100], "truncated": len(candidates) > 100,
                "rule": "Direct bus-pair line X + series-compensator X; screening only; no element or impedance was changed."}}

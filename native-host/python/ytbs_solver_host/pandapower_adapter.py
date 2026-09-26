"""AC/DC entry point. Engineering diagnostics never become user ResultSets."""
import copy
import time
from datetime import datetime, timezone
import pandapower as pp
from pandapower.auxiliary import LoadflowNotConverged
from .control_coordinator import solve_with_controls
from .convergence_diagnostics import extract_ac_diagnostics
from .network_mapper import convert, preflight, prepare
from .results import extract, result_availability


def _effective_settings(diagnostics):
    configured = diagnostics.get("loadFlowSettings", {}) if isinstance(diagnostics, dict) else {}

    def value(name, fallback):
        entry = configured.get(name, {})
        candidate = entry.get("value") if isinstance(entry, dict) else None
        return candidate if isinstance(candidate, int) and not isinstance(candidate, bool) and candidate > 0 else fallback

    reactive = configured.get("enforceReactiveLimits", {})
    return {"maxNewtonIterations": value("maxNewtonIterations", 30),
            "maxOuterIterations": value("maxOuterIterations", 10),
            "enforceReactiveLimits": reactive.get("value") if isinstance(reactive, dict) and isinstance(reactive.get("value"), bool) else True,
            "sources": configured}


def _blank_nonconverged(model, diagnostics, unsupported, conversion_ms, mode, solve_ms, convergence_diagnostics, error=None):
    summary = diagnostics.get("modelCounts", {})
    mapped = diagnostics.get("mappedCounts", {})
    inner_iterations = convergence_diagnostics.get("innerIterations")
    iterations = sum(value for value in inner_iterations if isinstance(value, int)) if isinstance(inner_iterations, list) else convergence_diagnostics.get("innerIterations")
    warnings = []
    if error:
        warnings.append(str(error))
    if (convergence_diagnostics.get("outerControl") or {}).get("unsatisfiedGroups"):
        warnings.append("Remote voltage control target was not met; diagnostic-only state retained.")
    return {"schemaVersion": "2.0", "engine": "pandapower", "engineVersion": pp.__version__,
        "modelId": model.get("modelId"), "modelHash": model.get("modelHash"), "timestamp": datetime.now(timezone.utc).isoformat(),
        "topologyMode": "NODE_BREAKER", "electricalScope": "FULL", "convergence": "NON_CONVERGED",
        "iterations": iterations, "maxMismatch": None, "validation": "NON_CONVERGED", "warnings": warnings,
        "unsupported": unsupported, "buses": [], "branches": [], "transformers": [], "generators": [],
        "externalGrids": [], "losses": [],
        "resultAvailability": result_availability(mode, "NON_CONVERGED"),
        "summary": {"generationMw": None, "generationMvar": None, "loadMw": None, "loadMvar": None,
            "activeLossMw": None, "reactiveLossMvar": None, "busCount": 0, "lineCount": 0,
            "transformerCount": 0, "modelBusCount": summary.get("bus", 0), "modelLineCount": summary.get("line", 0),
            "modelTransformerCount": summary.get("transformer", 0), "mappedBusCount": mapped.get("bus", 0),
            "mappedLineCount": mapped.get("line", 0), "mappedTransformerCount": mapped.get("transformer", 0),
            "solveMs": solve_ms, "mode": mode},
        "preflight": diagnostics, "calculationDiagnostics": convergence_diagnostics,
        "performance": {"conversionMs": conversion_ms, "solveMs": solve_ms}}


def _run_ac_inner(net, options, outer_limit, model, ids, use_controls):
    if use_controls:
        # Station sgens are PQ actuators; the coordinator enforces their finite Q bounds itself.
        # pandapower's global Q-limit pass is needed only for remaining voltage-controlled gen rows.
        if not any(bool(value) for value in net.gen.get("in_service", [])):
            options = {**options, "enforce_q_lims": False}
        control_state = solve_with_controls(net, ids, model, options, outer_limit)
        if control_state.get("appliedGroups", 0) > 0:
            return control_state
    pp.runpp(net, **options)
    inner = (net.get("_ppc") or {}).get("iterations")
    return {"converged": True, "outerIterations": 0,
            "innerIterations": [int(inner)] if isinstance(inner, (int, float)) and inner >= 0 else [None],
            "appliedGroups": 0, "qMinHits": 0, "qMaxHits": 0, "pvToPqCount": 0,
            "unsatisfiedGroups": [], "mappingFindings": [], "voltageTolerancePu": 1e-4}


def run(model, mode, prepared=None, diagnostics=None):
    if mode not in ("AC", "DC"):
        raise ValueError("mode must be AC or DC")
    if prepared is None:
        prepared, diagnostics = prepare(model)
    net, ids, unsupported, conversion_ms = prepared
    diagnostics = diagnostics if diagnostics is not None else preflight(model, net, ids, unsupported)
    if net.ext_grid.empty:
        raise ValueError("no mapped external grid; cannot solve load flow")
    settings = _effective_settings(diagnostics)
    started = time.perf_counter()
    outer = None
    try:
        if mode == "AC":
            options = {"algorithm": "nr", "calculate_voltage_angles": True,
                "enforce_q_lims": settings["enforceReactiveLimits"], "check_connectivity": True,
                "init": "auto", "max_iteration": settings["maxNewtonIterations"], "numba": False}
            outer = _run_ac_inner(net, options, settings["maxOuterIterations"], model, ids, use_controls=True)
            if not outer.get("converged"):
                solve_ms = (time.perf_counter() - started) * 1000
                calc = extract_ac_diagnostics(net, ids, model, outer=outer)
                return _blank_nonconverged(model, diagnostics, unsupported, conversion_ms, mode, solve_ms, calc, outer.get("lastError"))
        else:
            pp.rundcpp(net, check_connectivity=True, numba=False)
    except LoadflowNotConverged as error:
        solve_ms = (time.perf_counter() - started) * 1000
        calc = extract_ac_diagnostics(net, ids, model, error=error, outer=outer)
        return _blank_nonconverged(model, diagnostics, unsupported, conversion_ms, mode, solve_ms, calc, error)
    except Exception as error:
        if mode == "AC":
            solve_ms = (time.perf_counter() - started) * 1000
            calc = extract_ac_diagnostics(net, ids, model, error=error, outer=outer)
            return _blank_nonconverged(model, diagnostics, unsupported, conversion_ms, mode, solve_ms, calc, error)
        raise
    solve_ms = (time.perf_counter() - started) * 1000
    result = extract(net, ids, model, mode, unsupported, solve_ms)
    result["resultAvailability"] = result_availability(mode, result["convergence"])
    result["preflight"] = diagnostics
    result["performance"] = {"conversionMs": conversion_ms, "solveMs": solve_ms}
    if mode == "AC":
        result["calculationDiagnostics"] = extract_ac_diagnostics(net, ids, model, outer=outer)
    return result


def diagnose_ac(model, prepared=None, diagnostics=None):
    """Run isolated AC convergence profiles. No profile returns numerical user-result rows."""
    if prepared is None:
        prepared, diagnostics = prepare(model)
    diagnostics = diagnostics if diagnostics is not None else preflight(model, prepared[0], prepared[1], prepared[2])
    settings = _effective_settings(diagnostics)
    profiles = [
        {"id": "standard_nr_q_limits_auto", "init": "auto", "enforce_q_lims": settings["enforceReactiveLimits"], "controls": False},
        {"id": "standard_nr_without_q_limits_auto", "init": "auto", "enforce_q_lims": False, "controls": False},
        {"id": "standard_nr_q_limits_dc_init", "init": "dc", "enforce_q_lims": settings["enforceReactiveLimits"], "controls": False},
        {"id": "control_aware_q_limits_auto", "init": "auto", "enforce_q_lims": settings["enforceReactiveLimits"], "controls": True},
        {"id": "control_aware_q_limits_dc_init", "init": "dc", "enforce_q_lims": settings["enforceReactiveLimits"], "controls": True},
    ]
    outcomes = []
    options_base = {"algorithm": "nr", "calculate_voltage_angles": True, "check_connectivity": True,
        "max_iteration": settings["maxNewtonIterations"], "numba": False}
    for profile in profiles:
        candidate, ids, unsupported, _ = copy.deepcopy(prepared)
        options = {**options_base, "init": profile["init"], "enforce_q_lims": profile["enforce_q_lims"]}
        started = time.perf_counter()
        outer = None
        try:
            if profile["controls"]:
                outer = _run_ac_inner(candidate, options, settings["maxOuterIterations"], model, ids, use_controls=True)
                if not outer.get("converged"):
                    convergence, error = "CONTROL_TARGET_UNMET", None
                else:
                    convergence, error = "CONVERGED", None
            else:
                pp.runpp(candidate, **options)
                convergence, error = "CONVERGED", None
        except LoadflowNotConverged as exception:
            convergence, error = "NON_CONVERGED", str(exception)
        except Exception as exception:
            convergence, error = "ERROR", str(exception)
        calc = extract_ac_diagnostics(candidate, ids, model, error=error, outer=outer)
        outcomes.append({"profile": profile["id"], "algorithm": "nr", "initialization": profile["init"],
            "enforceQLimits": profile["enforce_q_lims"], "convergence": convergence,
            "elapsedMs": (time.perf_counter() - started) * 1000, "error": error,
            "innerIterations": calc.get("innerIterations"), "outerIterations": calc.get("outerIterations"),
            "maxPMismatchMw": calc.get("maxPMismatchMw"), "maxQMismatchMvar": calc.get("maxQMismatchMvar"),
            "voltagePuRange": [calc.get("voltagePuMin"), calc.get("voltagePuMax")],
            "control": outer, "userResult": False, "unsupportedCount": len(unsupported)})

    by_profile = {item["profile"]: item["convergence"] for item in outcomes}
    hints = []
    if by_profile.get("standard_nr_q_limits_auto") == "NON_CONVERGED" and by_profile.get("standard_nr_without_q_limits_auto") == "CONVERGED":
        hints.append("Yakınsama Q-limit profiliyle ilişkili olabilir; limitsiz profil kullanıcı sonucu değildir.")
    if any(by_profile.get(name) == "CONVERGED" for name in ("standard_nr_q_limits_dc_init", "control_aware_q_limits_auto", "control_aware_q_limits_dc_init")):
        hints.append("Bir tanı profili yakınsadı; bu, doğrulanmış kullanıcı sonucu veya PowerFactory doğrulaması değildir.")
    series = prepared[0].get("ytbs_series_compensation_paths")
    if not isinstance(series, dict):
        from .series_compensation import series_compensation_paths
        series = series_compensation_paths(model)
    return {"profiles": outcomes, "engineeringHints": hints, "productionSettings": settings,
        "seriesCompensation": series, "userResult": False}

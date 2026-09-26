"""Best-effort diagnostics from verified pandapower 3.5.5 Newton state."""
import math


def _finite(value):
    try:
        return math.isfinite(float(value))
    except (TypeError, ValueError):
        return False


def _bus_labels(net, ids, model, bus_lookup):
    result = {}
    for item in model.get("buses", []):
        bus_idx = ids.get("bus", {}).get(item.get("id"))
        if bus_idx is None or bus_idx >= len(bus_lookup):
            continue
        ppc_idx = int(bus_lookup[bus_idx])
        if ppc_idx < 0:
            continue
        result.setdefault(ppc_idx, []).append(item.get("id"))
    return result


def _pv_to_pq_count(net, ids, model, internal, bus_lookup):
    pq = internal.get("pq")
    if pq is None:
        return None
    pq_indices = {int(value) for value in pq}
    changed = set()
    for item in model.get("generators", []):
        if item.get("inService") is not True or item.get("controlMode") != "PV" or item.get("id") not in ids.get("gen", {}):
            continue
        bus_idx = ids["bus"].get(item.get("bus"))
        if bus_idx is not None and bus_idx < len(bus_lookup) and int(bus_lookup[bus_idx]) in pq_indices:
            changed.add(item.get("id"))
    return len(changed)


def extract_ac_diagnostics(net, ids, model, error=None, outer=None):
    """Return only finite, sourced diagnostics. Missing internal arrays stay explicitly unavailable."""
    ppc = net.get("_ppc") if isinstance(net, dict) else None
    ppc = ppc if isinstance(ppc, dict) else {}
    internal = ppc.get("internal") if isinstance(ppc.get("internal"), dict) else ppc
    bus_lookup = getattr(net, "_pd2ppc_lookups", {}).get("bus") if hasattr(net, "_pd2ppc_lookups") else None
    unsatisfied = outer.get("unsatisfiedGroups", []) if isinstance(outer, dict) else []
    if error or (isinstance(outer, dict) and outer.get("lastError")) or any(item.get("status") == "INNER_NR_FAILED" for item in unsatisfied):
        reason = "INNER_NR_DIVERGED"
    elif any(item.get("status") == "ALL_UNITS_AT_Q_LIMIT" for item in unsatisfied):
        reason = "CONTROL_EXHAUSTED"
    elif unsatisfied:
        reason = "OUTER_CONTROL_DIVERGED"
    else:
        reason = None
    result = {
        "diagnosticOnly": True,
        "innerIterations": (sum(value for value in outer.get("innerIterations", []) if isinstance(value, int))
            if isinstance(outer, dict) and isinstance(outer.get("innerIterations"), list)
            else int(ppc["iterations"]) if _finite(ppc.get("iterations")) else None),
        "outerIterations": outer.get("outerIterations") if isinstance(outer, dict) else 0,
        "outerControl": outer,
        "innerSolverConverged": error is None and not (isinstance(outer, dict) and outer.get("lastError"))
            and not any(item.get("status") == "INNER_NR_FAILED" for item in unsatisfied),
        "controlSystemConverged": outer.get("converged") if isinstance(outer, dict) else None,
        "convergenceMethod": "NR",
        "nonConvergenceReason": reason,
        "maxPMismatchMw": None,
        "maxQMismatchMvar": None,
        "voltagePuMin": None,
        "voltagePuMax": None,
        "topPMismatchBuses": [],
        "topQMismatchBuses": [],
        "pvToPqCount": None,
        "qMinHits": None,
        "qMaxHits": None,
        "residualStatus": "UNAVAILABLE",
        "residualReason": None,
        "error": str(error)[:300] if error else None,
    }
    required = ("V", "Ybus", "Sbus", "baseMVA", "pv", "pq")
    if bus_lookup is None or any(key not in internal for key in required):
        result["residualReason"] = "pandapower 3.5.5 internal AC state or bus lookup is incomplete"
        return result
    try:
        import numpy as np
        voltage = np.asarray(internal["V"], dtype=complex).reshape(-1)
        target = np.asarray(internal["Sbus"], dtype=complex).reshape(-1)
        ybus = internal["Ybus"]
        base_mva = float(internal["baseMVA"])
        if len(voltage) != len(target) or ybus.shape != (len(voltage), len(voltage)) or not math.isfinite(base_mva) or base_mva <= 0:
            raise ValueError("inconsistent pandapower internal vector sizes/base")
        mismatch = (voltage * np.conj(ybus @ voltage) - target) * base_mva
        bus_labels = _bus_labels(net, ids, model, bus_lookup)
        p_equations = {int(value) for value in internal["pv"]} | {int(value) for value in internal["pq"]}
        q_equations = {int(value) for value in internal["pq"]}

        def ranked(indices, component):
            rows = []
            for index in indices:
                if index < 0 or index >= len(mismatch) or not _finite(mismatch[index].real if component == "p" else mismatch[index].imag):
                    continue
                value = float(mismatch[index].real if component == "p" else mismatch[index].imag)
                row = {"buses": sorted(bus_labels.get(index, [])), "residualMw" if component == "p" else "residualMvar": value,
                       "absoluteResidual": abs(value)}
                rows.append(row)
            return sorted(rows, key=lambda row: row["absoluteResidual"], reverse=True)[:20]

        p_rows, q_rows = ranked(p_equations, "p"), ranked(q_equations, "q")
        p_abs = max((row["absoluteResidual"] for row in p_rows), default=None)
        q_abs = max((row["absoluteResidual"] for row in q_rows), default=None)
        mapped_ppc_buses = [int(bus_lookup[index]) for index in ids.get("bus", {}).values()
            if index < len(bus_lookup) and int(bus_lookup[index]) >= 0 and int(bus_lookup[index]) < len(voltage)]
        vm = [float(abs(voltage[index])) for index in mapped_ppc_buses if _finite(abs(voltage[index]))]
        result.update({"maxPMismatchMw": p_abs, "maxQMismatchMvar": q_abs,
            "voltagePuMin": min(vm) if vm else None, "voltagePuMax": max(vm) if vm else None,
            "topPMismatchBuses": p_rows, "topQMismatchBuses": q_rows,
            "pvToPqCount": _pv_to_pq_count(net, ids, model, internal, bus_lookup),
            "residualStatus": "AVAILABLE", "residualReason": None})
        if isinstance(outer, dict) and isinstance(outer.get("qMinHits"), int) and isinstance(outer.get("qMaxHits"), int):
            result["qMinHits"], result["qMaxHits"] = outer["qMinHits"], outer["qMaxHits"]
        elif len(getattr(net, "res_gen", [])):
            min_hits = max_hits = 0
            available = True
            for item in model.get("generators", []):
                index = ids.get("gen", {}).get(item.get("id"))
                low, high = item.get("qMinMvar"), item.get("qMaxMvar")
                if index is None or not (_finite(low) and _finite(high)):
                    continue
                q = net.res_gen.at[index, "q_mvar"] if index in net.res_gen.index else None
                if not _finite(q):
                    available = False
                    continue
                min_hits += abs(float(q) - float(low)) <= 1e-4
                max_hits += abs(float(q) - float(high)) <= 1e-4
            if available:
                result["qMinHits"], result["qMaxHits"] = int(min_hits), int(max_hits)
        return result
    except Exception as exception:
        result["residualReason"] = f"pandapower internal residual extraction failed: {type(exception).__name__}: {exception}"[:300]
        return result

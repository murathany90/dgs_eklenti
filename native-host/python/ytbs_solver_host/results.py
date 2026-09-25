"""Typed ResultSet V2 extraction from pandapower tables."""
import math
from datetime import datetime, timezone


def clean(value):
    if value is None:
        return None
    try:
        number = float(value)
        return number if math.isfinite(number) else None
    except (TypeError, ValueError):
        return None


def extract(net, ids, model, mode, unsupported, elapsed_ms):
    quality = "CALCULATED"
    source = "pandapower"
    buses = []
    for item in model.get("buses", []):
        idx = ids["bus"].get(item.get("id"))
        if idx is None or idx not in net.res_bus.index:
            continue
        row = net.res_bus.loc[idx]
        vm = clean(row.get("vm_pu")) if mode == "AC" else None
        buses.append({"id": item["id"], "vPu": vm, "vKv": vm * item["nominalKv"] if vm is not None else None,
                      "angleDeg": clean(row.get("va_degree")), "quality": quality, "source": source})

    branches = []
    for item in model.get("lines", []):
        idx = ids["line"].get(item.get("id"))
        if idx is None or idx not in net.res_line.index:
            continue
        row = net.res_line.loc[idx]
        branches.append({"id": item["id"], "kind": "LINE", "fromBus": item.get("fromBus"), "toBus": item.get("toBus"),
            "from": _end(row, "from", mode), "to": _end(row, "to", mode), "loadingPercent": clean(row.get("loading_percent")) if mode == "AC" else None,
            "pLossMw": clean(row.get("pl_mw")) if mode == "AC" else None, "qLossMvar": clean(row.get("ql_mvar")) if mode == "AC" else None, "quality": quality, "source": source})
    for item in model.get("seriesCompensators", []):
        idx = ids["impedance"].get(item.get("id"))
        if idx is None or idx not in net.res_impedance.index:
            continue
        row = net.res_impedance.loc[idx]
        branches.append({"id": item["id"], "kind": "SERIES_COMPENSATOR", "fromBus": item.get("fromBus"), "toBus": item.get("toBus"),
            "from": _end(row, "from", mode), "to": _end(row, "to", mode), "loadingPercent": None,
            "pLossMw": clean(row.get("pl_mw")) if mode == "AC" else None, "qLossMvar": clean(row.get("ql_mvar")) if mode == "AC" else None, "quality": quality, "source": source})

    transformers = []
    for item in model.get("transformers", []):
        idx = ids["trafo"].get(item.get("id"))
        if idx is None or idx not in net.res_trafo.index:
            continue
        row = net.res_trafo.loc[idx]
        transformers.append({"id": item["id"], "hvBus": item.get("hvBus"), "lvBus": item.get("lvBus"),
            "hv": _end(row, "hv", mode), "lv": _end(row, "lv", mode), "loadingPercent": clean(row.get("loading_percent")) if mode == "AC" else None,
            "pLossMw": clean(row.get("pl_mw")) if mode == "AC" else None, "qLossMvar": clean(row.get("ql_mvar")) if mode == "AC" else None, "tapPosition": item.get("tapPosition"),
            "quality": quality, "source": source})

    generators = []
    for item in model.get("generators", []):
        group = "gen" if item.get("id") in ids["gen"] else "sgen"
        idx = ids[group].get(item.get("id"))
        table = net.res_gen if group == "gen" else net.res_sgen
        if idx is None or idx not in table.index:
            continue
        row = table.loc[idx]
        q = clean(row.get("q_mvar")) if mode == "AC" else None
        min_q, max_q = item.get("qMinMvar"), item.get("qMaxMvar")
        state = "AT_MIN" if q is not None and min_q is not None and abs(q - min_q) < 1e-5 else "AT_MAX" if q is not None and max_q is not None and abs(q - max_q) < 1e-5 else "WITHIN" if min_q is not None and max_q is not None else "UNKNOWN"
        bus_idx = ids["bus"].get(item.get("bus"))
        generators.append({"id": item["id"], "bus": item.get("bus"), "powerFactoryClass": item.get("sourceRefs", {}).get("powerFactoryClass"), "pMw": clean(row.get("p_mw")), "qMvar": q,
            "vPu": clean(net.res_bus.loc[bus_idx].get("vm_pu")) if mode == "AC" and bus_idx in net.res_bus.index else None,
            "limitState": state, "quality": quality, "source": source})

    external_grids = []
    for item in model.get("externalGrids", []):
        idx = ids["ext_grid"].get(item.get("id"))
        if idx is not None and idx in net.res_ext_grid.index:
            row = net.res_ext_grid.loc[idx]
            external_grids.append({"id": item["id"], "bus": item.get("bus"), "pMw": clean(row.get("p_mw")),
                "qMvar": clean(row.get("q_mvar")) if mode == "AC" else None, "quality": quality, "source": source})

    load_p = sum(item.get("pMw", 0) for item in model.get("loads", []) if item.get("id") in ids["load"] and item.get("inService"))
    load_q = sum(item.get("qMvar", 0) for item in model.get("loads", []) if item.get("id") in ids["load"] and item.get("inService"))
    gen_p = sum(item["pMw"] or 0 for item in generators) + sum(item["pMw"] or 0 for item in external_grids)
    gen_q = sum(item["qMvar"] or 0 for item in generators) + sum(item["qMvar"] or 0 for item in external_grids)
    loss_p = sum(item["pLossMw"] or 0 for item in branches + transformers) if mode == "AC" else None
    loss_q = sum(item["qLossMvar"] or 0 for item in branches + transformers) if mode == "AC" else None
    ppc = net.get('_ppc') or {}
    iteration_value = clean(ppc.get('iterations'))
    iterations = int(iteration_value) if iteration_value is not None else None
    return {"schemaVersion": "2.0", "engine": "pandapower", "engineVersion": __import__("pandapower").__version__,
        "modelId": model.get("modelId"), "modelHash": model.get("modelHash"), "timestamp": datetime.now(timezone.utc).isoformat(),
        "topologyMode": "NODE_BREAKER", "electricalScope": "FULL", "convergence": "CONVERGED", "iterations": iterations,
        "maxMismatch": None, "validation": "PARTIAL" if unsupported or model.get("completeness") != "COMPLETE" else "COMPLETE_UNVALIDATED",
        "warnings": ["pandapower convergence is not PowerFactory validation"], "unsupported": unsupported,
        "buses": buses, "branches": branches, "transformers": transformers, "generators": generators,
        "externalGrids": external_grids, "losses": [{"id": "network", "pMw": loss_p, "qMvar": loss_q}],
        "summary": {"generationMw": gen_p, "generationMvar": gen_q if mode == "AC" else None, "loadMw": load_p, "loadMvar": load_q if mode == "AC" else None,
                    "activeLossMw": loss_p, "reactiveLossMvar": loss_q, "busCount": len(buses),
                    "lineCount": len([item for item in model.get("lines", []) if item.get("id") in ids["line"]]),
                    "transformerCount": len(transformers),
                    "modelBusCount": len(model.get("buses", [])), "modelLineCount": len(model.get("lines", [])),
                    "modelTransformerCount": len(model.get("transformers", [])),
                    "mappedBusCount": len(ids["bus"]), "mappedLineCount": len(ids["line"]), "mappedTransformerCount": len(ids["trafo"]),
                    "solveMs": elapsed_ms,
                    "mode": mode}}


def _end(row, side, mode):
    p = clean(row.get(f"p_{side}_mw"))
    q = clean(row.get(f"q_{side}_mvar")) if mode == "AC" else None
    i = clean(row.get(f"i_{side}_ka")) if mode == "AC" else None
    return {"pMw": p, "qMvar": q, "sMva": math.hypot(p, q) if p is not None and q is not None else None,
            "iA": i * 1000 if i is not None else None}

"""Topology-aware series-compensation path checks; this module never changes the network."""
from collections import defaultdict


def _union_find(items):
    parent = {item: item for item in items}

    def find(item):
        while parent[item] != item:
            parent[item] = parent[parent[item]]
            item = parent[item]
        return item

    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[rb] = ra

    return parent, find, union


def series_compensation_paths(model):
    buses = {item.get("id") for item in model.get("buses", []) if isinstance(item.get("id"), str)}
    parent, find, union = _union_find(buses)
    for item in model.get("switches", []):
        if item.get("inService") is True and item.get("closed") is True:
            a, b = item.get("fromBus"), item.get("toBus")
            if a in parent and b in parent:
                union(a, b)

    graph = defaultdict(list)
    edge_by_id = {}
    terminations = set()
    for key in ("generators", "loads", "shunts", "externalGrids"):
        for item in model.get(key, []):
            if item.get("inService") is True and item.get("bus") in parent:
                terminations.add(find(item["bus"]))
    for item in model.get("transformers", []):
        if item.get("inService") is True:
            for key in ("hvBus", "lvBus"):
                if item.get(key) in parent:
                    terminations.add(find(item[key]))

    def add_edges(key, kind):
        for item in model.get(key, []):
            if item.get("inService") is not True:
                continue
            a, b = item.get("fromBus"), item.get("toBus")
            x = item.get("xOhm")
            if a not in parent or b not in parent or not isinstance(x, (int, float)):
                continue
            a, b = find(a), find(b)
            if a == b:
                continue
            edge = {"id": item.get("id"), "kind": kind, "a": a, "b": b, "xOhm": float(x), "nominalKv": item.get("nominalKv")}
            edge_by_id[edge["id"]] = edge
            graph[a].append(edge)
            graph[b].append(edge)

    add_edges("lines", "LINE")
    add_edges("seriesCompensators", "SERIES_COMPENSATOR")

    def trace(start, excluded_id):
        path, seen = [], set()
        current, previous_edge = start, None
        while current not in terminations:
            options = [edge for edge in graph[current] if edge["id"] != excluded_id and edge["id"] != previous_edge and edge["id"] not in seen]
            if len(options) != 1:
                break
            edge = options[0]
            if edge["kind"] != "LINE":
                break
            path.append(edge)
            seen.add(edge["id"])
            previous_edge = edge["id"]
            current = edge["b"] if edge["a"] == current else edge["a"]
            if len(graph[current]) != 2:
                break
        return path

    paths = []
    for item in model.get("seriesCompensators", []):
        if item.get("inService") is not True or item.get("id") not in edge_by_id:
            continue
        cap = edge_by_id[item["id"]]
        parallel_lines = [edge["id"] for edge in graph[cap["a"]]
            if edge["kind"] == "LINE" and {edge["a"], edge["b"]} == {cap["a"], cap["b"]}]
        if parallel_lines:
            paths.append({"compensatorId": cap["id"], "status": "NOT_A_SERIES_CHAIN", "lineIds": sorted(parallel_lines),
                          "lineXOhm": sum(edge_by_id[line_id]["xOhm"] for line_id in parallel_lines),
                          "capacitorXOhm": cap["xOhm"], "netXOhm": None,
                          "reason": "An active line has the same fused endpoint pair; this branch is parallel and is not counted as series-path X."})
            continue
        left = trace(cap["a"], cap["id"])
        right = trace(cap["b"], cap["id"])
        line_edges = left + right
        unique = {edge["id"]: edge for edge in line_edges}
        line_edges = list(unique.values())
        if not line_edges:
            paths.append({"compensatorId": cap["id"], "status": "PATH_UNRESOLVED", "lineIds": [], "lineXOhm": None,
                          "capacitorXOhm": cap["xOhm"], "netXOhm": None})
            continue
        line_x = sum(edge["xOhm"] for edge in line_edges)
        net_x = line_x + cap["xOhm"]
        base_kv = cap["nominalKv"] if isinstance(cap["nominalKv"], (int, float)) and cap["nominalKv"] > 0 else next(
            (edge["nominalKv"] for edge in line_edges if isinstance(edge["nominalKv"], (int, float)) and edge["nominalKv"] > 0), None)
        per_unit_x = net_x * 100 / (base_kv ** 2) if base_kv else None
        sensitive = net_x <= 0 or (per_unit_x is not None and 0 < abs(per_unit_x) < 1e-5)
        paths.append({"compensatorId": cap["id"], "status": "NUMERICALLY_SENSITIVE_SERIES_PATH" if sensitive else "RESOLVED",
                      "lineIds": sorted(unique), "lineXOhm": line_x, "capacitorXOhm": cap["xOhm"], "netXOhm": net_x,
                      "netXPu": per_unit_x, "voltageBaseKv": base_kv})
    return {"count": len(paths), "paths": paths, "sensitiveCount": sum(item["status"] == "NUMERICALLY_SENSITIVE_SERIES_PATH" for item in paths),
            "unresolvedCount": sum(item["status"] in ("PATH_UNRESOLVED", "NOT_A_SERIES_CHAIN") for item in paths),
            "rule": "Closed ElmCoup nodes are fused for diagnosis only. Trace degree-two active line chains from each active capacitor terminal, stopping at injections, transformer terminals, or branches. No source impedance or topology is changed."}

"""Bounded remote-voltage/Q sharing coordinator around pandapower's NR solver."""
import math

VOLTAGE_TOLERANCE_PU = 1e-4
# Numerical controls: 2% Q-capability probe, 2% secant-step cap, then 0.5 damping.
# These bound outer-loop movement; they are not physical droop or participation factors.
INITIAL_PROBE_FRACTION = 0.02
MAX_Q_STEP_FRACTION = 0.02
CONTROL_DAMPING = 0.5
Q_LIMIT_TOLERANCE_MVAR = 1e-4


def _finite(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _distribute_delta(current, target_total, shares, q_min, q_max):
    values = list(current)
    delta = target_total - sum(values)
    remaining = set(range(len(values)))
    while remaining and abs(delta) > Q_LIMIT_TOLERANCE_MVAR:
        weight_total = sum(shares[index] for index in remaining)
        if weight_total <= 0:
            return None
        consumed = 0.0
        saturated = set()
        for index in tuple(remaining):
            proposal = values[index] + delta * shares[index] / weight_total
            bounded = min(q_max[index], max(q_min[index], proposal))
            step = bounded - values[index]
            values[index] = bounded
            consumed += step
            if abs(bounded - proposal) > Q_LIMIT_TOLERANCE_MVAR:
                saturated.add(index)
        delta -= consumed
        remaining -= saturated
        if not saturated:
            break
        if abs(consumed) <= Q_LIMIT_TOLERANCE_MVAR:
            break
    if abs(delta) > Q_LIMIT_TOLERANCE_MVAR:
        return None
    return values


def _controller_groups(model, ids, net):
    groups, findings, seen_generators, seen_buses = [], [], set(), set()
    for control in model.get("controls", []):
        if control.get("kind") != "STATION" or control.get("inService") is not True:
            continue
        if control.get("mappingStatus") != "SOLVED" or control.get("controllerMode") != "VOLTAGE" or control.get("droopEnabled") is not False:
            continue
        bus_id = control.get("controlledBus")
        bus_idx = ids["bus"].get(bus_id)
        target = control.get("setpoint")
        members = control.get("controlledGeneratorIds") or []
        if bus_idx is None or not _finite(target) or not members:
            findings.append({"controllerId": control.get("id"), "status": "MAPPING_INCOMPLETE"})
            continue
        member_indices = [ids["sgen"].get(generator_id) for generator_id in members]
        if any(index is None for index in member_indices):
            findings.append({"controllerId": control.get("id"), "status": "ACTUATOR_UNAVAILABLE"})
            continue
        if bus_id in seen_buses or any(generator_id in seen_generators for generator_id in members):
            findings.append({"controllerId": control.get("id"), "status": "CONTROLLER_CONFLICT"})
            continue
        shares = control.get("controlledGeneratorShares")
        if len(members) == 1:
            shares = [1.0]
        if not isinstance(shares, list) or len(shares) != len(members) or not all(_finite(share) and share > 0 for share in shares):
            findings.append({"controllerId": control.get("id"), "status": "REACTIVE_SHARING_DATA_INCOMPLETE"})
            continue
        share_total = sum(shares)
        shares = [share / share_total for share in shares]
        q_min, q_max, current = [], [], []
        valid = True
        for index in member_indices:
            row = net.sgen.loc[index]
            low, high, q = row.get("min_q_mvar"), row.get("max_q_mvar"), row.get("q_mvar")
            if not (_finite(low) and _finite(high) and low <= high and _finite(q)):
                valid = False
                break
            q_min.append(float(low)); q_max.append(float(high)); current.append(float(q))
        if not valid:
            findings.append({"controllerId": control.get("id"), "status": "Q_LIMITS_UNAVAILABLE"})
            continue
        groups.append({"controllerId": control.get("id"), "busId": bus_id, "busIndex": bus_idx, "targetPu": float(target),
            "generatorIds": list(members), "indices": member_indices, "shares": shares, "qMin": q_min, "qMax": q_max,
            "history": None, "status": "RUNNING", "voltagePu": None, "errorPu": None})
        seen_buses.add(bus_id); seen_generators.update(members)
    return groups, findings


def solve_with_controls(net, ids, model, runpp_options, max_outer_iterations):
    """Run NR plus source-grounded singleton/weighted remote-voltage controls."""
    groups, mapping_findings = _controller_groups(model, ids, net)
    if not groups:
        net._ytbs_inner_iterations = []
        return {"converged": True, "outerIterations": 0, "innerIterations": [], "appliedGroups": 0,
                "qMinHits": 0, "qMaxHits": 0, "pvToPqCount": 0, "unsatisfiedGroups": [],
                "mappingFindings": mapping_findings, "voltageTolerancePu": VOLTAGE_TOLERANCE_PU}

    inner_iterations, last_error = [], None
    settled = set()
    pending_solution = False
    for outer_iteration in range(1, max_outer_iterations + 1):
        options = dict(runpp_options)
        if outer_iteration > 1:
            options["init"] = "results"
        net._ytbs_inner_iterations = inner_iterations
        net._ytbs_outer_iteration = outer_iteration
        try:
            import pandapower as pp
            pp.runpp(net, **options)
            pending_solution = False
        except Exception as error:
            last_error = error
            iteration = (net.get("_ppc") or {}).get("iterations")
            inner_iterations.append(int(iteration) if _finite(iteration) and iteration >= 0 else None)
            for group in groups:
                if group["status"] == "RUNNING":
                    group["status"] = "INNER_NR_FAILED"
            break
        iteration = (net.get("_ppc") or {}).get("iterations")
        inner_iterations.append(int(iteration) if _finite(iteration) and iteration >= 0 else None)
        proposals = []
        for group in groups:
            vm = float(net.res_bus.at[group["busIndex"], "vm_pu"])
            error_pu = group["targetPu"] - vm
            group["voltagePu"], group["errorPu"] = vm, error_pu
            if abs(error_pu) <= VOLTAGE_TOLERANCE_PU:
                group["status"] = "CONVERGED"
                settled.add(group["controllerId"])
                continue
            q = [float(net.sgen.at[index, "q_mvar"]) for index in group["indices"]]
            q_total = sum(q)
            low, high = sum(group["qMin"]), sum(group["qMax"])
            previous = group["history"]
            if previous is not None:
                previous_q, previous_vm = previous
                slope = (vm - previous_vm) / (q_total - previous_q) if abs(q_total - previous_q) > Q_LIMIT_TOLERANCE_MVAR else 0.0
                proposed_total = q_total + error_pu / slope if math.isfinite(slope) and abs(slope) > 1e-9 else math.nan
            else:
                # One bounded numerical probe measures the local voltage/Q response; it does not encode a physical droop gain.
                span = high - low
                # Generator Q is positive injection in pandapower; use its measured target-error direction.
                direction = 1.0 if error_pu > 0 else -1.0
                proposed_total = q_total + direction * span * INITIAL_PROBE_FRACTION
            if not _finite(proposed_total):
                group["status"] = "CONTROL_SENSITIVITY_UNAVAILABLE"
                continue
            # Cap each measured secant step to 2% of the source Q capability span,
            # then apply 0.5 damping. These are numerical safeguards, not a physical droop law.
            max_step = (high - low) * MAX_Q_STEP_FRACTION * CONTROL_DAMPING
            delta_q = max(-max_step, min(max_step, proposed_total - q_total))
            proposed_total = min(high, max(low, q_total + delta_q))
            redistributed = _distribute_delta(q, proposed_total, group["shares"], group["qMin"], group["qMax"])
            if redistributed is None:
                group["status"] = "ALL_UNITS_AT_Q_LIMIT"
                continue
            if all(abs(value - old) <= Q_LIMIT_TOLERANCE_MVAR for value, old in zip(redistributed, q)):
                at_limits = all(abs(old - low) <= Q_LIMIT_TOLERANCE_MVAR or abs(old - high) <= Q_LIMIT_TOLERANCE_MVAR
                    for old, low, high in zip(q, group["qMin"], group["qMax"]))
                group["status"] = "ALL_UNITS_AT_Q_LIMIT" if at_limits else "CONTROL_TARGET_UNMET"
                continue
            if outer_iteration >= max_outer_iterations:
                group["status"] = "CONTROL_TARGET_UNMET"
                continue
            group["history"] = (q_total, vm)
            proposals.append((group, redistributed))
        if all(group["status"] == "CONVERGED" for group in groups):
            break
        if not proposals:
            break
        for group, values in proposals:
            for index, value in zip(group["indices"], values):
                net.sgen.at[index, "q_mvar"] = value
        pending_solution = bool(proposals)

    if pending_solution:
        # This can only be true when max_outer_iterations is zero; do not publish an unsolved update.
        for group in groups:
            if group["status"] == "RUNNING": group["status"] = "CONTROL_TARGET_UNMET"

    q_min_hits = q_max_hits = 0
    controlled_ids = {generator_id for group in groups for generator_id in group["generatorIds"]}
    for group in groups:
        for low, high, index in zip(group["qMin"], group["qMax"], group["indices"]):
            q = float(net.sgen.at[index, "q_mvar"])
            q_min_hits += abs(q - low) <= Q_LIMIT_TOLERANCE_MVAR
            q_max_hits += abs(q - high) <= Q_LIMIT_TOLERANCE_MVAR
    unsatisfied = [{"controllerId": group["controllerId"], "status": group["status"], "targetPu": group["targetPu"],
        "voltagePu": group["voltagePu"], "errorPu": group["errorPu"]} for group in groups if group["status"] != "CONVERGED"]
    converged = not unsatisfied
    net._ytbs_inner_iterations = inner_iterations
    net._ytbs_outer_iteration = len(inner_iterations)
    return {"converged": converged, "outerIterations": len(inner_iterations), "innerIterations": inner_iterations,
        "appliedGroups": len(groups), "qMinHits": int(q_min_hits), "qMaxHits": int(q_max_hits),
        "pvToPqCount": 0, "unsatisfiedGroups": unsatisfied, "mappingFindings": mapping_findings,
        "controllers": [{"controllerId": group["controllerId"], "status": group["status"], "targetPu": group["targetPu"],
            "voltagePu": group["voltagePu"], "errorPu": group["errorPu"], "generatorIds": group["generatorIds"]} for group in groups],
        "voltageTolerancePu": VOLTAGE_TOLERANCE_PU,
        "lastError": str(last_error) if last_error else None,
        "controlledGeneratorIds": sorted(controlled_ids)}

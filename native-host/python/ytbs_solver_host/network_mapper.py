"""Explicit electrical canonical model to pandapower mapping."""
import math
import time
import pandapower as pp
from .series_compensation import series_compensation_paths


def _number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _positive(value):
    return _number(value) and value > 0


def convert(model):
    if not isinstance(model, dict) or not isinstance(model.get("buses"), list):
        raise ValueError("invalid electrical canonical network")
    started = time.perf_counter()
    net = pp.create_empty_network(f_hz=50.0, sn_mva=100.0)
    ids = {kind: {} for kind in ("bus", "line", "trafo", "gen", "sgen", "load", "international", "shunt", "ext_grid", "switch", "impedance")}
    unsupported = []
    def missing(kind, item, reason):
        unsupported.append({"kind": kind, "id": str(item.get("id", "?")), "reason": reason})
    def endpoints(item, *keys):
        return all(item.get(key) in ids["bus"] for key in keys)

    valid_buses = []
    for bus in model["buses"]:
        if not isinstance(bus, dict) or not isinstance(bus.get("id"), str) or not _positive(bus.get("nominalKv")):
            missing("bus", bus, "missing id or nominalKv")
            continue
        valid_buses.append(bus)
    if valid_buses:
        indices = pp.create_buses(net, len(valid_buses), vn_kv=[bus["nominalKv"] for bus in valid_buses],
            name=[bus.get("name") for bus in valid_buses], in_service=[bus.get("inService") is True for bus in valid_buses])
        ids["bus"].update((bus["id"], int(index)) for bus, index in zip(valid_buses, indices))

    valid_lines = []
    for item in model.get("lines", []):
        if not endpoints(item, "fromBus", "toBus") or not all(_positive(item.get(key)) for key in ("lengthKm", "ratedCurrentKa")) or not all(_number(item.get(key)) for key in ("rOhm", "xOhm", "bSiemens")):
            missing("line", item, "missing terminals, R/X/B, length or rating")
            continue
        length = item["lengthKm"]
        # B=2*pi*f*C; pandapower expects total line capacitance in nF/km.
        capacitance = item["bSiemens"] / length / (2 * math.pi * net.f_hz) * 1e9
        valid_lines.append((item, capacitance))
        if len(item.get("sections", [])) > 1:
            missing("line_sections", item, "sections aggregated into equivalent PI line; bottleneck current retained")

    if valid_lines:
        items = [entry[0] for entry in valid_lines]
        indices = pp.create_lines_from_parameters(net,
            [ids["bus"][item["fromBus"]] for item in items], [ids["bus"][item["toBus"]] for item in items],
            length_km=[item["lengthKm"] for item in items],
            r_ohm_per_km=[item["rOhm"] / item["lengthKm"] for item in items],
            x_ohm_per_km=[item["xOhm"] / item["lengthKm"] for item in items],
            c_nf_per_km=[entry[1] for entry in valid_lines],
            max_i_ka=[item["ratedCurrentKa"] for item in items],
            name=[item.get("name") for item in items], in_service=[item.get("inService") is True for item in items])
        ids["line"].update((item["id"], int(index)) for item, index in zip(items, indices))

    valid_trafos = []
    for item in model.get("transformers", []):
        required = ("snMva", "vnHvKv", "vnLvKv", "vkPercent", "vkrPercent")
        if not endpoints(item, "hvBus", "lvBus") or not all(_positive(item.get(key)) for key in required[:4]) or not _number(item.get("vkrPercent")):
            missing("trafo", item, "missing terminals or nameplate impedance")
            continue
        if item["vkrPercent"] > item["vkPercent"]:
            missing("trafo", item, "vkr exceeds vk")
            continue
        shift = item.get("phaseShiftDeg")
        if not _number(shift):
            shift = 0.0
            missing("trafo_phase_shift", item, "source shift absent; 0 degree assumed for approximate calculation")
        tap_kwargs = {}
        if item.get("tapSide") in ("hv", "lv") and all(_number(item.get(key)) for key in ("tapPosition", "tapNeutral", "tapStepPercent")):
            tap_kwargs = {"tap_side": item["tapSide"], "tap_pos": item["tapPosition"], "tap_neutral": item["tapNeutral"],
                "tap_min": item.get("tapMin", math.nan), "tap_max": item.get("tapMax", math.nan), "tap_step_percent": item["tapStepPercent"], "tap_changer_type": "Ratio"}
        elif item.get("tapPosition") is not None:
            missing("trafo_tap", item, "tap parameters incomplete")
        valid_trafos.append((item, shift, tap_kwargs))
        if item.get("pfeKw") is None or item.get("i0Percent") is None:
            missing("trafo_no_load", item, "missing iron loss or magnetizing current; zero assumed")

    if valid_trafos:
        items = [entry[0] for entry in valid_trafos]
        indices = pp.create_transformers_from_parameters(net,
            [ids["bus"][item["hvBus"]] for item in items], [ids["bus"][item["lvBus"]] for item in items],
            sn_mva=[item["snMva"] for item in items], vn_hv_kv=[item["vnHvKv"] for item in items],
            vn_lv_kv=[item["vnLvKv"] for item in items], vkr_percent=[item["vkrPercent"] for item in items],
            vk_percent=[item["vkPercent"] for item in items],
            pfe_kw=[item["pfeKw"] if _number(item.get("pfeKw")) else 0.0 for item in items],
            i0_percent=[item["i0Percent"] if _number(item.get("i0Percent")) else 0.0 for item in items],
            shift_degree=[entry[1] for entry in valid_trafos],
            tap_side=[entry[2].get("tap_side") for entry in valid_trafos],
            tap_pos=[entry[2].get("tap_pos", math.nan) for entry in valid_trafos],
            tap_neutral=[entry[2].get("tap_neutral", math.nan) for entry in valid_trafos],
            tap_min=[entry[2].get("tap_min", math.nan) for entry in valid_trafos],
            tap_max=[entry[2].get("tap_max", math.nan) for entry in valid_trafos],
            tap_step_percent=[entry[2].get("tap_step_percent", math.nan) for entry in valid_trafos],
            tap_changer_type=[entry[2].get("tap_changer_type") for entry in valid_trafos],
            name=[item.get("name") for item in items], in_service=[item.get("inService") is True for item in items])
        ids["trafo"].update((item["id"], int(index)) for item, index in zip(items, indices))

    settings = model.get("loadFlowSettings") if isinstance(model.get("loadFlowSettings"), dict) else {}
    net["ytbs_load_flow_settings"] = settings
    station_controls = [item for item in model.get("controls", []) if item.get("kind") == "STATION" and item.get("inService") is True]
    net["ytbs_station_controls"] = station_controls
    solved_station_members = {generator_id for control in station_controls if control.get("mappingStatus") in ("SOLVED", "APPROXIMATE")
        and control.get("controllerMode") == "VOLTAGE" and control.get("droopEnabled") is False
        for generator_id in control.get("controlledGeneratorIds", [])}
    all_station_members = {generator_id for control in station_controls for generator_id in control.get("controlledGeneratorIds", [])}

    valid_pv, valid_pq, valid_station = [], [], []
    for item in model.get("generators", []):
        if not endpoints(item, "bus") or not _number(item.get("pMw")):
            missing("generator", item, "missing bus or P")
            continue
        mode = item.get("controlMode")
        has_q_limits = _number(item.get("qMinMvar")) and _number(item.get("qMaxMvar")) and item["qMinMvar"] <= item["qMaxMvar"]
        if item.get("id") in solved_station_members and has_q_limits and _number(item.get("qMvar")):
            valid_station.append(item)
        elif item.get("id") in all_station_members:
            if _number(item.get("qMvar")):
                valid_pq.append(item)
            missing("station_control", item, "station control unresolved; retained as fixed-q snapshot and excluded from PV regulation")
        elif mode == "PV" and _positive(item.get("vmPu")) and has_q_limits:
            valid_pv.append(item)
        elif _number(item.get("qMvar")):
            valid_pq.append(item)
            if mode == "PV":
                missing("generator_control_mode", item, "PV request has no finite ordered Q bounds; retained as fixed-q snapshot")
        else:
            missing("generator", item, "unknown control mode or missing Q snapshot; element not numerically guessed")
        if item.get("remoteControlBus") or item.get("participationFactor") or item.get("droop"):
            missing("generator_control", item, "remote regulation, Q sharing or droop unsupported")

    if valid_pv:
        indices = pp.create_gens(net, [ids["bus"][item["bus"]] for item in valid_pv],
            p_mw=[item["pMw"] for item in valid_pv], vm_pu=[item["vmPu"] for item in valid_pv],
            min_q_mvar=[item["qMinMvar"] if _number(item.get("qMinMvar")) else math.nan for item in valid_pv],
            max_q_mvar=[item["qMaxMvar"] if _number(item.get("qMaxMvar")) else math.nan for item in valid_pv],
            name=[item.get("name") for item in valid_pv], in_service=[item.get("inService") is True for item in valid_pv])
        ids["gen"].update((item["id"], int(index)) for item, index in zip(valid_pv, indices))
    if valid_pq:
        # pandapower clips SGEN q_mvar to min/max when enforce_q_lims is enabled.
        # Preserve fixed-PQ source qgini; limits belong on PV gens or controlled actuators only.
        indices = pp.create_sgens(net, [ids["bus"][item["bus"]] for item in valid_pq],
            p_mw=[item["pMw"] for item in valid_pq], q_mvar=[item["qMvar"] for item in valid_pq],
            name=[item.get("name") for item in valid_pq], in_service=[item.get("inService") is True for item in valid_pq])
        ids["sgen"].update((item["id"], int(index)) for item, index in zip(valid_pq, indices))

    if valid_station:
        indices = pp.create_sgens(net, [ids["bus"][item["bus"]] for item in valid_station],
            p_mw=[item["pMw"] for item in valid_station], q_mvar=[item["qMvar"] for item in valid_station],
            min_q_mvar=[item["qMinMvar"] for item in valid_station], max_q_mvar=[item["qMaxMvar"] for item in valid_station],
            name=[item.get("name") for item in valid_station], in_service=[item.get("inService") is True for item in valid_station])
        ids["sgen"].update((item["id"], int(index)) for item, index in zip(valid_station, indices))

    for item in model.get("externalGrids", []):
        if not endpoints(item, "bus") or not _positive(item.get("vmPu")):
            missing("external_grid", item, "missing bus or voltage setpoint")
            continue
        angle = item.get("angleDeg")
        if not _number(angle):
            angle = 0.0
            missing("external_grid_angle", item, "source angle absent; 0 degree reference selected")
        ids["ext_grid"][item["id"]] = pp.create_ext_grid(net, ids["bus"][item["bus"]], vm_pu=item["vmPu"], va_degree=angle,
            name=item.get("name"), in_service=item.get("inService") is True)

    valid_loads = []
    for item in model.get("loads", []):
        if not endpoints(item, "bus") or not all(_number(item.get(key)) for key in ("pMw", "qMvar")):
            missing("load", item, "missing bus, P or Q")
            continue
        valid_loads.append(item)
    if valid_loads:
        indices = pp.create_loads(net, [ids["bus"][item["bus"]] for item in valid_loads],
            p_mw=[item["pMw"] for item in valid_loads], q_mvar=[item["qMvar"] for item in valid_loads],
            name=[item.get("name") for item in valid_loads], in_service=[item.get("inService") is True for item in valid_loads])
        ids["load"].update((item["id"], int(index)) for item, index in zip(valid_loads, indices))

    # ElmVac is not an ext_grid. Preserve the source model and use its explicit Pload/Qload
    # only through this clearly labelled fixed-PQ approximation.
    valid_international = []
    for item in model.get("internationalConnections", []):
        if item.get("mappingMode") != "FIXED_PQ_LOAD_APPROXIMATION":
            missing("international_connection", item, "ElmVac source behavior is preserved but unsupported by the fixed-PQ adapter")
            continue
        if not endpoints(item, "bus") or not all(_number(item.get(key)) for key in ("pLoadMw", "qLoadMvar")):
            missing("international_connection", item, "missing bus or Pload/Qload")
            continue
        valid_international.append(item)
    if valid_international:
        indices = pp.create_loads(net, [ids["bus"][item["bus"]] for item in valid_international],
            p_mw=[item["pLoadMw"] for item in valid_international], q_mvar=[item["qLoadMvar"] for item in valid_international],
            name=[item.get("name") for item in valid_international], in_service=[item.get("inService") is True for item in valid_international])
        ids["international"].update((item["id"], int(index)) for item, index in zip(valid_international, indices))
        for item in valid_international:
            missing("international_connection_behavior", item, "ElmVac Pload/Qload mapped consumption-positive as fixed PQ; itype and source-impedance behavior are not solved")

    for item in model.get("shunts", []):
        if not endpoints(item, "bus") or not _number(item.get("qMvarPerStep")) or not _number(item.get("currentStep")):
            missing("shunt", item, "missing bus, Q or step")
            continue
        kwargs = {"q_mvar": item["qMvarPerStep"], "step": int(item["currentStep"]),
            "max_step": int(item["steps"]) if _number(item.get("steps")) else 1,
            "name": item.get("name"), "in_service": item.get("inService") is True}
        if _positive(item.get("nominalKv")):
            kwargs["vn_kv"] = item["nominalKv"]
        else:
            missing("shunt_voltage_base", item, "ushnm unavailable; pandapower uses connected bus voltage base")
        ids["shunt"][item["id"]] = pp.create_shunt(net, ids["bus"][item["bus"]], **kwargs)

    valid_switches = []
    for item in model.get("switches", []):
        if not endpoints(item, "fromBus", "toBus"):
            missing("switch", item, "missing terminals")
            continue
        valid_switches.append(item)
    if valid_switches:
        indices = pp.create_switches(net, [ids["bus"][item["fromBus"]] for item in valid_switches],
            [ids["bus"][item["toBus"]] for item in valid_switches], et="b",
            closed=[item.get("closed") is True and item.get("inService") is True for item in valid_switches],
            name=[item.get("name") for item in valid_switches])
        ids["switch"].update((item["id"], int(index)) for item, index in zip(valid_switches, indices))

    for item in model.get("seriesCompensators", []):
        if not endpoints(item, "fromBus", "toBus") or not _number(item.get("xOhm")) or not _positive(item.get("nominalKv")):
            missing("series_compensator", item, "missing terminals, X or nominal voltage")
            continue
        zbase = item["nominalKv"] ** 2 / net.sn_mva
        ids["impedance"][item["id"]] = pp.create_impedance(net, ids["bus"][item["fromBus"]], ids["bus"][item["toBus"]],
            rft_pu=0.0, xft_pu=item["xOhm"] / zbase, sn_mva=net.sn_mva, name=item.get("name"), in_service=item.get("inService") is True)
    net["ytbs_series_compensation_paths"] = series_compensation_paths(model)
    return net, ids, unsupported, (time.perf_counter() - started) * 1000


def prepare(model):
    """Convert once for both preflight reporting and the subsequent solve."""
    net, ids, unsupported, conversion_ms = convert(model)
    return (net, ids, unsupported, conversion_ms), preflight(model, net, ids, unsupported)


def preflight(model, net=None, ids=None, unsupported=None):
    """Return bounded, model-grounded AC diagnostics; no numerical solution is produced."""
    if ids is None:
        net, ids, unsupported, _ = convert(model)
    unsupported = unsupported or []
    def num(value):
        return value if _number(value) else None
    def count_map(model_key, id_map):
        total = len(model.get(model_key, []))
        mapped = len(id_map)
        return {"kind": model_key, "model": total, "mapped": mapped, "notMapped": max(0, total - mapped)}

    bus_ids = {item.get("id") for item in model.get("buses", []) if item.get("id") in ids["bus"] and item.get("inService") is True}
    adjacency = {bus_id: set() for bus_id in bus_ids}
    def connect(items, id_map, a_key, b_key, require_closed=False):
        for item in items:
            a, b = item.get(a_key), item.get(b_key)
            if item.get("id") not in id_map or item.get("inService") is not True or (require_closed and item.get("closed") is not True):
                continue
            if a in adjacency and b in adjacency:
                adjacency[a].add(b); adjacency[b].add(a)
    connect(model.get("lines", []), ids["line"], "fromBus", "toBus")
    connect(model.get("transformers", []), ids["trafo"], "hvBus", "lvBus")
    connect(model.get("seriesCompensators", []), ids["impedance"], "fromBus", "toBus")
    connect(model.get("switches", []), ids["switch"], "fromBus", "toBus", True)

    slack_buses = {item.get("bus") for item in model.get("externalGrids", [])
                   if item.get("id") in ids["ext_grid"] and item.get("inService") is True and item.get("bus") in bus_ids}
    unseen = set(bus_ids)
    islands, islands_with_slack, unsupplied_buses = 0, 0, 0
    unsupplied_bus_ids = []
    while unseen:
        islands += 1
        stack = [unseen.pop()]
        component = set(stack)
        while stack:
            current = stack.pop()
            for neighbor in adjacency[current]:
                if neighbor in unseen:
                    unseen.remove(neighbor); component.add(neighbor); stack.append(neighbor)
        if component & slack_buses:
            islands_with_slack += 1
        else:
            unsupplied_buses += len(component)
            unsupplied_bus_ids.extend(sorted(component))

    in_service_gens = [item for item in model.get("generators", []) if item.get("id") in ids["gen"] or item.get("id") in ids["sgen"]]
    in_service_gens = [item for item in in_service_gens if item.get("inService") is True]
    loads = [item for item in model.get("loads", []) if item.get("id") in ids["load"] and item.get("inService") is True]
    international = [item for item in model.get("internationalConnections", []) if item.get("id") in ids["international"] and item.get("inService") is True]
    total_gen_mw = sum(num(item.get("pMw")) or 0.0 for item in in_service_gens)
    international_p_mw = sum(num(item.get("pLoadMw")) or 0.0 for item in international)
    international_q_mvar = sum(num(item.get("qLoadMvar")) or 0.0 for item in international)
    total_load_mw = sum(num(item.get("pMw")) or 0.0 for item in loads) + international_p_mw
    station_member_ids = {generator_id for control in model.get("controls", []) if control.get("kind") == "STATION"
        and control.get("inService") is True for generator_id in control.get("controlledGeneratorIds", [])}
    pv_buses = {item.get("bus") for item in in_service_gens if item.get("controlMode") == "PV"
        and item.get("id") not in station_member_ids and item.get("bus") in bus_ids}
    pq_buses = bus_ids - pv_buses - slack_buses
    pv_units = [item for item in in_service_gens if item.get("controlMode") == "PV" and item.get("id") not in station_member_ids]
    q_missing_pv = sum(not (_number(item.get("qMinMvar")) and _number(item.get("qMaxMvar"))) for item in pv_units)
    valid_vm = [item["vmPu"] for item in pv_units if _number(item.get("vmPu")) and 0.5 <= item["vmPu"] <= 1.5]
    invalid_vm = sum(not (_number(item.get("vmPu")) and 0.5 <= item["vmPu"] <= 1.5) for item in pv_units)

    trafos = model.get("transformers", [])
    taps_outside = 0
    taps_extreme = 0
    for item in trafos:
        tap = num(item.get("tapPosition")); neutral = num(item.get("tapNeutral")); low = num(item.get("tapMin")); high = num(item.get("tapMax"))
        if tap is None:
            continue
        if low is not None and tap < low or high is not None and tap > high:
            taps_outside += 1
        if neutral is not None and abs(tap - neutral) > 10:
            taps_extreme += 1

    switch_items = model.get("switches", [])
    switch_closed = sum(item.get("inService") is True and item.get("closed") is True for item in switch_items)
    switch_open = sum(item.get("inService") is True and item.get("closed") is not True for item in switch_items)
    controls = model.get("controls", [])
    station_controls = [item for item in controls if item.get("kind") == "STATION"]
    station_controls_in_service = [item for item in station_controls if item.get("inService") is True]
    droop_controls = [item for item in station_controls_in_service if item.get("droopEnabled") is True]
    multi_unit_controls = [item for item in station_controls_in_service if len(item.get("controlledGeneratorIds") or []) > 1]
    approximate_controls = [item for item in station_controls_in_service if item.get("mappingStatus") == "APPROXIMATE"]
    remote_voltage_controls = [item for item in controls if item.get("controlledBus")]
    reactive_sharing_records = [item for item in station_controls if item.get("reactiveSharingModeCode") is not None or len(item.get("controlledGeneratorIds") or []) > 1]
    droop_records = [item for item in station_controls if item.get("droopEnabled") is True or item.get("droopPercent") is not None or item.get("droopRatedMvar") is not None]
    unsupported_controls = sum(item.get("support") != "SUPPORTED" or item.get("mappingStatus") == "MAPPED_BUT_NOT_SOLVED" for item in controls)

    not_mapped = [
        count_map("buses", ids["bus"]), count_map("lines", ids["line"]), count_map("transformers", ids["trafo"]),
        count_map("generators", {**ids["gen"], **ids["sgen"]}), count_map("loads", ids["load"]),
        count_map("shunts", ids["shunt"]), count_map("seriesCompensators", ids["impedance"]),
        count_map("externalGrids", ids["ext_grid"]), count_map("switches", ids["switch"]),
        count_map("internationalConnections", ids["international"]),
    ]
    model_elements_not_mapped = sum(item["notMapped"] for item in not_mapped)
    active_lines = [item for item in model.get("lines", []) if item.get("inService") is True]
    series = [item for item in model.get("seriesCompensators", []) if item.get("inService") is True]
    impedance_zero = sum((_number(item.get("rOhm")) and _number(item.get("xOhm")) and abs(item["rOhm"]) + abs(item["xOhm"]) == 0) for item in active_lines)
    impedance_zero += sum((_number(item.get("xOhm")) and item["xOhm"] == 0) for item in series)
    impedance_zero += sum((_number(item.get("vkPercent")) and item["vkPercent"] == 0) for item in trafos)
    negative_x = sum(_number(item.get("xOhm")) and item["xOhm"] < 0 for item in active_lines + series)
    very_small_x = 0
    for item in active_lines:
        kv, x = num(item.get("nominalKv")), num(item.get("xOhm"))
        if kv and x is not None and 0 < abs(x * 100.0 / (kv * kv)) < 1e-5:
            very_small_x += 1
    for item in series:
        kv, x = num(item.get("nominalKv")), num(item.get("xOhm"))
        if kv and x is not None and 0 < abs(x * 100.0 / (kv * kv)) < 1e-5:
            very_small_x += 1
    compensation_paths = series_compensation_paths(model)
    nonpositive_compensated_paths = compensation_paths["sensitiveCount"]

    def non_finite(value):
        if isinstance(value, float): return not math.isfinite(value)
        if isinstance(value, dict): return sum(non_finite(part) for part in value.values())
        if isinstance(value, list): return sum(non_finite(part) for part in value)
        return 0
    non_finite_count = non_finite(model)
    ext_count = sum(item.get("inService") is True and item.get("id") in ids["ext_grid"] for item in model.get("externalGrids", []))
    winding_missing = sum(not (item.get("hvWindingConnection") and item.get("lvWindingConnection")) for item in trafos)
    load_flow = model.get("loadFlowSettings") if isinstance(model.get("loadFlowSettings"), dict) else {}
    effective_settings = {
        "enforceReactiveLimits": {"value": load_flow.get("enforceReactiveLimits") if isinstance(load_flow.get("enforceReactiveLimits"), bool) else True,
            "source": "ComLdf.iopt_lim" if isinstance(load_flow.get("enforceReactiveLimits"), bool) else "FALLBACK", "sourceValue": load_flow.get("rawValues", {}).get("iopt_lim")},
        "maxNewtonIterations": {"value": load_flow.get("maxNewtonIterations") if isinstance(load_flow.get("maxNewtonIterations"), int) else 30,
            "source": "ComLdf.itrlx" if isinstance(load_flow.get("maxNewtonIterations"), int) else "FALLBACK", "sourceValue": load_flow.get("rawValues", {}).get("itrlx")},
        "maxOuterIterations": {"value": load_flow.get("maxOuterIterations") if isinstance(load_flow.get("maxOuterIterations"), int) else 10,
            "source": "ComLdf.ictrlx" if isinstance(load_flow.get("maxOuterIterations"), int) else "FALLBACK", "sourceValue": load_flow.get("rawValues", {}).get("ictrlx")},
        "nodalTolerance": {"value": None, "source": "UNKNOWN", "sourceValue": load_flow.get("nodalToleranceRaw")},
        "modelEquationTolerance": {"value": None, "source": "UNKNOWN", "sourceValue": load_flow.get("modelEquationToleranceRaw")},
        "activePowerBalancingMode": {"value": "UNKNOWN", "source": "UNKNOWN", "sourceValue": load_flow.get("activePowerBalancingModeCode")},
    }
    pv_with_limits = sum(_number(item.get("qMinMvar")) and _number(item.get("qMaxMvar")) for item in pv_units)
    elm_gen_stat = [item for item in model.get("generators", []) if item.get("inService") is True
        and item.get("sourceRefs", {}).get("powerFactoryClass") == "ElmGenStat"]
    elm_gen_stat_q_coverage = sum(_number(item.get("qMinMvar")) and _number(item.get("qMaxMvar")) for item in elm_gen_stat)
    applied_station_controls = [item for item in station_controls_in_service if item.get("mappingStatus") in ("SOLVED", "APPROXIMATE")
        and item.get("controllerMode") == "VOLTAGE"]
    applied_share_groups = [item for item in applied_station_controls if len(item.get("controlledGeneratorIds") or []) > 1
        and len(item.get("controlledGeneratorShares") or []) == len(item.get("controlledGeneratorIds") or [])]

    return {
        "modelCounts": {"bus": len(model.get("buses", [])), "line": len(model.get("lines", [])), "transformer": len(trafos), "generator": len(model.get("generators", []))},
        "mappedCounts": {"bus": len(ids["bus"]), "line": len(ids["line"]), "transformer": len(ids["trafo"]), "generator": len(ids["gen"]) + len(ids["sgen"])},
        "elementsNotMapped": model_elements_not_mapped, "notMappedByKind": not_mapped,
        "electricalIslandCount": islands, "islandsWithSlackCount": islands_with_slack,
        "islandsWithoutSlackCount": islands - islands_with_slack, "unsuppliedBusCount": unsupplied_buses,
        "unsuppliedBusIds": unsupplied_bus_ids,
        "inServiceBusCount": len(bus_ids), "externalGridCount": ext_count,
        "generationMw": total_gen_mw, "loadMw": total_load_mw,
        "initialPImbalanceMw": total_gen_mw - total_load_mw,
        "internationalConnectionCount": len(model.get("internationalConnections", [])),
        "internationalConnectionsInService": sum(item.get("inService") is True for item in model.get("internationalConnections", [])),
        "internationalConnectionsMapped": len(ids["international"]),
        "internationalPmw": international_p_mw, "internationalQmvar": international_q_mvar,
        "internationalMappingMode": "FIXED_PQ_LOAD_APPROXIMATION",
        "pvBusCount": len(pv_buses), "pqBusCount": len(pq_buses), "pvUnitCount": len(pv_units),
        "pvUnitsMissingQLimits": q_missing_pv, "pvUnitsWithQLimits": len(pv_units) - q_missing_pv,
        "pvUnitsWithQLimitsCount": int(pv_with_limits),
        "elmGenStatQLimitCoverage": {"available": int(elm_gen_stat_q_coverage), "total": len(elm_gen_stat)},
        "pvUnitsInvalidVoltageSetpoint": invalid_vm,
        "minVmSetpointPu": min(valid_vm) if valid_vm else None, "maxVmSetpointPu": max(valid_vm) if valid_vm else None,
        "transformerTapOutsideDeclaredLimits": taps_outside, "transformerTapDeviationAbsGreaterThan10": taps_extreme,
        "transformerPhaseAngleMissing": sum(item.get("phaseShiftDeg") is None for item in trafos),
        "transformerPhaseAngleCoverage": {"total": len(trafos), "available": sum(item.get("phaseShiftDeg") is not None for item in trafos)},
        "transformerWindingConnectionMissing": winding_missing,
        "transformerWindingConnectionCoverage": {"total": len(trafos), "available": sum(bool(item.get("hvWindingConnection") and item.get("lvWindingConnection")) for item in trafos)},
        "unsupportedOrUnsolvedControlCount": unsupported_controls,
        "stationControlCount": len(station_controls), "stationControlsInService": len(station_controls_in_service),
        "remoteVoltageControllerCount": len(remote_voltage_controls), "remoteVoltageControllersApplied": len(applied_station_controls),
        "stationControllersTotal": len(station_controls), "stationControllersInService": len(station_controls_in_service),
        "stationControllersApplied": len(applied_station_controls), "stationControllersApproximate": len(approximate_controls),
        "stationControllersUnsupported": len(station_controls_in_service) - len(applied_station_controls),
        "multiUnitControllersTotal": len(multi_unit_controls),
        "multiUnitControllersApplied": sum(item.get("mappingStatus") in ("SOLVED", "APPROXIMATE") for item in multi_unit_controls),
        "multiUnitControllersApproximate": sum(item.get("mappingStatus") == "APPROXIMATE" for item in multi_unit_controls),
        "droopControllersTotal": len(droop_controls), "droopControllersApplied": 0,
        "droopControllersPartial": len(droop_controls),
        "secondaryControllersTotal": len(model.get("secondaryControllers", [])),
        "boundariesTotal": len(model.get("boundaries", [])),
        "activePowerBalancingModeCode": load_flow.get("activePowerBalancingModeCode"),
        "activePowerBalancingBehavior": "UNKNOWN; raw ComLdf code preserved; no balancing law applied",
        "reactiveSharingRecordCount": len(reactive_sharing_records), "reactiveSharingGroupsApplied": len(applied_share_groups),
        "droopRecordCount": len(droop_records),
        "droopControllersApplied": 0,
        "openSwitchCount": switch_open, "closedSwitchCount": switch_closed,
        "zeroImpedanceCount": int(impedance_zero), "nonFiniteValueCount": int(non_finite_count),
        "negativeReactanceCount": int(negative_x), "verySmallReactanceCount": int(very_small_x),
        "candidateNonPositiveCompensatedPathCount": int(nonpositive_compensated_paths),
        "seriesCompensation": compensation_paths,
        "loadFlowSettings": effective_settings,
        "unsupportedConversionCount": len(unsupported),
    }

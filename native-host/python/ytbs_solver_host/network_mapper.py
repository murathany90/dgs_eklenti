"""Explicit electrical canonical model to pandapower mapping."""
import math
import time
import pandapower as pp


def _number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _positive(value):
    return _number(value) and value > 0


def convert(model):
    if not isinstance(model, dict) or not isinstance(model.get("buses"), list):
        raise ValueError("invalid electrical canonical network")
    started = time.perf_counter()
    net = pp.create_empty_network(f_hz=50.0, sn_mva=100.0)
    ids = {kind: {} for kind in ("bus", "line", "trafo", "gen", "sgen", "load", "shunt", "ext_grid", "switch", "impedance")}
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

    valid_pv, valid_pq = [], []
    for item in model.get("generators", []):
        if not endpoints(item, "bus") or not _number(item.get("pMw")):
            missing("generator", item, "missing bus or P")
            continue
        mode = item.get("controlMode")
        if mode == "PV" and _positive(item.get("vmPu")):
            valid_pv.append(item)
            if not _number(item.get("qMinMvar")) or not _number(item.get("qMaxMvar")):
                missing("generator_q_limits", item, "PV Q limits unavailable")
        elif mode == "PQ" and _number(item.get("qMvar")):
            valid_pq.append(item)
        else:
            missing("generator", item, "unknown control mode or missing setpoint/Q")
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
        indices = pp.create_sgens(net, [ids["bus"][item["bus"]] for item in valid_pq],
            p_mw=[item["pMw"] for item in valid_pq], q_mvar=[item["qMvar"] for item in valid_pq],
            name=[item.get("name") for item in valid_pq], in_service=[item.get("inService") is True for item in valid_pq])
        ids["sgen"].update((item["id"], int(index)) for item, index in zip(valid_pq, indices))

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

    for item in model.get("shunts", []):
        if not endpoints(item, "bus") or not _number(item.get("qMvarPerStep")) or not _number(item.get("currentStep")):
            missing("shunt", item, "missing bus, Q or step")
            continue
        ids["shunt"][item["id"]] = pp.create_shunt(net, ids["bus"][item["bus"]], q_mvar=item["qMvarPerStep"], step=int(item["currentStep"]),
            max_step=int(item["steps"]) if _number(item.get("steps")) else 1, name=item.get("name"), in_service=item.get("inService") is True)

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
    return net, ids, unsupported, (time.perf_counter() - started) * 1000

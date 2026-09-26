import io
import base64
import hashlib
import json
import math
import struct
import unittest
from unittest.mock import patch
from pandapower.auxiliary import LoadflowNotConverged

from ytbs_solver_host.main import serve
from ytbs_solver_host.network_mapper import convert, preflight, prepare
from ytbs_solver_host.pandapower_adapter import diagnose_ac, run
from ytbs_solver_host.control_coordinator import solve_with_controls
from ytbs_solver_host.series_compensation import series_compensation_paths
from ytbs_solver_host.protocol import read_message, write_message


def base(n=2):
    buses = [{"id": f"B{i}", "name": f"Bus {i}", "nominalKv": 110.0, "inService": True} for i in range(n)]
    return {"modelId": "fixture", "modelHash": "fixture-hash", "completeness": "COMPLETE", "buses": buses,
        "lines": [], "transformers": [], "generators": [], "loads": [], "shunts": [], "seriesCompensators": [], "externalGrids": [
            {"id": "X", "bus": "B0", "vmPu": 1.0, "angleDeg": 0.0, "inService": True}], "switches": []}


def line(model, a=0, b=1, x=10.0, r=0.0, ident=None):
    model["lines"].append({"id": ident or f"L{a}{b}", "fromBus": f"B{a}", "toBus": f"B{b}", "lengthKm": 10.0,
        "rOhm": r, "xOhm": x, "bSiemens": 0.0, "ratedCurrentKa": 1.0, "inService": True, "sections": []})


def load(model, bus, p=100.0, q=20.0):
    model["loads"].append({"id": f"D{bus}", "bus": f"B{bus}", "pMw": p, "qMvar": q, "inService": True})


class ElectricalTests(unittest.TestCase):
    def test_two_bus_dc_independent_angle(self):
        model = base(); line(model); load(model, 1)
        result = run(model, "DC")
        self.assertEqual(result["convergence"], "CONVERGED")
        self.assertAlmostEqual(result["branches"][0]["from"]["pMw"], 100.0, places=4)
        self.assertIsNone(result["buses"][1]["vPu"])
        self.assertIsNone(result["branches"][0]["from"]["qMvar"])
        self.assertIsNone(result["summary"]["activeLossMw"])
        self.assertEqual(result["resultAvailability"]["reasons"]["voltage"], "DC_MODE_NO_VOLTAGE_MAGNITUDE")
        self.assertEqual(result["resultAvailability"]["reasons"]["reactivePower"], "DC_MODE_NO_REACTIVE_POWER")
        expected_deg = -(100.0 * 10.0 / 110.0**2) * 180 / math.pi
        self.assertAlmostEqual(result["buses"][1]["angleDeg"], expected_deg, delta=0.3)

    def test_two_bus_ac_balance(self):
        model = base(); line(model, r=1.0); load(model, 1)
        result = run(model, "AC")
        self.assertEqual(result["convergence"], "CONVERGED")
        self.assertGreater(result["summary"]["activeLossMw"], 0)
        self.assertAlmostEqual(result["summary"]["generationMw"] - result["summary"]["loadMw"], result["summary"]["activeLossMw"], delta=0.3)

    def test_three_and_four_bus(self):
        for n in (3, 4):
            with self.subTest(n=n):
                model = base(n)
                for i in range(n - 1): line(model, i, i + 1)
                load(model, n - 1, 20, 5)
                result = run(model, "AC")
                self.assertEqual(len(result["buses"]), n)
                self.assertAlmostEqual(result["externalGrids"][0]["pMw"], 20, delta=0.1)

    def test_pv_pq_and_q_limit(self):
        model = base(3); line(model, 0, 1); line(model, 1, 2); load(model, 2, 80, 25)
        model["generators"].append({"id": "G", "bus": "B1", "pMw": 30, "qMvar": 0, "vmPu": 1.02,
            "qMinMvar": -2, "qMaxMvar": 2, "controlMode": "PV", "inService": True})
        model["generators"].append({"id": "PQ", "bus": "B2", "pMw": 0, "qMvar": 3, "vmPu": None,
            "qMinMvar": -1, "qMaxMvar": 1, "controlMode": "PQ", "inService": True})
        result = run(model, "AC")
        self.assertEqual(result["convergence"], "CONVERGED")
        self.assertLessEqual(result["generators"][0]["qMvar"], 2.001)
        self.assertIn(result["generators"][0]["limitState"], ("AT_MAX", "AT_MIN", "WITHIN"))
        self.assertAlmostEqual(next(item for item in result["generators"] if item["id"] == "PQ")["qMvar"], 3, delta=1e-4)

    def test_transformer_tap_and_phase_shift(self):
        model = base(); model["buses"][1]["nominalKv"] = 10.0
        model["transformers"].append({"id": "T", "hvBus": "B0", "lvBus": "B1", "snMva": 100,
            "vnHvKv": 110, "vnLvKv": 10, "vkPercent": 10, "vkrPercent": 0.5,
            "pfeKw": 0, "i0Percent": 0, "phaseShiftDeg": 5, "tapSide": "hv", "tapPosition": 1,
            "tapNeutral": 0, "tapMin": -5, "tapMax": 5, "tapStepPercent": 1.25, "inService": True})
        load(model, 1, 20, 5)
        result = run(model, "AC")
        self.assertEqual(len(result["transformers"]), 1)
        self.assertAlmostEqual(result["transformers"][0]["tapPosition"], 1)
        self.assertIsNotNone(result["buses"][1]["angleDeg"])

    def test_parallel_generators(self):
        model = base(); line(model); load(model, 1, 50, 10)
        for index in range(2): model["generators"].append({"id": f"G{index}", "bus": "B1", "pMw": 10,
            "qMvar": 0, "vmPu": 1.01, "qMinMvar": -50, "qMaxMvar": 50, "controlMode": "PV", "inService": True})
        result = run(model, "AC")
        self.assertEqual(len(result["generators"]), 2)
        self.assertAlmostEqual(result["generators"][0]["qMvar"], result["generators"][1]["qMvar"], delta=0.01)

    def test_island_non_convergence(self):
        model = base(3); line(model); load(model, 2, 10, 2)
        result = run(model, "AC")
        self.assertIsNone(next(bus for bus in result["buses"] if bus["id"] == "B2")["vPu"])

    def test_shunt_and_series_compensation(self):
        model = base(4); line(model, 0, 1, x=10, r=0.1, ident="L1"); line(model, 2, 3, x=10, r=0.1, ident="L2"); load(model, 3, 20, 5)
        model["shunts"].append({"id": "S", "bus": "B3", "nominalKv": 110, "qMvarPerStep": -2,
            "steps": 1, "currentStep": 1, "inService": True})
        model["seriesCompensators"].append({"id": "C", "fromBus": "B1", "toBus": "B2", "xOhm": -1,
            "nominalKv": 110, "inService": True})
        result = run(model, "AC")
        self.assertTrue(any(branch["kind"] == "SERIES_COMPENSATOR" for branch in result["branches"]))
        path = series_compensation_paths(model)["paths"][0]
        self.assertEqual(path["status"], "RESOLVED")
        self.assertEqual(path["lineIds"], ["L1", "L2"])
        self.assertAlmostEqual(path["netXOhm"], 19.0)

        parallel = base(2); line(parallel, 0, 1, x=10, ident="LP")
        parallel["seriesCompensators"].append({"id": "CP", "fromBus": "B0", "toBus": "B1", "xOhm": -1,
            "nominalKv": 110, "inService": True})
        self.assertEqual(series_compensation_paths(parallel)["paths"][0]["status"], "NOT_A_SERIES_CHAIN")

        bypass = base(2)
        bypass["seriesCompensators"].append({"id": "CB", "fromBus": "B0", "toBus": "B1", "xOhm": -1,
            "nominalKv": 110, "inService": False})
        bypass["switches"].append({"id": "SW", "fromBus": "B0", "toBus": "B1", "closed": True, "inService": True})
        self.assertEqual(series_compensation_paths(bypass)["count"], 0)

    def test_remote_voltage_control_shares_and_limit_unmet_detection(self):
        model = base(3)
        line(model, 0, 1, x=6, r=1, ident="L01"); line(model, 1, 2, x=6, r=1, ident="L12")
        load(model, 1, 20, 10); load(model, 2, 15, 5)
        model["generators"] = [
            {"id": "G1", "bus": "B2", "pMw": 10, "qMvar": 0, "vmPu": 1.0, "qMinMvar": -15, "qMaxMvar": 1, "controlMode": "PV", "inService": True},
            {"id": "G2", "bus": "B2", "pMw": 10, "qMvar": 0, "vmPu": 1.0, "qMinMvar": -15, "qMaxMvar": 30, "controlMode": "PV", "inService": True},
        ]
        model["controls"] = [{"id": "CTRL", "kind": "STATION", "targetId": "CTRL", "inService": True,
            "controllerMode": "VOLTAGE", "controlledBus": "B1", "controlledGeneratorIds": ["G1", "G2"],
            "controlledGeneratorShares": [0.25, 0.75], "setpoint": 1.005, "droopEnabled": False, "mappingStatus": "SOLVED"}]
        net, ids, _, _ = convert(model)
        options = {"algorithm": "nr", "calculate_voltage_angles": True, "enforce_q_lims": True,
            "check_connectivity": True, "init": "auto", "max_iteration": 30, "numba": False}
        state = solve_with_controls(net, ids, model, options, 50)
        self.assertTrue(state["converged"], state)
        self.assertLessEqual(abs(state["controllers"][0]["errorPu"]), 1e-4)
        self.assertAlmostEqual(net.res_bus.at[ids["bus"]["B1"], "vm_pu"], 1.005, delta=1e-4)
        self.assertAlmostEqual(net.res_sgen.at[ids["sgen"]["G1"], "q_mvar"], 1.0, delta=1e-3)
        self.assertGreater(net.res_sgen.at[ids["sgen"]["G2"], "q_mvar"], 20)

        unreachable = json.loads(json.dumps(model))
        unreachable["controls"][0]["setpoint"] = 1.03
        net, ids, _, _ = convert(unreachable)
        state = solve_with_controls(net, ids, unreachable, options, 50)
        self.assertFalse(state["converged"])
        self.assertIn(state["unsatisfiedGroups"][0]["status"], ("CONTROL_TARGET_UNMET", "ALL_UNITS_AT_Q_LIMIT"))
        self.assertGreater(abs(state["unsatisfiedGroups"][0]["errorPu"]), 0.01)

    def test_missing_phase_reports_partial(self):
        model = base(); model["buses"][1]["nominalKv"] = 10
        model["transformers"] = [{"id": "T", "hvBus": "B0", "lvBus": "B1", "snMva": 100, "vnHvKv": 110,
            "vnLvKv": 10, "vkPercent": 10, "vkrPercent": 1, "pfeKw": 0, "i0Percent": 0, "phaseShiftDeg": None, "inService": True}]
        load(model, 1, 10, 2)
        result = run(model, "AC")
        self.assertEqual(result["validation"], "PARTIAL")
        self.assertTrue(any(item["kind"] == "trafo_phase_shift" for item in result["unsupported"]))

    def test_preflight_island_supply_q_limits_and_model_counts(self):
        model = base(3); line(model, 0, 1); load(model, 1, 20, 5); load(model, 2, 7, 2)
        model["generators"].append({"id": "G", "bus": "B1", "pMw": 10, "qMvar": 0, "vmPu": 1.02,
            "qMinMvar": None, "qMaxMvar": None, "controlMode": "PV", "inService": True})
        model["transformers"].append({"id": "T", "hvBus": "B1", "lvBus": "B2", "snMva": 100, "vnHvKv": 110,
            "vnLvKv": 110, "vkPercent": 10, "vkrPercent": 1, "tapPosition": 15, "tapNeutral": 3,
            "tapMin": 0, "tapMax": 20, "inService": False})
        diagnostic = preflight(model)
        self.assertEqual(diagnostic["modelCounts"]["bus"], 3)
        self.assertEqual(diagnostic["mappedCounts"]["bus"], 3)
        self.assertEqual(diagnostic["electricalIslandCount"], 2)
        self.assertEqual(diagnostic["islandsWithSlackCount"], 1)
        self.assertEqual(diagnostic["islandsWithoutSlackCount"], 1)
        self.assertEqual(diagnostic["unsuppliedBusCount"], 1)
        self.assertEqual(diagnostic["unsuppliedBusIds"], ["B2"])
        self.assertEqual(diagnostic["stationControlCount"], 0)
        self.assertEqual(diagnostic["transformerPhaseAngleCoverage"]["total"], 1)
        self.assertEqual(diagnostic["pvUnitsMissingQLimits"], 1)
        self.assertEqual(diagnostic["transformerTapOutsideDeclaredLimits"], 0)
        self.assertEqual(diagnostic["transformerTapDeviationAbsGreaterThan10"], 1)
        self.assertAlmostEqual(diagnostic["initialPImbalanceMw"], -17)

    def test_non_convergence_preserves_model_counts_without_results(self):
        model = base(); line(model); load(model, 1)
        with patch("ytbs_solver_host.pandapower_adapter.pp.runpp", side_effect=LoadflowNotConverged("fixture did not converge")):
            result = run(model, "AC")
        self.assertEqual(result["convergence"], "NON_CONVERGED")
        self.assertEqual(result["buses"], [])
        self.assertEqual(result["branches"], [])
        self.assertEqual(result["transformers"], [])
        self.assertEqual(result["generators"], [])
        self.assertEqual(result["summary"]["modelBusCount"], 2)
        self.assertEqual(result["summary"]["modelLineCount"], 1)
        self.assertGreater(result["summary"]["mappedBusCount"], 0)

    def test_non_converged_has_no_numeric_results(self):
        model = base(); line(model); load(model, 1)
        with patch("ytbs_solver_host.pandapower_adapter.pp.runpp", side_effect=LoadflowNotConverged("fixture did not converge")):
            result = run(model, "AC")
        self.assertEqual(result["convergence"], "NON_CONVERGED")
        self.assertEqual(result["buses"], [])
        self.assertEqual(result["validation"], "NON_CONVERGED")
        self.assertEqual(result["resultAvailability"]["reasons"]["voltage"], "AC_NON_CONVERGED")

    def test_ac_root_cause_profiles_are_isolated_and_diagnostic_only(self):
        model = base(); line(model); load(model, 1)
        prepared, diagnostic = prepare(model)
        calls = []
        def profile(net, **options):
            calls.append(options)
            if options["algorithm"] == "nr" and options["enforce_q_lims"]:
                raise LoadflowNotConverged("standard profile")
        with patch("ytbs_solver_host.pandapower_adapter.pp.runpp", side_effect=profile):
            result = diagnose_ac(model, prepared, diagnostic)
        self.assertEqual([item["algorithm"] for item in calls], ["nr"] * 5)
        self.assertEqual(calls[0]["enforce_q_lims"], True)
        self.assertEqual(calls[1]["enforce_q_lims"], False)
        self.assertEqual(calls[2]["init"], "dc")
        self.assertTrue(all(item["userResult"] is False for item in result["profiles"]))
        self.assertTrue(any("Q-limit profiliyle" in hint for hint in result["engineeringHints"]))


class ProtocolTests(unittest.TestCase):
    def test_frame_roundtrip(self):
        stream = io.BytesIO()
        write_message({"type": "PING", "protocolVersion": "1.0", "requestId": "r", "jobId": "j"}, stream)
        stream.seek(0)
        self.assertEqual(read_message(stream)["type"], "PING")

    def test_reject_large_frame(self):
        with self.assertRaises(ValueError): read_message(io.BytesIO(struct.pack("<I", 3_000_000)))

    def test_hello_and_unknown_command(self):
        input_stream, output_stream = io.BytesIO(), io.BytesIO()
        for kind in ("HELLO", "SHELL"):
            write_message({"type": kind, "protocolVersion": "1.0", "requestId": "r", "jobId": "j"}, input_stream)
        input_stream.seek(0)
        serve(input_stream, output_stream)
        output_stream.seek(0)
        self.assertEqual(read_message(output_stream)["type"], "HELLO_ACK")
        self.assertEqual(read_message(output_stream)["type"], "CAPABILITIES")
        self.assertEqual(read_message(output_stream)["code"], "UNKNOWN_COMMAND")

    def test_hello_reports_pandapower_import_error(self):
        input_stream, output_stream = io.BytesIO(), io.BytesIO()
        write_message({"type": "HELLO", "protocolVersion": "1.0", "requestId": "r", "jobId": "j"}, input_stream)
        input_stream.seek(0)
        original_import = __import__
        def fail_pandapower(name, *args, **kwargs):
            if name == "pandapower":
                raise ImportError("pandapower unavailable")
            return original_import(name, *args, **kwargs)
        with patch("builtins.__import__", side_effect=fail_pandapower):
            serve(input_stream, output_stream)
        output_stream.seek(0)
        self.assertEqual(read_message(output_stream)["type"], "HELLO_ACK")
        self.assertEqual(read_message(output_stream)["code"], "PANDAPOWER_IMPORT_ERROR")

    def test_chunked_model_and_result_roundtrip(self):
        model = base(); line(model); load(model, 1, 10, 2)
        payload = json.dumps(model).encode()
        input_stream, output_stream = io.BytesIO(), io.BytesIO()
        def send(kind, **fields):
            write_message({"type": kind, "protocolVersion": "1.0", "requestId": "r", "jobId": "j", **fields}, input_stream)
        send("CREATE_MODEL", byteLength=len(payload), sha256=hashlib.sha256(payload).hexdigest())
        send("MODEL_CHUNK", index=0, data=base64.b64encode(payload).decode())
        send("MODEL_COMPLETE")
        send("PREFLIGHT")
        send("RUN_LOAD_FLOW", mode="AC")
        input_stream.seek(0)
        serve(input_stream, output_stream)
        output_stream.seek(0)
        messages = []
        while message := read_message(output_stream): messages.append(message)
        self.assertFalse(any(msg["type"] == "ERROR" for msg in messages))
        diagnostic = next(msg["diagnostics"] for msg in messages if msg["type"] == "DIAGNOSTICS")
        self.assertEqual(diagnostic["modelCounts"]["bus"], 2)
        self.assertTrue(any(msg.get("phase") == "SOLVING_AC" for msg in messages if msg["type"] == "PROGRESS"))
        summary = next(msg for msg in messages if msg["type"] == "RESULT_SUMMARY")
        chunks = [msg for msg in messages if msg["type"] == "RESULT_CHUNK"]
        self.assertEqual(len(chunks), summary["chunkCount"])
        result_bytes = b"".join(base64.b64decode(msg["data"]) for msg in chunks)
        self.assertEqual(hashlib.sha256(result_bytes).hexdigest(), summary["sha256"])
        self.assertEqual(json.loads(result_bytes)["convergence"], "CONVERGED")
        self.assertEqual(json.loads(result_bytes)["summary"]["modelBusCount"], 2)


if __name__ == "__main__": unittest.main()

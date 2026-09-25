# Phase 3 readiness gate · v6.1.3

This release does not start Phase 3 and adds no N-1, short-circuit, OPF or PyPowSyBl analysis.

| Gate | Status | Basis |
| --- | --- | --- |
| `UI_READY` | TRUE | Terminology, responsive, scenario, host-health, cache-prompt and availability-reason UI checks pass. |
| `BASE_DC_READY` | TRUE | Both local full DGS models converge in pandapower DC and return active-power results for mapped buses, lines, transformers and generators. DC voltage magnitude and reactive quantities remain null. |
| `BASE_AC_READY` | FALSE | Both full models remain `NON_CONVERGED` at 30 Newton iterations with no numeric AC result rows. Diagnostic profiles do not replace the default solution. |
| `MODEL_CONTROL_MAPPING_READY` | FALSE | Source station-control data is preserved and coverage reported, but station/remote control, reactive sharing and droop behavior are not solved or independently verified. |
| `SCENARIO_STATE_READY` | TRUE | Line, switch, restored-terminal, undo, reset and bundled virtual energization state are included in canonical identity; revision is excluded from cache identity; IndexedDB restore avoids duplicate mutations. |
| `NATIVE_HOST_READY` | FALSE | Protocol, engine and engine-version classification are unit-tested. Full-model Chrome Native Messaging E2E timed out during the 143 MB model load, before its health request. |
| `POWERFACTORY_REFERENCE_READY` | FALSE | No matching independent PowerFactory ResultSet V2 reference is supplied. |

Full-model AC/DC baseline measurements remain in `docs/v6.1.2-validation.md`; v6.1.3 test results are recorded in `docs/v6.1.3-validation.md`. A missing CI source model remains `SKIP/SOURCE_UNAVAILABLE`, never a pass. Every gate remains an explicit review item; this file does not trigger Phase 3.

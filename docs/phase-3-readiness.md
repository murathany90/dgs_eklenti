# Phase 3 readiness gate · v6.1.2

This release does not start Phase 3 and adds no N-1, short-circuit, OPF or PyPowSyBl analysis.

| Gate | Status | Basis |
| --- | --- | --- |
| `UI_READY` | TRUE | Terminology, responsive, scenario, host-health, cache-prompt and availability-reason UI checks pass. |
| `BASE_DC_READY` | TRUE | Both local full DGS models converge in pandapower DC and return active-power results for mapped buses, lines, transformers and generators. DC voltage magnitude and reactive quantities remain null. |
| `BASE_AC_READY` | FALSE | Both full models remain `NON_CONVERGED` at 30 Newton iterations with no numeric AC result rows. Diagnostic profiles do not replace the default solution. |
| `MODEL_CONTROL_MAPPING_READY` | FALSE | Source station-control data is preserved and coverage reported, but station/remote control, reactive sharing and droop behavior are not solved or independently verified. |
| `SCENARIO_STATE_READY` | TRUE | Line, switch, undo, reset and bundled virtual energization mutations use one revision/event commit; state is persisted by model hash and stale scenario results are not selected as base results. |
| `NATIVE_HOST_READY` | FALSE | HELLO/CAPABILITIES behavior is unit-tested and E2E install guidance is verified, but no host is registered for the UI E2E extension ID in this run. |
| `POWERFACTORY_REFERENCE_READY` | FALSE | No matching independent PowerFactory ResultSet V2 reference is supplied. |

Full local results and test evidence are in `docs/v6.1.2-validation.md`. A missing CI source model remains `SKIP/SOURCE_UNAVAILABLE`, never a pass. Every gate remains an explicit review item; this file does not trigger Phase 3.

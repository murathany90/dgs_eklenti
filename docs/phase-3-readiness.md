# Phase 3 readiness gate

This release does not start Phase 3 and adds no N-1, short-circuit, OPF or PyPowSyBl analysis.

| Gate | Status | Basis |
| --- | --- | --- |
| `UI_READY` | TRUE | UI terminology, scenario navigation, screenshot and responsive checks pass. |
| `BASE_DC_READY` | TRUE | Both full DGS models converged in pandapower DC and returned active-power results for every mapped bus, line, transformer and generator. |
| `BASE_AC_READY` | FALSE | Both full models must converge consistently; the solver stays at 30 Newton iterations and no repair is applied. |
| `MODEL_CONTROL_MAPPING_READY` | FALSE | Station-control source fields are preserved, but their remote control, reactive sharing and droop are not solved; coverage still needs engineering verification. |
| `POWERFACTORY_REFERENCE_READY` | FALSE | No matching independent PowerFactory ResultSet V2 reference is supplied. |

`BASE_AC_READY` and `BASE_DC_READY` are updated from both real local full-model runs in `docs/v6.1.1-validation.md`. A missing CI source model is reported as `SKIP/SOURCE_UNAVAILABLE`, never as a pass. The next phase requires explicit human review of these gates; no gate automatically launches Phase 3.

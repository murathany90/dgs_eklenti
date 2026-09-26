# ComLdf mapping

The mapper preserves all available values for `iopt_lim`, `itrlx`, `ictrlx`, `errlf`, `erreq`, `iopt_chctr`, `iShowOutLoopMsg`, `iPbalancing`, `iopt_initOPF`, `iItAlgStag`, `iInterChg`, and `iInterType` in `loadFlowSettings.rawValues`.

| Field | Solver treatment |
|---|---|
| `iopt_lim` | `0` and `1` map to pandapower `enforce_q_lims=false/true`; other codes remain unknown. |
| `itrlx` | Positive integer is used as pandapower NR `max_iteration`; tolerance semantics are not inferred. |
| `ictrlx` | Positive integer is used as the bounded outer-control maximum. |
| `errlf`, `erreq` | Raw only. Units/scaling have not been verified against pandapower `tolerance_mva`. |
| `iopt_chctr`, `iShowOutLoopMsg`, `iopt_initOPF`, `iItAlgStag`, `iInterChg`, `iInterType` | Raw only; no verified equivalent was found in the adapter. |
| `iPbalancing` | Raw only. The local code `3` is **UNKNOWN**; no active balancing mode or weights are inferred. |

The official DIgSILENT material confirms distributed slack and interchange-related balancing are available features, but the pages found do not define the numeric DGS `iPbalancing=3` enum. General feature availability cannot establish a particular integer code. See [PowerFactory 2024 base package](https://www.digsilent.de/en/downloads.html?downloadkey=4985D1420E2092A6E7011FA174948625).

## Evidence classes

- FACT: All twelve source fields are retained; iopt_lim, itrlx, and ictrlx feed bounded pandapower options.
- INFERENCE: Those mappings use positive source values as practical loop limits and do not prove matching PowerFactory units or algorithm details.
- APPROXIMATION: Source iteration limits are used as caps for pandapower inner/outer loops.
- UNSUPPORTED: iPbalancing=3 and the remaining unverified option codes have no invented numerical behavior.

# Full-model regression — v6.1.6

## Input and mapping

The 25 September 2026 source `kontrol1/20260925_1000_SN5_TR0.json` was read and solved locally. Size: 143,003,403 bytes. SHA-256: `fbb660ffb68df328defeb39b207c42afe9aef76f84be66a1afd0e68dfd76f781`.

The run mapped 86,499 buses, 2,382 lines, 3,684 transformers, 2,840 generators, 2,525 loads, 137 shunts, 15 series compensators, 95,392 switches, and all 12 ElmVac records. Electrical preflight mapped every counted bus, line, transformer, generator, load, shunt, series-compensator, external-grid, switch, and ElmVac row.

ElmVac: 12 total, 8 in service, 12 mapped as separate fixed-PQ load approximations; active totals are 785.98 MW and −137.49 MVAr. This does not reproduce ElmVac voltage-source or impedance semantics.

Station controllers: 479 total, 263 active. Active groups comprise 30 non-droop single-unit groups, 100 non-droop multi-unit groups, and 133 droop groups. The solver applied 30 single-unit groups and 34 multi-unit groups using the explicit `APPROXIMATE` positive-P dispatch weighting. The remaining 199 are not numerically applied: 66 unresolved multi-unit groups and 133 droop groups whose DGS-specific scale/sign and measurement semantics are unverified.

AGC1 resolves to BOUNDARY with both the AGC target and boundary interchange target at 156.09 MW. The relation is retained, but the balancing action is unsupported because the meaning of `ComLdf.iPbalancing = 3` remains unknown. Transformer snapshot taps and all 3,684 winding connection pairs were mapped; the DGS contains no resolved transformer phase angle/vector group.

## Native full-model results

`node --import tsx tools/validate-full-electrical-models.mjs kontrol1/20260925_1000_SN5_TR0.json` completed. The retained full result is [`full-model-validation-v6.1.6.json`](full-model-validation-v6.1.6.json); the local untracked runner output is `artifacts/full-model-validation.json`.

| Mode | Result | Iterations | Runtime | Measurements |
|---|---|---:|---:|---|
| AC | `NON_CONVERGED` | 155 inner NR; 50 outer | 69.9 s | Inner NR converged; outer station-control system did not. Reason `CONTROL_EXHAUSTED`; 64 applied groups remained unsatisfied. Max P residual 8.96×10⁻¹⁰ MW; max Q residual 2.10×10⁻⁹ MVAr; Q-limit hits: 1 minimum, 3 maximum. No user-facing numerical rows were published. |
| DC | `CONVERGED` | 1 | 5.1 s | 86,499 bus rows returned. DC has no voltage magnitude, reactive power, or reactive-loss result. |

The small inner residual confirms the numerical AC equations converged for the final attempted state; it does not mean the station voltage targets converged. The AC result is therefore kept `NON_CONVERGED` and its numerical result arrays remain empty.

## 143 MB browser-load performance

The large-model UI E2E was run on 2026-09-26 using both direct workspace and side-panel flows. Latest runs were ready within the 60 s budget: 15.63 s direct, 15.09 s side-panel. Electrical worker readiness was 1.93–2.25 s; bus search took 190–212 ms; observed JS heap was 264–271 MB. The longest observed main-thread task was 938–1,002 ms. The direct-flow browser graph audit also routed all 8 active ElmVac rows (785.98 MW / −137.49 MVAr) through its fixed-PQ approximation. This measures DGS import/UI readiness and graph input mapping, not a browser full-network AC solve.
## Validation boundary

Full-model mapping and native AC/DC runs: **EXECUTED**. Browser-vs-native AC numeric comparison: **SKIPPED**, because the native AC run returned no publishable numerical result and BrowserApprox still consumes only the legacy reduced model. Browser feature ablation: **SKIPPED**, because canonical feature toggles are not implemented in that path. PowerFactory software/reference: **NOT AVAILABLE**; this report makes no PowerFactory validation or equivalence claim.

The requested native A–G controller feature ablation was executed and retained in [`ac-control-ablation-study.md`](ac-control-ablation-study.md) and [`ac-control-ablation-study.json`](ac-control-ablation-study.json). The control-free stage A converged; adding single-unit controllers in stage B produced inner convergence but outer `CONTROL_EXHAUSTED`. Stages C–G also remained `CONTROL_EXHAUSTED`.

The separate Chrome Native Messaging full-model E2E is **FAIL**, not pass: HELLO/CAPABILITIES health negotiation succeeded (2.97 s), the full model transferred and passed preflight, then the host disconnected 15.4 s after `SOLVING_AC` began (24.6 s from request start). Chrome reported “Error when communicating with the native messaging host”; the UI showed `HOST_DISCONNECTED`, and no native AC ResultSet was received during the 120 s diagnostic run. `npm run test:e2e:native-health` passes, so the failure is in the full-model solver request path after health negotiation. It is not counted as a successful native E2E.

## Evidence classes

- FACT: File hash, counts, AC/DC outcomes, iterations, residuals, and ablation values above come from local DGS/pandapower runs.
- INFERENCE: A control-free baseline converging while B-G exhaust outer controls associates the enabled control set with current AC non-convergence, but does not identify a specific root cause.
- APPROXIMATION: ElmVac P/Q and 34 reactive-sharing groups use documented approximate mappings.
- UNSUPPORTED: PowerFactory comparison, browser feature ablation, and a full-vs-browser AC delta are unavailable. The full-model Chrome native request also failed after health negotiation and returned no result.

# AC feature ablation — 20260925_1000_SN5_TR0.json

Source SHA-256: `fbb660ffb68df328defeb39b207c42afe9aef76f84be66a1afd0e68dfd76f781`; bytes: 143003403. Each stage solves an isolated copy of the same canonical network. Excluded features are disabled only in that copy. These are pandapower results, not PowerFactory validation. Run=PASS means the experiment completed and its diagnostics were recorded; it does not mean the AC/control result converged.

| Stage | Run | Result | Reason | Inner | Outer | Inner iters | Outer iters | max ΔP MW | max ΔQ MVAr | max V error p.u. | Qmin/Qmax hits | exhausted | solve ms |
|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| A_ELMVAC_ONLY | PASS | CONVERGED | — | True | True | 6 | 0 | 7.96986869909966E-10 | 1.29433058200902E-09 |  | 0 / 0 | 0 | 8757 |
| B_SINGLE_UNIT | PASS | NON_CONVERGED | CONTROL_EXHAUSTED | True | False | 150 | 50 | 6.33843880887895E-10 | 1.0682507327063E-09 | 0.135222619151347 | 4 / 5 | 8 | 66057 |
| C_MULTI_REACTIVE_SHARING | PASS | NON_CONVERGED | CONTROL_EXHAUSTED | True | False | 146 | 50 | 1.88558844090341E-07 | 6.64776234060582E-08 | 0.198334250328771 | 2 / 0 | 2 | 51714 |
| D_DROOP | PASS | NON_CONVERGED | CONTROL_EXHAUSTED | True | False | 146 | 50 | 1.88558844090341E-07 | 6.64776234060582E-08 | 0.198334250328771 | 2 / 0 | 2 | 53284 |
| E_BOUNDARY_SECONDARY | PASS | NON_CONVERGED | CONTROL_EXHAUSTED | True | False | 146 | 50 | 1.88558844090341E-07 | 6.64776234060582E-08 | 0.198334250328771 | 2 / 0 | 2 | 53974 |
| F_Q_LIMITS | PASS | NON_CONVERGED | CONTROL_EXHAUSTED | True | False | 146 | 50 | 1.88561805287914E-07 | 6.64772653591328E-08 | 0.198334250330898 | 2 / 0 | 2 | 54235 |
| G_TRANSFORMER_TAPS | PASS | NON_CONVERGED | CONTROL_EXHAUSTED | True | False | 155 | 50 | 8.95896133502107E-10 | 2.10492288113897E-09 | 0.149308045044447 | 1 / 3 | 3 | 54423 |

Stage A is the control-free baseline with the ElmVac fixed-PQ approximation enabled. It converged. B adds eligible non-droop single-unit station groups and reaches CONTROL_EXHAUSTED; C adds non-droop multi-unit sharing and remains CONTROL_EXHAUSTED. D contains the source droop records, but droop is currently not numerically applied; E contains boundary/secondary metadata, but balancing remains unknown. F enables non-station generator Q limits; G restores static transformer taps. The JSON report carries the complete per-stage diagnostics and controller counts.

PowerFactory reference: **NOT AVAILABLE**. Browser approximation ablation and full-vs-browser comparison are separate and not represented by this table.
## Evidence classes

- FACT: Stage outcomes and timing values are from seven completed local pandapower runs on the same DGS hash.
- INFERENCE: B-G remaining control-exhausted after the converged stage A associates the active station-control set with the outer convergence issue, without isolating a single semantic root cause.
- APPROXIMATION: Stage A keeps ElmVac as fixed-PQ approximation; stage C uses approximate positive-P dispatch weights.
- UNSUPPORTED: Droop and boundary balancing are represented only as source metadata in these stages; PowerFactory comparison is unavailable.

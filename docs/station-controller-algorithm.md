# Station-controller algorithm

## Facts

`ElmStactrl` membership, controlled bar (`rembar` when `selBus=0`), voltage target, `i_ctrl`, `i_droop`, `Srated`, `ddroop`, `pQmeas`, Q-setpoint, orientation, and `imode` are retained in canonical controls. A group is eligible for the native outer loop only when the controller is active, voltage mode, the selected bar resolves, every participant resolves, and every actuator has finite Q limits. The outer loop uses pandapower NR for the inner AC equations and caps/damps Q updates; per-unit Q saturation and redistribution are separate from controller-level target exhaustion.

## Approximate active-power sharing

The supplied task describes YTBS `Kqi` as normalized from participants' active output, but the YTBS Technical Reference equation itself was not present in the repository or supplied files. When `cvqq` is absent and a non-droop multi-unit group's members all have positive active dispatch, v6.1.6 uses

`weight[i] = P[i] / sum(P)`

as an explicit **ACTIVE_POWER_WEIGHTED_APPROXIMATION**. This follows the stated active-power basis but does not establish that it is the exact YTBS Kqi equation. The mode and finding are returned in diagnostics; it is never described as verified. Nonpositive/missing dispatch makes the group unresolved instead of applying equal weights.

## Limits and convergence

Q deltas are distributed with the declared weights. If an actuator saturates, the remaining delta is reallocated over remaining available members. If no Q capacity remains and voltage error persists, the group status is `ALL_UNITS_AT_Q_LIMIT`; the AC result is not reported as converged. Inner NR and controller target convergence are separately recorded.

## Full model counts

For the fixed 2026-09-25 DGS: 263 active controllers partition into 133 single-unit droop groups, 100 non-droop multi-unit groups, and 30 non-droop single-unit groups. All 100 multi-unit groups retain their complete member references. Current mapping classifies 34 as approximate and applies them; the others fail one or more input/Q-limit/dispatch requirements and stay source-mapped but unsolved.

## Evidence classes

- FACT: DGS participant, target, controlled-bus, and Q-bound fields are retained and tested.
- INFERENCE: The bounded outer Q loop is an engineering approximation around pandapower NR, not a claim about PowerFactory's exact controller sequence.
- APPROXIMATION: Positive-P normalized sharing is applied only to eligible groups and labelled as such.
- UNSUPPORTED: Droop laws and unresolved multi-unit groups stay out of the numerical solve.

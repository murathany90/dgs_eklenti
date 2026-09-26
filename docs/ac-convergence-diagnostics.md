# AC convergence diagnostics

The native response distinguishes the electrical inner solve from its outer controls:

- `innerSolverConverged`: inner pandapower Newton result status.
- `controlSystemConverged`: station voltage target loop status, when present.
- `innerIterations` and `outerIterations`: separate counters.
- Q-limit hits, PV-to-PQ count, residual availability, max P/Q mismatch, and unsatisfied controller groups remain diagnostic values.

A mathematically converged NR state is not published as a successful production result when an applied station-controller target is unmet. The UI names whether the inner equations converged and reports unmet voltage-controller groups; on a nonconverged result it does not show numerical AC map results. Control exhaustion remains separately visible as `ALL_UNITS_AT_Q_LIMIT` in group diagnostics; top-level status reason taxonomy is still partial.

Pandapower is the numerical engine. None of these statuses is PowerFactory validation.

## Evidence classes

- **FACT:** Full-model inner NR converged to the recorded P/Q residuals, while outer voltage control did not satisfy its targets.
- **INFERENCE:** A successful inner solve with an unmet controller target points to a model/control limitation, not a Newton residual failure.
- **APPROXIMATION:** Positive-P reactive sharing for eligible multi-unit groups is a numerical policy marked approximate.
- **UNSUPPORTED:** The remaining droop and active-power balancing laws are not numerically applied because their DGS semantics are unverified.

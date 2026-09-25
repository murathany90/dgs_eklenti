# AC non-convergence

The adapter retains `max_iteration=30`. A non-converged AC result has empty numeric bus, branch, transformer and generator arrays. Its summary still carries model and mapped equipment counts, iteration limit/result where available, the solver warning and the preflight diagnostics.

Likely cause groups are reported as measured counts instead of silently changed:

1. buses in electrical islands with no slack source;
2. PV units with missing Q limits or invalid voltage setpoints;
3. controls carried from the source but not executed by the solver, including station control and droop;
4. transformer phase angle and vector-group data not present in the DGS export;
5. elements omitted by parameter or terminal validation;
6. zero, negative, very small or compensation-sensitive reactance.

`candidateNonPositiveCompensatedPathCount` is a direct bus-pair screen and is not proof of a network-equivalent X. No automatic topology cleanup is performed.

Measured with pandapower 3.5.5 and the unchanged 30-iteration limit on 2026-09-25:

| Model | AC | DC | AC numeric arrays |
| --- | --- | --- | --- |
| 2026-09-23 12:00 | `NON_CONVERGED`, 30 iterations | `CONVERGED`, 1 iteration | Empty |
| 2026-09-25 10:00 | `NON_CONVERGED`, 30 iterations | `CONVERGED`, 1 iteration | Empty |

The preflight reports one electrical island containing the mapped slack and zero unsupplied buses in both models. It reports no invalid PV voltage setpoints, zero-impedance elements, non-finite values, or very small positive X. This rules out an unsupplied island or those screened data faults as the immediate explanation in the mapped network. It does not isolate a single Newton failure cause.

Material unresolved contributors are visible in both models: every transformer lacks an angle/clock field despite full high/low winding-connection coverage; active PV units are missing both Q limits (210/459 at 12:00 and 133/358 at 10:00); 488/479 station controllers are mapped but not solved; and ten direct compensated bus-pair paths meet the candidate non-positive-X screen. The preflight also finds ten negative-reactance elements. These are root-cause candidates for engineering review, not a proven single cause. AC remains not ready for Phase 3 until both full reference models repeatedly converge with controls and transformer phase data sufficiently represented and the result is compared against PowerFactory.

Full-model measurements are recorded by `tools/validate-full-electrical-models.mjs`; the generated JSON is local under `artifacts/` and is not committed because the source DGS files are local-only. See `docs/v6.1.2-validation.md` for the measured run results after execution.

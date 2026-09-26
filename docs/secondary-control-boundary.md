# Secondary controller and boundary

`ElmSecctrl`, `ElmBoundary`, and `ElmXnet` are separate canonical roles.

- `ElmBoundary` preserves its cubicle references, resolved buses where possible, `ciorient`, interchange enable flag, and `InterPset`.
- `ElmSecctrl` preserves `rembar`, `pPmeas`, `psetp`, `Kpf`, `imode`, and `psym` participant IDs. `pPmeas` resolves against boundary FID or name; `psym` references are kept even when the item is an external grid rather than an `ElmSym`/`ElmGenStat`.
- The local DGS resolves `AGC1.pPmeas=BOUNDARY`, `psetp=156.09 MW`, and participant `SL1`; `BOUNDARY.InterPset=156.09 MW` and three cubicles.

This is steady-state source-model preservation only. No AGC dynamics or active balancing correction is applied. The relationship does not identify how `ComLdf.iPbalancing=3` dispatches residual active power. Treating the boundary setpoint as a fixed injection or treating `SL1` as a distributed-slack participant would be an unsupported inference.

## Evidence classes

- FACT: The supplied DGS links AGC1 to BOUNDARY and carries matching 156.09 MW setpoints.
- INFERENCE: The measurement and participant relationships can be retained, but do not specify the steady-state balancing law.
- APPROXIMATION: No boundary power correction is applied in the solver.
- UNSUPPORTED: Active balancing, AGC dynamics, and iPbalancing=3 behavior remain unsupported.

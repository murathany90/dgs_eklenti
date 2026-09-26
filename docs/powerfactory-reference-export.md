# PowerFactory reference export protocol

No PowerFactory executable or independent reference export was available for this task. This document records what evidence is required to make a later comparison; it does not create or infer a reference result.

For the same DGS source/hash and active study case, export at minimum:

- convergence status, inner/outer iteration counts, and exact ComLdf settings;
- bus ID, voltage magnitude and angle; branch/transformer terminal P/Q/current/loss;
- generator P/Q, PV/PQ state, limits and limit events;
- station-controller setpoint, measurement point, selected bus, droop configuration, reactive participants, their Kqi values, and Q-limit/saturation status;
- ElmVac `itype`, actual load-flow role, P/Q sign convention, voltage setpoint, and equivalent/source impedances;
- ElmSecctrl-to-ElmBoundary/participant links and active balancing weights;
- transformer vector group/clock/phase shift and tap positions;
- solver version, project/study-case identifier, and source model hash.

Compare only matching equipment IDs and sign conventions. Keep source facts, numeric difference metrics, and interpretation separate. A pandapower comparison is an engineering cross-check, not a PowerFactory reference.

## Evidence classes

- FACT: No PowerFactory executable or independent reference was available during this work.
- INFERENCE: A same-model, same-study-case export is needed for a meaningful numerical comparison.
- APPROXIMATION: Native pandapower can be used as an engineering cross-check while keeping its engine label.
- UNSUPPORTED: Current evidence supports no PowerFactory accuracy, equivalence, or validation claim.

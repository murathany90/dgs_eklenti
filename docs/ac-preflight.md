# AC preflight diagnostics

The host runs preflight after mapping the canonical model into pandapower and before AC/DC solve. It keeps the converted network in memory and reuses it for the solve, so the counts describe the network handed to the solver. The diagnostic object is returned in `ResultSet.preflight` and the Native Messaging `DIAGNOSTICS` response.

The summary includes model and mapped counts; in-service buses; connected islands with and without an in-service external-grid reference; unsupplied buses; scheduled in-service generator P and mapped load P; their initial difference (excluding slack balancing); distinct PV and PQ bus counts; PV-unit Q-limit and voltage-setpoint coverage; transformer tap positions outside declared limits or displaced by more than ten steps from neutral; missing phase angle and winding data; unsupported or mapped-but-unsolved controls; open and closed in-service switches; model elements not represented in solver tables; invalid/non-finite and zero-impedance values; negative or very small per-unit reactance; and directly compensated bus pairs whose summed line and compensator X is non-positive.

Definitions and limits:

- “Island” is a connected component over in-service buses and the branches, transformers, series-compensation branches and closed in-service bus switches that passed the solver mapper.
- “Unsupplied” counts buses in components with no mapped in-service external grid. It is a load-flow screening count, not a protection or restoration assessment.
- Initial P imbalance is mapped in-service generator schedule minus mapped in-service load schedule. It excludes external-grid balancing and is not a solved mismatch.
- PV setpoints outside 0.5–1.5 p.u. are flagged as invalid for this generic screening. The limits do not replace project-specific voltage criteria.
- Very small X means positive absolute X below 1e-5 p.u. on a 100 MVA base. Negative X is reported separately.
- The compensated-path check only groups parallel line and series-compensator elements with the same bus pair and sums their source X values. This is a candidate-path indicator, not an equivalent-network reduction.
- Non-finite values are counted recursively. JSON `null` values are missing-data values, not NaN/Inf.

Preflight does not adjust solver settings or repair, suppress or synthesize model data. The fixed AC limit remains 30 Newton iterations. Source phase angles and reactive limits are never invented to improve convergence.

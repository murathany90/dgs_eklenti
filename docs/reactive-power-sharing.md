# Reactive-power sharing

## Facts from the available sources

The task description states that YTBS station-controller participation coefficients `Kqi` are normalized from participating generators' active outputs. The exact YTBS technical-reference formula was not supplied. DIgSILENT documents Q(V) droop at generator and station-controller level, but that is a separate law from the inter-unit reactive-sharing weights: [DIgSILENT Q(V) droop FAQ](https://faq.digsilent.de/en/faq-reader-powerfactory/how-to-model-the-qv-characteristic-according-to-vde-ar-n-4120-tab-hs.html).

## Approximate policy implemented

For multi-unit voltage groups with no exported `cvqq`, all members in service, positive known P, and finite ordered Q limits, the mapper normalizes positive active dispatch `P_i/sum(P)`. The coordinator applies the resulting weights to a bounded Q correction and redistributes the remainder after an individual unit reaches Qmin/Qmax. A source `cvqq` vector, if present and valid, takes precedence.

This policy is labelled `ACTIVE_POWER_WEIGHTED_APPROXIMATION`, appears as `APPROXIMATE` in canonical mapping and diagnostics, and remains outside any PowerFactory validation claim. Missing, zero, or negative P is not converted with `abs(P)` and does not produce weights. A later source-backed YTBS equation should replace this policy.

## Tests

Unit coverage checks exact normalized weights for a 25/75 MW example and confirms that zero dispatch returns `UNRESOLVED`. Native tests exercise an approximate controller through the outer Q loop and verify the mode remains visible in controller diagnostics.

## Evidence classes

- FACT: The task describes Kqi as normalized from participant active output; its cited primary YTBS technical reference was not supplied.
- INFERENCE: Positive dispatch normalization is a plausible interpretation, not proof of the exact formula.
- APPROXIMATION: The solver uses these weights only when every member has positive P and valid Q limits.
- UNSUPPORTED: Groups without valid source shares/dispatch and unverified droop groups receive no invented weights.

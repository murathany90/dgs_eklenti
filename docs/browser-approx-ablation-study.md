# Browser approximation feature ablation

**Status: SKIPPED / CANONICAL_FEATURE_SWITCHES_UNAVAILABLE.** `BrowserApproxSolver` returns typed ResultSet rows from the existing legacy AC-PQ analysis, including mapped fixed-PQ ElmVac inputs with an explicit approximation label. It still runs the legacy reduced 66 kV+ model and does not consume canonical station Q sharing, droop, boundary, or secondary-control data. The worker has no per-feature switches to run the requested baseline → ElmVac → PV/PQ → Q limits → station sharing → remote control → droop → warm-start matrix. Repeating the same legacy solve would not measure those feature effects.

**Full-vs-approx AC comparison: SKIPPED / NO_NATIVE_NUMERIC_AC_RESULT.** The full 25 September model's pandapower inner NR converged, but outer controls ended `CONTROL_EXHAUSTED`; native ResultSet correctly contains no AC numeric rows. Browser-only rows cannot be used to fabricate a delta against that failed native calculation. After both engines return numeric AC rows for the same model/scenario, the comparison UI selects cached results only when engine, model hash, mode, and scenario hash match.

The Browser solver remains `APPROXIMATE` and reduced-scope. This report does not label a native pandapower comparison as PowerFactory validation. PowerFactory reference: **NOT AVAILABLE**.
## Evidence classes

- FACT: The native full AC run returned no numerical rows; BrowserApprox uses a reduced legacy model and maps ElmVac only as fixed-PQ demand.
- INFERENCE: A browser feature ablation requires toggles that the current worker does not expose.
- APPROXIMATION: Browser result rows remain reduced-scope approximate outputs.
- UNSUPPORTED: A full-vs-browser AC delta and canonical browser feature effects are not measured here.

# Solver validation and test scope

The checked-in 33 KB `dgs-smoke-from-20260923.json` is a real excerpt. It lacks many connectivity and type rows; it is an import and missing-field test, not a solvable full network. The two ~143 MB local DGS files under `kontrol1/` are not committed. Existing integration tests run them if present and report `SKIP/SOURCE_UNAVAILABLE` otherwise. CI does not claim the missing full models passed.

Deterministic host fixtures cover 2-bus AC and DC, 3- and 4-bus, PV/PQ with Q limits, transformer tap and phase shift, parallel generators, an island, shunt and series compensation. The DC two-bus angle is compared to the independent small-angle reactance equation. AC active power is checked against an independent power balance, including resistive loss. Other cases verify physical limits and output structure; they are regression tests, not an independent PowerFactory comparison.

No independent PowerFactory result data is present in the repository or working directory. Therefore no `VALIDATED` label is assigned. Convergence means pandapower converged on the mapped network; it does not establish equal controls or equal results in PowerFactory. Missing transformer phase angles and Q limits remain material limitations.

Run: `npm test`, `npm run test:integration`, `python -m unittest discover -s native-host/python/tests -v`, `npm run build`, `npm run test:e2e`. The optional full browser regression uses `DGS_E2E_MODEL=kontrol1/20260923_1200_SN3_TR0.json`.

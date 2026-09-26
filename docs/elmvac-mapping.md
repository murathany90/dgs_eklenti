# ElmVac mapping

## Facts

`ElmVac` has a separate canonical representation in `internationalConnections[]`. It retains terminal/bus, `Unom`, `usetp`, positive/negative/zero-sequence R/X, `itype`, `Pload`, `Qload`, service state, and DGS source identity. It is not merged with `ElmXnet`, station balancing, or interchange boundary data.

The checked-in source `kontrol1/20260925_1000_SN5_TR0.json` has 12 ElmVac rows, 8 in service. The active raw-field totals are Pload = 785.98 MW and Qload = −137.49 MVAr. These source facts are regression-checked.

## Approximation used by pandapower

The adapter creates a separate pandapower `load` row from `Pload/Qload`, with consumption-positive signs, including negative values as reverse fixed-PQ demand. This makes the values visible in preflight balance and in the solver. It does **not** model ElmVac as an ideal voltage source, Thevenin source, or impedance. `itype`, `usetp`, and sequence impedances remain preserved but do not affect the numerical solve. The ResultSet marks these values `APPROXIMATE` and lists the mapping caveat.

BrowserApprox now adds in-service ElmVac `Pload/Qload` to its reduced 66 kV+ network as fixed-PQ demand when the bus can be routed. Its diagnostics report total, in-service and mapped counts with P/Q totals. The same source-semantics caveat applies; this does not create an ElmVac voltage source in the browser solver.

The official DIgSILENT FAQ confirms that ElmVac is an AC voltage source in EMT use, but does not establish the load-flow meaning of the DGS `itype=2` code or the YTBS use of `Pload/Qload`; therefore that reference is not used to claim a load-flow equivalence: [DIgSILENT ElmVac FAQ](https://www.digsilent.de/en/faq-reader-powerfactory/how-can-i-replay-an-emt-or-rms-time-series-in-an-emt-simulation.html).

## Sign convention tests

Tests assert that positive P and negative Q are passed without sign inversion or absolute-value conversion. An out-of-service ElmVac remains a mapped but inactive pandapower row and is excluded from active P/Q preflight totals. `initialPImbalanceMw` now includes active ElmVac Pload, so the old `generation - ElmLod` subtotal is not presented as the whole model imbalance.

## Unsupported

No independent YTBS / PowerFactory load-flow export was available to confirm whether `Pload/Qload` are fixed PQ injections, source operating point, or another ElmVac model mode. The approximation must be replaced only when this semantic is confirmed against a reference export.

## Evidence classes

- FACT: DGS source values and signs are retained; all twelve ElmVac rows map, with eight active. The browser regression checks all eight active rows route into the reduced graph for this model.
- INFERENCE: A separate fixed-PQ row makes exported P/Q visible without conflating ElmVac with ElmXnet.
- APPROXIMATION: Native and browser solvers treat Pload/Qload as fixed-PQ consumption-positive values.
- UNSUPPORTED: ElmVac itype, voltage-source, and impedance effects are not represented in load flow.

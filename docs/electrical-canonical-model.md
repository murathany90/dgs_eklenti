# Electrical CanonicalNetwork (v6.1)

`src/model/electrical-types.ts` defines electrical buses, lines, line sections, two winding transformers, synchronous and static generators, loads, shunts, series capacitors, external grids, switches and controls. Each equipment item keeps its DGS class and FID. Unknown source fields remain `null`, with a mapping finding. `ElectricalCanonicalNetwork.completeness` is `PARTIAL` when information needed for a full calculation is missing.

The v6.0 inventory `CanonicalNetwork` remains for map, SLD and legacy compatibility. Its optional `electrical` member is the v6.1 solver input. The model worker creates this member before the legacy UI receives the raw DGS document. IndexedDB stores the compact electrical form instead of a second copy of the full inventory. The legacy UI still needs one structured clone of raw DGS; removing that clone is a later migration.

`FULL` denotes the target input network scope, not equivalence to PowerFactory. The pandapower output is `PARTIAL` if a source value is unknown or a model behavior is approximated. BrowserApproxSolver remains `TRANSMISSION_REDUCED` and is limited to the v5.5 66 kV+ calculation.

Source and solver values are separate. DGS `pgini`, `plini`, `usetp` and nameplate data are inputs. Bus voltage, branch power and loss are populated only by solver results or a verified external measurement.

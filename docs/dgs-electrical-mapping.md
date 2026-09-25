# DGS electrical mapping

The mapping is in `src/model/dgs/` and is covered by deterministic unit fixtures and the two available local full DGS regressions. FIDs, not display names or ID prefixes, resolve references.

| DGS class | Electrical mapping | Key fields |
| --- | --- | --- |
| ElmTerm | bus | `FID`, `uknom`, `outserv` |
| StaCubic | terminal relation | `fold_id` to ElmTerm |
| ElmLne, TypLne, ElmLnesec | line and sections | `bus1/bus2`, `dline`, `rline/xline/bline/sline`; `bline` µS/km to S/km |
| ElmTr2, TypTr2 | two winding transformer | `strn`, `utrn_h/l`, `uktr`, `pcutr`, tap fields, `pfe`, `curmg` |
| ElmSym, ElmGenStat, TypSym | generator | `pgini`, `qgini`, `usetp`, `av_mode`, P/Q limits where exported; TypSym `Q_min/Q_max` are a flagged fallback for ElmSym |
| ElmLod | load | `plini`, `qlini` |
| ElmShnt | shunt | `shtype`, `qrean/qcapn`, `ncapa/ncapx` |
| ElmScap | series capacitor | `bcap` S; X = −1/B Ω |
| ElmXnet | external grid | `usetp`, Q limits, optional angle |
| ElmCoup | bus switch | `bus1/bus2`, `on_off` |
| StaSwitch | finding | no reliable terminal model in supplied export |

`TypLne.sline` is treated as kA, matching the existing v5.5 interpretation. `TypTr2.pcutr` kW yields `vkr_percent = pcutr / (10 × strn MVA)`. Line section impedances and shunt B are summed; the minimum section current rating is retained. pandapower receives an equivalent PI line, so internal section voltage and loading are not available.

The supplied full models have no transformer phase shift field. Each such transformer keeps `phaseShiftDeg: null`; the adapter chooses 0° only to run an explicitly `PARTIAL` calculation and records an unsupported item. An absent external grid angle is an arbitrary 0° reference, also recorded. Dynamic OLTC, remote regulation, droop and reactive participation are not inferred.

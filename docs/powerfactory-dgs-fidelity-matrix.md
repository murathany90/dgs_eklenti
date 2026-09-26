# PowerFactory / DGS fidelity matrix — v6.1.6

This is a source-to-solver audit, not a PowerFactory validation report. The field names below are from the local 2026-09-25 DGS export. The complete source attribute inventory and measured counts are in [v6.1.6-model-audit.json](v6.1.6-model-audit.json). `StaSwitch` is absent from that export. `BrowserApprox` still runs the legacy 66 kV+ workflow; it does not consume `ElectricalCanonicalNetwork` directly.

Status meanings: **SUPPORTED** means the stated field reaches an active solver element/controller; **PARTIAL** means only some semantics are applied; **APPROXIMATE** means a documented inference is used; **UNSUPPORTED** means retained or inspected but not applied; **NOT_REQUIRED** means descriptive/source-only data not used in balanced steady-state load flow.

| DGS class / key source attributes | CanonicalNetwork field | pandapower field / controller | BrowserApprox | Status / limit |
|---|---|---|---|---|
| `ElmTerm`: `FID,loc_name,uknom,outserv,vmin,vmax,iUsage,phtech` | `buses[].{id,name,nominalKv,inService}`; voltage limits/usage retained only where explicitly mapped | `bus.{name,vn_kv,in_service}` | Legacy buses are reduced by old workflow; no canonical path | PARTIAL |
| `StaCubic`: `FID,fold_id,obj_id,obj_bus` | `busFromCubic()` resolves terminals through the exported terminal reference | Used to resolve element bus indices; no independent pp element | No canonical cubic mapping | PARTIAL; `obj_id` not used as electrical injection |
| `ElmCoup`: `FID,bus1,bus2,on_off,outserv,typ_id,aUsage` | `switches[].{fromBus,toBus,closed,inService,usage}` | bus-bus switch | Legacy switch/topology path | PARTIAL; missing `outserv` defaults in-service |
| `StaSwitch` | None | None | None | UNSUPPORTED; class absent in supplied DGS |
| `ElmLne`: `FID,bus1,bus2,typ_id,dline,outserv` | `lines[]` | `line.{from_bus,to_bus,length_km,r_ohm_per_km,x_ohm_per_km,c_nf_per_km,max_i_ka}` | Reduced legacy line model | PARTIAL; multi-section equivalents aggregate |
| `ElmLnesec`: `FID,fold_id,index,typ_id,dline` | `CanonicalLine.sections[]`, source section FIDs | Aggregated equivalent PI line | No section-level canonical input | PARTIAL |
| `TypLne`: `uline,sline,rline,xline,bline,rline0,xline0,bline0` | Positive-sequence line voltage/rating/R/X/B | pandapower positive-sequence PI line | Reduced legacy AC/DC inputs | PARTIAL; zero-sequence fields not used in balanced solve |
| `ElmTr2`: `FID,bushv,buslv,typ_id,nntap,outserv,i_auto,iblock,i_uopt,i_uoptCont,iTaps,mTaps` | transformer terminals, snapshot tap and service state | `trafo` nameplate, tap and loss fields | Legacy reduced transformer model | PARTIAL; automatic OLTC/switch logic not applied |
| `TypTr2`: `strn,utrn_h,utrn_l,pcutr,uktr,pfe,curmg,nntap0,ntpmn,ntpmx,dutap,tap_side,tr2cn_h,tr2cn_l,oltc` | transformer impedance, ratings, tap range, winding labels | transformer equivalent and static tap | Legacy subset | PARTIAL; no phase/clock angle in export; `uk0tr/x0tor0` unused |
| `ElmSym`: `bus1,ngnum,av_mode,pgini,qgini,usetp,Pmin_uc,Pmax_uc,cQ_min,cQ_max,iqtype,ip_ctrl,typ_id,outserv` | `generators[]` including P/Q, PV/PQ role, setpoint, Q bounds, reference flag | `gen` for finite-Q PV; `sgen` for fixed P/Q and station actuator | Legacy gen dispatch; no canonical control data | PARTIAL; P/Q multiplied by `ngnum` |
| `TypSym`: `Q_min,Q_max` and machine parameters | type Q limits when `iqtype=1`; `typeFid` | gen Q bounds | No canonical type-limit path | PARTIAL; electrical machine dynamics unused |
| `ElmGenStat`: `bus1,ngnum,av_mode,pgini,qgini,usetp,Pmin_uc,Pmax_uc,pQlimType,outserv` | canonical generator and capability curve data where numeric bounds resolve | `gen` or `sgen` | Legacy generator subset | PARTIAL; OPF option codes are not treated as MVAr limits |
| `ElmLod`: `bus1,plini,qlini,u0,outserv` | `loads[]` P/Q and bus | `load.{p_mw,q_mvar}` | Legacy reduced load | SUPPORTED for constant-PQ fields; voltage dependence absent |
| `ElmShnt`: `bus1,ushnm,shtype,qrean,qcapn,ncapa,ncapx,iswitch,i_opt,i_optCont,iTaps,mTaps` | shunt snapshot Q, step and tap-table values | static pp shunt snapshot | Legacy fixed shunt subset | PARTIAL; no inferred automatic switching |
| `ElmScap`: `bus1,bus2,ucn,bcap,outserv` | series compensator and equivalent X | pp impedance branch | Legacy series path not guaranteed | PARTIAL |
| `ElmXnet`: `bus1,usetp,bustp,cQ_min,cQ_max,outserv` | `externalGrids[]` | `ext_grid` voltage/angle reference | Legacy slack role | PARTIAL; absent angle selects 0° reference; balancing shares not inferred |
| `ElmVac`: `bus1,Unom,usetp,R1,X1,R2,X2,R0,X0,itype,Pload,Qload,outserv` | `internationalConnections[]`; raw source fields preserved | Pload/Qload added as a separately tracked fixed-PQ `load` approximation; never `ext_grid` | Pload/Qload injected as fixed-PQ demand for routable nodes in the legacy 66 kV+ graph; diagnostics count mapped records and totals | APPROXIMATE; `itype` and Thevenin/source impedance behavior are not solved |
| `ElmStactrl`: `rembar,selBus,usetp,i_ctrl,psym,i_droop,Srated,ddroop,pQmeas,qsetp,iQorient,imode` | station `controls[]`, participants and raw control fields | bounded outer Q sharing for resolved groups; approximate positive-P dispatch shares flagged | No canonical station-control path | PARTIAL; droop law and some orientation/measurement semantics remain unknown |
| `ElmSecctrl`: `rembar,pPmeas,psetp,Kpf,imode,psym,i_net,iexchange` | `secondaryControllers[]`; `pPmeas` boundary relation and participant IDs | source-only diagnostics; no AGC balancing action | No canonical secondary-control path | UNSUPPORTED for solver action; source references preserved |
| `ElmBoundary`: `cubicles,ciorient,iInterChg,InterPset` | `boundaries[]` with resolved cubicle buses and orientations | source-only diagnostics | No canonical boundary path | PARTIAL; interchange target not enforced |
| `ComLdf`: all 12 load-flow option fields | `loadFlowSettings.rawValues` | `iopt_lim`, `itrlx`, `ictrlx` used; unknown semantics remain raw | No canonical ComLdf path | PARTIAL; `iPbalancing=3` explicitly UNKNOWN |

## Explicit status by ComLdf field

| Field | v6.1.6 handling | Status |
|---|---|---|
| `iopt_lim` | `0/1` controls Q-limit enforcement; other values remain unknown | PARTIAL |
| `itrlx` | positive integer → pandapower NR iteration cap | PARTIAL; raw value is not a verified tolerance match |
| `ictrlx` | positive integer → outer control cap | PARTIAL |
| `errlf`, `erreq` | preserved raw; units/interpretation unresolved | UNSUPPORTED with reason |
| `iopt_chctr`, `iShowOutLoopMsg`, `iopt_initOPF`, `iItAlgStag`, `iInterChg`, `iInterType` | preserved raw; no verified implementation | UNSUPPORTED with reason |
| `iPbalancing` | raw code preserved; `3` behavior is UNKNOWN and has no numerical effect | UNSUPPORTED with reason |

## Evidence boundaries

- **FACT:** The 2026-09-25 source has 12 ElmVac rows, 8 in service, with active Pload total 785.98 MW and Qload total −137.49 MVAr. The local audit records the SHA-256.
- **INFERENCE:** Positive-power dispatch normalized over station members approximates the supplied task's described Kqi weighting; the YTBS Technical Reference formula was not present locally to verify the exact equation.
- **APPROXIMATION:** ElmVac Pload/Qload are interpreted consumption-positive as fixed PQ for pandapower preflight/solve, while its type, voltage source and impedance behavior remain out of the numerical model.
- **UNSUPPORTED:** No PowerFactory result/reference is available; this matrix is not a compatibility percentage or validation claim.

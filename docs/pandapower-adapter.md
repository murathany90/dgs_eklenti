# pandapower adapter

`native-host/python/ytbs_solver_host/network_mapper.py` converts the electrical canonical model to pandapower 3.5.5. It uses `create_buses` and `create_switches` in bulk for the large YTBS topology. Lines use length, R/X in Ω/km, B converted from S to nF/km at 50 Hz, and kA rating. Transformers use nameplate voltage, `vk_percent`, `vkr_percent`, no-load losses and exported static tap. PV generators use `gen`, PQ generators use `sgen`, loads use `load`, external grids use `ext_grid`, switched shunts use their current static step, and series capacitors use negative-X `impedance` elements.

AC calls `runpp(algorithm='nr', calculate_voltage_angles=True, enforce_q_lims=True, check_connectivity=True)`. DC calls `rundcpp(check_connectivity=True)`. The adapter never substitutes a missing branch impedance or rating. A skipped element or an explicit approximation is recorded in `unsupported` and makes validation `PARTIAL`. Unknown trafo phase shift is modeled as 0° solely for an approximate solve, with a per-element warning. Transformer automatic OLTC, remote generator regulation, droop and source-specific reactive sharing are not emulated.

| Capability | Status |
| --- | --- |
| Slack, PV/PQ, voltage setpoint | SUPPORTED |
| Multiple external grids | PARTIAL; source participation and limits are not exported to solver |
| PV→PQ Q limit enforcement | SUPPORTED for NR when limits present |
| P limits, parallel generator Q sharing | PARTIAL |
| Static tap and static switched shunt step | SUPPORTED when fields present |
| Series capacitor, line sections, phase shift | PARTIAL |
| Automatic OLTC, remote voltage control, reactive participation, droop | UNSUPPORTED |

The complete matrix is exported by `src/model/dgs/controls-mapper.ts`. A numerical convergence flag is not a PowerFactory match.

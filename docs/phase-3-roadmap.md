# Phase 3 technical debt (not implemented in v6.1)

1. Remove the legacy raw DGS clone by moving v5.5 view indexes and map/SLD selectors behind worker queries. Keep equipment FID identity and existing H5846 scenarios.
2. Stream or incrementally decode large JSON and record true peak RSS in browser and host. Current File read, `JSON.parse` and structured clone still require substantial memory.
3. Use pandapower bulk element constructors for all large element families and implement solver cancellation through a separate worker process.
4. Obtain transformer vector-group/phase-shift, regulator, remote control, droop and reactive participation exports; model them only when source fields are verified.
5. Resolve StaSwitch and any additional PowerFactory classes used in future DGS exports. Preserve source provenance and explicit unsupported counts.
6. Add independent PowerFactory reference cases and automatic bus/line/trafo/generator/loss comparisons before claiming equivalence or `VALIDATED`.
7. Support native host version negotiation, installed-host UI guidance, durable reference import, and scenario overrides through the typed electrical model.

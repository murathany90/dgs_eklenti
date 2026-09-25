# v6.1.2 UI architecture

The workspace keeps the existing DGS parser, map, station and line selection, single-line diagram, capacity, flow animation and scenario code. A small presentation shell routes those features through five main pages: Model, Map, Single-Line Diagram, Analysis and Scenario. Help and Settings are helper actions in the header. Model pages contain Summary, Equipment, Operating Data and Data Quality.

`src/presentation/equipmentPresentation.ts` is the presentation registry. It owns Turkish equipment names, categories, identity labels, field labels and default-mode text translation. It does not rename DGS fields, source classes, FIDs or canonical model fields. The compatibility inventory and raw validation table remain under the closed “Technical DGS fields” disclosure. Settings can enable that view for debugging.

The Analysis Center is the normal analysis entry point. Old result panels remain in a closed disclosure so the legacy result browser remains available. The four status cards are rendered from `AnalysisState`: selected engine, selected mode, active result, most recent browser result, most recent local result, reference result and model integrity. Selecting a different engine changes the metadata source immediately; legacy solver counters never overwrite a pandapower result.

The model and scenario views retain their existing data and event handlers. Scenario changes remain virtual, are stored independently, and do not change the source DGS model. The local full-network engine reports that it does not apply scenario overrides.

Playwright checks the visible text in each main view with technical mode off, checks the opt-in technical view, captures 1440×900 UI review screenshots and checks the 1280×720 layout for horizontal overflow. CI publishes these files as the `ui-review` artifact.

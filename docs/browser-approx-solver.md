# Tarayıcı Yaklaşık Çözüm

The user-facing name remains **Tarayıcı Yaklaşık Çözüm**. It is a visualization/scenario preview, is reduced scope, and is not a PowerFactory-equivalent or full-network AC result.

Current v6.1.6 status: `BrowserApproxSolver` invokes the legacy 66 kV+ browser analysis and converts its calculation rows into bus, line, transformer and generator ResultSet rows. Canonical equipment data is used to attach known bus endpoints and nominal voltage bases. The legacy graph now injects in-service ElmVac `Pload`/`Qload` as fixed-PQ demand at routable buses, and reports total, in-service, mapped, P and Q counts in diagnostics. This is explicitly an approximation: voltage-source, `itype`, and source-impedance behavior are not modeled. The legacy numerical solver still does **not** consume the complete `ElectricalCanonicalNetwork`; canonical multi-unit station sharing, droop, boundary setpoints, and canonical warm-start behavior remain unsupported or partial.

DC preview must leave voltage magnitude, reactive power, and reactive losses unavailable. The legacy browser path is AC-PQ only (`dc=false` capability). Its existing PV/slack/island and limited direct high-voltage Q-limit handling is retained; these are not full canonical controls. Shared equipment values can now be compared in the UI when both engines have cached results. The requested feature-by-feature browser ablation is still **SKIPPED** because the legacy implementation has no controlled switches for the canonical ElmVac/control/Q-limit stages. This limitation is explicit in [browser-approx-ablation-study.md](browser-approx-ablation-study.md).

## Evidence classes

- FACT: The worker solves the reduced legacy network and emits approximate ResultSet rows.
- INFERENCE: Those rows are suitable for previewing the covered reduced graph.
- APPROXIMATION: Returned values and inferred end-loss sums are labelled approximate.
- UNSUPPORTED: ElmVac source mode/impedance, station Q sharing/droop, boundary balancing, complete canonical Q-limit semantics, and warm start are not consumed; browser feature ablation is skipped.

# Q(V) droop control

## Verified general semantics

DIgSILENT's official FAQ says Q(V) droop is available for generator and station-controller load-flow reactive control. It defines relative droop in percent using voltage relative to nominal voltage and Q relative to rated power (`Sn`), and notes that the characteristic acts outside its deadband: [DIgSILENT Q(V) droop FAQ](https://faq.digsilent.de/en/faq-reader-powerfactory/how-to-model-the-qv-characteristic-according-to-vde-ar-n-4120-tab-hs.html).

## DGS-specific gaps

That general formula does not verify which `ElmStactrl.ddroop` enum/sign/scale the supplied DGS uses, whether `Srated` matches the exact FAQ base, which measurement target `pQmeas` selects, how `rembar` and `selBus` combine, or the sign semantics of `iQorient`. These fields are retained verbatim. The local model's active 133 droop controllers have `Srated` and `ddroop`; the export does not provide a usable `pQmeas` target/deadband mapping for them. No arbitrary sign, gain, or zero is applied.

## Status

The 133 active droop controllers are **PARTIAL/source-mapped, not numerically applied**. Preflight distinguishes their total/partial/applied counts. `droopPercent` and `droopRatedMvar` remain null unless a verifiable source mapping becomes available. This is an explicit limitation rather than silent exclusion.

## Evidence classes

- FACT: DIgSILENT's FAQ describes a general Q(V) characteristic using voltage and rated-power bases.
- INFERENCE: That rule may be relevant to this DGS controller, but does not settle this export's enum or sign conventions.
- APPROXIMATION: No droop approximation is numerically applied.
- UNSUPPORTED: DGS-specific ddroop, Srated, measurement, orientation, and deadband mapping is unresolved.

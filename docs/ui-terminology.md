# v6.1.2 UI terminology

| Internal source name | Default display |
| --- | --- |
| `ElmSite` | Trafo Merkezi |
| `ElmTerm` | Bara |
| `ElmLne` | Enerji İletim Hattı |
| `ElmTr2` | Transformatör |
| `ElmSym`, `ElmGenStat` | Üretim Ünitesi |
| `ElmLod` | Tüketim / Yük |
| `ElmShnt` | Şönt Ekipman |
| `ElmScap` | Seri Kompanzasyon |
| `ElmCoup`, `StaSwitch` | Kesici / Ayırıcı |
| `StaCubic` | Hücre / Bağlantı Noktası |
| `TypLne`, `TypTr2` | Teknik Tip; only visible in technical details |

Equipment names come before identities. Search prompts and table labels say “Ekipman adı veya kimliği”; line, bus, transformer and source lists use the relevant identity label. The raw source identity remains unchanged in exports and the canonical model.

| Internal value | Default display |
| --- | --- |
| `NON_CONVERGED` | Yakınsamadı |
| `CONVERGED` | Yakınsadı |
| `PARTIAL` | Kısmi |
| `COMPLETE_UNVALIDATED` | Doğrulanmadı |
| `TRANSMISSION_REDUCED` | İletim ağına indirgenmiş |
| `BUS_BRANCH` | Bara-kol gösterimi |
| `NODE_BREAKER` | Düğüm-kesici gösterimi |

The native engine is called “Yerel Tam Şebeke Çözücüsü”; the reduced browser engine is “Tarayıcı Yaklaşık Çözüm”. Internal IDs and raw values stay available in the technical details and machine-readable exports.

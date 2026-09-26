# Phase 3 readiness gate · v6.1.5

Phase 3 başlatılmadı. N-1, kısa devre, OPF veya Tauri migration eklenmedi. PR birleştirilmedi.

| Gate | Durum | Kanıt / sınır |
| --- | --- | --- |
| `UI_READY` | TRUE | Extension UI smoke ve çelişkili host/hesap state E2E PASS. |
| `FULL_MODEL_UI_READY` | TRUE | 143 MB model direct ve sidepanel yolunda yaklaşık 14,6 saniyede hazır; 60 saniye bütçesi PASS. |
| `BASE_DC_READY` | TRUE | İki gerçek tam model DC bir iterasyonda yakınsadı; voltaj ve Q alanları unavailable kalır. |
| `BASE_AC_READY` | FALSE | İki üretim AC hesabı 50 outer iterasyonda remote-control hedeflerini karşılamadı; sayısal AC sonuçları gizlendi. |
| `MODEL_CONTROL_MAPPING_READY` | FALSE | 39/30 station grubu çalıştırılabiliyor; 317/233 aktif kontrol kaydı, paylaşım grupları ve droop çözümlenmedi. |
| `SCENARIO_STATE_READY` | TRUE | Hesap/host state E2E regresyonu PASS; v6.1.4 senaryo kimliği davranışı korunuyor. |
| `NATIVE_HOST_CONNECTIVITY_READY` | TRUE | Gerçek Chrome HELLO/CAPABILITIES ve UI health E2E PASS. |
| `FULL_MODEL_NATIVE_E2E_READY` | TRUE | Gerçek 143 MB DGS ile Chrome native AC `NON_CONVERGED` güvenli sonucu ve DC `CONVERGED` sonucu E2E PASS. |
| `MAP_RESULTS_READY` | TRUE | Electrical map/results E2E PASS; native DC alan availability ve iki uç sonuç korundu. |
| `POWERFACTORY_REFERENCE_READY` | FALSE | Aynı DGS modelleri için bağımsız PowerFactory ResultSet yoktur. |

Tam metrikler, AC tanı profilleri ve sınırlamalar: [v6.1.5 doğrulama raporu](v6.1.5-validation.md). Yerel DGS dosyaları CI'da bulunmadığından gerçek tam-model CI adımları `SKIP/SOURCE_UNAVAILABLE` kalır; PR CI sonucu ayrıca değerlendirilir. Bu gate Phase 3'e geçiş izni değildir.

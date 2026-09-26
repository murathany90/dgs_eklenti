# Phase 3 readiness gate · v6.1.4

Phase 3 başlatılmadı. N-1, kısa devre, OPF veya PyPowSyBl eklenmedi. PR birleştirilmez.

| Gate | Durum | Kanıt / sınır |
| --- | --- | --- |
| `UI_READY` | TRUE | Durum ayrımı, önbellek kaynağı, motor değişimi, marka ve mevcut extension smoke doğrulaması. |
| `FULL_MODEL_UI_READY` | TRUE | Gerçek 143.026.320 bayt model: doğrudan 14.676 ms; sidepanel 14.838 ms. İki yol da 60.000 ms altında. |
| `BASE_DC_READY` | TRUE | Gerçek tam model Chrome Native Messaging DC hesabı yakınsıyor; aktif güç sonuçları var. Gerilim büyüklüğü ve reaktif güç null. Önceki iki-model DC tabanı korunuyor. |
| `BASE_AC_READY` | FALSE | Tam model varsayılan AC hesabı 30 Newton iterasyonunda NON_CONVERGED; sayısal AC sonuçları gösterilmez. |
| `MODEL_CONTROL_MAPPING_READY` | FALSE | Kaynak istasyon/remote control verileri korunuyor; reaktif paylaşım, droop ve kontrol davranışı çözülmüş veya bağımsız doğrulanmış değil. |
| `SCENARIO_STATE_READY` | TRUE | Hat, anahtar, restore terminal, undo/reset ve sanal enerjilendirme hesap kimliğinde. Senaryo değişimi eski sonucu geçersiz kılar. |
| `NATIVE_HOST_CONNECTIVITY_READY` | TRUE | Registry→manifest→executable→direct framed HELLO→gerçek Chrome CAPABILITIES ve DGS'siz UI health doğrulandı. |
| `FULL_MODEL_NATIVE_E2E_READY` | TRUE | 143 MB gerçek model Chrome ile yüklendi; native aktarım, AC NON_CONVERGED ve DC CONVERGED durumları gerçek host üzerinden doğrulandı. AC yakınsama kapısından ayrıdır. |
| `MAP_RESULTS_READY` | TRUE | Geçerli activeResult, ortak ekipman indeksi, iki uç P/Q/I, isim/kV, eksik alan ve stale koruması hedefli E2E ile doğrulandı. Motorun üretmediği alanlar UNAVAILABLE kalır. |
| `POWERFACTORY_REFERENCE_READY` | FALSE | Aynı modele ait bağımsız PowerFactory ResultSet V2 referansı sağlanmadı. |

Ölçümler ve PASS/FAIL/SKIP ayrımı: [v6.1.4-validation.md](v6.1.4-validation.md). Gerçek kaynak dosyalarının bulunmadığı CI full-model testleri `SKIP/SOURCE_UNAVAILABLE` sayılır; yerel PASS sonucu CI'ye aktarılmaz. Bu tablo sonraki aşamaya geçiş izni değildir.

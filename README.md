# YTBS / PowerFactory DGS Şebeke Görüntüleyici v6.1 — Aşama 2

DIgSILENT PowerFactory DGS JSON modellerini yerel olarak açan Chrome Manifest V3 uzantısı. v5.5'in harita, hat ve trafo merkezi seçimi, tek hat şeması, fider görünümü, kapasite, senaryo ve deneysel yaklaşık hesabını korur. v6.1 elektriksel kanonik model, yerel pandapower AC/DC host ve typed ResultSet V2 ekler.

## Kurulum ve kullanım

```sh
npm install
npm run typecheck
npm run lint
npm test
npm run test:integration
npm run build
python -m pip install -e native-host/python
python -m unittest discover -s native-host/python/tests -v
```

Chrome'da `chrome://extensions` → Developer mode → Load unpacked → bu projenin `dist/` klasörünü seçin. Araç çubuğundaki uzantı simgesini tıklayarak yan paneli açın. DGS JSON dosyasını panelden seçip **Çalışma Alanını Aç** düğmesine basın. Dosya doğrudan çalışma alanındaki **Model** sekmesinden de seçilebilir. Büyük model, senaryo ve sonuçlar IndexedDB'de yerel olarak saklanır. Uzantı host izni veya uzak JavaScript istemez. pandapower için Windows yerel host kurulumunu [native messaging](docs/native-messaging.md) belgesi anlatır; host kurulmamışsa arayüz `HOST NOT INSTALLED` gösterir.

`npm run test:e2e` paketlenmiş Chromium uzantısıyla smoke testi çalıştırır. Yerel tam model tarayıcı regresyonu için PowerShell'de:

```powershell
$env:DGS_E2E_MODEL='kontrol1/20260923_1200_SN3_TR0.json'
npm run test:e2e
npm run test:e2e:native
```

## Kaynak yapısı

| Yol | Görev |
| --- | --- |
| `src/legacy/` | v5.5'in CSP uyumlu dış JS/CSS modülleri; davranış koruma katmanı |
| `src/workspace/` | Tam sekme çalışma alanı, kanonik adaptör, doğrulama ve sonuç kaynağı |
| `src/sidepanel/`, `src/background/` | Uzantı yan paneli ve araç çubuğu |
| `src/model/`, `src/validation/`, `src/solvers/`, `src/storage/` | Yeni türler, kayıt defteri, doğrulama, çözücü arayüzü, IndexedDB |
| `native-host/python/` | Chrome Native Messaging protokolü ve pandapower 3.5.5 adaptörü |
| `workers/` | Paketlenmiş parser, topoloji ve v5.5 çözücü worker dosyaları |
| `assets/data/` | 315 hatlık sürümlü mevsimsel kapasite JSON'u ve SHA-256 metadata |
| `tests/`, `docs/fixtures/` | Unit, gerçek DGS entegrasyon ve Chromium uzantı testleri |

## Elektriksel durum ve sınırlar

Analiz ekranında Browser Approx. (`TRANSMISSION_REDUCED`) ve pandapower (`FULL` hedef, çoğu gerçek DGS'de `PARTIAL` doğrulama) seçilir. Gerçek 12:00 ve 10:00 tam modellerde pandapower DC yakınsadı; AC 30 Newton iterasyonunda yakınsamadı. Eksik trafo faz kayması, Q limitleri ve bölüm eşdeğerleri açıkça raporlanır. Pandapower yakınsaması PowerFactory eşdeğerliği değildir; bağımsız referans yoktur.

Ham 143 MB JSON modelleri `kontrol1/` altında yerel olarak korunur ve GitHub'ın dosya sınırı nedeniyle Git'e eklenmez. `docs/fixtures/dgs-smoke-from-20260923.json`, 12:00 gerçek modelinin değiştirilmemiş ilk kayıtlarından türetilmiş 33 KB CI smoke kesitidir; tam model değildir. Yerel dosyalar mevcutken entegrasyon testi iki gerçek modeli de çalıştırır.

Mimari ve kurulum: [architecture](docs/architecture.md), [extension-installation](docs/extension-installation.md), [native messaging](docs/native-messaging.md). Elektriksel model: [canonical](docs/electrical-canonical-model.md), [mapping](docs/dgs-electrical-mapping.md), [pandapower](docs/pandapower-adapter.md), [ResultSet V2](docs/resultset-v2.md). Test ve ölçümler: [testing](docs/testing.md), [validation](docs/solver-validation.md), [performance](docs/performance.md).

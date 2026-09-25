# YTBS / PowerFactory DGS Şebeke Görüntüleyici v6.0 — Aşama 1

DIgSILENT PowerFactory DGS JSON modellerini yerel olarak açan Chrome Manifest V3 uzantısı. v5.5'in harita, hat ve trafo merkezi seçimi, tek hat şeması, fider görünümü, kapasite, senaryo ve deneysel AC/DC analizlerini korur. Aşama 1 elektriksel hesap motorunu yeniden yazmaz.

## Kurulum ve kullanım

```sh
npm install
npm run typecheck
npm run lint
npm test
npm run test:integration
npm run build
```

Chrome'da `chrome://extensions` → Developer mode → Load unpacked → bu projenin `dist/` klasörünü seçin. Araç çubuğundaki uzantı simgesini tıklayarak yan paneli açın. DGS JSON dosyasını panelden seçip **Çalışma Alanını Aç** düğmesine basın. Dosya doğrudan çalışma alanındaki **Model** sekmesinden de seçilebilir. Büyük model, senaryo ve sonuçlar IndexedDB'de yerel olarak saklanır; kullanıcı tercihi için `chrome.storage` ayrılmıştır. Uzantı host izni veya uzak JavaScript istemez.

`npm run test:e2e` paketlenmiş Chromium uzantısıyla smoke testi çalıştırır. Yerel tam model tarayıcı regresyonu için PowerShell'de:

```powershell
$env:DGS_E2E_MODEL='kontrol1/20260923_1200_SN3_TR0.json'
npm run test:e2e
```

## Kaynak yapısı

| Yol | Görev |
| --- | --- |
| `src/legacy/` | v5.5'in CSP uyumlu dış JS/CSS modülleri; davranış koruma katmanı |
| `src/workspace/` | Tam sekme çalışma alanı, kanonik adaptör, doğrulama ve sonuç kaynağı |
| `src/sidepanel/`, `src/background/` | Uzantı yan paneli ve araç çubuğu |
| `src/model/`, `src/validation/`, `src/solvers/`, `src/storage/` | Yeni türler, kayıt defteri, doğrulama, çözücü arayüzü, IndexedDB |
| `workers/` | Paketlenmiş parser, topoloji ve v5.5 çözücü worker dosyaları |
| `assets/data/` | 315 hatlık sürümlü mevsimsel kapasite JSON'u ve SHA-256 metadata |
| `tests/`, `docs/fixtures/` | Unit, gerçek DGS entegrasyon ve Chromium uzantı testleri |

## Elektriksel durum ve sınırlar

Analiz ekranı motoru, model adını, topoloji görünümünü, kapsamı, yakınsamayı ve doğrulama durumunu gösterir. v5.5 yaklaşık AC-PQ ve DC tarama korunmuştur. 66 kV altındaki enjeksiyonların üst sisteme yansıtıldığı hesap açıkça **REDUCED TRANSMISSION MODEL** olarak etiketlenir. Sonuçlar PowerFactory referansı veya resmî işletme sonucu değildir. Kanonik `FULL` model temel ekipmanı kaydeder, ancak yeni tam ağ solver'ı bu aşamada yoktur. Newton yakınsamama ve Q paylaşımı gibi v5.5 sınırlamaları sürer.

Ham 143 MB JSON modelleri `kontrol1/` altında yerel olarak korunur ve GitHub'ın dosya sınırı nedeniyle Git'e eklenmez. `docs/fixtures/dgs-smoke-from-20260923.json`, 12:00 gerçek modelinin değiştirilmemiş ilk kayıtlarından türetilmiş 33 KB CI smoke kesitidir; tam model değildir. Yerel dosyalar mevcutken entegrasyon testi iki gerçek modeli de çalıştırır.

Mimari ve kurulum: [architecture](docs/architecture.md), [extension-installation](docs/extension-installation.md). Geçiş farkları: [migration-v5.5-to-v6](docs/migration-v5.5-to-v6.md). Test kapsamı: [testing](docs/testing.md).

# Grid Analyzer v6.1.4 · yerel doğrulama

## Native Messaging

1. `npm run build` çalıştırın ve `dist` klasörünü Chrome'da paketlenmemiş uzantı olarak açın.
2. `chrome://extensions` sayfasındaki gerçek uzantı kimliğiyle kurun:

   ```powershell
   .\native-host\python\scripts\install-windows.ps1 -ExtensionId "<EXTENSION_ID>"
   ```

3. Chrome'u tamamen kapatıp açın. Registry, manifest, izinli kimlik, çalıştırılabilir dosya, Python bağımlılıkları ve framed HELLO zincirini denetleyin:

   ```powershell
   node tools/native-host-smoke.mjs --extension-id=<EXTENSION_ID>
   npm run test:e2e:native-health
   ```

   `native-health` testi kendi Chrome profilini ve gerçek uzantı kimliğini kullanır; önceki HKCU kaydı ile manifest baytlarını test sonunda geri yükler. Eski bir manifestte UTF-8 BOM varsa doğrudan tanı aracı bunu bildirir. `--allow-bom` yalnız mevcut kurulumu incelemek içindir; kalıcı çözüm güncel kurulum scriptini yeniden çalıştırmaktır.

## Gerçek büyük model

`kontrol1` içindeki en büyük mevcut dosya `20260923_1200_SN3_TR0.json` (143.026.320 bayt, 576.001 kayıt). Diğer mevcut dosya `20260925_1000_SN5_TR0.json` (143.003.403 bayt, 575.815 kayıt). `20260925_1800_SN5_TR0.json` bu dizinde yoktur.

```powershell
$env:DGS_E2E_MODEL = (Resolve-Path .\kontrol1\20260923_1200_SN3_TR0.json).Path
npm run test:e2e:large-model
npm run test:e2e:native
Remove-Item Env:DGS_E2E_MODEL
```

`large-model` testi doğrudan çalışma alanı ve gerçek sidepanel → IndexedDB → çalışma alanı yollarında dosya seçiminden UI hazır durumuna kadar süreyi ölçer. 240 saniyelik bekleme yalnız tanı sınırıdır; kabul sınırı her yol için 60 saniyedir. Native AC yakınsamazsa test bunu başarıya çevirmemelidir. Harita ve durum ayrımı için `npm run test:e2e:map-results` ile `npm run test:e2e:states` çalıştırın.

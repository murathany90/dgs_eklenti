# Grid Analyzer v6.1.3: Windows yerel smoke testi

## Gerekenler

- Node.js 20 veya üzeri ve npm.
- Python 3.11 veya üzeri. pandapower yerel motoru için Python 3.12 önerilir.
- Chrome 116 veya üzeri.

Dep bağımlılıklarını proje kökünde PowerShell ile kurun:

```powershell
npm ci
if (-not (Test-Path .venv\Scripts\python.exe)) { py -3.12 -m venv .venv }
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -e .\native-host\python
```

Paketlenmiş uzantıyı üretin:

```powershell
npm run build
```

## Uzantıyı Chrome'a yükleyin

1. Chrome adres çubuğunda `chrome://extensions` sayfasını açın ve Geliştirici modunu etkinleştirin.
2. **Paketlenmemiş öğe yükle** seçeneğine basın. Proje kökündeki `dist` klasörünü seçin.
3. Araç çubuğundaki GA simgesine basın. Yan panel açılmalı; panel API'si açılamazsa çalışma alanı sekmesi yedek olarak açılır.
4. `docs/fixtures/dgs-smoke-from-20260923.json` dosyasını seçip **Çalışma Alanını Aç** düğmesine basın.

## Küçük senaryo denemesi

1. Çalışma alanında **Senaryo** sekmesini açın.
2. Hat alanına `H2525` yazıp **Senaryoda servis dışı** düğmesine basın. Özet `1 etkin değişiklik` göstermeli; YTBS / PowerFactory DGS kaynak dosyası değişmemeli.
3. **Analiz** sekmesine geçip motoru **Yerel Tam Şebeke** seçin. Etkin sanal senaryoda yerel tam şebeke hesap düğmesi devre dışı görünmeli.
4. Motoru **Tarayıcı Yaklaşık Çözüm** olarak seçip **Hesapla** düğmesine basın. İş durumu tamamlanmalı veya sonuç kısmi/yakınsamamışsa bu durum Türkçe açıklanmalı; geçmişte `browser-approx`, `PARTIAL` veya `NON_CONVERGED` ham kodlarını görmemelisiniz.
5. **Senaryo** sekmesinden **Senaryoyu sıfırla** düğmesine basın. Özet sıfır etkin değişiklik göstermeli.
6. Model dosyasını tekrar seçin. Senaryo boş kalmalı. Aynı dosyanın aynı senaryo durumuyla tekrar hesaplanması önceki sonucu önbellekten önermelidir.

Büyük DGS JSON açıldığında AC-PQ yaklaşık hesabı kendiliğinden başlamaz; model açıldıktan sonra **Analiz** sekmesinde siz başlatabilirsiniz. Analiz ekranındaki bara alanı ilk 500 barayı gösterir; ada göre arama tüm eşleşmeleri listeler. Tam yerel model ile yükleme/sekme yanıtını ölçmek için:

```powershell
$env:DGS_E2E_MODEL = (Resolve-Path .\yol\tam-model.json).Path
npm run test:e2e:large-model
```

Bu test yükleme tamamlandıktan sonra Harita, Tek Hat Şeması, Analiz, Senaryo ve Model sekmelerini tıklar; bara aramasını ve otomatik hesap başlatılmadığını doğrular.

E2E testi ayrıca sanal devreye alınan iki terminali IndexedDB'ye yazıp modeli yeniden yükleyerek geri geldiğini denetler. Native host paketi kurulur; Chrome Native Messaging kaydı, Chrome'daki unpacked extension ID'sine özeldir. DC/AC yerel hesap denemek için çalışma alanındaki **Kurulum Yardımı** bölümünün verdiği Extension ID ile `native-host/python/scripts/install-windows.ps1` komutunu ayrıca çalıştırın ve Chrome'u yeniden başlatın.

## Doğrulama komutları

```powershell
npm run typecheck
npm run lint
npm test
npm run test:integration
.\.venv\Scripts\python.exe -m unittest discover -s native-host/python/tests -v
npm run build
npm run test:e2e
```

Tam yerel DGS modelleri varsa PowerShell'de `DGS_E2E_MODEL` değişkeniyle ek regresyon çalıştırılabilir. Bu dosyalar yoksa küçük fixture E2E sonucu tam model AC/DC doğrulaması sayılmaz.

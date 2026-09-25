# Aşama 1 mimarisi

Uzantı araç çubuğu `background.js` üzerinden yan paneli açar. Panelde seçilen Blob IndexedDB `models` deposundaki `pending` kaydına yazılır. `workspace.html` bu kaydı alıp v5.5 `loadFiles` hattına verir. Eski ekranların kod sırası korunarak 12 dış script ve 8 dış stylesheet halinde çalışır; inline script ve Blob worker yoktur.

`parser.worker` JSON.parse işlemini arka planda yapar. v5.5 DGSModel hiyerarşi, koordinat, hat güzergâhı ve eski ekranları üretir. V6 adaptörü aynı ham DGS'den `EquipmentRegistry` ve `CanonicalNetwork` oluşturur. `topology.worker` kanonik uç ve kenarların bağlantı bileşenlerini hesaplar; eski Node-Breaker, Bus-Branch ve SLD işlemleri davranış koruma için v5.5 katmanındadır. Ayrı `solver.worker` orijinal yaklaşık AC-PQ hesap kodunu çalıştırır. `BrowserApproxSolver` gelecekteki solver'lar için arayüz sağlar.

IndexedDB depoları `models`, `canonical`, `scenarios`, `results` olarak ayrıdır. Tam DGS ve kanonik model kaydı büyük dosyalarda bellek ve disk tüketir. Özellikle 143 MB modelin worker'dan ana iş parçacığına aktarımı ve kanonik adaptör işlemi kısa süreli UI duraksaması yaratabilir; bu Aşama 2 performans borcudur.

Paket içindeki `capacity-data.js`, sürümlü `assets/data/line-capacity-v1.json` dosyasından build sırasında üretilir. Böylece v5.5 eşleşme algoritması aynı 315 kaydı senkron kullanır; JSON tek bakım kaynağıdır.

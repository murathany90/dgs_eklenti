# v5.5 → v6.0 Aşama 1 geçişi

v5.5'in tek HTML uygulaması arşiv kaynak olarak kökte durur. Çalışan uzantı aynı script sırasını dış JS/CSS dosyalarıyla kullanır. Harita, SLD, hat/TM seçimleri, akış animasyonu, 315 kayıtlı kapasite eşleşmesi, sanal servis senaryosu ve yaklaşık AC/DC kodu korunmuştur. Parser ve AC solver Blob worker yerine paketli worker dosyalarını kullanır.

Bilerek değişenler:

- Açılış Chrome MV3 yan paneli ve tam sekme çalışma alanıdır; tek HTML'yi `file://` ile açma akışı yerine geçer.
- Analiz ekranı `BrowserApproxSolver`, `REDUCED TRANSMISSION MODEL`, yakınsama ve doğrulama bilgisini ayrıca gösterir.
- YTBS koordinat doğrulama profili 35–42° / 24–45° olarak düzeltilmiştir; harita çizim sınırı değiştirilmedi.
- Seçilen model, kanonik önbellek, senaryo ve sonuç zarfı IndexedDB'de tutulur.

12:00 gerçek modelinde 2.382 hat, 3.682 trafo, 1.612 TM, 2.841 jeneratör, 2.523 yük ve 15 seri kompanzatör; 25 Eylül 10:00 modelinde 2.382 hat, 3.684 trafo, 1.613 TM, 2.840 jeneratör, 2.525 yük ve 15 seri kompanzatör entegrasyon testinde doğrulandı. Chromium'da 12:00 modelinin 315 kapasite eşleşmesi ve H5846 senaryosu doğrulandı. Tüm elektriksel ada/akış metrikleri ile v5.5 arasında birebir fark tablosu henüz çıkarılmadı; iddia edilen eşdeğerlik yalnız doğrulanan davranışlar içindir.

# Akış Animasyonu Test Raporu

## Gerçek model
23.09.2026 15:00 DGS JSON kullanıldı.

## Sonuçlar
- Türkiye geneli görünümde adaptif motor çalıştı; v5.5 ekranında 175 hat / 187 ok örnek durumu görüldü.
- H5846 odak görünümünde harita zoom değeri ~5,77 iken hat ekrandaki uzunluğu ~1008 px oldu ve motor **3 ok** seçti.
- H5846 test ekranında toplam 74 animasyonlu hat / 103 ok çizildi.
- Hiçbir hat için hesaplanan istek 3'ü aşmadı.
- Geçerli aktif güç sonucu olmayan veya servis dışı hat için animasyon üretilmemesi kuralı korunmuştur.
- Görsel ekran görüntüleri Türkiye geneli ve odak görünümü için kaydedildi.

## Kabul
**Başarılı:** hat başına ≤3 ok, uzunluk/yüklenme tabanlı sayı, yüklenme tabanlı görsel hız, ekran yoğunluğu azaltma.

# Genel Kabul Test Raporu — v5.5

## Başarılı kontroller
- 5 gerçek JSON modelinde 8 sekme: **40/40**.
- JavaScript page/console error: **0** (regresyon testlerinde).
- 2382/2382 nominal hat kapasitesi.
- 315/315 gömülü Excel kapasite eşleşmesi.
- Akış animasyonu hat başına maksimum 3 ok.
- H5846 odak testinde 3 ok üretildi.
- 390 px mobil viewport taşma testi başarılı.
- H3882 sanal devreye alma planı uygulanarak geçerli yaklaşık P/Q sonucu üretildi.

## Başarısız / tamamlanmamış kapsam
- 12:00 ulusal model Newton düzeltmesi yakınsamadı; yaklaşık AC fallback kullanıldı.
- 13 referans üretim ünitesi için hesaplanmış Q sonucu üretilmedi.
- H4719'un ikinci uç bağlantısında servis içi hedef yalnız anahtar zinciri üzerinden bulunamadığından otomatik sanal devreye alma planı uygulanmadı.
- Gerçek işletme güvenliği, N-1, senkronizasyon ve koruma koordinasyonu doğrulanmamıştır.
- `file://` doğrudan açılış bu ortamda yönetici politikası nedeniyle test edilemedi; HTML içeriği Chromium'a yüklenerek gerçek dosya seçiciyle test edildi.

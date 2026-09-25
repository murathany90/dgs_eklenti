# Hata ve Bug Analiz Raporu — v5.5

## Düzeltilen / geliştirilen
1. Güç akışı oklarının Türkiye genelinde aşırı yoğun olması: adaptif yoğunluk ve 3 ok üst sınırı eklendi.
2. Sabit animasyon hızı: yüklenme tabanlı parametrik hız eklendi.
3. Servis dışı hattın yalnız `outserv` override'ı ile başarılı sayılması: terminal/anahtar yolu tanısı eklendi.
4. İki uç bağlantı yolu çözümlenmeden sanal devreye alma: plan düğmesi devre dışı bırakılır.
5. Newton sonucu / fallback ayrımı: tanı görünümü ve ayrı etiket korunmuştur.

## Devam eden
1. Ulusal Newton Jacobian doğrusal çözümü.
2. 66 kV altı tam elektriksel kontrol modeli.
3. Ünite bazında Q paylaşımı ve 13 referans ünitenin kapsamı.
4. H4719 gibi tamamı servis dışı fider zinciri bulunan hatların daha geniş ekipman sınıfları üzerinden topolojik devreye alma analizi.

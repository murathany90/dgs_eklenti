# Test stratejisi ve veriler

`npm test` kanonik sınıf kaydı, özelleştirilebilir koordinat profili, gerçek DGS kesiti, kapasite veri hash'i ve yaklaşık solver kaynak etiketini test eder. `npm run test:integration` 33 KB gerçek DGS kesitini her ortamda okur; `kontrol1/` içinde mevcutsa iki 143 MB tam modeli de açıp temel sayımları karşılaştırır. `npm run test:e2e` Chromium'u unpacked extension modunda açar; model yükleme, harita, SLD, analiz ve kaynak etiketini doğrular. `DGS_E2E_MODEL` verilirse 12:00 gerçek modelinde 2.382 hat, 315 Excel eşleşmesi, H5846 seçimi, senaryo durumu ve SLD düğümlerini de doğrular.

`docs/fixtures/dgs-smoke-from-20260923.json`, `kontrol1/20260923_1200_SN3_TR0.json` içindeki 40 DGS sınıfının ilk en fazla 8 ham satırından oluşturuldu. Bu kesit elektriksel olarak tam bir şebeke değildir ve tam solver regresyonu için kullanılmaz. Kaynak iki JSON değiştirilmez. CI'da küçük kesit, geliştirici ortamında tam dosyalar kullanılır.

Eski `TEST_KODLARI/` Python betikleri sabit `/mnt/data` yolları nedeniyle yeni CI'ya doğrudan bağlanmadı; `TEST_KAYITLARI/` v5.5 referans kayıtları korunmuştur. Tam harita/SLD piksel karşılaştırması ve bütün elektriksel metrikler Aşama 2 borcudur.

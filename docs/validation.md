# Model doğrulama

Yeni bulgular `ERROR`, `WARNING`, `APPROXIMATION`, `INFO`; bütünlük `VALIDATED`, `COMPLETE_UNVALIDATED`, `REDUCED`, `PARTIAL`, `INVALID`, `NON_CONVERGED` olarak modellenir. Mevcut kontroller: tekrarlı FID, çözülemeyen referans, eksik hat türü/empedans referansı, eksik terminal, geçersiz bara gerilimi, Q sınırları ve koordinat. Gerçek DGS `Matrix` sınıfında aynı FID'in birden çok koordinat satırında bulunması normaldir; tekrarlı ekipman sayılmaz.

Varsayılan YTBS profili `35 ≤ enlem ≤ 42` ve `24 ≤ boylam ≤ 45` kullanır. `validCoordinate` fonksiyonu farklı profili parametre olarak kabul eder. Harita çizim sınırları ve veri doğrulama sınırları ayrıdır. Bu kontroller elektriksel çözümün doğrulandığı anlamına gelmez; bu nedenle kapsamlı referans karşılaştırması olmadan `VALIDATED` üretilmez. v5.5'in kendi kalite ve hata ekranları da korunur.

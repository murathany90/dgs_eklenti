# AC yakınsama tanısı

v6.1.5 gerçek model ölçümleri ve üretim ayarları [v6.1.5 doğrulama raporunda](v6.1.5-validation.md) kayıtlıdır. Pandapower 3.5.5 kullanılır. Kaynak `ComLdf.itrlx=100` ve `ictrlx=50`; ilk değer inner NR üst sınırı, ikincisi outer kontrol üst sınırıdır.

Pandapower'ın `enforce_q_lims` seçeneği SGEN Q değerlerini de sınır aralığına kırpar. Bu nedenle sabit PQ davranışındaki üreticilere Q sınırı taşımak `qgini` kaynak çalışma noktasını değiştirebilirdi. v6.1.5 bu sınırları sabit-PQ SGEN'lerden kaldırır; sınırlar PV makinelerde ve çözülebilen gerilim-kontrol aktüatörlerinde korunur. Tam modelde standart Q-limitli ve limitsiz tanı profilleri artık aynı inner çözümü verir.

Üretim AC hesabı remote gerilim hedeflerini de karşılamalıdır. Her iki tam modelde inner NR kararlı kalırken uygulanabilir kontrol gruplarının tümü 50 outer iterasyon sonunda hedefini karşılamamıştır. Bu durumda ResultSet'e sayısal AC değerleri konmaz. Q-limit kapalı veya station kontrolleri uygulanmadan yakınsayan profiller yalnız tanıdır; kullanıcı hesabı değildir.

Seri kompanzasyon yolları kapalı anahtar düğümleri birleştirilerek fiziksel hat zinciri boyunca denetlenir. Gerçek iki modelde 10 aktif kapasitör yolu bulunmuş; hat ve kapasitör X toplamlarının hepsi pozitif, küçük-X hassas yol sayısı sıfırdır. Bu tanı model topolojisini değiştirmez.

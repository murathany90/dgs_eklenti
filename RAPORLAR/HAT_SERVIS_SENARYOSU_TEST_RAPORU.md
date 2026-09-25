# Hat Servis / Sanal Devreye Alma Test Raporu

## H3882 — 400 kV ATATURK HES–BASPINAR OSB
15:00 modelinde kaynak hat servis dışıdır. İki uç için servis içi terminale anahtar yolu çözümlendi.

Plan:
- 4 servis dışı terminal sanal hesap grafına dahil edildi.
- 4 açık, servis içi anahtara senaryo kapama override'ı uygulandı.
- H3882 senaryoda servise alındı.

Sonuç:
- Elektriksel graf: 1 ada, 1729 yüksek gerilim düğümü, 2647 dal.
- Genel yaklaşık AC-PQ hesabı: 1/1 ada kabul edildi.
- H3882 `from` terminali P: **429,917 MW**.
- H3882 `from` terminali Q: **6,160 MVAr**.
- Sonuç kaynağı: yaklaşık AC-PQ · SANAL SENARYO.
- Newton düzeltmesi kabul edilmedi (`Newton adımını azaltma yakınsamadı`).
- İşlenmemiş JavaScript hatası: 0.

## H4719 — 154 kV YILDIZTEPE–SILAHTAR
Bir uçta servis içi hedefe anahtar zinciri çözümlendi. Diğer uçta yalnız `ElmCoup` bağlantı zinciri içinde servis içi terminal bulunamadı. Bu nedenle uygulama otomatik planı devre dışı bırakır.

Bu sonuç hata gizlemek yerine modeldeki bağlantı kapsamını açıkça gösterir. H4719 için geçerli P/Q sonucu üretildiği iddia edilmemektedir.

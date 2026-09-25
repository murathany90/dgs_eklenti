# Teknik Geliştirme Raporu — v5.5

## 1. Akıllı akış animasyonu
`SmartFlowAnimationEngine` eklendi. Ok sayısı:
- görünür ekran uzunluğu,
- hesaplanan hat yüklenmesi,
- ekran hücresi yoğunluğu,
- seçili hat önceliği
ile belirlenmektedir.

Hat başına üst sınır 3'tür. Türkiye geneli görünümde 115 px hücrelere yoğunluk sınırı uygulanır. Seçilen hat bu sınırdan öncelikli yararlanır.

Animasyon hızı yüklenmeyle ölçeklenir; Yavaş/Normal/Hızlı kullanıcı çarpanı bulunur. Fiziksel iletim hızı olarak yorumlanmaz.

## 2. Sanal devreye alma analizi
`VirtualEnergizationEngine` gerçek `StaCubic` / `ElmTerm` / `ElmCoup` ilişkilerini kullanarak hat uçlarından servis içi terminale doğru anahtarlama yolunu tarar.

İki uç için yol bulunursa:
- kaynak modelde servis dışı terminaller sanal hesap grafında etkinleştirilebilir,
- açık fakat servis içi anahtarlar senaryo override'ı ile kapatılabilir,
- hat servis durumu senaryoda servise alınabilir.

Kaynak JSON değiştirilmez. Servis dışı anahtarlar otomatik olarak etkinleştirilmez.

## 3. Newton tanısı
v5.5 Newton çekirdeğinin matematiksel modelini değiştirmemiştir. Bunun yerine sonuçların Newton/geri dönüş niteliği açık tutulmuş ve ayrıntılı tanı görünümü eklenmiştir.

12:00 modelde mevcut başarısızlık: `Seyrek Jacobian doğrusal çözümü başarısız`.

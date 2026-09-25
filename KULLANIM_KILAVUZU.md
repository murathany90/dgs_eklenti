# Kullanım Kılavuzu — v5.5

## Harita
Üç ana gerilim grubu vardır: **400 kV**, **154 kV grubu (66/154/220 kV)** ve **≤36 kV**. Gerçek nominal gerilim verisi değişmez; bu gruplama yalnız kullanıcı arayüzü filtresidir.

## Akış animasyonu
Filtreler panelindeki **Akış Animasyonu** bölümünden:
- Akıllı: ekran yoğunluğunu otomatik azaltır.
- Ayrıntılı: daha yüksek hücre yoğunluğuna izin verir.
- Görsel hız: Yavaş / Normal / Hızlı.

Hat başına ok sayısı görünür hat uzunluğu ve geçerli yüklenmeye göre belirlenir; **3'ü geçmez**. Çok kısa hatlarda ok çizilmeyebilir. Bu hız fiziksel enerji iletim hızı değildir.

## Servis senaryosu
Hat servisteyse `Servis Dışı Bırak`, servis dışıysa `Servise Al` gösterilir. Başlangıçta servis dışı hatlarda yalnız `outserv` değerinin değiştirilmesi elektriksel bağlantı garantisi değildir.

⚡ panelindeki **Sanal devreye alma analizi**:
- hat uç terminallerini,
- terminal zincirini,
- açık anahtarları,
- servis dışı anahtarları,
- iki uçta servis içi hedefe ulaşılabilirliği
inceleyerek yalnız sanal model için bağlantı planı oluşturur.

Servis dışı anahtarlar otomatik etkinleştirilmez. Plan gerçek şebeke kumandası değildir.

## Hesap sonuçları
Newton düzeltmesi başarısızsa sonuç etiketi yaklaşık AC olarak kalır. Geçerli P/Q sonucu olmayan hatta akış animasyonu gösterilmez.

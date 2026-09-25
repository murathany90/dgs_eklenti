# Aşama 2 teknik borç

1. DGS ayrıştırma, nesne grafı ve kanonik dönüştürmeyi tek worker hattında yaparak 143 MB modelde ana iş parçacığına büyük structured clone ve `File.arrayBuffer()` tekrarını azaltmak.
2. v5.5 harita, SLD, Node-Breaker, Bus-Branch ve senaryo tüketicilerini adım adım kanonik modele geçirmek; v5.5 test API'sini geçiş süresince tutmak.
3. `ResultSet` içine tüm bara, trafo, jeneratör, kayıp ve terminal metriklerini kayıpsız aktarmak; ölçüm/hesap/approximation kaynaklarını ayrı tutmak.
4. Gerçek tam modellerde ada, indirgeme, hariç enjeksiyon, servis ve akış sonuçlarını v5.5 ve mümkünse PowerFactory referansıyla ayrıntılı karşılaştırmak.
5. Ek doğrulayıcılar: desteklenmeyen ekipman, belirsiz alçak gerilim projeksiyonu, kopuk adalar, kontrol referansları, enjeksiyon kapsamı.
6. Büyük model için IndexedDB kota yönetimi, atomik sürüm yükseltme ve kullanıcı kontrollü silme arayüzü.
7. Arayüzde kalan DGS kaynaklı HTML şablonlarını DOM API bileşenlerine geçirmek ve CSP/güvenlik testlerini genişletmek.
8. Harici olgun AC solver ve PowerFactory referans adaptörü değerlendirmesi. Bu aşama içinde pandapower entegrasyonu yapılmadı.

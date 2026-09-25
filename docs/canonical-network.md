# Kanonik ağ temeli

`CanonicalNetwork`, DGS sınıflarından bağımsız ekipman listeleri sunar: trafo merkezleri, gerilim seviyeleri, baralar, terminaller, anahtarlar, hatlar, trafolar, jeneratörler, yükler, şöntler, seri kompanzatörler, harici şebekeler, ölçümler ve kontroller. Her kayıtta kaynak PowerFactory sınıfı, FID, ad ve uç ilişkileri bulunur. `EquipmentRegistry` tipi sınıf adına göre belirler; FID prefix'i belirleyici değildir.

`scope` değeri `FULL` veya `TRANSMISSION_REDUCED` olabilir. v6.1 `electrical` üyesi typed elektriksel parametreleri ve eksik/veri dışı bulgularını taşır. Kaynak DGS adaptörü `FULL` kapsamı hedefler; eksik kontroller nedeniyle sonuç `PARTIAL` kalabilir. Eski yaklaşık çözücü yalnız indirgenmiş 66 kV+ hesabı üretir. Harita ve SLD'nin bir kısmı hâlâ v5.5 ham modelini kullanır. Ayrıntılar [Electrical CanonicalNetwork](electrical-canonical-model.md) belgesindedir.

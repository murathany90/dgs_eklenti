# Kanonik ağ temeli

`CanonicalNetwork`, DGS sınıflarından bağımsız ekipman listeleri sunar: trafo merkezleri, gerilim seviyeleri, baralar, terminaller, anahtarlar, hatlar, trafolar, jeneratörler, yükler, şöntler, seri kompanzatörler, harici şebekeler, ölçümler ve kontroller. Her kayıtta kaynak PowerFactory sınıfı, FID, ad ve uç ilişkileri bulunur. `EquipmentRegistry` tipi sınıf adına göre belirler; FID prefix'i belirleyici değildir.

`scope` değeri `FULL` veya `TRANSMISSION_REDUCED` olabilir. Kaynak DGS adaptörü `FULL` ekipman envanterini taşır. Eski yaklaşık çözücü yalnız indirgenmiş 66 kV+ hesabı üretir. Bu iki kapsamın karıştırılmaması gerekir. Aşama 1 kanonik ağ hâlâ v5.5 ham modelinin yanında çalışır; tüm harita ve SLD tüketicileri henüz kanonik nesnelere geçirilmedi.

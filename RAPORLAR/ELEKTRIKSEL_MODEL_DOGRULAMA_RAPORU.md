# Elektriksel Model Doğrulama Raporu

## 23.09.2026 12:00 PowerFactory referans karşılaştırması
Uygulamanın v5.5'te değişmeyen yaklaşık AC-PQ sonucu, sağlanan PowerFactory analiz sütunlarıyla tekrar karşılaştırıldı.

| Büyüklük | Referans | Eşleşen | MAE | RMSE | Maks. mutlak fark |
|---|---:|---:|---:|---:|---:|
| Hat aktif güç P | 287 | 287 | 16,881 MW | 37,548 MW | 311,305 MW |
| Bara gerilim V | 188 | 188 | 5,197 kV | 5,567 kV | 14,450 kV |
| Ünite Q | 13 | 0 | — | — | — |

Hat P karşılaştırmasında uygulamanın `from` terminal sonucu kullanıldı. Ünite Q kapsamı hâlen eksiktir.

Bu sonuçlar Newton doğrulaması değildir; mevcut yaklaşık motorun referans regresyonudur.

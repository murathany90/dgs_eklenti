# Aşama 1 yerel doğrulama kaydı — 2026-09-25

Windows çalışma alanında Node.js 26.5.1, npm 11.17.0 ve Playwright Chromium ile çalıştırıldı.

| Komut | Sonuç |
| --- | --- |
| `npm run typecheck` | geçti, TypeScript hatası yok |
| `npm run lint` | geçti, 12 legacy JS ve solver worker sözdizimi; inline script/style ve Blob worker taraması |
| `npm test` | 5/5 geçti |
| `npm run test:integration` | 3/3 geçti; 33 KB gerçek kesit ve iki tam 143 MB model |
| `npm run build` | geçti; `dist/` MV3 unpacked paketi |
| `npm run test:e2e` | geçti; yan panel → çalışma alanı, kesit JSON, harita/SLD/analiz |
| `DGS_E2E_MODEL=kontrol1/20260923_1200_SN3_TR0.json npm run test:e2e` | geçti; 2.382 hat, 315 kapasite eşleşmesi, H5846 seçimi ve senaryosu, SLD düğümleri, IndexedDB sonuç kaydı |

Tam model dosyaları Git deposuna eklenmedi; `kontrol1/` yerel klasöründedir. CI küçük gerçek DGS kesitini kullanır. Elektriksel sayısal referans eşdeğerliği bu kayıtla iddia edilmez.

# YTBS PowerFactory Şebeke Görüntüleyici v5.5 – Chrome Eklentisi ve Elektriksel Analiz Geliştirme Raporu

Yüklediğiniz **`YTBS_PowerFactory_Sebeke_Goruntuleyici_v5_5_TESLIM(1).zip`** paketini; ana HTML kaynak kodu, test kodları, test kayıtları ve paket içindeki teknik raporlarla birlikte inceledim. Ayrıca uygulamanın hedef davranışını, eklediğiniz **YTBS Modelleme, Analiz, Teknik Referans, Şebeke Modeli ve Veri Setleri kılavuzlarıyla** karşılaştırdım.

## 1. Sonuç

Uygulamanın mevcut hali **güçlü bir YTBS/DGS model görüntüleyicisi ve deneysel şebeke analiz prototipi**, fakat henüz “PowerFactory seviyesinde şebeke hesap motoruna sahip Chrome eklentisi” seviyesinde değil.

Chrome eklentisine dönüştürmeye devam etmek teknik olarak oldukça uygun. Fakat iki işi birbirinden ayırmanızı öneriyorum:

> **Chrome Extension = modelleme, görselleştirme, SLD, senaryo yönetimi, sonuç analizi ve kullanıcı arayüzü**  
> **Hesap motoru = ayrı ve değiştirilebilir bir elektriksel solver katmanı**

Özellikle mevcut yaklaşık AC-PQ/Newton motorunu büyütüp sıfırdan PowerFactory benzeri bir çözüm motoru yazmaya devam etmek yerine, **hazır açık kaynak güç sistemi motorlarından yararlanmak çok daha doğru** olur.

Benim önerdiğim nihai mimari:

**Chrome Manifest V3 eklentisi + yerel Worker'lar + isteğe bağlı Native Messaging hesap servisi + pandapower/PyPowSyBl gibi hazır hesap motorları.**

Böylece:

- DGS JSON tamamen yerel kalabilir.
- Chrome tarafında harita/SLD çok hızlı çalışır.
- Basit DC/ön analizler tarayıcı içinde yapılabilir.
- Gerçek AC yük akışı, N-1, kısa devre, OPF vb. olgun bir motorla hesaplanabilir.
- Daha sonra PowerFactory doğrulama adaptörü eklenebilir.

---

# 2. Mevcut uygulamada iyi yapılmış noktalar

Uygulamanın tamamını atıp yeniden başlamak doğru olmaz. Mevcut altyapının önemli bölümü korunmaya değer.

| Alan | Mevcut durum | Değerlendirme |
|---|---|---|
| DGS JSON okuma | Geniş sınıf desteği var | Korunmalı |
| Büyük model görüntüleme | Çalışıyor | Güçlü taraf |
| Coğrafi şebeke haritası | Hat güzergâhı/TM gösterimi mevcut | Korunmalı |
| Node-breaker / fider SLD | DGS ilişkilerinden türetiliyor | Geliştirilmeli |
| Hat kapasitesi | `TypLne`, `ElmLnesec`, mevsimsel veri işleniyor | İyi temel |
| Senaryo yönetimi | Hat/anahtar servis durumu değiştirilebiliyor | Çok değerli |
| Sanal devreye alma | Terminal ve anahtar yolunu inceliyor | İyi fikir |
| Akış animasyonu | v5.5'te ciddi şekilde geliştirilmiş | UI için uygun |
| Hesap sonucu kaynak etiketi | Yaklaşık sonuç PowerFactory sonucu diye sunulmuyor | Doğru yaklaşım |
| Test otomasyonu | Playwright tabanlı testler mevcut | CI seviyesine taşınmalı |

YTBS'nin şebeke modeli Full modelde 400 kV'dan 33 kV'a kadar ekipmanları kapsıyor; iletim modeli ise 400–66 kV aralığını kullanıyor. Ayrıca topoloji, üretim/tüketim, trafo kademesi ve jeneratör gerilim ayarları modelin parçası. Mevcut uygulamanın 66 kV üstü hesap yaklaşımı bu nedenle “YTBS İletim Modeli” ile bir ölçüde uyumlu bir başlangıç olsa da, alt gerilim ağını basitçe üst sisteme projekte etmek Full model eşdeğerliği sağlamıyor. :chatgpt-content-reference{index="0"}

---

# 3. Kaynak kodunda tespit ettiğim temel mimari problem

Ana problem elektriksel solver'dan bile önce **tek HTML mimarisi**.

Ana uygulama yaklaşık **496 KB ve 2631 satırlık tek HTML dosyası**. İçinde:

- 13 adet `<script>`,
- 8 adet `<style>`,
- model parser,
- topoloji oluşturucu,
- yaklaşık AC solver,
- Newton solver,
- DC solver,
- harita,
- SLD,
- senaryo motoru,
- kapasite motoru,
- UI,
- test API'leri

aynı dosyada bulunuyor.

Üstelik sürümler ilerledikçe fonksiyonlar yeniden sarılmış:

`renderAnalysis = ...`  
`applyComputedIslands = ...`  
`selectLine = ...`

gibi monkey-patch tarzı yapılar oluşmuş.

Bu, v5.5 için çalışıyor fakat **v6–v10 arası geliştirme için sürdürülebilir değil**.

Daha somut bir örnek var. HTML'nin yaklaşık 905. satırında tanı metni hâlâ:

> PV→PQ limit denetimi uygulanmadı

diyor; fakat 1114–1119 civarında v5.2 Newton motorunun gerçekten bazı PV baraları için **Q limiti ve PV→PQ geçişi yaptığı** görülüyor.

Yani eski sürüm bilgi metni ile yeni motor davranışı aynı dosyada üst üste kalmış. Bu, tek dosyalı patch mimarisinin artık teknik borç üretmeye başladığının göstergesi.

---

# 4. Chrome eklentisine doğrudan dönüştürülmesini engelleyen konu

Mevcut HTML'nin etrafına yalnızca `manifest.json` koymak yeterli olmayacak.

Manifest V3 altında uzantının çalıştırdığı kodun paket içinde olması gerekiyor ve varsayılan Extension CSP'si inline JavaScript çalıştırılmasına izin vermiyor. WebAssembly kullanılacaksa ayrıca `wasm-unsafe-eval` tanımlanabiliyor. Chrome ayrıca uzaktan indirilen yürütülebilir JavaScript'i Manifest V3 uzantılarında kabul etmiyor. :chatgpt-content-reference{index="1"}

Mevcut uygulamada iki yerde özellikle sorun oluşacak:

```text
satır ~662 : Blob içinden JSON parser Worker oluşturuluyor
satır ~849 : solverWorkerSource -> Blob -> new Worker(blobUrl)
```

Chrome Extension sürümünde bunların:

```text
workers/parser.worker.js
workers/solver.worker.js
```

şeklinde **paketlenmiş gerçek worker dosyaları** olması gerekir.

Bu aynı zamanda mimariyi temizlemek için iyi bir fırsat.

---

# 5. Önerdiğim Chrome Extension mimarisi

Ana harita ve SLD'yi küçük bir popup'a sıkıştırmamalısınız. Chrome Side Panel kullanılabilir ve Chrome 114+ Manifest V3'te destekleniyor; ayrıca extension API'lerine erişebiliyor. Fakat bu uygulamanın ana çalışma alanı için geniş ekran gerekiyor. :chatgpt-content-reference{index="2"}

Bu nedenle mimariyi şöyle kurardım:

| Katman | Görev |
|---|---|
| `manifest.json` | MV3 tanımı ve minimum izinler |
| `service-worker.js` | Eklenti yaşam döngüsü, komutlar, Native Messaging, dosya/sekme koordinasyonu |
| `workspace.html` | Ana YTBS çalışma ekranı |
| `sidepanel.html` | Seçili TM/hat bilgisi, hızlı analiz, “Çalışma Alanını Aç” |
| `parser.worker.js` | Büyük DGS JSON ayrıştırma |
| `topology.worker.js` | Node-breaker grafı ve topoloji işlemleri |
| `solver.worker.js` | Sadece tarayıcı-içi basit DC/AC analizler |
| `model/` | DGS → ortak elektriksel model |
| `analysis/` | N-1, yüklenme, kayıp, karşılaştırma mantığı |
| `visualization/` | Harita, SLD, animasyon |
| `solver-adapters/` | Browser / pandapower / PyPowSyBl / PowerFactory adaptörleri |
| IndexedDB | Büyük DGS modelleri ve hesap sonuçları |
| `chrome.storage` | Kullanıcı tercihleri ve ayarlar |

**Uzun süren hesapları service worker'ın içine koymamak gerekir.** Manifest V3 arka plan service worker'ları kalıcı süreçler değildir; Chrome uzun ömürlü persistent worker tasarımını desteklemiyor. Uzun hesap için Dedicated Worker, extension çalışma sayfası veya native process daha uygun. :chatgpt-content-reference{index="3"}

---

# 6. Mevcut elektriksel hesap motorunun asıl sorunu

HTML içindeki ilk solver gerçekten Full Newton-Raphson değil.

Kodun kendisi bunu doğru biçimde açıklıyor:

> sparse Ybus, B′≈B″, CG, ardışık P/Q düzeltmeleri.

Yani mevcut ilk çözüm esasen **Fast-Decoupled benzeri yaklaşık AC-PQ çözüm**.

Daha sonra v5.2'de eklenen `solveIslandV52()` ise:

- polar koordinatlı sparse Jacobian,
- P/Q mismatch,
- PV/PQ ayrımı,
- bazı Q limitleri,
- PV→PQ dönüşümü,
- GMRES,
- BiCG,
- line-search/damping

kullanarak gerçek Newton-Raphson'a yaklaşmış.

Ancak gerçek 12:00 YTBS modelinde:

**1 ada → 0 NR kabulü → 1 fallback**

ve hata:

**“Seyrek Jacobian doğrusal çözümü başarısız”**

olmuş.

Paketin kendi test kaydında ayrıca:

- **920 unsupported model bulgusu**
- **3982 adet alt gerilim enjeksiyonunun üst gerilime projeksiyonu**
- **5 hesap dışı enjeksiyon**
- **1730 indirgenmiş bara**
- **2642 dal**
- **356 trafo tap uygulaması**

bulunuyor.

Dolayısıyla Newton problemini yalnızca “GMRES daha iyi çalışsın” diye çözmek yeterli değil. **Model dönüşüm katmanı da düzeltilmeli.**

---

# 7. YTBS Full Newton-Raphson ile mevcut motor arasındaki kritik fark

YTBS Teknik Referans Kılavuzu burada çok önemli.

YTBS'nin yaklaşımı yalnızca klasik Newton iç iterasyonu değil. Önce:

- ekipman empedansları okunuyor,
- Y-bus oluşturuluyor,
- gerilim/açı başlangıçları atanıyor,

ardından bir **dış kontrol döngüsü** çalışıyor. Dış döngü:

- bara kontrol modunu belirliyor,
- Newton çözümünü çalıştırıyor,
- gerilim kontrolünü uyguluyor,
- üreticiler arasında reaktif gücü yeniden paylaştırıyor,
- yakınsamayı kontrol ediyor.

Kılavuz özellikle bunun remote voltage control ve droop control gibi iletim sistemi davranışları için gerekli olduğunu söylüyor. :chatgpt-content-reference{index="4"}

Mevcut v5.5'te ise büyük ölçüde:

```text
Network reduction
       ↓
PV/PQ oluştur
       ↓
Newton
       ↓
Q limitine girerse PV → PQ
```

var.

Olması gereken yapı daha çok:

```text
DGS topology
      ↓
Electrical model
      ↓
Control-area / regulator model
      ↓
┌──────────── OUTER LOOP ────────────┐
│ Slack / distributed slack         │
│ Remote V control                  │
│ Generator Q sharing              │
│ Droop                            │
│ OLTC / tap regulation            │
│ Switched shunt                   │
│ PV↔PQ mode changes               │
│                                   │
│        FULL AC NEWTON             │
│   ΔP, ΔQ → sparse Jacobian        │
│        ↓                          │
│     Δθ, ΔV                        │
└───────────────────────────────────┘
      ↓
Electrical results
```

YTBS modelindeki PowerFactory `ComLdf` alanlarının bile Newton maksimum iterasyon sayısını, dış döngü sayısını, reaktif limitleri ve kabul edilebilir yük akış hatalarını ayrı parametreler olarak taşıması bunu destekliyor. :chatgpt-content-reference{index="5"}

Bu nedenle mevcut tarayıcı Newton motorundaki en önemli eksik **lineer çözümleyiciden önce kontrol sistemi modelidir**.

---

# 8. Ünite reaktif gücü problemi

Mevcut test:

| Büyüklük | Referans | Eşleşen | MAE | Maksimum fark |
|---|---:|---:|---:|---:|
| Hat P | 287 | 287 | 16,881 MW | 311,305 MW |
| Bara V | 188 | 188 | 5,197 kV | 14,450 kV |
| Ünite Q | 13 | **0** | — | — |

Buradaki **13/13 ünite Q'nun eksik olması** önemli.

Sebebi kodda da görülüyor. Unit Q yalnızca kontrol barasında **tek doğrudan kontrollü ünite** bulunuyorsa hesap sonucu olarak dışarı çıkarılıyor:

```text
if (!z.units || z.units.length !== 1 ...) continue;
```

Gerçekte aynı barayı veya uzaktaki bir barayı kontrol eden birden fazla jeneratörün:

- Qmin/Qmax,
- capability limitleri,
- reactive participation factor,
- droop,
- remote bus,
- dispatch Q

ile paylaşılması gerekiyor.

YTBS Teknik Referansı da reaktif güç paylaşımını açıkça dış döngünün parçası olarak ele alıyor. :chatgpt-content-reference{index="6"}

**Bu sorun düzeltilmeden bara gerilimi sonuçlarını PowerFactory ile çok yakın hale getirmek de zor olacaktır.**

---

# 9. 66 kV altı ağın indirgenmesi

Kodda `<66 kV` tarafındaki yük ve üretimler tek bir yüksek gerilim sınırı bulunursa o sınıra taşınıyor:

```text
low-voltage component
       ↓
tek HV boundary?
       ↓ evet
enjeksiyonu HV baraya aktar
```

Birden fazla sınır varsa “ambiguous” kabul ediliyor.

Bu, görüntüleme ve hızlı yaklaşık hesap için mantıklı; fakat şu etkileri kaybettiriyor:

- yükseltici/indirici trafonun kaybı,
- trafo tap etkisi,
- OG bara gerilimi,
- şöntler,
- jeneratörün gerçek kontrol barası,
- OG şebeke P/Q kayıpları,
- dağıtım üretimi/yükünün gerilim bağımlılığı.

YTBS Full modeli 33 kV seviyesine kadar iniyor. :chatgpt-content-reference{index="7"}

Bu yüzden iki ayrı çalışma modu oluşturulmalı:

| Mod | Kullanım |
|---|---|
| **Transmission Reduced** | 66 kV+, hızlı görselleştirme/DC/PTDF |
| **Full Electrical Model** | 33 kV+, gerçek AC PF/N-1/SC/OPF |

Kullanıcı hangi sonuç setine baktığını her zaman görmeli.

---

# 10. Tespit ettiğim belirgin veri doğrulama hatası

HTML yaklaşık 261. satırda TM koordinatları:

```text
lat >= 30 && lat <= 46
lon >= 25 && lon <= 46
```

ise geçerli kabul ediliyor.

YTBS Modelleme Kılavuzu ise Türkiye şebekesi için:

- enlem: **35–42**
- boylam: **24–45**

aralığını belirtiyor. :chatgpt-content-reference{index="8"}

Dolayısıyla validation katmanı şu anda hem:

- olması gerekenden çok güney/kuzey noktaları,
- 45–46° doğu aralığını,

“geçerli YTBS koordinatı” sayabiliyor.

Bu kolay düzeltilebilir fakat önemli: **data validator kılavuzdan türetilmiş kurallar tablosuna bağlanmalı**, kod içinde dağınık sabitler bulunmamalı.

---

# 11. Model bütünlüğü göstergesi de yeniden tasarlanmalı

Şu an:

```javascript
modelIntegrity =
  !unresolvedSeriesCaps.length &&
  !excludedInputs.length
    ? "PARTIAL_APPROXIMATE"
    : "INCOMPLETE"
```

yaklaşımı var.

Ancak `unsupported`, gerilim kontrolü eksikleri, atlanan ekipman sınıfları vb. bu karara tam dahil değil.

Bu nedenle teorik olarak:

```text
800 unsupported
0 excluded
0 unresolved capacitor
```

olan bir ağ bile `PARTIAL_APPROXIMATE` olabilir.

Daha doğru model:

| Durum | Anlam |
|---|---|
| `VALIDATED` | Referansla doğrulanmış |
| `COMPLETE_UNVALIDATED` | Model tam, fakat solver referansı yok |
| `REDUCED` | Bilinçli ağ indirgemesi var |
| `PARTIAL` | Bazı elektriksel elemanlar modellenmemiş |
| `INVALID` | Kritik model/veri hatası |
| `NON_CONVERGED` | Model kurulmuş fakat çözüm yakınsamadı |

Ayrıca her bulgu:

**ERROR / WARNING / APPROXIMATION / INFORMATION**

olarak sınıflandırılmalı.

Şu an 920 farklı `unsupported` mesajını bir sayı olarak göstermek mühendisin gerçek problemi teşhis etmesini zorlaştırıyor.

---

# 12. SLD tarafında geliştirilmesi gerekenler

Mevcut Node-Breaker yaklaşımını korurdum. Hatta Chrome sürümünün en değerli özelliklerinden biri haline gelebilir.

Ancak üç farklı şema açıkça ayrılmalı:

| Şema | Amaç |
|---|---|
| **Geographical** | Türkiye haritası |
| **Bus-Branch** | Analiz amaçlı elektriksel indirgenmiş model |
| **Node-Breaker** | Gerçek fider/kesici/ayırıcı topolojisi |

YTBS yük akış ekranı da haritada hatların her iki ucundaki **P, Q, S, I, kayıp ve yüklenmeyi**, TM üzerinde ise **bara V ve açı** değerlerini göstermektedir. Aynı kılavuzda bara seçildiğinde indirgenmiş bara şeması oluşturuluyor. :chatgpt-content-reference{index="9"}

Dolayısıyla sizin eklenti için hedefiniz şu olabilir:

**coğrafi şebeke ↔ TM ↔ SLD ↔ ekipman ↔ analiz sonucu**

arasında kesintisiz drill-down.

Örneğin 400 kV Sincan–Ürgüp hattına tıklanınca:

```text
H5846
400 kV

From:
P = ...
Q = ...
S = ...
I = ...
V = ...
δ = ...

To:
P = ...
Q = ...
S = ...
I = ...
V = ...
δ = ...

Loss:
ΔP
ΔQ

Capacity:
Summer
Winter
Current limit

Contingency:
N-1 rank / violations
```

tek panelde görülebilmeli.

---

# 13. Hat kapasitesi motoru

v5.5'in bu kısmı temelde doğru yönde.

`TypLne.sline`, `ElmLnesec`, `fline` üzerinden sınırlayıcı kesitin bulunması ve:

\[
S = \sqrt3\,V I
\]

ile MVA kapasitesi türetilmesi kullanılabilir.

Fakat 315 hatlık mevsimsel kapasite envanteri HTML'nin içine büyük bir JavaScript nesnesi olarak gömülmüş.

Bunu koddan çıkarmak gerekir:

```text
/assets/data/line-capacity-v1.json
```

gibi versiyonlu bir kaynak olmalı ve yanında:

```text
datasetVersion
generatedAt
source
sha256
lineCount
```

tutulmalı.

Böylece veri değiştiğinde uygulama kodu yeniden değiştirilmez.

---

# 14. Chrome eklentisi içinde hazır elektrik hesaplama kütüphanesi kullanılabilir mi?

## Evet. Hatta bu projede kullanılmasını öneriyorum.

Ancak doğru soru “hangi kütüphaneyi JavaScript'e import edelim?” değil.

Çünkü olgun güç sistemi kütüphanelerinin büyük bölümü JavaScript değil:

- Python,
- C/C++,
- Java

tabanlı.

Üç mimari seçeneğiniz var.

| Çözüm | Performans | Elektriksel yetenek | Kurulum | Değerlendirme |
|---|---|---|---|---|
| Saf JS Worker | Orta | Sınırlı | Çok kolay | Hızlı DC/ön analiz |
| WASM | Çok yüksek | Motor geliştirmeye bağlı | Orta/zor | İleri aşama |
| **Native Messaging + Python/C++/Java** | **Yüksek** | **Çok yüksek** | Yerel yardımcı kurulum | **Ana önerim** |

Chrome'un Native Messaging sistemi extension ile yerel program arasında stdin/stdout üzerinden JSON mesajlaşmasına izin veriyor. Bunun için `nativeMessaging` yetkisi ve kayıtlı bir native host gerekiyor. :chatgpt-content-reference{index="10"}

Bu proje için son derece uygun.

---

# 15. Birinci hesap motoru adayı: pandapower

İlk geliştirme aşamasında **pandapower** en kolay entegrasyon seçeneklerinden biri.

Güncel dokümantasyonunda doğrudan:

- AC/DC Power Flow,
- contingency analysis,
- Optimal Power Flow,
- Short Circuit,
- State Estimation

modülleri bulunuyor. :chatgpt-content-reference{index="11"}

Kısa devre modülü de IEC 60909 tabanlı hesap yapabiliyor. :chatgpt-content-reference{index="12"}

Dolayısıyla sizin bir eklenti butonuna:

```text
▶ AC Yük Akışı
▶ N-1 Analizi
▶ Kısa Devre
▶ OPF
▶ Durum Kestirimi
```

koymanız teorik olarak mümkün.

### Önerilen akış

```text
PowerFactory DGS JSON
       │
       ▼
YTBS DGS Parser
       │
       ▼
CanonicalNetwork
       │
       ├────────── Browser DC Solver
       │
       ▼
Native Messaging
       │
       ▼
Python Solver Host
       │
       ▼
pandapower
       │
       ▼
ResultSet JSON
       │
       ▼
Chrome Extension
       │
       ├─ Harita
       ├─ SLD
       ├─ Tablo
       └─ Grafik
```

En kritik nokta, **DGS → pandapower dönüştürücünün ayrı bir modül olmasıdır**.

UI hiçbir zaman doğrudan pandapower nesnelerini bilmemeli.

---

# 16. İkinci ve stratejik olarak çok güçlü aday: PyPowSyBl / OpenLoadFlow

YTBS bir **iletim şebekesi** uygulaması olduğu için bunu ayrıca ciddi biçimde değerlendirmenizi öneririm.

PyPowSyBl/OpenLoadFlow:

- AC Newton-Raphson,
- DC load-flow,
- distributed slack,
- outer loops,
- security analysis,
- contingency,
- remedial actions,
- sensitivity analysis

gibi iletim şebekesi açısından çok faydalı kabiliyetlere sahip. :chatgpt-content-reference{index="13"}

Özellikle security analysis doğrudan:

```text
N-1 contingency
↓
post-contingency AC power flow
↓
current violations
voltage violations
angle violations
```

çıkarabiliyor. Ayrıca açma/kapama, trafo tap değişikliği, shunt kademesi, üretim/yük değişikliği gibi remedial action türleri de destekleniyor. :chatgpt-content-reference{index="14"}

Bu sizin mevcut **“Sanal Devreye Alma / Anahtarlama Senaryosu”** sisteminizle çok iyi eşleşir.

Daha da önemlisi, YTBS zaten PSS/E, PowerFactory, CGMES ve UCTE formatlarına model export edebiliyor. :chatgpt-content-reference{index="15"}

Dolayısıyla uzun vadede:

**YTBS DGS → ortak network model → PyPowSyBl**

çok güçlü bir mimari olabilir.

---

# 17. LightSim2Grid nerede kullanılabilir?

Çok sayıda N-1 senaryosu hesaplamaya başladığınızda performans önemli hale gelecek.

LightSim2Grid C++ tabanlı hızlı Newton-Raphson solver'ları sunuyor ve:

- single slack NR,
- distributed slack NR,
- SparseLU,
- KLU

gibi çözümler içeriyor. :chatgpt-content-reference{index="16"}

Pandapower ile de entegre kullanılabiliyor. Fakat controllable shunt, TCSC, bazı DC elemanları vb. konusunda kullanım koşulları/limitleri bulunuyor. :chatgpt-content-reference{index="17"}

Bu nedenle mimari olarak:

> **pandapower → önce doğru sonuç**  
> **LightSim2Grid → daha sonra performans hızlandırması**

şeklinde kullanırdım.

---

# 18. PyPSA nerede kullanılmalı?

PyPSA'yı daha çok:

- üretim planlama,
- ekonomik dispatch,
- çok zaman dilimli optimizasyon,
- kapasite planlama,
- optimal power flow

tarafında değerlendirirdim.

Non-linear AC power flow ve linear contingency hesapları da var. :chatgpt-content-reference{index="18"}

Ancak sizin ilk probleminiz **YTBS/PowerFactory elektriksel modelinin doğru çözümü** olduğu için başlangıçta pandapower veya PyPowSyBl daha uygun.

---

# 19. Power Grid Model

LF Energy'nin `power-grid-model` motoru:

- C++ çekirdek,
- Python ve C API,
- symmetric/asymmetric power flow,
- state estimation,
- short circuit

sunuyor ve performans odaklı. :chatgpt-content-reference{index="19"}

Fakat proje özellikle **distribution grid analysis** hedefli tanımlanıyor.

Dolayısıyla 400/154 kV TEİAŞ iletim sistemi için bunu birincil motor yapmak yerine daha çok araştırma/performans alternatifi olarak tutardım.

---

# 20. Ben olsam hangi motoru seçerdim?

Bunu tek motorla sınırlandırmazdım.

### Önerilen yapı

```text
                      ┌─ Browser DC / PTDF / LODF
                      │
DGS → Canonical Model ├─ pandapower
                      │    ├─ AC PF
                      │    ├─ IEC60909 SC
                      │    ├─ State Estimation
                      │    └─ OPF
                      │
                      ├─ PyPowSyBl
                      │    ├─ AC NR
                      │    ├─ N-1 Security
                      │    ├─ Sensitivity
                      │    └─ Remedial Actions
                      │
                      └─ PowerFactory Adapter
                           └─ Reference validation
```

Bu yapıda kullanıcı:

**Hesap Motoru → Browser / pandapower / OpenLoadFlow / PowerFactory Referansı**

seçebilir.

Ancak aynı kullanıcı arayüzü ve aynı `CanonicalNetwork` kullanılır.

Bu mimari gelecekte sizi herhangi bir solver'a bağımlı olmaktan kurtarır.

---

# 21. Native Messaging kullanırken önemli teknik ayrıntı

Chrome Native Messaging protokolünde tek mesaj boyutunun:

- extension → native host tarafında **64 MiB**,
- native host → extension tarafında **1 MiB**

sınırı bulunuyor. :chatgpt-content-reference{index="20"}

Türkiye şebekesi sonuçları tek mesajla dönmemeli.

Örneğin:

```text
JOB_START
NETWORK_CHUNK 1/20
NETWORK_CHUNK 2/20
...
RUN_POWER_FLOW

RESULT_SUMMARY
BUS_RESULT_CHUNK 1/8
BUS_RESULT_CHUNK 2/8
...
BRANCH_RESULT_CHUNK
GENERATOR_RESULT_CHUNK
JOB_END
```

şeklinde streaming protokolü kullanılmalı.

Bu aynı zamanda ilerleme çubuğunu mümkün kılar:

> Model dönüştürülüyor → Ybus hazırlanıyor → Newton 4/12 → sonuçlar aktarılıyor.

---

# 22. Elektriksel analizlerin geliştirilme sırası

YTBS Analiz Kılavuzu yalnız yük akışını değil; **kayıp, kısıt/N-1, kısa devre, dinamik kararlılık ve koruma analizlerini** de kapsamına alıyor. :chatgpt-content-reference{index="21"}

Mevcut proje için önerdiğim sıra şöyledir:

| Aşama | Analiz | Öncelik |
|---|---|---:|
| 1 | AC Load Flow | P0 |
| 2 | DC Load Flow | P0 |
| 3 | Model/KCL doğrulama | P0 |
| 4 | Hat/trafo kayıpları | P0 |
| 5 | PTDF/LODF | P1 |
| 6 | N-1 AC contingency | P1 |
| 7 | 3F/2F/1F kısa devre | P1 |
| 8 | State Estimation | P2 |
| 9 | AC/DC OPF | P2 |
| 10 | Gerilim/reaktif optimizasyonu | P2 |
| 11 | Dinamik kararlılık | ayrı motor |
| 12 | Mesafe koruma | ileri aşama |

---

# 23. AC yük akışında mutlaka tamamlanması gerekenler

Tam yük akışı motorunun yalnızca Newton denklemlerini çözmesi yeterli değil.

Model düzeyinde desteklenmesi gereken başlıklar:

| Özellik | v5.5 | Hedef |
|---|---|---|
| PQ bus | Var | Tam |
| PV bus | Kısmi | Tam |
| Slack | Basit | Distributed slack |
| Generator Q limits | Kısmi | Tam |
| PV→PQ | Kısmi | Tam |
| Multiple generator Q sharing | Yok | Tam |
| Remote voltage control | Yok | Tam |
| Droop | Yok | Tam |
| OLTC | Yaklaşık | Regülasyonlu |
| Phase shift | Eksik/kısıtlı | Tam |
| Shunt control | Basit | Kademeli |
| Series capacitor | İndirgeme | Native element |
| <66 kV network | Projeksiyon | Full model |
| Transformer losses | Eksik/kısıtlı | Tam |
| Generator capability | Yok | P-Q limit eğrisi |
| Distributed balancing | Yok/kısıtlı | Tam |

YTBS'nin kendi teknik referansının Full Jacobian yapısı `H/N/M/L` blokları ve mismatch vektörleriyle klasik Full Newton çözümünü tarif etmesi de hedef mimariyi açıkça gösteriyor. :chatgpt-content-reference{index="22"}

---

# 24. N-1 analizi nasıl geliştirilmelidir?

Mevcut “hat servise al/çıkar ve yeniden hesapla” özelliği aslında N-1 sisteminin çekirdeğine çok yakın.

Bunun otomatikleştirilmiş hali:

```text
Base AC PF
    ↓
N adet contingency üret
    ↓
H1 OUT → çöz
H2 OUT → çöz
H3 OUT → çöz
T1 OUT → çöz
G1 OUT → çöz
...
    ↓
Limit violation matrix
```

olmalı.

YTBS kılavuzunda da 400/154 kV hatlar, üretim üniteleri, 400/154 kV ototrafolar vb. kısıt analizlerine sokuluyor ve kısıt sonrası aşırı yüklenen ekipmanlar belirleniyor. :chatgpt-content-reference{index="23"}

Bunun için performanslı yöntem:

```text
PTDF / LODF pre-screen
        ↓
riskli 150 contingency
        ↓
Full AC N-1
        ↓
kritik 20
```

olur.

Böylece örneğin 2500 hat için her senaryoda pahalı AC NR çözmek zorunda kalmazsınız.

---

# 25. N-1 sonuç ekranı

Mevcut harita sistemi buna çok uygun.

Her contingency için:

| Kısıt | Etkilenen ekipman | Base | Post-N-1 | Limit | İhlal |
|---|---|---:|---:|---:|---:|
| H5846 OUT | H5713 | 742 MVA | 1275 MVA | 1160 | 109.9% |
| H5846 OUT | B9467 | 1.012 pu | 0.934 pu | 0.95 | LOW V |

Haritada:

- kırmızı = ihlal,
- turuncu = limite yakın,
- normal = ihlal yok,

gösterilebilir.

Ayrıca:

**“Bu hattın açılması kaç başka ekipmanı limite sokuyor?”**

metriği eklenmeli.

Bu, YTBS'nin “Kısıtlılığı Kritik Hatlar” yaklaşımıyla doğrudan örtüşüyor. :chatgpt-content-reference{index="24"}

---

# 26. Kısa devre analizi

Bunu sıfırdan JavaScript ile yazmayı önermiyorum.

YTBS analiz kapsamı:

- üç faz,
- iki faz,
- tek faz

kısa devre sonuçlarını içeriyor. :chatgpt-content-reference{index="25"}

Pandapower'ın IEC 60909 implementasyonu bu aşama için çok uygun. :chatgpt-content-reference{index="26"}

Ancak DGS'den aşağıdaki verilerin tam alınması gerekiyor:

```text
positive sequence Z1
negative sequence Z2
zero sequence Z0
transformer vector group
transformer zero sequence
generator subtransient data
external grid Sk"
X/R
earthing
```

Bu veriler olmadan yalnızca “yaklaşık 3F fault” yapılabilir; gerçek tek faz-toprak koruma analizi yapılamaz.

---

# 27. Durum kestirimi

YTBS kılavuzu yük akış sonuçlarının durum kestirimi sonuçlarıyla da raporlanabildiğini ve PMU açı ölçümleriyle hesaplanan açıların karşılaştırıldığını belirtiyor. :chatgpt-content-reference{index="27"}

Chrome eklentisinde ileri aşamada:

```text
SCADA P/Q/V
PMU V∠θ
OSOS
       ↓
Measurement Model
       ↓
WLS State Estimator
       ↓
Bad Data Detection
       ↓
Estimated Network State
```

kurulabilir.

UI'da her değer:

```text
MEASURED
ESTIMATED
CALCULATED
FORECAST
APPROXIMATE
```

etiketine sahip olmalı.

Mevcut uygulamanın `source`/`quality` yaklaşımı bunun için iyi bir başlangıç.

---

# 28. OPF ve gerilim planlama

YTBS Veri Setleri Kılavuzunda yük akışının yanında:

- optimum yük akışı / gerilim planlama,
- dinamik hat kapasitesi,
- atalet,
- rezerv

analizleri de tanımlanmış. :chatgpt-content-reference{index="28"}

DGS modeli de PowerFactory `ComOpf` parametrelerinde:

- generator P distribution,
- generator/SVS Q distribution,
- transformer tap,
- switched shunt,
- generator P/Q limits,
- bus voltage limits,
- branch flow limits

gibi değişkenleri taşıyor. :chatgpt-content-reference{index="29"}

Dolayısıyla uzun vadede eklentiye:

**“Gerilim ve Kayıp Optimizasyonu”**

modülü çok iyi oturur.

Ama bu AC yük akışı güvenilir hale geldikten sonra yapılmalı.

---

# 29. Dinamik kararlılık ayrı bir konu

YTBS'de geçici rejim analizi:

- arıza/kısıt senaryoları,
- hat yüklenmeleri,
- bara gerilimleri,
- generatör rotor açıları

üzerinden yapılıyor. :chatgpt-content-reference{index="30"}

Bunu Chrome içindeki mevcut AC solver'a eklemeye çalışmanızı önermiyorum.

Dinamik analiz için daha sonra:

- PowerFactory,
- PSS/E,
- Dynawo,
- başka RMS/EMT motoru

üzerinden ayrı bir solver adapter kullanılmalı.

Chrome eklentisi sadece:

```text
scenario definition
↓
simulation job
↓
time-series results
↓
V(t), f(t), δ(t), P(t), Q(t)
```

göstersin.

---

# 30. Test altyapısında önemli eksik

Paketin test kodları örneğin:

```python
/mnt/data/20260923_1200_SN3_TR0.json
/mnt/data/20260923_1500_SN3_TR0.json
...
```

gibi harici mutlak yollar kullanıyor.

Fakat bu asıl DGS dosyaları teslim ZIP'inde bulunmuyor. ZIP içinde yalnız test sonuç kayıtları bulunuyor.

Bu nedenle:

> teslim paketindeki raporlar **tam olarak yeniden üretilebilir test paketi değil.**

Yeni projede:

```text
/tests/fixtures/
/tests/unit/
/tests/integration/
/tests/e2e/
/tests/reference/
```

oluşturulmalı.

Model dosyaları büyükse Git LFS veya ayrı test-data paketi kullanılabilir.

---

# 31. Test stratejisini önemli ölçüde güçlendirin

En kritik geliştirmelerden biri bu.

Mevcut 40/40 sekme açılması ve JavaScript hata kontrolü UI regresyonu açısından yararlı; fakat elektriksel doğruluk kanıtı değil.

Yeni kabul sistemi:

| Test | Referans |
|---|---|
| DGS parser | Sabit model fixture |
| Bus-branch conversion | Beklenen topoloji |
| Node-breaker reduction | Beklenen connectivity |
| AC PF | IEEE 14/30/57/118/300 |
| Transformer tap | Analitik küçük model |
| PV→PQ | Q-limit test case |
| Multiple generator Q | Referans case |
| Remote V control | PowerFactory |
| Series compensation | PowerFactory |
| N-1 | PowerFactory/PyPowSyBl |
| Short circuit | IEC 60909 case |
| YTBS 12:00 | PowerFactory |
| YTBS 15:00 | PowerFactory |
| YTBS 16:00 | PowerFactory |

Özellikle karşılaştırılan büyüklükler:

```text
V magnitude
V angle
P from / P to
Q from / Q to
I from / I to
branch losses
generator Q
transformer tap
slack P/Q
total system losses
```

olmalı.

---

# 32. Mevcut 12:00 karşılaştırması yeterli değil

Mevcut sonuç:

**Hat P MAE = 16.88 MW**

ve maksimum hata:

**311.3 MW**

Bu değer, görüntüleme/prototip açısından kullanılabilir fakat solver eşdeğerliği iddiası için yüksek.

Daha önemlisi:

**Ünite Q = 0/13 eşleşme.**

Dolayısıyla bundan sonraki geliştirme hedefi yalnız “Newton yakınsasın” olmamalı.

Önce:

**DGS model fidelity → kontrol modelleri → solver → referans karşılaştırması**

sırası izlenmeli.

---

# 33. Güvenlik açısından

Mevcut kaynakta değerlerin çoğunda `h()` / `safe()` escape mekanizması kullanılması olumlu.

Ancak uygulama çok fazla `innerHTML` üretiyor.

Chrome da extension güvenlik rehberinde `innerHTML` kullanımının saldırı yüzeyini artırdığını, mümkün olduğunda DOM node / `innerText` yaklaşımını öneriyor. :chatgpt-content-reference{index="31"}

Yeni modüler sürümde:

```javascript
element.textContent = value
```

tercih edilmeli.

HTML üretilmesi gereken sınırlı yerlerde merkezi sanitize mekanizması kullanılmalı.

Özellikle gelecekte eklenti YTBS web sayfasına content-script ile bağlanırsa bu çok daha önemli hale gelir.

---

# 34. Depolama

Büyük DGS dosyalarını `chrome.storage.local` içine koymamak gerekir.

Chrome Storage API ayar ve extension state için uygun ve tüm extension context'lerinden erişilebiliyor; ancak kotası ve yazma maliyeti var. :chatgpt-content-reference{index="32"}

Ben:

**IndexedDB**

içinde:

```text
network models
normalized topology
solver result sets
scenario snapshots
```

saklarım.

`chrome.storage.local/sync` içinde ise:

```text
theme
last engine
map options
flow settings
analysis preferences
```

tutarım.

---

# 35. Model veri yapısını baştan normalize etmek gerekiyor

En önemli refactor budur.

Şu anda UI tarafı doğrudan `ElmLne`, `ElmTerm`, `ElmSym`, `StaCubic` vb. PowerFactory sınıflarına çok bağımlı.

Araya şu tip bir model koyun:

```text
CanonicalNetwork
 ├─ substations
 ├─ voltageLevels
 ├─ buses
 ├─ terminals
 ├─ switches
 ├─ lines
 ├─ transformers
 ├─ generators
 ├─ loads
 ├─ shunts
 ├─ seriesCompensators
 ├─ externalGrids
 ├─ measurements
 └─ controls
```

Sonra:

```text
DGS → CanonicalNetwork
CGMES → CanonicalNetwork
PSS/E → CanonicalNetwork
UCTE → CanonicalNetwork
```

olabilir.

Bu yaklaşım projenin gerçek anlamda **“YTBS Şebeke Analiz Platformu”** haline gelmesini sağlar.

---

# 36. Bir başka kırılgan nokta: FID prefix ile ekipman sınıfı belirleme

Mevcut kodun yaklaşık 457. satırındaki:

```javascript
id.startsWith('H') ? 'ElmLne' :
id.startsWith('T') ? 'ElmTr2' :
id.startsWith('U') ? 'ElmSym' :
...
```

yaklaşımı UI yardımı için pratik ama çekirdek model mantığında kullanılmamalı.

Bunun yerine global:

```text
EquipmentRegistry
FID → class → object → terminal refs
```

indeksi oluşturulmalı.

FID biçimi değişirse veya başka model formatı eklenirse mevcut prefix bağımlılığı sorun çıkarabilir.

---

# 37. Chrome sürümünün önerilen kullanıcı deneyimi

Ana toolbar:

```text
MODEL | ŞEBEKE | SLD | ANALİZ | SENARYO | SONUÇLAR
```

Altında motor seçimi:

```text
Hesap Motoru:
[ Browser Approx. ▼ ]

● Browser Approx.
○ pandapower
○ OpenLoadFlow
○ PowerFactory Reference
```

ve her hesap sonucunun üst kısmında:

```text
ENGINE       OpenLoadFlow
MODEL        2026-09-23 15:00
TOPOLOGY     Node-Breaker → Bus-Branch
SCOPE        ≥66 kV
CONVERGENCE  OK
MAX ΔP       2.1e-7 pu
ITERATIONS   5
VALIDATION   PowerFactory comparison available
```

olmalı.

Bu, mevcut “yaklaşık/deneysel” etiketlemesini profesyonel bir **provenance system** haline getirir.

---

# 38. Kısa vadeli geliştirme öncelikleri

| Öncelik | İş | Neden |
|---|---|---|
| **P0** | Tek HTML'yi TypeScript modüllerine böl | MV3 ve sürdürülebilirlik |
| **P0** | Manifest V3 oluştur | Chrome Extension |
| **P0** | Blob Worker'ları dosya worker'a dönüştür | CSP |
| **P0** | CanonicalNetwork katmanı oluştur | Solver bağımsızlığı |
| **P0** | 66 kV projection kurallarını açıklaştır | Doğruluk |
| **P0** | Koordinat validation düzelt | YTBS uyumu |
| **P0** | Test fixture'larını paketle | Tekrar üretilebilirlik |
| **P1** | pandapower Native Host prototipi | Gerçek AC PF |
| **P1** | Generator Q/remote V control | V/Q doğruluğu |
| **P1** | N-1 motoru | YTBS analizi |
| **P1** | PyPowSyBl adapter | Security analysis |
| **P1** | IEC60909 kısa devre | YTBS kapsamı |
| **P2** | OPF | Gerilim/kayıp optimizasyonu |
| **P2** | State estimation | SCADA/PMU |
| **P3** | Dynamic solver adapter | Geçici rejim |
| **P3** | Protection analysis | Röle/mesafe koruma |

---

# 39. Önerdiğim v6.0 hedefi

Ben **v6.0'da daha fazla görsel özellik eklemeyi ikinci plana alırdım**.

v6.0'ın konusu:

## **“Chrome Extension + Electrical Core Refactor”**

olmalı.

Hedef:

```text
YTBS PowerFactory Network Studio v6.0
Chrome Extension · Manifest V3

✓ DGS JSON
✓ Full Node-Breaker topology
✓ Bus-Branch reduction
✓ Geographic map
✓ SLD
✓ Scenario engine
✓ Browser DC flow
✓ Browser approximate AC
✓ pandapower AC load flow
✓ solver comparison
✓ result provenance
✓ validation dashboard
```

Bu noktadan sonra v6.1:

**N-1 / contingency**

v6.2:

**Short Circuit**

v6.3:

**OPF / Voltage Planning**

v7:

**State Estimation / PMU / SCADA**

şeklinde ilerlenebilir.

---

# 40. Mimari olarak nihai hedef

```text
                    YTBS / DGS
                         │
                         ▼
              ┌─────────────────────┐
              │   Import / Parser   │
              └──────────┬──────────┘
                         ▼
              ┌─────────────────────┐
              │  CANONICAL NETWORK  │
              │ Node-Breaker Model  │
              └──────────┬──────────┘
                         │
               ┌─────────┴─────────┐
               ▼                   ▼
        Bus-Branch Model       SLD / Topology
               │
     ┌─────────┼───────────────┐
     ▼         ▼               ▼
 Browser    pandapower      PyPowSyBl
 DC/AC      Native Host     Native Host
     │         │               │
     └─────────┼───────────────┘
               ▼
        STANDARD RESULTSET
               │
        ┌──────┼───────┐
        ▼      ▼       ▼
       MAP    SLD    ANALYSIS
        │      │       │
        └──────┼───────┘
               ▼
        Scenario Manager
```

Bu yapı, projenin büyümeye devam etmesi açısından mevcut tek HTML modelinden **çok daha sağlam bir temel** oluşturur.

## En önemli karar

Bu projede **elektriksel hesap motorunu sıfırdan JavaScript ile PowerFactory seviyesine çıkarmaya çalışmayı ana geliştirme yolu olarak seçmezdim**.

Tarayıcı içindeki mevcut motoru koruyup onu:

> **“hızlı ön analiz / fallback / eğitim / görselleştirme motoru”**

olarak konumlandırırdım.

Mühendislik hesabı için ise ilk aşamada **pandapower**, iletim sistemi güvenlik ve N-1 tarafında **PyPowSyBl/OpenLoadFlow**, hız gerektiğinde **LightSim2Grid**, referans doğrulaması için de mümkünse **PowerFactory adapter** kullanırdım. Böylece Chrome eklentisi basit bir görüntüleyiciden, gerçek anlamda **çok motorlu YTBS şebeke analiz çalışma ortamına** dönüşebilir. :chatgpt-content-reference{index="33"}

Bir sonraki geliştirme adımı olarak **v6.0 Chrome Extension mimarisini dosya/dizin seviyesinde tasarlayıp, hangi mevcut v5.5 fonksiyonlarının aynen taşınacağı, hangilerinin yeniden yazılacağı ve `pandapower Native Messaging` hesap motorunun API sözleşmesinin nasıl olacağına kadar ayrıntılı bir geliştirme planı/promptu** hazırlanması en doğru adım olur.
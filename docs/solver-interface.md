# Solver arayüzü ve sonuç kaynağı

`PowerSystemSolver.runLoadFlow(network, options)` bir `ResultSet` döndürür. Yapı motor adı/sürümü, model kimliği ve SHA-256 hash'i, zaman, topoloji, elektriksel kapsam, yakınsama, doğrulama, uyarılar ve ekipman sonuç gruplarını içerir. Kalite türleri `MEASURED`, `CALCULATED`, `ESTIMATED`, `FORECAST`, `APPROXIMATE`, `REFERENCE` olarak tanımlanır.

`BrowserApproxSolver`, mevcut v5.5 yaklaşık çözücüsünü çağıran adaptördür. Eski UI ve senaryo akışı aynı worker'ı doğrudan kullanmaya devam eder; V6 sonuç zarfı ve IndexedDB kaydı yanında oluşturulur. Bu adaptörün boş sonuç grupları, orijinal çözücü çıktısının tüm bara/generatör/trafo metriklerinin henüz standart yapıya aktarılmadığını gösterir. Çözücü PowerFactory eşdeğeri olarak etiketlenmez.

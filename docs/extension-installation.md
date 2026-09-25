# Uzantı kurulumu

1. Node.js 22 veya üstünü kurun; `npm install` ve `npm run build` çalıştırın.
2. Chrome `chrome://extensions` sayfasında **Developer mode** açın.
3. **Load unpacked** ile `dist/` klasörünü seçin.
4. Uzantı simgesine tıklayın. Yan panelden DGS JSON seçin ve **Çalışma Alanını Aç** düğmesine basın.
5. Alternatif olarak çalışma alanındaki Model sekmesinden JSON seçin.

Uzantı izni `sidePanel` ve `storage` ile sınırlıdır; host izni yoktur. Model yerel cihazda kalır. Güncellemeden sonra `npm run build` ve Chrome uzantı kartındaki Reload düğmesini kullanın.

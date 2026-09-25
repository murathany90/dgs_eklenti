
// v4.1 tek-dosya güvenlik sözleşmesi: harici ölçüm/sonuç girişi kesin olarak devre dışı.
(function(){
 const disableLegacy=()=>{for(const id of ['resultInput','measureInput','uploadResultShortcut','uploadMeasureShortcut','resultSpec']){const el=document.getElementById(id);if(el){el.disabled=true;el.setAttribute('aria-disabled','true');}}};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',disableLegacy);else disableLegacy();
 try{loadResultFiles=async function(){throw new Error('v4.1 yalnız YTBS DGS JSON kabul eder; harici ölçüm/sonuç dosyası desteklenmez.');};}catch(_){}
})();

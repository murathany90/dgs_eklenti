
'use strict';
/* v4.3 hotfix-1: deneysel cozucu on-kosul korumasi (eksik sinifli dosyada TypeError yerine acik mesaj). */
(function(){
 try{
  var origStart=window.startV3Solver;
  window.startV3Solver=async function(){
   try{
    if(!active){try{putText('solverStatus','Model yukleyin.');}catch(_){}return;}
    var missing=[];
    try{if(!active.t('ElmTerm'))missing.push('ElmTerm');}catch(_){missing.push('ElmTerm');}
    try{if(!active.t('StaCubic'))missing.push('StaCubic');}catch(_){missing.push('StaCubic');}
    if(missing.length){try{putText('solverStatus','Hesap baslatilamadi: modelde '+missing.join(', ')+' sinifi yok; P/Q/V sonucu uretilmedi.');var s=$('solverStatus');if(s)s.className='notice bad';}catch(_){}return;}
   }catch(_){}
   return origStart.apply(this,arguments);
  };
 }catch(_){}
})();

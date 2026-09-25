
'use strict';
/* YTBS v4.3 overlay — tek dosya, cevrimdisi. Orijinal v4.2 motoru korunur; bu blok yalnizca UI/senaryo merkezilestirme ekler. */
(function(){
try{document.querySelector('header.apphead h1').textContent='PowerFactory Şebeke Görüntüleyici ve Analiz Sistemi v4.3 · Düzeltilmiş';}catch(_){}
try{document.title='YTBS | PowerFactory Şebeke Görüntüleyici v4.3 · Düzeltilmiş';}catch(_){}
try{var fr=$('footerRight'); if(fr) fr.textContent='YTBS / PowerFactory model goruntuleme \u00B7 Cevrimdisi \u00B7 v4.3';}catch(_){}
var V43_SOLVER='v5.2-nr-refinement-pv-limit-1';
window.getVisibleVoltageSet=function(){try{return selectedVolts();}catch(_){return new Set();}};
function v43Fp(){try{if(!active) return 'no-model';return active.rid+'|'+active.timeKey+'|'+active.stats.rows+'|'+active.tables.size;}catch(_){return 'err';}}
function v43ShortFp(){var f=v43Fp();return f.length>28?f.slice(0,12)+'\u2026'+f.slice(-8):f;}

/* Bir önceki Worker sonucunu, onu başlatan model/senaryo revizyonundan kopar.
   Worker'ın mevcut message handler'ına iptal mesajı vererek bekleyen Promise'i de çöz. */
function v43AbortSolve(){
 if(!v3.running)return false;
 var worker=v3.worker;v3.seq++;v4.generation++;
 if(worker){
  try{if(typeof worker.onmessage==='function')worker.onmessage({data:{done:true,cancelled:true}});}catch(_){}
  try{worker.terminate();}catch(_){}
 }
 v3.worker=null;v3.running=false;
 return true;
}
/* Görüntülenen P/Q/V veri kümesi seçili Referans/Senaryo moduna bağlıdır.
   Bekleyen veya farklı model/revizyonlu senaryo verisi asla görüntülenmez. */
function v43SyncViewSets(){
 if(!active)return;
 var key=v43Fp()+'|'+SC.revision+'|'+SC.solverVersion;
 var base=v4.base&&v4.base.modelId===active.rid?v4.base:null;
 var scenario=!SC.pending&&SC.lastCalcKey===key&&v4.scenario&&v4.scenario.modelId===active.rid?v4.scenario:null;
 var which=SC.viewMode==='reference'?base:SC.viewMode==='scenario'?scenario:null;
 var available=[base,scenario].filter(Boolean);
 if(v3.running)return;
 if(v2.sets.length!==available.length||v2.sets.some((s,i)=>s!==available[i]))v2.sets.splice(0,v2.sets.length,...available);
 var chosen=which?.id||'';
 if(v2.selectedSet!==chosen)v2.selectedSet=chosen;
}


/* ---------- ScenarioController (tek senaryo kaynagi) ---------- */
var SC=window.ScenarioController={revision:0,history:[],pending:false,viewMode:'reference',lastCalcKey:null,solverVersion:V43_SOLVER,
 fingerprint:function(){return v43Fp();},
 commitMutation:function(){
  v43AbortSolve(); v4.scenario=null;v4.scenarioSolver=null;SC.revision++;SC.lastCalcKey=null;
  SC.pending=v4.overrides.size>0||v42.switchOverrides.size>0||(window.VirtualEnergizationEngine?.restored?.().length||0)>0;SC.viewMode='reference';v3.solver=v4.baseSolver||null;
  v2.sets.splice(0,v2.sets.length,...(v4.base?[v4.base]:[]));v2.selectedSet=v4.base?.id||'';
  try{stopFlow();listSets();drawMap();v4OverlayStatus();v4ValidateCalc();v4ScenarioComparison();v42RenderSwitchAnalysis();}catch(_){}
  try{v43SyncViewSets();v43Refresh();}catch(_){}
  window.V6Bridge?.scenarioChanged?.();
  return SC.revision;
 },
 touch:function(){return SC.commitMutation();},
 applySwitch:function(fid,position){
  var prev=v42.switchOverrides.has(fid)?v42.switchOverrides.get(fid):null;
  var sw=active?.get('ElmCoup',fid);if(!sw)return false;
  var next=position===null||Number(sw.on_off)===(position?1:0)?null:(position?1:0);
  if(prev===next)return true;
  SC.history.push({kind:'switch',fid:fid,prev:prev,next:next,t:Date.now()});if(SC.history.length>60)SC.history.shift();
  if(next===null)v42.switchOverrides.delete(fid);else v42.switchOverrides.set(fid,next);
  SC.commitMutation();return true;
 },
 clearSwitches:function(){if(!v42.switchOverrides.size)return true;SC.history.push({kind:'switches',prev:[...v42.switchOverrides],t:Date.now()});if(SC.history.length>60)SC.history.shift();v42.switchOverrides.clear();SC.commitMutation();return true;},
 applyBundle:function(plan){
  if(!plan||!active)return false;
  var line=active.lineById(plan.line);if(!line)return false;
  var previous={kind:'bundle',lines:[...v4.overrides],switches:[...v42.switchOverrides],restored:window.VirtualEnergizationEngine?.restored?.()||[],t:Date.now()};
  var lineOff=Number(plan.lineOff)===1?1:0;
  var linePrev=v4.overrides.has(line.FID)?v4.overrides.get(line.FID):null;
  var switchChanges=(plan.switches||[]).filter(function(sw){return sw.out!==1;});
  var restoredBefore=window.VirtualEnergizationEngine?.restored?.()||[];
  var restoredAfter=[...new Set([...restoredBefore,...(plan.restoredTerminals||[])].map(String))];
  var restoredChanged=restoredAfter.length!==restoredBefore.length;
  if(linePrev===lineOff&&!restoredChanged&&switchChanges.every(function(sw){return Number(v42.switchOverrides.get(sw.id)??active.get('ElmCoup',sw.id)?.on_off)===1;}))return true;
  SC.history.push(previous);if(SC.history.length>60)SC.history.shift();
  if(linePrev!==lineOff){if(v43OrigApply)v43OrigApply(line.FID,lineOff);else v4.overrides.set(line.FID,lineOff);if(Number(line.outserv)===lineOff)v4.overrides.delete(line.FID);}
  for(var sw of switchChanges){if(active.get('ElmCoup',sw.id))v42.switchOverrides.set(sw.id,1);}
  if(restoredChanged)window.VirtualEnergizationEngine?.restore?.(restoredAfter);
  v4.activeOverrides=v4.overrides.size?v4.overrides:null;
  SC.commitMutation();v43OpenDrawer(line.FID);return true;
 },
 restore:function(snapshot){
  if(!active||!snapshot)return false;
  var normalizeEntries=function(entries,valid){return (entries||[]).filter(function(entry){return Array.isArray(entry)&&valid(entry[0]);}).map(function(entry){return [String(entry[0]),Number(entry[1])===1?1:0];}).sort(function(a,b){return a[0]<b[0]?-1:a[0]>b[0]?1:0;});};
  var nextLines=normalizeEntries(snapshot.lines,function(id){return !!active.lineById(id);});
  var nextSwitches=normalizeEntries(snapshot.switches,function(id){return !!active.get('ElmCoup',id);});
  var nextRestored=[...new Set((snapshot.restoredTerminals||[]).map(function(id){return String(id??'').trim();}).filter(Boolean))].sort(function(a,b){return a<b?-1:a>b?1:0;});
  var currentLines=normalizeEntries([...v4.overrides],function(){return true;});
  var currentSwitches=normalizeEntries([...v42.switchOverrides],function(){return true;});
  var currentRestored=[...new Set((window.VirtualEnergizationEngine?.restored?.()||[]).map(function(id){return String(id??'').trim();}).filter(Boolean))].sort(function(a,b){return a<b?-1:a>b?1:0;});
  var auto=$('v53AutoTerm'),nextAuto=snapshot.autoRestoreTerminals===true;
  if(JSON.stringify(nextLines)===JSON.stringify(currentLines)&&JSON.stringify(nextSwitches)===JSON.stringify(currentSwitches)&&JSON.stringify(nextRestored)===JSON.stringify(currentRestored)&&!!(auto&&auto.checked)===nextAuto){try{window.YTBS_V53?.refreshRestoredEnds?.();}catch(_){}return true;}
  v4.overrides.clear();v42.switchOverrides.clear();
  for(var entry of nextLines)v4.overrides.set(entry[0],entry[1]);
  for(var entry of nextSwitches)v42.switchOverrides.set(entry[0],entry[1]);
  try{window.VirtualEnergizationEngine?.restore?.(nextRestored);}catch(_){}
  try{if(auto)auto.checked=nextAuto;window.YTBS_V53?.refreshRestoredEnds?.();}catch(_){}
  v4.activeOverrides=v4.overrides.size?v4.overrides:null;SC.history.splice(0);SC.commitMutation();return true;
 },
 apply:function(id,off){
  try{
   if(!active){v4Notify('Once bir JSON yukleyiniz.',true);return false;}
   var l=active.lineById(id); if(!l){v4Notify('Gecerli hat bulunamadi.',true);return false;}
   var prev=v4.overrides.has(l.FID)?v4.overrides.get(l.FID):null;
   off=Number(off)===1?1:0;
   if(prev===off||(prev===null&&Number(l.outserv)===off)){v43Refresh();v43OpenDrawer(l.FID);return true;}
   v43AbortSolve();
   SC.history.push({fid:l.FID,prev:prev,next:off,t:Date.now()});
   if(SC.history.length>60) SC.history.shift();
   v43OrigApply(l.FID,off);
   if(Number(l.outserv)===off)v4.overrides.delete(l.FID);
   v4.activeOverrides=v4.overrides.size?v4.overrides:null;
   SC.commitMutation();v43OpenDrawer(l.FID);
   return true;
  }catch(e){console.warn('SC.apply',e);return false;}
 },
 undo:function(){
  try{
   var hh=SC.history.pop();
   if(!hh){v4Notify('Geri alinacak islem yok.',true);return false;}
   v43AbortSolve();
    if(hh.kind==='bundle'){
     v4.overrides.clear();for(var le of hh.lines)v4.overrides.set(le[0],le[1]);
     v42.switchOverrides.clear();for(var se of hh.switches)v42.switchOverrides.set(se[0],se[1]);
     window.VirtualEnergizationEngine?.restore?.(hh.restored||[]);
    }else if(hh.kind==='switches'){v42.switchOverrides.clear();for(var se of hh.prev)v42.switchOverrides.set(se[0],se[1]);}
    else if(hh.kind==='switch'){if(hh.prev===null||hh.prev===undefined)v42.switchOverrides.delete(hh.fid);else v42.switchOverrides.set(hh.fid,hh.prev);}
    else if(hh.prev===null||hh.prev===undefined) v4.overrides.delete(hh.fid); else v4.overrides.set(hh.fid,hh.prev);
   v4.activeOverrides=v4.overrides.size?v4.overrides:null;
   if(v4.base===null&&v2.sets.length&&!v4.scenario) v4.base=v2.sets[0];
   v4.scenario=null; v4.scenarioSolver=null; v2.sets.splice(0); v2.selectedSet=''; v3.solver=null;
   try{stopFlow();}catch(_){}
   try{listSets();}catch(_){}
   try{drawMap();}catch(_){}
   try{v4OverlayStatus();}catch(_){}
   try{v4ValidateCalc();}catch(_){}
   try{v4ScenarioComparison();}catch(_){}
    SC.commitMutation();
   v4Notify(hh.fid+': islem geri alindi. '+(SC.pending?'Senaryo hesabi bekliyor.':'Referans hesap geri yuklendi.')+' Orijinal DGS degismedi.');
   v43Refresh(); v43OpenDrawer(hh.fid);
   return true;
  }catch(e){console.warn('SC.undo',e);return false;}
 },
 reset:function(){
  try{
   v43AbortSolve();
    var restored=window.VirtualEnergizationEngine?.restored?.()||[],auto=$('v53AutoTerm');
    if(!v4.overrides.size&&!v42.switchOverrides.size&&!restored.length&&!(auto&&auto.checked))return true;
    v4.overrides.clear();v42.switchOverrides.clear();window.VirtualEnergizationEngine?.restore?.([]);if(auto)auto.checked=false;try{window.YTBS_V53?.refreshRestoredEnds?.();}catch(_){}
    v4.activeOverrides=null; v4.scenario=null;
   if(v4.base){v2.sets.splice(0,v2.sets.length,v4.base);v2.selectedSet=v4.base.id;v3.solver=v4.baseSolver;}
   else{v2.sets.splice(0);v2.selectedSet='';v3.solver=null;}
    SC.history.splice(0);SC.commitMutation();
   try{listSets();}catch(_){}
   try{v4ScenarioComparison();}catch(_){}
   try{v4OverlayStatus();}catch(_){}
   try{v4ValidateCalc();}catch(_){}
   try{drawMap();}catch(_){}
   v4Notify('Senaryo sifirlandi; orijinal modele donuldu.');
   v43Refresh();
   return true;
  }catch(e){console.warn('SC.reset',e);return false;}
 },
 cancel:function(){
  try{
   var wasRunning=v43AbortSolve();
   v4.scenario=null;v4.scenarioSolver=null;SC.lastCalcKey=null;
   SC.pending=v4.overrides.size>0||v42.switchOverrides.size>0||(window.VirtualEnergizationEngine?.restored?.().length||0)>0;v3.solver=null;
   v43SyncViewSets();
   v4Notify(wasRunning?'Hesap iptal edildi; bekleyen senaryo sonucu uygulanmayacak.':'Calisan hesap yok.',true);
   v43Refresh();if(selectedLine)v43OpenDrawer(selectedLine);drawMap(); return wasRunning;
  }catch(e){return false;}
 },
 run:function(){
  (async function(){
   try{
    if(!active){v4Notify('Once bir JSON yukleyiniz.',true);return;}
    if(!v4.overrides.size&&!v42.switchOverrides.size&&!(window.VirtualEnergizationEngine?.restored?.().length||0)){v4Notify('Senaryo icin once bir hat, anahtar veya terminal durumu degistiriniz.',true);return;}
    if(v3.running){v4Notify('Baska bir hesap suruyor.',true);return;}
    var model=active, fp=v43Fp(), rev=SC.revision, stamp=++v4.generation;
    v4Notify('Senaryo topolojisi kuruluyor, deneysel 66 kV+ AC-PQ hesaplaniyor\u2026');
    v43Refresh();
    v52SwitchInGraph=true;try{await startV3Solver();}finally{v52SwitchInGraph=false;}
    if(active!==model||stamp!==v4.generation||v43Fp()!==fp||SC.revision!==rev){v4Notify('Model/senaryo degisti; eski sonuc atildi.',true);return;}
    var set=null; try{set=v2.sets.find(x=>x.kind==='calculation'&&x.modelId===active.rid)||null;}catch(_){}
    if(!set||!v3.solver||!v3.solver.solved||!set.rows.length){v4Notify('Yuk akisi yakinşamadi veya gecerli sonuc uretilmedi; senaryo verisi uygulanmadi.',true);SC.pending=true;v43SyncViewSets();return;}
    if(!/SANAL SENARYO/.test(set.name||'')) set.name+=' \u00B7 SANAL SENARYO';
    for(var r of set.rows){ if(!/SANAL SENARYO/.test(r.source||'')) r.source+=' \u00B7 SANAL SENARYO'; }
    v4.scenario=set; v4.scenarioSolver=v3.solver;
    try{v4ValidateCalc();}catch(_){}
    v4Notify('Senaryo hesabi bitti. '+((v3.solver&&v3.solver.solved)||0)+'/'+((v3.solver&&v3.solver.total)||0)+' ada yakinsadi. Sonuclar DENEYSEL ve referans dogrulamasi yapilmadi.');
    try{v4ScenarioComparison();}catch(_){}
    try{drawMap();}catch(_){}
    SC.pending=false; SC.lastCalcKey=fp+'|'+rev+'|'+V43_SOLVER; window.V6Bridge?.scenarioCalculated?.();
    v43SyncViewSets();
    v43Refresh();
    if(selectedLine) v43OpenDrawer(selectedLine);
   }catch(e){v52SwitchInGraph=false;SC.pending=true;SC.lastCalcKey=null;v43SyncViewSets();try{v4Notify('Senaryo hesaplanamadi: '+e.message,true);}catch(_){}}
  })();
 }
};

/* ---------- v42BuildVolts override: <=36 tek ana katman ---------- */
var v43PrevSel=new Map();
function v43IsMinorStr(v){if(v==='other') return false; var n=Number(v); return Number.isFinite(n)&&n<=36;}
window.v43GroupInfo=function(){
 try{
  if(!active) return {minor:[],major:[],gLines:0,gBus:0,gTrafo:0};
  var termTable=active.t('ElmTerm'), uix=active.attrAt('ElmTerm','uknom');
  var lineCount=new Map(), busCount=new Map();
  for(var l of active.lines){var k=Number.isFinite(l.voltage)?String(l.voltage):'other';lineCount.set(k,(lineCount.get(k)||0)+1);}
  if(termTable) for(var r of termTable.Values){var u=Number(r[uix]);var k2=(Number.isFinite(u)&&u>0)?String(u):'other';busCount.set(k2,(busCount.get(k2)||0)+1);}
  var all=[...new Set([...active.lines.map(function(x){return Number.isFinite(x.voltage)?String(x.voltage):'other';}),...(termTable?termTable.Values.map(function(rr){var uu=Number(rr[uix]);return (Number.isFinite(uu)&&uu>0)?String(uu):'other';}):[])])];
  var minor=all.filter(function(v){return v!=='other'&&Number(v)<=36;}), major=all.filter(function(v){return v!=='other'&&Number(v)>36;});
  var gL=0,gB=0; for(var v of minor){gL+=lineCount.get(v)||0;gB+=busCount.get(v)||0;}
  return {minor:minor,major:major,gLines:gL,gBus:gB,all:all};
 }catch(_){return {minor:[],major:[],gLines:0,gBus:0};}
};
window.v42BuildVolts=function(){
 var box=$('voltageLayers'); if(!box) return;
 if(!active){try{$('v42TopStatus').textContent='Model bekleniyor';}catch(_){} return;}
 try{box.querySelectorAll('[data-volt]').forEach(function(e){v43PrevSel.set(e.dataset.volt,e.checked);});}catch(_){}
 var termTable=active.t('ElmTerm'), uix=active.attrAt('ElmTerm','uknom');
 var lineCount=new Map(), busCount=new Map(), trafoCount=new Map();
 for(var l of active.lines){var k=Number.isFinite(l.voltage)?String(l.voltage):'other';lineCount.set(k,(lineCount.get(k)||0)+1);}
 if(termTable) for(var r of termTable.Values){var u=Number(r[uix]);var k2=(Number.isFinite(u)&&u>0)?String(u):'other';busCount.set(k2,(busCount.get(k2)||0)+1);}
 try{
  var tt=active.t('ElmTr2');
  for(var i=0;i<((tt&&tt.Values.length)||0);i++){var rr=active.row('ElmTr2',i);var cub=active.get('StaCubic',rr.bushv||rr.bus1);var tm=active.get('ElmTerm',cub&&cub.fold_id);var typ=active.get('TypTr2',rr.typ_id);var uu=Number((tm&&tm.uknom)!==undefined&&tm?tm.uknom:typ&&typ.utrn_h);var kk=Number.isFinite(uu)&&uu>0?String(uu):'other';trafoCount.set(kk,(trafoCount.get(kk)||0)+1);}
 }catch(_){}
 var allV=[...new Set([...active.lines.map(function(x){return Number.isFinite(x.voltage)?String(x.voltage):'other';}),...(termTable?termTable.Values.map(function(rr){var uu=Number(rr[uix]);return (Number.isFinite(uu)&&uu>0)?String(uu):'other';}):[])])];
 allV.sort(function(a,b){if(a==='other') return 1;if(b==='other') return -1;return Number(b)-Number(a);});
 var major=allV.filter(function(v){return v!=='other'&&Number(v)>36;});
 var minor=allV.filter(function(v){return v!=='other'&&Number(v)<=36;});
 var hasOther=allV.includes('other');
 function isChecked(v){if(v43PrevSel.has(v)) return v43PrevSel.get(v);return true;}
 for(var v of allV) if(!v43PrevSel.has(v)) v43PrevSel.set(v,true);
 function itemHTML(v){
  var c=''; try{c=(v4.styles.get(v)&&v4.styles.get(v).color)||VOLT_COLORS[v]||VOLT_COLORS.other;}catch(_){c='#c9c2ae';}
  var chk=isChecked(v)?'checked':'';
  var lc=lineCount.get(v)||0, bc=busCount.get(v)||0;
  var title=lc+' hat \u00B7 '+bc+' bara (hat gerilimi ile bara uknom ayri turdur)';
  return '<label class="v42Volt" title="'+h(title)+'"><input type="checkbox" data-volt="'+h(v)+'" '+chk+' aria-checked="'+(chk?'true':'false')+'"><span style="background:'+h(c)+'"></span>'+h(v)+' kV <small style="opacity:.7">('+nf.format(lc)+'h/'+nf.format(bc)+'b)</small></label>';
 }
 var minorStates=minor.map(isChecked);
 var allOn=minor.length>0&&minorStates.every(Boolean);
 var noneOn=minor.length===0||minorStates.every(function(x){return !x;});
 var gL=0,gB=0,gT=0; for(var v of minor){gL+=lineCount.get(v)||0;gB+=busCount.get(v)||0;gT+=trafoCount.get(v)||0;}
 var gSum='\u226436 kV ('+minor.length+' seviye \u00B7 '+nf.format(gL)+' hat, '+nf.format(gB)+' bara, '+nf.format(gT)+' trafo)';
 var html=major.map(itemHTML).join('');
 if(minor.length){
  html+='<span class="v43GroupWrap"><label class="v42Volt v43Group" title="'+h(gSum)+' \u2014 36 kV dahil alti tum seviyeler"><input type="checkbox" id="v43Le36" '+(allOn?'checked':'')+' aria-checked="'+(allOn?'true':(noneOn?'false':'mixed'))+'"><span style="background:#8fd6c9"></span>\u226436 kV ('+minor.length+')</label><details class="v42Minor" id="v43Minor"><summary aria-label="'+h(gSum)+'" aria-expanded="false">'+h(gSum)+' \u25BE</summary><div class="v42MinorBody">'+minor.map(itemHTML).join('')+'</div></details></span>';
 }
 if(hasOther) html+=itemHTML('other');
 box.innerHTML=html;
 var groupBox=$('v43Le36');
 if(groupBox){groupBox.indeterminate=!(allOn||noneOn);if(!allOn&&!noneOn) groupBox.setAttribute('aria-checked','mixed');
  groupBox.onchange=function(){
   var on=groupBox.checked;
   box.querySelectorAll('#v43Minor [data-volt]').forEach(function(e){e.checked=on;e.setAttribute('aria-checked',String(on));v43PrevSel.set(e.dataset.volt,on);});
   groupBox.indeterminate=false;groupBox.setAttribute('aria-checked',String(on));
   try{drawMap();}catch(_){} try{v42RenderLightning();}catch(_){} try{if(typeof renderResultOverlay==='function') renderResultOverlay(false);}catch(_){}
  };
 }
 box.querySelectorAll('[data-volt]').forEach(function(e){
  e.onchange=function(){
   v43PrevSel.set(e.dataset.volt,e.checked);e.setAttribute('aria-checked',String(e.checked));
   if(e.closest&&e.closest('#v43Minor')&&groupBox){
    var subs=[...box.querySelectorAll('#v43Minor [data-volt]')];
    var on=subs.filter(function(x){return x.checked;}).length;
    groupBox.checked=(on===subs.length);groupBox.indeterminate=(on>0&&on<subs.length);
    groupBox.setAttribute('aria-checked',on===subs.length?'true':(on===0?'false':'mixed'));
   }
   try{drawMap();}catch(_){} try{v42RenderLightning();}catch(_){} try{if(typeof renderResultOverlay==='function') renderResultOverlay(false);}catch(_){}
  };
 });
 var det=$('v43Minor');
 if(det){var sum=det.querySelector('summary');var sync=function(){sum.setAttribute('aria-expanded',det.open?'true':'false');};
  det.addEventListener('toggle',sync);sync();
  if(!det.dataset.v43bound){det.dataset.v43bound='1';
   document.addEventListener('keydown',function(ev){if(ev.key==='Escape'&&det.open){det.open=false;sync();}});
   document.addEventListener('pointerdown',function(ev){if(det.open&&!det.contains(ev.target)&&!(ev.target.closest&&ev.target.closest('.v43Group'))){det.open=false;sync();}});
  }
 }
 try{
  var majL=0; for(var v of major) majL+=lineCount.get(v)||0;
  $('v42TopStatus').textContent=nf.format(active.lines.length)+' hat \u00B7 '+nf.format(active.sites.length)+' TM \u00B7 \u226436: '+nf.format(gL)+'h/'+nf.format(gB)+'b \u00B7 >36: '+nf.format(majL)+'h \u00B7 '+active.date+' '+active.time;
 }catch(_){}
};
try{if(typeof v42BuildVolts==='function'&&active) v42BuildVolts();}catch(_){}

/* ---------- Harita ici cekmece (drawer) ---------- */
function v43EnsureDrawer(){
 if($('v43Drawer')) return $('v43Drawer');
 var wrap=$('mapWrap'); if(!wrap) return null;
 var d=document.createElement('section'); d.id='v43Drawer';d.setAttribute('role','dialog');d.setAttribute('aria-modal','false'); d.setAttribute('aria-label','Hat bilgi ve senaryo çekmecesi'); d.hidden=true;
 d.innerHTML='<header><strong id="v43Title">Hat secilmedi</strong><button id="v43Close" aria-label="Cekmeceyi kapat">\u2715</button></header>'
 +'<div id="v43Stale" class="v43Stale" hidden>Senaryo degisti; hesap bekliyor \u2014 onceki P/Q/V bu senaryonun sonucu degildir.</div>'
 +'<div id="v43SwitchWarn" class="v43SwitchWarn" hidden>Yerel topoloji \u2014 AC sonucu yok: anahtar senaryosu yalniz secili fider bagli-bilesenini etkiler, ulke geneli yuk akisi yeniden hesaplanmaz.</div>'
 +'<div id="v43Body"><span class="mini">Haritadan, aramadan veya \u26A1 Hatlar listesinden bir hat secin.</span></div>'
 +'<div class="v43Btns"><button id="v43Off">Senaryoda servis disi birak</button><button id="v43On">Senaryoda servise al</button><button id="v43Undo">Son islemden geri al</button><button id="v43Reset">Senaryoyu sifirla / Orijinal modele don</button><button id="v43Run" class="primary">Senaryoyu hesapla / Yeniden hesapla</button><button id="v43Cancel">Hesabi iptal et</button></div>'
 +'<div class="v43Row"><label>Referans / Senaryo / Degisim gorunumu<select id="v43View" aria-label="Referans senaryo degisim gorunumu"><option value="reference">Referans (baz hesap)</option><option value="scenario">Senaryo (son hesap)</option><option value="delta">Degisim (\u0394 referans\u2192senaryo)</option></select></label><div id="v43CalcMeta" class="mini" style="margin-top:6px"></div></div>'
 +'<div id="v43Compare"></div>'
 +'<div class="v43Links"><button class="sm" id="v43GoLightning">\u26A1 listede goster</button><button class="sm" id="v43GoSld">SLDde goster</button><button class="sm" id="v43GoAnalysis">Analizlerde goster</button></div>';
 wrap.appendChild(d);
 $('v43Close').onclick=function(){d.hidden=true;try{resizeMap();drawMap();}catch(_){}};
 $('v43Off').onclick=function(){if(selectedLine) SC.apply(selectedLine,1);else v4Notify('Once bir hat seciniz.',true);};
 $('v43On').onclick=function(){if(selectedLine) SC.apply(selectedLine,0);else v4Notify('Once bir hat seciniz.',true);};
 $('v43Undo').onclick=function(){SC.undo();};
 $('v43Reset').onclick=function(){SC.reset();};
 $('v43Run').onclick=function(){SC.run();};
 $('v43Cancel').onclick=function(){SC.cancel();};
 $('v43View').onchange=function(e){SC.viewMode=e.target.value;v43SyncViewSets();v43Refresh();if(selectedLine) v43OpenDrawer(selectedLine);try{drawMap();}catch(_){} try{v42RenderLightning();}catch(_){}};
 $('v43View').value=SC.viewMode;
 $('v43GoLightning').onclick=function(){try{v42.opened=true;v42UpdatePanel();}catch(_){} if(selectedLine){try{v42.kind='line';}catch(_){} try{$('v42Search').value=selectedLine;}catch(_){} try{v42.page=0;v42RenderLightning();}catch(_){}};};
 $('v43GoSld').onclick=function(){try{if(!selectedLine) return;var l=active.lineById(selectedLine);selectedSite=l.stationA||l.stationB;setView('sld');}catch(_){}};
 $('v43GoAnalysis').onclick=function(){try{setView('analysis');}catch(_){}};
 document.addEventListener('keydown',function(ev){if(ev.key==='Escape'&&!d.hidden){d.hidden=true;try{resizeMap();drawMap();}catch(_){}}});
 return d;
}
function v43Lookup(set,cls,id,metric,terminal){
 try{
  if(!set||!set.index) return null;
  var keys=terminal?[cls+'|'+id+'|'+metric+'|'+terminal]:[cls+'|'+id+'|'+metric+'|from',cls+'|'+id+'|'+metric+'|to',cls+'|'+id+'|'+metric+'|'];
  var out=null;
  for(var k of keys){var arr=set.index.get(k)||[];for(var r of arr){if(!r.usable) continue;if(!out||String(r.timestamp)>String(out.timestamp)) out=r;}}
  return out;
 }catch(_){return null;}
}
function v43Fmt(r,unit){
 if(!r||r.value===null||r.value===undefined||!Number.isFinite(Number(r.value))) return 'Veri yok';
 return fmt(r.value)+' '+(r.unit||unit||'');
}
function v43Delta(a,b){
 if(!a||!b||!Number.isFinite(Number(a.value))||!Number.isFinite(Number(b.value))) return null;
 return b.value-a.value;
}
window.v43OpenDrawer=function(fid){
 var d=v43EnsureDrawer(); if(!d||!active) return;
 var l=active.lineById(fid); if(!l) return;
 d.hidden=false;
 if(window.innerWidth<=800&&v42.opened){v42.opened=false;v42UpdatePanel();}
 try{resizeMap();}catch(_){}
 var scenOut=v4LineOut(l);
 var modelOut=l.outserv===1;
 var scenHas=v4.overrides.has(l.FID);
 var scenVal=scenHas?v4.overrides.get(l.FID):null;
 $('v43Title').textContent=l.FID+' \u00B7 '+l.loc_name;
 var stale=SC.pending||(scenHas&&!v4.scenario);
 $('v43Stale').hidden=!stale;
 var swActive=false; try{swActive=v42.switchOverrides&&v42.switchOverrides.size>0;}catch(_){}
 $('v43SwitchWarn').hidden=!swActive;
 var typ=null; try{typ=active.get('TypLne',l.typ_id);}catch(_){}
 var len=Number(l.dline);
 v43SyncViewSets();
 var Pf=latestResult('ElmLne',l.FID,'P','from'), Qf=latestResult('ElmLne',l.FID,'Q','from');
 var Pt=latestResult('ElmLne',l.FID,'P','to'), Qt=latestResult('ElmLne',l.FID,'Q','to');
 var termA=null,termB=null,vA=null,vB=null,nomA=null,nomB=null;
 try{
  var cA=active.get('StaCubic',l.bus1), cB=active.get('StaCubic',l.bus2);
  termA=cA&&cA.fold_id; termB=cB&&cB.fold_id;
  if(termA){vA=latestResult('ElmTerm',termA,'V');nomA=Number(active.get('ElmTerm',termA)&&active.get('ElmTerm',termA).uknom);}
  if(termB){vB=latestResult('ElmTerm',termB,'V');nomB=Number(active.get('ElmTerm',termB)&&active.get('ElmTerm',termB).uknom);}
 }catch(_){}
 var load=null; try{load=v4Loading(l);}catch(_){}
 var cap=v4.capacities.get(l.FID);
 var src=(Pf&&Pf.source)||(Qf&&Qf.source)||(vA&&vA.source)||'yok';
 var qual=(Pf&&Pf.quality)||(vA&&vA.quality)||'yok';
 var vRow=(termA?h(termA)+' ('+(Number.isFinite(nomA)?nomA+' kV nominal':'nominal yok')+'): '+(vA?v43Fmt(vA,'kV'):'Veri yok'):'Veri yok')+(termB?'<br>'+h(termB)+' ('+(Number.isFinite(nomB)?nomB+' kV nominal':'nominal yok')+'): '+(vB?v43Fmt(vB,'kV'):'Veri yok'):'');
 function visNote(){
  try{
   var vv=selectedVolts(), ar=$('mapArea').value;
   if(!visibleLine(l,vv,ar)) return '<div class="kv"><small>Filtered</small><b>Secili hat katman/filtre nedeniyle gizli \u2014 cizim ve hit-test ayni gorunurluk verisini kullanir.</b></div>';
  }catch(_){}
  return '';
 }
 $('v43Body').innerHTML=
  '<div class="kv"><small>Hat FID / Adi</small><b>'+h(l.FID)+' \u00B7 '+h(l.loc_name)+'</b></div>'
  +'<div class="kv"><small>TM uclari</small><b>'+h(siteName(l.stationA))+' ('+h(l.stationA||'\u2014')+') \u2194 '+h(siteName(l.stationB))+' ('+h(l.stationB||'\u2014')+')</b></div>'
  +'<div class="kv"><small>Nominal gerilim (hat turu; yuvarlama yok)</small><b>'+(Number.isFinite(l.voltage)?h(l.voltage)+' kV':'Veri yok')+'</b></div>'
  +'<div class="kv"><small>Tur / Uzunluk</small><b>'+h(l.typ_id||'Veri yok')+' \u00B7 '+(Number.isFinite(len)?fmt(len)+' km':'Veri yok')+(typ&&typ.rline?' \u00B7 R/X kaydi var':'')+'</b></div>'
  +'<div class="kv"><small>Guzergah</small><b>'+h(l.geoStatus==='Model g\u00FCzerg\u00E2h\u0131'?'Gercek DGS guzergahi':'TM\u2013TM temsili baglanti (fiziksel guzergah degildir)')+'</b></div>'
  +'<div class="kv"><small>Orijinal servis (DGS outserv; degismez)</small><b>'+(modelOut?'SERVIS DISI':'Serviste')+'</b></div>'
  +'<div class="kv"><small>Senaryo servis'+(scenHas?' (override)':'')+'</small><b>'+(scenOut?'SERVIS DISI':'Serviste')+(scenHas?' \u00B7 senaryoda degistirildi':'')+'</b></div>'
  +'<div class="kv"><small>Uc-terminal P (from/to) \u00B7 y\u00F6n ve animasyon gecerli olcum/deneysel hesaba baglidir</small><b>from: '+(Pf?v43Fmt(Pf,'MW')+' <small>('+h(Pf.source||'')+')</small>':'Veri yok')+'<br>to: '+(Pt?v43Fmt(Pt,'MW')+' <small>('+h(Pt.source||'')+')</small>':'Veri yok')+'</b></div>'
  +'<div class="kv"><small>Uc-terminal Q (from/to)</small><b>from: '+(Qf?v43Fmt(Qf,'MVAr'):'Veri yok')+'<br>to: '+(Qt?v43Fmt(Qt,'MVAr'):'Veri yok')+'</b></div>'
  +'<div class="kv"><small>Ilgili bara V (isletme; uknom nominal, ayni degil)</small><b>'+vRow+'</b></div>'
  +'<div class="kv"><small>Yuklenme (yaz/kis MVA parametreli; resmi limit degil)</small><b>'+(load?fmt(load.percent)+' % \u00B7 '+h(load.season)+' '+fmt(load.capacity)+' MVA \u00B7 '+h(load.source||''):'Veri yok (kapasite ve/veya gecerli P/Q yoksa % uretilmez)')+(cap?'<br>Kayitli: yaz '+h(cap.summer)+' / kis '+h(cap.winter)+' MVA (manuel)':'')+'</b></div>'
  +'<div class="kv"><small>Veri kaynagi / kalitesi</small><b>'+h(src)+' / '+h(qual)+'</b></div>'
  +'<div class="kv"><small>Model ve senaryo zamani</small><b>'+h(active.date)+' '+h(active.time)+' \u00B7 fp '+h(v43ShortFp())+' \u00B7 rev '+SC.revision+' \u00B7 solver '+h(SC.solverVersion)+(stale?' \u00B7 HESAP BEKLIYOR':'')+'</b></div>'
  +visNote()
  +(swActive?'<div class="kv"><small>Anahtar senaryosu</small><b>Yerel topoloji \u2014 AC sonucu yok. Hat servis disi ile kesici acik esdeger degildir.</b></div>':'');
 // karsilastirma: referans/senaryo/delta
 var cmp=$('v43Compare');
 try{
  var base=v4.base&&v4.base.modelId===active.rid?v4.base:null, scen=(SC.lastCalcKey===v43Fp()+'|'+SC.revision+'|'+SC.solverVersion&&!SC.pending)?v4.scenario:null;
  var cur=resultSet()||null;
  var refP=v43Lookup(base,'ElmLne',l.FID,'P','from');
  var scP=v43Lookup(scen,'ElmLne',l.FID,'P','from');
  var refQ=v43Lookup(base,'ElmLne',l.FID,'Q','from'), scQ=v43Lookup(scen,'ElmLne',l.FID,'Q','from');
  var refV=v43Lookup(base,'ElmTerm',termA,'V',null), scVV=v43Lookup(scen,'ElmTerm',termA,'V',null);
  function cell(r){return r?v43Fmt(r,r.unit):'Veri yok';}
  function dcell(a,b,unit){var d=v43Delta(a,b);return d===null?'Hesaplanamadi':(d>=0?'+':'')+fmt(d)+' '+unit;}
  var okKey=SC.lastCalcKey===v43Fp()+'|'+SC.revision+'|'+SC.solverVersion&&!SC.pending;
  if(SC.viewMode==='delta'){
   cmp.innerHTML='<b>Degisim (\u0394) \u00B7 yalniz ayni model + dogru revizyon</b><table><tr><th>B\u00FCy\u00FCkl\u00FCk</th><th>Referans</th><th>Senaryo</th><th>\u0394</th></tr>'
   +'<tr><td>P from (MW)</td><td>'+cell(refP)+'</td><td>'+cell(scP)+'</td><td>'+dcell(refP,scP,'MW')+'</td></tr>'
   +'<tr><td>Q from (MVAr)</td><td>'+cell(refQ)+'</td><td>'+cell(scQ)+'</td><td>'+dcell(refQ,scQ,'MVAr')+'</td></tr>'
   +'<tr><td>V ('+h(termA||'\u2014')+')</td><td>'+cell(refV)+'</td><td>'+cell(scVV)+'</td><td>'+dcell(refV,scVV,'kV')+'</td></tr></table>'
   +(!base?'<div class="mini">Referans hesap kaydedilmedi; fark Hesaplanamadi.</div>':'')
   +(stale?'<div class="mini">Senaryo degisti; hesap bekliyor \u2014 eski sonuclar yeni senaryo gibi gosterilmez.</div>':'')
   +(!okKey&&scen?'<div class="mini">Revizyon/fingerprint eslesmedi; sonuc supheli.</div>':'');
  } else if(SC.viewMode==='scenario'){
   cmp.innerHTML='<b>Senaryo degerleri '+(scen?'':' (henuz senaryo hesabi yok \u2014 Hesaplanamadi)')+'</b><table><tr><th>B\u00FCy\u00FCkl\u00FCk</th><th>Senaryo</th></tr>'
   +'<tr><td>P from</td><td>'+cell(scP)+'</td></tr><tr><td>Q from</td><td>'+cell(scQ)+'</td></tr><tr><td>V</td><td>'+cell(scVV)+'</td></tr></table>'
   +(stale?'<div class="mini">Senaryo degisti; hesap bekliyor.</div>':'');
  } else {
   cmp.innerHTML='<b>Referans degerler '+(base?'':' (baz hesap yoksa gecerli hesap/Veri yok)')+'</b><table><tr><th>B\u00FCy\u00FCkl\u00FCk</th><th>Referans</th></tr>'
   +'<tr><td>P from</td><td>'+cell(refP)+'</td></tr><tr><td>Q from</td><td>'+cell(refQ)+'</td></tr><tr><td>V</td><td>'+cell(refV)+'</td></tr></table>';
  }
 }catch(e){cmp.innerHTML='<span class="mini">Karsilastirma uretilemedi.</span>';}
 try{$('v43View').value=SC.viewMode;}catch(_){}
 try{
  var meta='fp '+v43ShortFp()+' \u00B7 rev '+SC.revision+' \u00B7 solver '+SC.solverVersion
  +' \u00B7 override '+v4.overrides.size+' \u00B7 '+(v4.scenario?'senaryo hesaplandi':'senaryo hesabi yok')
  +(v3.solver?(' \u00B7 ada '+v3.solver.solved+'/'+v3.solver.total):'');
  $('v43CalcMeta').textContent=meta;
 }catch(_){}
 try{resizeMap();drawMap();}catch(_){}
};

/* ---------- toolbar ekleri + durum rozeti ---------- */
function v43EnsureToolbar(){
 try{
  var bar=document.querySelector('#v42Toolbar .v42Row');
  if(!bar||$('v43ViewSel')) return;
  var sel=document.createElement('select'); sel.id='v43ViewSel'; sel.title='Referans / Senaryo / Degisim gorunumu';
  sel.innerHTML='<option value="reference">Referans</option><option value="scenario">Senaryo</option><option value="delta">Degisim \u0394</option>';
  sel.value=SC.viewMode;
  sel.onchange=function(){SC.viewMode=sel.value;try{$('v43View').value=sel.value;}catch(_){} v43SyncViewSets();v43Refresh(); if(selectedLine) v43OpenDrawer(selectedLine); try{drawMap();}catch(_){} try{v42RenderLightning();}catch(_){}};
  var st=document.createElement('span'); st.id='v43Status'; st.className='v42Status';
  bar.appendChild(sel); bar.appendChild(st);
 }catch(_){}
}
function v43Refresh(){
 try{v43EnsureToolbar();}catch(_){}
 try{
  var vs=$('v43ViewSel'); if(vs) vs.value=SC.viewMode;
  var vv=$('v43View'); if(vv) vv.value=SC.viewMode;
 }catch(_){}
 try{
  var el=$('v43Status');
  if(el){
   var t='rev '+SC.revision+' \u00B7 '+v4.overrides.size+' override'+(SC.pending?' \u00B7 HESAP BEKLIYOR':(v4.scenario?' \u00B7 senaryo hesaplandi':''));
   if(v42.switchOverrides&&v42.switchOverrides.size) t+=' \u00B7 anahtar: yerel';
   el.textContent=t;
  }
 }catch(_){}
 try{
  var ov=$('v4MapStatus'); if(ov&&SC.pending) ov.textContent+=' \u00B7 Senaryo degisti; hesap bekliyor.';
 }catch(_){}
 try{v42RenderLightningBadges();}catch(_){}
 try{
  if(v42.switchOverrides&&v42.switchOverrides.size){try{v42RenderSwitchAnalysis();}catch(_){}}
 }catch(_){}
}

/* ---------- lightning rozetleri (post-process) ---------- */
window.v42RenderLightningBadges=function(){
 try{
  if(!v42.opened) return;
  var rows=document.querySelectorAll('#v42LBody tr[data-v42item]');
  var scenIds=null;
  try{scenIds=new Set((v4.scenario&&v4.scenario.rows||[]).filter(function(r){return r.cls==='ElmLne'&&r.metric==='P';}).map(function(r){return r.id;}));}catch(_){scenIds=new Set();}
  rows.forEach(function(row){
   try{
    row.querySelectorAll('.v43Badge').forEach(function(b){b.remove();});
    var parts=(row.dataset.v42item||'').split('|'); var cls=parts[0], id=parts[1];
    if(cls!=='ElmLne') return;
    var td=row.querySelector('td'); if(!td) return;
    var badge='';
    if(v4.overrides.has(id)&&SC.pending) badge='<span class="v43Badge warn">hesap bekliyor</span>';
    else if(v4.overrides.has(id)) badge='<span class="v43Badge">senaryoda degistirildi</span>';
    else if(v4.scenario&&scenIds.has(id)) badge='<span class="v43Badge">hesaplandi</span>';
    else if(v4.scenario&&!scenIds.has(id)) badge='<span class="v43Badge bad">cozulemedi</span>';
    if(badge) td.insertAdjacentHTML('beforeend','<br>'+badge);
   }catch(_){}
  });
 }catch(_){}
};

/* ---------- mevcut fonksiyonlarin v4.3 sarmalayicilari ---------- */
var v43OrigApply=null;
try{v43OrigApply=v4Apply;}catch(_){}
window.v4Apply=function(id,off){return SC.apply(id,off);};

var v43OrigDrawMap=null;
try{v43OrigDrawMap=drawMap;}catch(_){}
window.drawMap=function(){
 try{if(v43OrigDrawMap) v43OrigDrawMap();}catch(e){console.warn(e);}
 try{
  if(SC.viewMode==='delta'&&active&&v4.scenario&&mapMode==='geo'&&currentView==='map'){
   var cv=$('networkCanvas'); if(!cv) return;
   var ctx=cv.getContext('2d'); if(!ctx) return;
   var dpr=Math.min(2,window.devicePixelRatio||1);
   var changed=[...v4.overrides.keys()];
   for(var fid of changed){
    var l=active.lineById(fid); if(!l) continue;
    try{var vv=selectedVolts(), ar=$('mapArea').value; if(!visibleLine(l,vv,ar)) continue;}catch(_){continue;}
    try{showLine(l,ctx,true,1);}catch(_){}
   }
   var ov=$('mapOverlay');
   if(ov&&!ov.textContent.includes('Degisim')) ov.textContent+=' \u00B7 Degisim: degisen hatlar vurgulu, sayisal fark secili hat cekmecesinde';
  }
 }catch(_){}
};

var v43OrigSelectLine=null;
try{v43OrigSelectLine=selectLine;}catch(_){}
window.selectLine=function(id){
 try{if(v43OrigSelectLine) v43OrigSelectLine(id);}catch(e){console.warn(e);}
 try{
  var sc=$('v4ScenarioLine'); if(sc) sc.value=id;
  var sl=$('sldLine'); if(sl&&active&&active.lineById(id)){try{var l=active.lineById(id);var site=active.siteById(l.stationA);if(site){var ss=$('sldStation');if(ss) ss.value=site.FID;}}catch(_){} try{if([...sl.options].some(function(o){return o.value===id;})) sl.value=id;}catch(_){}}
  v43OpenDrawer(id);
  try{v42RenderLightningBadges();}catch(_){}
  try{v43SyncAnalysis(id);}catch(_){}
 }catch(_){}
};
window.v43SyncAnalysis=function(fid){
 try{
  var d=$('analysisDetail'); if(!d||!active) return;
  if(!fid||!active.lineById(fid)) return;
  var l=active.lineById(fid);
  var base=v4.base, scen=v4.scenario;
  var rb=v43Lookup(base,'ElmLne',fid,'P','from'), sb=v43Lookup(scen,'ElmLne',fid,'P','from');
  var dd=(rb&&sb&&!SC.pending&&SC.lastCalcKey===v43Fp()+'|'+SC.revision+'|'+SC.solverVersion)?(sb.value-rb.value):null;
  var note=document.createElement('div'); note.id='v43AnalysisSync'; note.className='mini';
  var old=$('v43AnalysisSync'); if(old) old.remove();
  note.innerHTML='Harita/\u26A1/SLD ile ayni secim: <b>'+h(fid)+' \u00B7 '+h(l.loc_name)+'</b> \u00B7 rev '+SC.revision+' \u00B7 fp '+h(v43ShortFp())
  +' \u00B7 ref '+(rb?fmt(rb.value)+' MW':'Hesaplanamadi')+' \u00B7 sen '+(sb?fmt(sb.value)+' MW':'Hesaplanamadi')
  +' \u00B7 \u0394 '+(dd===null?'Hesaplanamadi':((dd>=0?'+':'')+fmt(dd)+' MW'))
  +(SC.pending?' \u00B7 HESAP BEKLIYOR':'')+' \u00B7 deneysel, N-1 degil.';
  d.prepend(note);
 }catch(_){}
};

var v43OrigRenderLightning=null;
try{v43OrigRenderLightning=v42RenderLightning;}catch(_){}
window.v42RenderLightning=function(){
 try{if(v43OrigRenderLightning) v43OrigRenderLightning();}catch(e){console.warn(e);}
 try{v42RenderLightningBadges();}catch(_){}
};

/* senaryo kisayolu artik Analizlere zorunlu gidis degil: cekmeceyi acar */
try{
 var sc2=$('v42ScenarioShortcut');
 if(sc2){sc2.textContent='\u21C4 Hat senaryosu (haritada)';sc2.onclick=function(){
  v43EnsureDrawer();
  if(selectedLine){v43OpenDrawer(selectedLine);}
  else{var d=v43EnsureDrawer();if(d){d.hidden=false;try{resizeMap();drawMap();}catch(_){} v4Notify('Haritada bir hat secin; senaryo islemleri bu cekmeceden yapilir. Analizler sekmesine gitmek zorunlu degildir.');}}
 };}
}catch(_){}

/* model degisimi / reset: senaryo revizyonu ve eski sonuclar devre disi */
try{
 var v43OrigActivate=activateModel;
 window.activateModel=function(m){
  try{SC.history.splice(0);SC.revision++;SC.pending=false;SC.lastCalcKey=null;SC.viewMode='reference';}catch(_){}
  try{var d=$('v43Drawer');if(d) d.hidden=true;}catch(_){}
  try{v43PrevSel.clear();}catch(_){}
  var out=null;
  try{out=v43OrigActivate(m);}catch(e){console.warn(e);}
  try{v43Refresh();}catch(_){}
  return out;
 };
}catch(_){}
try{
 var v43OrigResetV3=resetV3;
 window.resetV3=function(m){
  try{SC.history.splice(0);SC.revision++;SC.pending=false;SC.lastCalcKey=null;}catch(_){}
  var out=null; try{out=v43OrigResetV3(m);}catch(e){console.warn(e);}
  try{v43Refresh();}catch(_){}
  return out;
 };
}catch(_){}

/* anahtar senaryosu ACye bagli degilse acik uyari (mevcut null-korumayi doldurma) */
window.v43SwitchNote=function(){
 try{
  var n=(v42.switchOverrides&&v42.switchOverrides.size)||0;
  if(n>0){try{v42RenderSwitchAnalysis();}catch(_){}}
  return n;
 }catch(_){return 0;}
};

/* bilgi sozlugu ekleri */
try{
 if(typeof INFO!=='undefined'){
  if(INFO.map) INFO.map+='<p><b>v4.3:</b> 36 kV dahil alti tum seviyeler tek <b>\u226436 kV</b> ana katmandir; alt seviyeler grup icinden acilip kapatilir. Hat gerilimi ile bara <code>uknom</code> ayri veri turudur; katman sayilari \u201CX hat, Y bara, Z trafo\u201D diye ayri verilir.</p>';
  if(INFO.help) INFO.help+='<h4>v4.3 harita senaryosu</h4><p>Haritada hat secin; cekmeceden <b>Senaryoda servis disi birak / servise al / geri al / hesapla / sifirla</b> ve <b>Referans / Senaryo / Degisim</b> gorunumunu ayni haritada kullanin. Senaryo degisince eski P/Q/V gecerli sayilmaz; ekranda <b>Senaryo degisti; hesap bekliyor</b> gorunur. Sonuc yalniz dogru <b>model fingerprint + senaryo revizyonu + solver surumu</b> ile uygulanir. Anahtar senaryosu <b>Yerel topoloji \u2014 AC sonucu yok</b> olarak ayridir; hat acma ile kesici acma esdeger degildir. Tum sonuclar deneyseldir; PowerFactory esdegeri / guvenilir N-1 iddiasi yoktur.</p>';
 }
 if(typeof GLOSSARY!=='undefined'&&GLOSSARY.push){
  GLOSSARY.push(['\u226436 kV','Tek ana dagitim katmani','36 kV dahil altindaki tum nominal seviyelerin (36, 34.5, 33.6, 33, 31.5, 11 vb.) haritada tek ana filtrede toplanmasi; yalniz UI gruplamasidir, JSON degeri yuvarlanmaz.']);
  GLOSSARY.push(['ScenarioController','Tek senaryo durumu','Hat override, revizyon, gecmis, hesap cagrisi ve eski-sonuc gecersiz kilmayi merkezilestiren harita+Analizler ortak durumu.']);
  GLOSSARY.push(['Senaryo revizyonu','Degisim sayaci','Her senaryo duzenlemesinde artan sayac; sonuc yalniz ayni revizyonla eslesirse UIya uygulanir.']);
 }
}catch(_){}

try{$('v42LightningButton').addEventListener('click',function(){var d=$('v43Drawer');if(window.innerWidth<=800&&v42.opened&&d)d.hidden=true;});}catch(_){}

/* Eski Analizler düğmeleri haritadan farklı revizyon üretmesin. */
try{
 $('v4ScenarioOff').onclick=function(){var l=v4ScenarioLine();if(l)SC.apply(l.FID,1);else v4Notify('Hat ID veya adi bulunamadi.',true);};
 $('v4ScenarioOn').onclick=function(){var l=v4ScenarioLine();if(l)SC.apply(l.FID,0);else v4Notify('Hat ID veya adi bulunamadi.',true);};
 $('v4ScenarioRun').onclick=function(){SC.run();};
 $('v4ScenarioReset').onclick=function(){SC.reset();};
 $('runSolver').onclick=function(){if(SC.pending)SC.run();else startV3Solver();};
}catch(_){}

/* ilk kurulum */
try{v43EnsureDrawer();}catch(_){}
try{v43EnsureToolbar();}catch(_){}
try{v43Refresh();}catch(_){}
window.YTBS_V43_TEST={
 state:function(){try{return {view:currentView,model:active&&active.name,lines:active&&active.lines.length,sites:active&&active.sites.length,selectedLine:selectedLine,scenario:[...v4.overrides],revision:window.ScenarioController?.revision,pending:window.ScenarioController?.pending,viewMode:SC.viewMode,fp:v43Fp(),solver:SC.solverVersion,drawerHidden:($('v43Drawer')&&$('v43Drawer').hidden),group:v43GroupInfo(),switchOverrides:(v42.switchOverrides&&v42.switchOverrides.size)||0,calc:v3.solver?{solved:v3.solver.solved,total:v3.solver.total}:null};}catch(e){return {error:String(e)};}},
 apply:function(id,off){return SC.apply(id,off);},
 undo:function(){return SC.undo();},
 reset:function(){return SC.reset();},
 run:function(){SC.run();},
 setViewMode:function(m){SC.viewMode=m;v43Refresh();},
 openDrawer:function(id){v43OpenDrawer(id);},
 fingerprint:function(){return v43Fp();},
 groupInfo:function(){return v43GroupInfo();},
 go:function(v){setView(v);}
};
})();

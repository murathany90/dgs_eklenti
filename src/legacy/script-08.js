
/* v5.2: shared switch/line scenario revision; original DGS remains immutable. */
let v52SwitchInGraph=false;
function v52SwitchChanged(){
 const S=window.ScenarioController;if(!S||!active)return;
 if(v3.running){const w=v3.worker;v3.seq++;v4.generation++;if(w){try{w.onmessage({data:{done:true,cancelled:true}});}catch(_){}w.terminate();}v3.worker=null;v3.running=false;}
 S.revision++;S.lastCalcKey=null;S.pending=!!(v4.overrides.size||v42.switchOverrides.size);
 v4.scenario=null;v4.scenarioSolver=null;S.viewMode='reference';v3.solver=v4.baseSolver||null;
 v2.sets.splice(0,v2.sets.length,...(v4.base?[v4.base]:[]));v2.selectedSet=v4.base?.id||'';
 try{YTBS_V43_TEST.setViewMode('reference');v42RenderSwitchAnalysis();drawMap();}catch(e){console.warn('v5.2 switch refresh',e);}
}
INFO.about += '<h3>v5.2 · Kapsam ve sınırlamalar</h3><p>Seyrek polar Newton denemesi, PV→PQ Q sınır kontrolü ve doğrudan tek kontrollü bir ünite için Q sonucu eklenmiştir. Büyük gerçek DGS modellerinde Newton doğrusal adımı yakınsamadığında eski 66 kV+ yaklaşık AC-PQ sonucu açık etiketle gösterilir; bu sonuç Newton ile doğrulanmış değildir. Alt gerilim ve çoklu ünite paylaşımı tam çözülmez. Anahtar ve hat senaryosu aynı yerel hesap grafında değerlendirilir; bağımsız PowerFactory senaryo referansı yoktur.</p>';
window.v52UpdateBadge=function(){
 const host=document.getElementById('v51State');if(!host)return;
 let badge=document.getElementById('v52CalcBadge');if(!badge){badge=document.createElement('span');badge.id='v52CalcBadge';badge.setAttribute('role','status');badge.style.cssText='margin-left:9px;padding:4px 8px;border:1px solid #bc8f4b;border-radius:6px;color:#ffdb9a;font-size:11px';host.after(badge);}
 if(!active){badge.textContent='Model bekleniyor';return;}
 const S=window.ScenarioController;
 const sum=(S?.viewMode==='scenario'?v4.scenarioSolver:v3.solver||v4.baseSolver)?.summary||[];
 if(!sum.length){badge.textContent='Hesap bekleniyor';return;}
 badge.textContent=sum.some(x=>x.nrFallback)?'⚠ Newton yakınsamadı · 66 kV+ yaklaşık sonuç':sum.some(x=>x.status==='CONVERGED_NR_EXPERIMENTAL')?'Deneysel Newton · bağımsız doğrulanmamış':'Deneysel hesap · sonuç yok';
};
window.YTBS_V52_TEST={getModel:()=>active,graph:(model=active)=>makeHVGraph(model,v4.activeOverrides),graphScenario:()=>{const prior=v52SwitchInGraph;v52SwitchInGraph=true;try{return makeHVGraph(active,v4.activeOverrides);}finally{v52SwitchInGraph=prior;}},state:()=>({model:active?.name,solver:v3.solver,sets:v2.sets.map(s=>({id:s.id,name:s.name,rows:s.rows.length})),switches:[...v42.switchOverrides],lines:[...v4.overrides],revision:window.ScenarioController.revision,pending:window.ScenarioController.pending,view:currentView}),switchOverride:(fid,position)=>{if(position===null)v42.switchOverrides.delete(fid);else v42.switchOverrides.set(fid,position);v52SwitchChanged();},run:()=>v4.overrides.size||v42.switchOverrides.size?window.ScenarioController.run():startV3Solver(),results:()=>v2.sets};

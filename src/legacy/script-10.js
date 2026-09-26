'use strict';
/* v5.4 UX layer. The DGS model, physical network, scenario results and capacity engine are not modified. */
(function(){
 const E=id=>document.getElementById(id), all=(s,root=document)=>[...root.querySelectorAll(s)];
 const safe=s=>h(String(s??''));
 const GROUPS={h400:v=>Math.abs(v-400)<.001,mid:v=>[66,154,220].some(x=>Math.abs(v-x)<.001),low:v=>Number.isFinite(v)&&v<=36};
 const ui={side:'list',filters:false};
 function validLine(){return active&&selectedLine?active.lineById(selectedLine):null;}
 function groupInputs(key){return all('[data-volt]',E('voltageLayers')).filter(e=>GROUPS[key](Number(e.dataset.volt)));}
 function stateOf(key){const ls=groupInputs(key),on=ls.filter(x=>x.checked).length;return !ls.length?'none':on===ls.length?'on':on?'mixed':'off';}
 function syncGroups(){for(const [key] of Object.entries(GROUPS)){const b=E('v54g'+key);if(!b)continue;const st=stateOf(key);b.classList.toggle('active',st==='on');b.classList.toggle('mixed',st==='mixed');b.setAttribute('aria-pressed',String(st==='on'));b.title=key==='mid'?'66 / 154 / 220 kV; nominal değerler korunur':key==='low'?'36 kV ve altındaki model seviyeleri':'400 kV';b.disabled=st==='none';}
  all('.v54Metric').forEach(b=>b.classList.toggle('active',b.dataset.metric===E('mapMetric').value));
  all('.v54Mode').forEach(b=>b.classList.toggle('active',b.dataset.view===ScenarioController.viewMode));
  const st=E('v54State');if(st){const n=v4.overrides.size+v42.switchOverrides.size;st.textContent=v3.running?'Hesaplanıyor':ScenarioController.pending?'Hesap bekliyor':n?(v4.scenario?'Deneysel senaryo':'Senaryo sonucu yok'):'Deneysel hesap';}
  const q=E('v54Quality');if(q){const sum=(v3.solver?.summary||v4.baseSolver?.summary||[]);q.textContent=sum.some(x=>x.nrFallback)?'⚠ Newton yakınsamadı · yaklaşık AC':sum.some(x=>x.status==='CONVERGED_NR_EXPERIMENTAL')?'⚠ Deneysel Newton · bağımsız doğrulama yok':'⚠ Deneysel sonuç · bağımsız doğrulama yok';}
 }
 function redraw(){syncGroups();if(currentView==='map')drawMap();try{v42RenderLightning();}catch(_){}}
 function applyGroup(key){const ls=groupInputs(key),on=!ls.length?false:ls.some(e=>!e.checked);if(key==='low'&&E('v43Le36')){const g=E('v43Le36');g.checked=on;g.dispatchEvent(new Event('change',{bubbles:true}));}else{for(const e of ls){if(e.checked===on)continue;e.checked=on;e.dispatchEvent(new Event('change',{bubbles:true}));}}redraw();}
 function side(mode){ui.side=mode;const p=E('v42LightningPanel');if(!p)return;const isDetail=mode==='selected',isSite=mode==='station';p.classList.toggle('v54Selected',isDetail);p.classList.toggle('v54Station',isSite);if(isDetail){const drawer=E('v43Drawer');if(drawer&&validLine())drawer.hidden=false;}all('#v54SideTabs button').forEach(b=>b.classList.toggle('active',b.dataset.side===mode));}
 function openSide(mode){if(!v42.opened){v42.opened=true;v42UpdatePanel();}side(mode);}
 function stationPanel(){const s=active?.siteById(selectedSite),p=E('v54SideSummary');if(!s||!p)return;const links=active.stationLines.get(s.FID)||[];
  p.innerHTML=`<h3>${safe(s.loc_name)}</h3><p class="mini">Trafo merkezi · ${safe(s.ytm||'YTM bilgisi yok')}</p><div class="v54SummaryGrid"><div><small>Nominal gerilimler</small><b>${safe(s.voltageList||'—')} kV</b></div><div><small>Bağlı hat</small><b>${links.length}</b></div><div><small>Transformatör</small><b>${Number(s.transformerCount)||0}</b></div><div><small>Fider</small><b>${Number(s.bayCount)||0}</b></div></div><h4>Bağlı enerji iletim hatları</h4><div id="v54StationLinks">${links.slice(0,32).map(l=>`<button class="sm" data-v54line="${safe(l.FID)}">${safe(l.loc_name)}</button>`).join('')||'<p class="mini">Bağlı hat yok.</p>'}</div><div class="mini">${links.length>32?'İlk 32 hat gösteriliyor.':''} Kaynak DGS bağlantılarına dayalıdır.</div>`;
  all('[data-v54line]',p).forEach(b=>b.onclick=()=>{selectLine(b.dataset.v54line);});
 }
 function clearSelection(){selectedLine=null;selectedSite=null;if(E('mapSite'))E('mapSite').value='';if(E('mapSelection'))E('mapSelection').textContent='Ekipman seçilmedi.';if(E('mapDetail'))E('mapDetail').textContent='Ekipman seçilmedi.';if(E('v43Drawer'))E('v43Drawer').hidden=true;if(ui.side!=='list')side('list');if(currentView==='map')drawMap();return true;}
 window.v54ClearMapSelection=clearSelection;
 function compactLine(){const l=validLine(),d=E('v43Drawer');if(!l||!d)return;
  let el=E('v54CompactLine');if(!el){el=document.createElement('div');el.id='v54CompactLine';d.querySelector('#v43Body').before(el);}
  if(window.YTBS_ActiveMapResult?.selectionHtml){el.innerHTML=window.YTBS_ActiveMapResult.selectionHtml('line',l.FID);return;}
  const stale=ScenarioController.pending&&ScenarioController.viewMode!=='reference';
  const get=(m)=>stale?null:latestResult('ElmLne',l.FID,m,'from');
  const p=get('P'),q=get('Q'),c=window.YTBS_V53_TEST?.line(l.FID),ld=stale?null:window.YTBS_V53_TEST?.loading(l.FID);
  const number=n=>Number.isFinite(Number(n))?Number(n).toLocaleString('tr-TR',{maximumFractionDigits:2}):'—';
  const isOff=v4LineOut(l);
  const cubicles=[l.bus1,l.bus2].map(x=>active.get('StaCubic',x));
  const ends=cubicles.map(x=>x?active.get('ElmTerm',x.fold_id):null);
  const missing=ends.filter(x=>!x).length,offEnds=ends.filter(x=>x&&Number(x.outserv)===1).length;
  const onFromOff=Number(l.outserv)===1&&!isOff;
  const solvedLine=!!p;
  let warning='';
  if(onFromOff){warning=missing?`${missing} uç terminal bağlantısı çözümlenemedi; hesap kapsamı denetlenmeli.`:offEnds?`${offEnds} uç düğüm kaynak modelde servis dışı. Filtreler → sanal uçları etkinleştirme seçeneği ayrı onay gerektirir; kesiciler otomatik kapanmaz.`:'Hat sanal olarak servise alındı. Uç kesici/ayırıcı pozisyonlarını Tek Hat Şemasında kontrol edin.';
   if(!ScenarioController.pending&&v4.scenario&&!solvedLine)warning+=' Genel hesap tamamlandı fakat bu hat için geçerli P/Q sonucu üretilmedi.';
  }
  el.innerHTML=`<h3>${safe(l.loc_name)}</h3><div class="v54Pills"><span>${Number(l.voltage)||'—'} kV</span><span>${isOff?'Servis dışı':'Serviste'}</span><span>${ScenarioController.pending?'Hesap bekliyor':'Deneysel sonuç'}</span></div><p class="mini">${safe(siteName(l.stationA))} ↔ ${safe(siteName(l.stationB))}</p><div class="v54Stats"><div><small>Aktif güç · başlangıç</small><strong>${p?number(p.value)+' MW':'Veri yok'}</strong></div><div><small>Reaktif güç</small><strong>${q?number(q.value)+' MVAr':'Veri yok'}</strong></div><div><small>Nominal kapasite</small><strong>${number(c?.nominalMVA)} MVA</strong></div><div><small>Nominal yüklenme</small><strong>${ld?number(ld.percent)+' %':'Hesap yok'}</strong></div></div>${isOff?'<p class="mini">Servis dışı hatta akış animasyonu gösterilmez.</p>':''}${warning?'<div class="v54W">'+safe(warning)+'</div>':''}`;
 }
 function updateActions(){const l=validLine();const off=E('v43Off'),on=E('v43On'),run=E('v43Run'),undo=E('v43Undo'),cancel=E('v43Cancel');if(!off||!on)return;off.hidden=!l||v4LineOut(l);on.hidden=!l||!v4LineOut(l);if(l)compactLine();if(run){run.hidden=!v4.overrides.size&&!v42.switchOverrides.size;run.disabled=!!v3.running;run.textContent=ScenarioController.pending?'Senaryoyu hesapla':'Senaryoyu yeniden hesapla';}if(undo)undo.hidden=!ScenarioController.history.length;if(cancel)cancel.hidden=!v3.running;
  const n=E('v54CurrentStatus');if(n)n.textContent=l?`${Number(l.outserv)===1?'Model: servis dışı':'Model: serviste'} · ${v4LineOut(l)?'Senaryo: servis dışı':'Senaryo: serviste'}`:'';
 }
 function initToolbar(){const view=E('view-map'),layout=view?.querySelector('.layout');if(!view||!layout)return;const t=document.createElement('div');t.id='v54Toolbar';t.setAttribute('role','toolbar');t.setAttribute('aria-label','Şebeke haritası görünümü ve filtreleri');t.innerHTML=`<button id="v54Filter" class="v54FilterToggle" aria-controls="v42MapAside" aria-expanded="false">☰ Filtreler</button><span class="v54Divider"></span><button class="v54Group" id="v54gh400">400 kV</button><button class="v54Group" id="v54gmid" title="66, 154 ve 220 kV">154 kV ▾</button><button class="v54Group" id="v54glow">≤36 kV</button><span class="v54Divider"></span><button class="v54Metric" data-metric="P">P</button><button class="v54Metric" data-metric="Q">Q</button><button class="v54Metric" data-metric="V">V</button><button class="v54Metric" data-metric="loading">Yüklenme</button><span class="v54Divider"></span><select id="v54Geometry" aria-label="Harita geometrisi"><option value="detailed">Ayrıntılı</option><option value="simple">Sade TM–TM</option></select><select id="v54Result" aria-label="Hesap görünümü"><option value="reference">Başlangıç</option><option value="scenario">Senaryo</option><option value="delta">Δ Değişim</option></select><button id="v54ScenarioRun" class="primary">Hesapla</button><button id="v54Impact">Etki özeti</button><span id="v54State" class="v54State" role="status">Model bekleniyor</span>`;layout.before(t);
  E('v54Filter').onclick=()=>toggleFilters();for(const key of Object.keys(GROUPS))E('v54g'+key).onclick=()=>applyGroup(key);
  all('.v54Metric',t).forEach(b=>b.onclick=()=>{E('mapMetric').value=b.dataset.metric;E('mapMetric').dispatchEvent(new Event('change',{bubbles:true}));redraw();});
  E('v54Geometry').onchange=e=>{E('v4Geometry').value=e.target.value;E('v4Geometry').dispatchEvent(new Event('change'));redraw();};
  E('v54Result').onchange=e=>{const old=E('v43ViewSel')||E('v43View');if(!old)return;old.value=e.target.value;old.dispatchEvent(new Event('change',{bubbles:true}));syncGroups();};
  E('v54ScenarioRun').onclick=()=>{if(v4.overrides.size||v42.switchOverrides.size)ScenarioController.run();else startV3Solver();updateActions();};
  E('v54Impact').onclick=()=>{E('v51ImpactOpen')?.click();const panel=E('v51Impact');if(panel&&!panel.hidden){openSide('list');const s=E('v54SideSummary');if(s)s.innerHTML='<h3>⚡ Senaryo etki özeti</h3>'+(E('v51ImpactBody')?.innerHTML||'<p>Geçerli senaryo sonucu bulunmuyor.</p>');side('station');}};
  const q=document.createElement('div');q.id='v54Quality';q.setAttribute('role','status');E('mapWrap').append(q);
 }
 function toggleFilters(force){ui.filters=force===undefined?!ui.filters:!!force;E('v42MapAside').classList.toggle('v54Open',ui.filters);E('v54Filter').setAttribute('aria-expanded',String(ui.filters));}
 function initFilter(){const f=E('v42MapAside'),w=E('mapWrap');if(!f||!w)return;w.append(f);const hd=document.createElement('div');hd.id='v54FilterHeader';hd.innerHTML='<strong>Filtreler ve katmanlar</strong><button class="sm" id="v54FilterClose" aria-label="Filtreleri kapat">✕</button>';f.prepend(hd);E('v54FilterClose').onclick=()=>toggleFilters(false);
  const extra=document.createElement('div');extra.id='v54FilterExtra';extra.innerHTML='<div class="sectiontitle">SONUÇ VE SENARYO</div><label><input type="checkbox" id="v54FilterFlow"> Yönlü güç akış okları</label><label><input type="checkbox" id="v54FilterLabels"> Harita sonuç etiketleri</label><label>Hat kapasitesi: <select id="v54FilterSeason"><option value="nominal">Nominal</option><option value="summer">Yazlık</option><option value="winter">Kışlık</option></select></label><label><input type="checkbox" id="v54Terminals"> Hat servise alırken servis dışı uç düğümlerini sanal hesapta etkinleştir (anahtarlara dokunma)</label><details><summary>Hesap kapsamı ve doğrulama</summary><p class="mini">AC çözüm yaklaşık olabilir. Uç düğümünün açılması kesicinin kapatılması değildir; genel hesap yakınsasa dahi seçili hattın akışı ayrıca denetlenir.</p></details>';f.append(extra);
  for(const [own,base] of [['v54FilterFlow','mapFlow'],['v54FilterLabels','mapLabels']]){E(own).checked=E(base).checked;E(own).onchange=e=>{E(base).checked=e.target.checked;E(base).dispatchEvent(new Event('change'));};}
  E('v54FilterSeason').value=E('v4Season').value;E('v54FilterSeason').onchange=e=>{E('v4Season').value=e.target.value;E('v4Season').dispatchEvent(new Event('change'));};
  E('v54Terminals').checked=false;E('v54Terminals').onchange=e=>{const native=E('v53AutoTerm');if(native){native.checked=e.target.checked;native.dispatchEvent(new Event('change'));}};
  const n=E('v53AutoTerm');if(n)n.checked=false;
  E('voltageLayers').addEventListener('change',()=>requestAnimationFrame(syncGroups));
  E('mapArea').addEventListener('change',()=>requestAnimationFrame(syncGroups));
 }
 function initSide(){const p=E('v42LightningPanel'),wrap=E('mapWrap'),drawer=E('v43Drawer');if(!p||!wrap)return;const sideTabs=document.createElement('div');sideTabs.id='v54SideTabs';sideTabs.innerHTML='<button data-side="selected">Seçili</button><button data-side="list" class="active">Ekipman listesi</button><button data-side="station">TM özeti</button><button id="v54SideTechnical">Teknik ayrıntı</button>';p.querySelector('header').after(sideTabs);const summ=document.createElement('div');summ.id='v54SideSummary';sideTabs.after(summ);if(drawer)p.append(drawer);
  const currentStatus=document.createElement('div');currentStatus.id='v54CurrentStatus';currentStatus.className='mini';drawer?.querySelector('#v43Body')?.before(currentStatus);
  all('[data-side]',sideTabs).forEach(b=>b.onclick=()=>{const m=b.dataset.side;if(m==='station'&&!selectedSite)return;if(m==='selected'&&!validLine())return;side(m);});
  E('v54SideTechnical').onclick=()=>E('v43Drawer')?.classList.toggle('v54ShowDetails');
  const oldOpen=window.v43OpenDrawer;window.v43OpenDrawer=function(fid){const r=oldOpen.apply(this,arguments);if(active?.lineById(fid)&&currentView==='map'){openSide('selected');updateActions();}return r;};
  const oldSite=window.selectSite;window.selectSite=function(id){const r=oldSite.apply(this,arguments);if(active?.siteById(id)&&currentView==='map'){stationPanel();openSide('station');}return r;};
  E('v42LightningButton').addEventListener('click',()=>{if(v42.opened)side('list');});
  E('v42LightningClose').addEventListener('click',()=>{if(drawer)drawer.hidden=true;});
  E('v43Close').addEventListener('click',()=>{v42.opened=false;v42UpdatePanel();});
  E('v43Off').addEventListener('click',()=>setTimeout(updateActions,0));E('v43On').addEventListener('click',()=>setTimeout(updateActions,0));
  E('v43Undo').addEventListener('click',()=>setTimeout(updateActions,0));E('v43Reset').addEventListener('click',()=>setTimeout(updateActions,0));
 }
 function initClear(){const c=E('networkCanvas');if(!c)return;
  let start=null;c.addEventListener('pointerdown',e=>{start={x:e.clientX,y:e.clientY};},{capture:true});
  c.addEventListener('pointerup',e=>{if(!active||!start)return;const delta=Math.hypot(e.clientX-start.x,e.clientY-start.y);start=null;if(delta>6)return;
   const rect=c.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top;
   /* Ground-truth hit test consistent with spatially indexed hover; do not clear a visible TM/line hit. */
   const spt=window.YTBS_V53_TEST;const chosen=E('v53Tip');let hit=chosen&&!chosen.hidden;
   if(!hit){let area=E('mapArea').value,allowed=selectedVolts();for(const s of active.sites){if(!visibleSite(s)||window.YTBS_V53&&!YTBS_V53.stationVisible(s,allowed))continue;let pt=coordsToPx(s.lon,s.lat);if(Math.hypot(pt[0]-x,pt[1]-y)<14){hit=true;break;}}
    if(!hit){for(const l of active.lines){if(!visibleLine(l,allowed,area))continue;const path=cfg.v4Geometry==='simple'?null:l.coords;const pts=path?.length>=2?path:[l.siteA?.lat!=null?[l.siteA.lat,l.siteA.lon]:null,l.siteB?.lat!=null?[l.siteB.lat,l.siteB.lon]:null].filter(Boolean);for(let j=1;j<pts.length;j++){const a=coordsToPx(pts[j-1][1],pts[j-1][0]),b=coordsToPx(pts[j][1],pts[j][0]),vx=b[0]-a[0],vy=b[1]-a[1],d=vx*vx+vy*vy,t=d?Math.max(0,Math.min(1,((x-a[0])*vx+(y-a[1])*vy)/d)):0;if(Math.hypot(x-a[0]-t*vx,y-a[1]-t*vy)<11){hit=true;break;}}if(hit)break;}}
   }
   if(!hit)clearSelection();
  },false);
 }
 function initLive(){const oldDraw=window.drawMap;window.drawMap=function(){const r=oldDraw.apply(this,arguments);if(currentView==='map'){const overlay=E('mapOverlay');if(overlay&&active)overlay.textContent=`${active.date} ${active.time} · ${mapCam.zoom.toFixed(1)}× · Servis dışı: kesikli · TM–TM çizgileri temsili`;syncGroups();}return r;};
  const oldAct=window.activateModel;window.activateModel=function(m){const r=oldAct.apply(this,arguments);requestAnimationFrame(()=>{syncGroups();updateActions();});return r;};
  const oldView=window.setView;window.setView=function(v){const r=oldView.apply(this,arguments);if(v==='map'){requestAnimationFrame(()=>{resizeMap();drawMap();syncGroups();});}return r;};
  const prevApply=ScenarioController.apply;ScenarioController.apply=function(...args){const r=prevApply.apply(this,args);updateActions();return r;};
  const prevUndo=ScenarioController.undo;ScenarioController.undo=function(...args){const r=prevUndo.apply(this,args);updateActions();return r;};
  const prevReset=ScenarioController.reset;ScenarioController.reset=function(...args){const r=prevReset.apply(this,args);updateActions();return r;};
  E('mapMetric').addEventListener('change',()=>requestAnimationFrame(syncGroups));
  E('v43ViewSel')?.addEventListener('change',()=>requestAnimationFrame(syncGroups));
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&currentView==='map'){if(ui.filters)toggleFilters(false);else if(v42.opened){v42.opened=false;v42UpdatePanel();}else clearSelection();}});
 }
 initToolbar();initFilter();initSide();initClear();initLive();syncGroups();updateActions();
 INFO.map+='<h3>v5.4 · Tek harita çalışma alanı</h3><p>400 kV, 154 kV grubu (66/154/220) ve ≤36 kV ana filtreleri yalnız gösterimi değiştirir; model nominal gerilimleri korunur. Harita boş alan tıklaması ekipman seçimini kaldırır, senaryoyu sıfırlamaz. ⚡ sağ panelde seçilen ekipman, listeler ve servis senaryosu görüntülenir. Akış okları geçerli, yönü belirlenmiş P sonucu bulunan görünür hatlarda en çok üçtür. Servise alınan bir hat için genel hesap yakınsaması kendi terminal akışının çözüldüğünü kanıtlamaz.</p>';
 INFO.metrics+='<h3>v5.4 · Hesaplamanın sınırı</h3><p>Ulusal DGS modelinde tam Newton–Raphson hâlâ yakınsamayabilir; geri dönüş sonucu yaklaşık AC-PQ olarak işaretlenir. 66 kV altı tam ağ, ünite bazında reaktif güç paylaşımı ve bağımsız hat açma referansları tamamlanmadan sonuçlar işletme veya N-1 kararı için kullanılmamalıdır.</p>';
 document.title='YTBS | Şebeke Görüntüleyici v5.4';const head=document.querySelector('.apphead h1');if(head)head.textContent='YTBS Şebeke Görüntüleyici v5.4';
 if(E('footerRight'))E('footerRight').textContent='YTBS · Tek HTML · v5.4 · DGS nominal kapasite · deneysel AC/DC';
 window.YTBS_V54_TEST={groups:()=>Object.fromEntries(Object.keys(GROUPS).map(k=>[k,{state:stateOf(k),levels:groupInputs(k).map(e=>e.dataset.volt)}])),selected:()=>({line:selectedLine,station:selectedSite,side:ui.side,panel:v42.opened,filters:ui.filters}),clear:clearSelection,actions:()=>({on:!E('v43On').hidden,off:!E('v43Off').hidden}),flow:()=>({maxPerLine:3,model:active?.name}),openFilters:()=>toggleFilters(true),openSide};
})();

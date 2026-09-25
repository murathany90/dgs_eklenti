
'use strict';
/* v5 additive UI layer: source FID, resultSet(), ScenarioController, and DGSModel remain unchanged. */
(function(){
 const V5={model:null,technical:false,site:null,voltage:null,areaGroups:new Map(),siteById:new Map(),treeFilter:''};
 const esc=v=>h(String(v??''));
 const isId=v=>/^(?:[A-Z]{1,4}\d+|ft\d+-\d+)$/.test(String(v||''));
 function clean(v,cls){
  let s=String(v??'').trim();
  s=s.replace(/^(?:[A-Z]{1,4}\d+)(?:\s*[-·:]\s*|\s+)(?=\S)/,'');
  if(cls==='ElmLne')s=s.replace(/^\s*\d+(?:[.,]\d+)?\s*kV\s*(?=[\p{L}\d])/iu,'');
  s=s.replace(/_/g,' ').replace(/\s{2,}/g,' ').trim();
  if(s&&!isId(s))return s;
  return ({ElmSite:'Trafo merkezi',ElmLne:'Enerji iletim hattı',ElmTerm:'Elektriksel düğüm',ElmSubstat:'Bara grubu',ElmBay:'Fider',ElmCoup:'Anahtarlama elemanı',ElmTr2:'Transformatör',ElmSym:'Üretim ünitesi',ElmGenStat:'Üretim ünitesi',ElmLod:'Yük'})[cls]||'Ekipman';
 }
 function rowFor(cls,id){if(!active)return null; if(cls==='ElmSite')return active.siteById(id)||active.get(cls,id);
  if(cls==='ElmLne')return active.lineById(id)||active.get(cls,id);return active.get(cls,id);}
 function label(cls,id,obj){const row=obj||rowFor(cls,id);return clean(row?.loc_name||row?.name||'',cls);}
 function v5Id(id){return V5.technical?`<span class="v5IdBadge" title="Kaynak DGS kimliği">${esc(id)}</span>`:'';}
 function stationLabel(id){return clean(active?.stationGroups.get(id)?.loc_name||active?.siteById(id)?.loc_name||'', 'ElmSite');}
 function siteFor(cls,id,obj){if(!active)return null;if(cls==='ElmSite')return id;
  if(cls==='ElmLne')return (obj||active.lineById(id))?.stationA||null;
  if(cls==='ElmTr2')return (obj||active.get(cls,id))?.station||active.resolveSiteByClass(cls,id)||null;
  try{return active.resolveSiteByClass(cls,id)||null;}catch(_){return null;}}
 function badgeState(){const note=$('v42TopStatus');if(note&&active)note.textContent=`${nf.format(active.stats.lines)} hat · ${nf.format(active.stats.sites)} TM`;
  const overlay=$('mapOverlay');if(overlay&&active)overlay.textContent=`${active.date} · ${active.time} · ${active.name.includes('_')?'YTBS modeli':'Şebeke modeli'}`;
 }
 function renameTabs(){LABEL.loc_name='Ekipman adı';const labels={upload:'Model',static:'Şebeke Envanteri',dynamic:'İşletme Verileri',map:'Harita',sld:'Tek Hat Şeması',analysis:'Analizler',info:'Yardım',settings:'Ayarlar'};
  $$('.tab').forEach(el=>{if(labels[el.dataset.view])el.textContent=labels[el.dataset.view]});
  const headers={static:'Şebeke envanteri',dynamic:'İşletme verileri',map:'Şebeke haritası',sld:'Tek hat şeması',upload:'YTBS şebeke modelini yükleyin'};
  for(const [key,v] of Object.entries(headers)){const el=$('view-'+key)?.querySelector('.heading h2');if(el)el.textContent=v;}
  document.title='YTBS | Şebeke Görüntüleyici v5.0';const brand=document.querySelector('.apphead h1');if(brand)brand.textContent='YTBS Şebeke Görüntüleyici v5.4';
  $('staticSearch').placeholder='TM, hat, fider veya teknik kimlik';$('dynSearch').placeholder='Ekipman adı';
  const fi=$('filedrop')?.querySelector('strong');if(fi)fi.textContent='YTBS şebeke modeli JSON dosyasını seçin';
  const lm=$('loadMsg');if(lm&&!active)lm.textContent='Bir YTBS DGS JSON dosyası seçerek başlayın.';
 }
 function setupLayout(){let section=$('view-static'),heading=section.querySelector('.heading'),panel=heading.nextElementSibling;
  const w=document.createElement('div');w.className='v5InvLayout';w.id='v5Inventory';heading.after(w);const aside=document.createElement('aside');aside.id='v5Tree';aside.className='v5Tree';aside.setAttribute('aria-label','Hiyerarşik şebeke ağacı');aside.innerHTML=`<div class="v5TreeHeading">Şebeke ağacı <button id="v5TreeClear" class="sm" title="Tüm şebekeyi listele">Tümü</button></div><div class="v5TreeInfo">YTM → TM → Gerilim → Ekipman</div><input id="v5TreeSearch" type="search" aria-label="Trafo merkezi ara" placeholder="Trafo merkezi ara..."><div id="v5TreeResults" aria-live="polite">Model yükleyin.</div><div id="v5StationCard" aria-live="polite"></div>`;w.append(aside,panel);panel.classList.add('v5InvTable');
  const top=document.createElement('div');top.id='v5Actions';top.className='v5TopActions';top.innerHTML=`<span class="v5StatusStrip"><strong>Envanter</strong><span class="v5Badge" id="v5Scope">Tüm şebeke</span></span><div class="v5QuickNav"><button id="v5ListAll" class="sm">Tüm ekipmanlar</button><button id="v5ToMap" class="sm">Harita</button><button id="v5ToSld" class="sm">Tek hat şeması</button></div>`;panel.prepend(top);
  $('v5TreeSearch').addEventListener('input',e=>{V5.treeFilter=e.target.value;renderTree();});
  $('v5TreeClear').onclick=()=>{V5.site=null;V5.voltage=null;$('staticSite').value='';$('staticVoltage').value='';$('staticSearch').value='';$('v5StationCard').replaceChildren();$('v5Scope').textContent='Tüm şebeke';renderStatic(true);renderTree();};
  $('v5ListAll').onclick=()=>$('v5TreeClear').click();
  $('v5ToMap').onclick=()=>{setView('map');if(V5.site){selectSite(V5.site);focusSite(V5.site);}};
  $('v5ToSld').onclick=()=>{if(V5.site){selectedSite=V5.site;$('sldStation').value=V5.site;}setView('sld');};
  aside.addEventListener('click',e=>{let s=e.target.closest('[data-v5site]');if(s){chooseSite(s.dataset.v5site);return;}let c=e.target.closest('[data-v5cat]');if(c){chooseCategory(c.dataset.v5cat,c.dataset.v5volt||'');return;}let a=e.target.closest('[data-v5go]');if(a){if(a.dataset.v5go==='map')$('v5ToMap').click();else if(a.dataset.v5go==='sld')$('v5ToSld').click();else {setView('dynamic');if(V5.site)$('dynSite').value=V5.site;renderDyn(true);}}});
  const notices=['#view-dynamic #dynNotice','#view-sld .notice.warn'];
  for(const q of notices){const n=document.querySelector(q);if(!n)continue;const d=document.createElement('details');d.className='v5ShortNotice';d.innerHTML='<summary>ⓘ Veri ve model açıklaması</summary>';n.parentNode.insertBefore(d,n);d.appendChild(n);n.classList.remove('warn');n.classList.add('mini');}
  const val=$('v4ValidationMap');if(val){const box=document.createElement('details');box.className='v5ShortNotice v5MapValidation';box.innerHTML='<summary>⚠ Deneysel hesap · Ayrıntılar</summary>';val.parentNode.insertBefore(box,val);box.appendChild(val);val.classList.add('mini');const sum=box.querySelector('summary');const refresh=()=>{const txt=val.textContent||'';const critical=/UYUMSUZ|BAŞARISIZ|YAKINSAMADI|HESAPLANAMADI|GEÇERSİZ/i.test(txt);sum.textContent=critical?'⛔ Hesap doğruluğu uyarısı · Ayrıntılar':'⚠ Deneysel hesap · Ayrıntılar';if(critical)box.open=true;};new MutationObserver(refresh).observe(val,{childList:true,subtree:true,characterData:true});refresh();}
  const originalInfo=$('mapWrap')?.parentElement.querySelector('.maphint');if(originalInfo){const d=document.createElement('details');d.className='v5ShortNotice';d.innerHTML='<summary>ⓘ Harita çizim açıklaması</summary>';originalInfo.parentElement.insertBefore(d,originalInfo);d.appendChild(originalInfo);originalInfo.style.display='block';}
  const target=$('view-settings')?.querySelector('.settinggrid .panel');if(target){const sec=document.createElement('div');sec.id='v5TechSetting';sec.style.marginTop='14px';sec.innerHTML=`<div><b>Teknik kimlikleri göster</b><div id="v5SettingsNote">Varsayılan görünümde ekipman adları öne çıkar. FID ve kaynak sınıfları korunur.</div></div><label class="check"><input type="checkbox" id="v5ShowTech" aria-label="Teknik kimlikleri göster">Aç</label>`;target.appendChild(sec);$('v5ShowTech').onchange=e=>{V5.technical=e.target.checked;document.body.classList.toggle('v5Tech',V5.technical);renderStatic(false);renderDyn(false);if(v42.opened)v42RenderLightning();if(selectedLine)updateMapLine();else if(selectedSite)updateMapSite();if(currentView==='sld')drawScheme();};}
  const summary=document.createElement('div');summary.id='v5UploadSummary';$('loadMsg').after(summary);
 }
 function setupTreeIndex(){V5.siteById.clear();V5.areaGroups.clear();V5.site=null;V5.voltage=null;V5.model=active;if(!active){$('v5TreeResults').textContent='Model yükleyin.';$('v5StationCard').replaceChildren();return;}
  for(const site of active.sites){V5.siteById.set(String(site.FID),site);const area=String(site.ytmId||site.ytm||'tanimsiz');let group=V5.areaGroups.get(area);if(!group)V5.areaGroups.set(area,group={name:String(site.ytm||'YTM belirtilmemiş'),sites:[]});group.sites.push(site);}
  for(const g of V5.areaGroups.values())g.sites.sort((a,b)=>clean(a.loc_name,'ElmSite').localeCompare(clean(b.loc_name,'ElmSite'),'tr'));
  $('v5StationCard').replaceChildren();$('v5TreeSearch').value='';V5.treeFilter='';renderTree();$('v5Scope').textContent=`${nf.format(active.stats.sites)} TM · ${nf.format(active.stats.lines)} hat`;
 }
 function renderTree(){const root=$('v5TreeResults');if(!active){root.textContent='Model yükleyin.';return;}const q=norm(V5.treeFilter.trim());
  if(q){const hits=active.sites.filter(s=>norm(s.loc_name+' '+s.FID).includes(q));root.innerHTML=`<div class="v5TreeInfo">${nf.format(hits.length)} trafo merkezi${hits.length>90?' · İlk 90 kayıt':''}</div><div class="v5SiteList">${hits.slice(0,90).map(s=>`<button class="v5SiteBtn" data-v5site="${esc(s.FID)}" title="${esc(s.loc_name)}">${esc(clean(s.loc_name,'ElmSite'))}</button>`).join('')||'Eşleşen trafo merkezi yok.'}</div>`;return;}
  const current=V5.site;root.innerHTML=[...V5.areaGroups.entries()].sort((a,b)=>a[1].name.localeCompare(b[1].name,'tr')).map(([key,g])=>`<details class="v5Area" data-v5area="${esc(key)}"><summary>${esc(g.name)} <small>(${nf.format(g.sites.length)})</small></summary><div class="v5SiteList" data-v5children="${esc(key)}"></div></details>`).join('');
  root.querySelectorAll('details.v5Area').forEach(d=>{d.addEventListener('toggle',()=>{if(!d.open)return;const box=d.querySelector('[data-v5children]');if(box.childElementCount)return;const group=V5.areaGroups.get(d.dataset.v5area);box.innerHTML=group.sites.map(s=>`<button class="v5SiteBtn" data-v5site="${esc(s.FID)}" aria-current="${current===s.FID}" title="${esc(s.loc_name)}">${esc(clean(s.loc_name,'ElmSite'))}</button>`).join('');});if(current&&V5.areaGroups.get(d.dataset.v5area)?.sites.some(s=>s.FID===current))d.open=true;});
 }
 function chooseSite(id){if(!active)return;const s=V5.siteById.get(String(id));if(!s)return;V5.site=s.FID;V5.voltage=null;
  const sel=$('staticSite');if([...sel.options].some(o=>o.value===s.FID))sel.value=s.FID;else sel.value='';$('staticArea').value='';$('staticVoltage').value='';$('staticSearch').value='';$('staticType').value='ElmSite';renderStatic(true);$('v5Scope').textContent=clean(s.loc_name,'ElmSite');
  const volts=(String(s.voltageList||'').match(/\d+(?:[.,]\d+)?/g)||[]).map(x=>Number(x.replace(',','.'))).filter(v=>Number.isFinite(v)&&v>0);const sorted=[...new Set(volts)].sort((a,b)=>b-a);
  const groups=sorted.length?sorted.map(v=>`<details class="v5VGroup"><summary>${esc(v)} kV</summary><div class="v5CategoryGrid">${categories(v)}</div></details>`).join(''):`<div class="v5TreeInfo">Gerilim seviyesi kaydı bulunmuyor.</div><div class="v5CategoryGrid">${categories('')}</div>`;
  $('v5StationCard').innerHTML=`<h3>${esc(clean(s.loc_name,'ElmSite'))}</h3><div class="v5TreeInfo">${esc(s.ytm||'YTM belirtilmemiş')} · ${nf.format(s.lineCount||0)} hat · ${nf.format(s.transformerCount||0)} trafo</div><div class="v5ActionBar"><button data-v5go="map" class="sm">Haritada aç</button><button data-v5go="sld" class="sm">Tek hat şeması</button><button data-v5go="dyn" class="sm">İşletme verileri</button></div>${groups}<details class="v5TechDisclosure"><summary>Teknik kayıt</summary><small>FID: ${esc(s.FID)}</small></details>`;
  $$('[data-v5site]',$('v5TreeResults')).forEach(b=>b.setAttribute('aria-current',String(b.dataset.v5site===id)));
 }
 function categories(v){return [['ElmTerm','Baralar / düğümler'],['ElmSubstat','Bara grupları'],['ElmBay','Fiderler'],['ElmLne','Enerji iletim hatları'],['ElmTr2','Transformatörler'],['ElmCoup','Kesici / ayırıcılar']].filter(([cls])=>active.t(cls)).map(([cls,name])=>`<button class="v5BranchBtn" data-v5cat="${cls}" data-v5volt="${esc(v)}">${name}</button>`).join('');}
 function chooseCategory(cls,voltage){if(!V5.site||!active.t(cls))return;V5.voltage=voltage||null;$('staticType').value=cls;$('staticSite').value=V5.site;$('staticArea').value='';$('staticSearch').value='';
  const resolved=['ElmTerm','ElmLne'].includes(cls);$('staticVoltage').value=resolved&&voltage&&[...$('staticVoltage').options].some(o=>o.value===voltage)?voltage:'';
  renderStatic(true);$('v5Scope').textContent=clean(V5.siteById.get(V5.site)?.loc_name,'ElmSite')+(voltage?' · '+voltage+' kV':'')+' · '+(CATEGORY[cls]?.label||cls);
  let note=$('v5CategoryNote');if(!note){note=document.createElement('div');note.id='v5CategoryNote';note.className='v5TreeInfo';$('v5StationCard').appendChild(note);}note.textContent=voltage&&!resolved?'Bu kategoride gerilim bağlantısı kaynak veriden doğrudan doğrulanamadığı için seçilen TM’nin bütün '+(CATEGORY[cls]?.label||'ekipman')+' kayıtları listelenir.':'';
 }
 function shortRows(type,table,rows,cols,cls,page,onpick){let show=V5.technical;let c=show?cols:[...cols].filter(k=>k!=='FID'&&k!=='typ_id'&&k!=='fold_id'&&k!=='bus1'&&k!=='bus2');if(!c.length)c=cols;
  const altered=rows.map(r=>{if(!r||!r.loc_name)return r;return {...r,loc_name:clean(r.loc_name,cls==='mixed'?(r.__cls||''):cls)};});
  return v5OrigRenderRows(type,table,altered,c,cls,page,(r,el)=>onpick(r,el));}
 const v5OrigRenderRows=renderRows;renderRows=shortRows;
 function techDetails(cls,id,source){let r=source||rowFor(cls,id),extra=String(r?.typ_id||'');return `<details class="v5TechDisclosure"><summary>Teknik bilgiler</summary><div>Kaynak kimliği: <code>${esc(id||'—')}</code></div><div>DGS sınıfı: <code>${esc(cls)}</code></div>${extra?`<div>Tür referansı: <code>${esc(extra)}</code></div>`:''}</details>`;}
 function trimDetail(){const root=$('staticDetail');if(!root||!active)return;const chip=root.querySelector('h3 .chip');if(chip)chip.classList.add('v5HiddenTech');const head=root.querySelector('h3');if(head){const source=head.firstChild;if(source?.nodeType===Node.TEXT_NODE)source.textContent=clean(source.textContent,$('staticType').value)+' ';}
  $$('small',root).forEach(el=>{if(/^(FID|Tür referansı|Üst nesne referansı|Bağlantı hücresi)/.test(el.textContent.trim()))el.closest('.kv')?.classList.add('v5HiddenTech');});
 }
 const origShowStaticDetail=showStaticDetail;showStaticDetail=function(cls,r){origShowStaticDetail(cls,r);trimDetail();if(r?.FID){const root=$('staticDetail');root.insertAdjacentHTML('beforeend',techDetails(cls,r.FID,r));}};
 const origStationNested=showStationNested;showStationNested=function(sid,cls){origStationNested(sid,cls);let root=$('stationNested');if(!root)return;const t=root.querySelector('table');if(t){const th=t.querySelector('thead th:first-child');if(th){th.textContent='Kimlik';th.classList.add('v5HiddenTech');}t.classList.add('v5NestedTable');}$$('tbody tr',root).forEach(row=>{if(row.cells.length>1){const id=row.cells[0].textContent.trim();row.cells[0].classList.add('v5HiddenTech');row.cells[1].textContent=label(cls,id,{loc_name:row.cells[1].textContent});row.cells[1].title=id;}});};
 const origRenderLightning=v42RenderLightning;v42RenderLightning=function(){origRenderLightning();const root=$('v42LBody');if(!active||!v42.opened||!root)return;
  $$('tr[data-v42item]',root).forEach(row=>{const [cls,id]=row.dataset.v42item.split('|'),r=rowFor(cls,id);if(!r)return;const first=row.cells[0];if(!first)return;const nm=label(cls,id,r);const u=cls==='ElmLne'?r.voltage:cls==='ElmTerm'?Number(r.uknom):null;let second=[];if(Number.isFinite(+u)&&+u>0)second.push(fmt(+u)+' kV');if(cls==='ElmLne')second.push(Number(r.outserv)===1?'Servis dışı':'Serviste');else if(cls==='ElmTerm'){const sid=siteFor(cls,id,r);if(sid)second.push(stationLabel(sid));}first.innerHTML=`<b>${esc(nm)}</b><small>${esc(second.filter(Boolean).join(' · '))}</small>${v5Id(id)}`;first.title=`${nm} · FID: ${id}`;});
  const n=$('v42LNote');if(n){const m=n.textContent.match(/^([\d.,]+) kayıt/);n.textContent=`${m?m[1]+' ekipman · ':''}${active.date} ${active.time} · Değerler: ölçüm veya deneysel hesap`;}
 };
 const origBayList=v42StationBayList;v42StationBayList=function(){origBayList();if(!active)return;$$('option',$('v42Bay')).forEach(o=>{if(!o.value)return;o.textContent=label('ElmBay',o.value);o.title=`Kaynak kimliği: ${o.value}`;});};
 const origDrawScheme=drawScheme;drawScheme=function(){origDrawScheme();simplifySld();};
 function simplifySld(){if(!active)return;const svg=$('schemeSvg');if(!svg)return;$$('text',svg).forEach(el=>{if(!el.dataset.v5Raw)el.dataset.v5Raw=el.textContent;const raw=el.dataset.v5Raw;if(V5.technical){el.textContent=raw;return;}
   let s=raw.replace(/\b(?:B\d{2,}|C\d{2,}|F\d{2,}|H\d{2,}|T\d{2,}|U\d{2,}|M\d{2,})\b/g,id=>{const cls=id[0]==='B'?'ElmTerm':id[0]==='C'?'ElmCoup':id[0]==='F'?'ElmBay':id[0]==='H'?'ElmLne':id[0]==='T'?'ElmTr2':id[0]==='U'?'ElmSym':'ElmSite';const row=rowFor(cls,id);const nm=label(cls,id,row);if(cls==='ElmCoup'){const typ=String(row?.aUsage||'');return typ==='cbk'?'Kesici':typ==='dct'?'Ayırıcı':'Anahtar';}return row&&nm!==id?nm:(cls==='ElmTerm'?'Elektriksel düğüm':cls==='ElmBay'?'Fider':id);});
   el.textContent=s.length>85?s.slice(0,82)+'…':s;el.setAttribute('aria-label',raw);});
  const title=$('schemeTitle');if(title){title.textContent=title.textContent.replace(/\s*·\s*F\d+\s*·/g,' · ');}
  const badge=$('v42SldBadge');if(badge&&badge.textContent.includes('StaCubic'))badge.textContent='Model bağlantılarından otomatik çizim · Özgün PowerFactory yerleşimi değil';
 }
 const origSelectSite=selectSite;selectSite=function(id){origSelectSite(id);updateMapSite();};
 const origSelectLine=selectLine;selectLine=function(id){origSelectLine(id);updateMapLine();};
 function hideTechnicalKv(root){$$('.kv',root).forEach(div=>{const txt=div.querySelector('small')?.textContent||'';if(/^(FID|Tür referansı)/.test(txt))div.classList.add('v5HiddenTech');});}
 function updateMapSite(){if(!active||!selectedSite)return;const r=active.siteById(selectedSite);if(!r)return;const root=$('mapSelection');root.innerHTML=`<b>${esc(label('ElmSite',r.FID,r))}</b><br><span class="sub">${esc(r.ytm||'Trafo merkezi')} · ${nf.format(active.stationLines.get(r.FID)?.length||0)} hat</span><div class="chips"><button class="sm" id="selectedStationDetail">TM bilgileri</button><button class="sm primary" id="selectedStationScheme">Tek hat şeması</button></div>`;$('selectedStationDetail').onclick=()=>openEquipment('ElmSite',r.FID);$('selectedStationScheme').onclick=()=>{selectedSite=r.FID;$('sldStation').value=r.FID;setView('sld');};
  const detail=$('mapDetail');const h3=detail.querySelector('h3');if(h3)h3.textContent=label('ElmSite',r.FID,r);hideTechnicalKv(detail);$$('[data-mapline]',detail).forEach(b=>{const l=active.lineById(b.dataset.mapline);if(l){b.textContent=label('ElmLne',l.FID,l);b.title=l.FID;}});if(!detail.querySelector('#v5MapTech'))detail.insertAdjacentHTML('beforeend',`<div id="v5MapTech">${techDetails('ElmSite',r.FID,r)}</div>`);badgeState();}
 function updateMapLine(){if(!active||!selectedLine)return;const l=active.lineById(selectedLine);if(!l)return;const nm=label('ElmLne',l.FID,l),state=Number(l.outserv)===1?'Servis dışı':'Serviste';
  $('mapSelection').innerHTML=`<b>${esc(nm)}</b><br><span class="sub">${esc(l.voltage)} kV · ${state}</span><div class="chips"><button class="sm" id="selectedLineDetail">Hat bilgileri</button></div>`;$('selectedLineDetail').onclick=()=>openEquipment('ElmLne',l.FID);
  const detail=$('mapDetail');const head=detail.querySelector('h3');if(head)head.textContent=nm;hideTechnicalKv(detail);if(!detail.querySelector('#v5MapTech'))detail.insertAdjacentHTML('beforeend',`<div id="v5MapTech">${techDetails('ElmLne',l.FID,l)}</div>`);badgeState();}
 const origFillModelInfo=fillModelInfo;fillModelInfo=function(){origFillModelInfo();if(active){$('headInfo').textContent=`${nf.format(active.stats.sites)} trafo merkezi · ${nf.format(active.stats.lines)} hat · ${active.date} ${active.time}`;const msg=$('loadMsg');if(msg&&!msg.classList.contains('bad'))msg.textContent=`Model hazır: ${active.date} ${active.time}.`;const summary=$('v5UploadSummary');if(summary)summary.innerHTML=`<div class="v5TopActions"><div><strong>Şebeke modeli hazır</strong><div class="v5TreeInfo">${active.date} ${active.time} · ${nf.format(active.stats.sites)} TM · ${nf.format(active.stats.lines)} hat</div></div><div class="v5QuickNav"><button class="sm primary" data-v5upload="map">Haritayı aç</button><button class="sm" data-v5upload="static">Envanteri incele</button><button class="sm" data-v5upload="sld">Tek hat şeması</button></div></div>`;summary.querySelectorAll('[data-v5upload]').forEach(b=>b.onclick=()=>setView(b.dataset.v5upload));}badgeState();};
 const origPopulateFilters=populateFilters;populateFilters=function(){origPopulateFilters();setupTreeIndex();$$('option',$('mapSite')).forEach(o=>{if(o.value)o.textContent=label('ElmSite',o.value);});$$('option',$('staticSite')).forEach(o=>{if(o.value)o.textContent=label('ElmSite',o.value);});$$('option',$('dynSite')).forEach(o=>{if(o.value)o.textContent=label('ElmSite',o.value);});};
 const origSetView=setView;setView=function(view){origSetView(view);if(view==='map')badgeState();if(view==='sld'&&active){$$('option',$('sldStation')).forEach(o=>{if(o.value)o.textContent=label('ElmSite',o.value);});$$('option',$('sldLine')).forEach(o=>{if(o.value)o.textContent=label('ElmLne',o.value);});$$('[data-v4sl]',$('sldInfo')).forEach(b=>{const id=b.dataset.v4sl;b.textContent=label('ElmLne',id)+(b.textContent.includes('SERVİS DIŞI')?' · Servis dışı':'');b.title=id;});simplifySld();}};
 function simplifyDrawer(fid){
  if(!active)return;const l=active.lineById(fid);const d=$('v43Drawer');if(!l||!d)return;
  $('v43Title').textContent=label('ElmLne',fid,l);
  const body=$('v43Body');const kv=body?.querySelectorAll(':scope > .kv');if(!kv?.length)return;
  if(kv[0]){kv[0].querySelector('small').textContent='Enerji iletim hattı';kv[0].querySelector('b').textContent=label('ElmLne',fid,l);}
  if(kv[1]){kv[1].querySelector('small').textContent='Bağlantılı trafo merkezleri';kv[1].querySelector('b').textContent=stationLabel(l.stationA)+' ↔ '+stationLabel(l.stationB);}
  if(kv[3]){const title=kv[3].querySelector('small'),v=kv[3].querySelector('b');if(title&&v){title.textContent='Hat uzunluğu';v.textContent=Number.isFinite(Number(l.dline))?fmt(Number(l.dline))+' km':'Veri yok';}}
  for(const el of kv){const txt=el.querySelector('small')?.textContent||'';if(/^(Model ve senaryo zamani|Model ve senaryo zamanı)/i.test(txt)){const b=el.querySelector('b');if(b)b.textContent=active.date+' '+active.time+(ScenarioController.pending?' · Hesap bekliyor':'');break;}
   if(/^Ilgili bara V/.test(txt)){const b=el.querySelector('b');if(b){b.innerHTML=b.innerHTML.replace(/B\d{2,}/g,'Bara').replace(/from:/g,'Başlangıç:').replace(/to:/g,'Bitiş:');}}}
  body.insertAdjacentHTML('beforeend',techDetails('ElmLne',l.FID,l));
 }
 const v5OriginalDrawer=window.v43OpenDrawer;
 if(typeof v5OriginalDrawer==='function')window.v43OpenDrawer=function(fid){v5OriginalDrawer.apply(this,arguments);simplifyDrawer(fid);};
 const v5OriginalAnalysis=renderAnalysis;
 renderAnalysis=function(){v5OriginalAnalysis();if(!active||currentView!=='analysis'||['topology','quality'].includes(v2.kind))return;
  const tbl=$('analysisTable')?.querySelector('table');if(!tbl)return;
  const cols=tbl.querySelectorAll('thead th');for(const j of [0,2])if(cols[j])cols[j].classList.toggle('v5HiddenTech',!V5.technical);
  const all=getAnalysisRows();const start=v2.page*v2.pageSize,part=all.slice(start,start+v2.pageSize);
  $$('tbody tr[data-resultrow]',tbl).forEach((tr,i)=>{const r=part[i];if(!r)return;const tds=tr.querySelectorAll('td');if(tds[0])tds[0].classList.toggle('v5HiddenTech',!V5.technical);if(tds[2])tds[2].classList.toggle('v5HiddenTech',!V5.technical);if(tds[1]){tds[1].textContent=label(r.cls,r.id);tds[1].title='Kaynak kimliği: '+r.id;}});
  const detail=$('analysisDetail'),head=detail.querySelector('h3');if(head&&detail.querySelector('.detailgrid')){const t=part.find(r=>head.textContent.includes(r.id));if(t){head.textContent=label(t.cls,t.id);if(!detail.querySelector('.v5TechDisclosure'))detail.insertAdjacentHTML('beforeend',techDetails(t.cls,t.id));}$$('.kv',detail).forEach(kv=>{if(/^(Terminal|Kaynak kimliği)/i.test(kv.querySelector('small')?.textContent||''))kv.classList.toggle('v5HiddenTech',!V5.technical);});}
 };
 try{if(typeof INFO.about==='string')INFO.about=INFO.about.replace(/v4\\.1/g,'v5.0');}catch(_){}
 renameTabs();setupLayout();setupTreeIndex();
 window.YTBS_V5_TEST={model:()=>active?.name||null,site:()=>V5.site,treeCount:()=>V5.siteById.size,label,chooseSite,chooseCategory,technical:()=>V5.technical,selection:()=>({line:selectedLine,site:selectedSite}),refresh:()=>{badgeState();if(v42.opened)v42RenderLightning();}};
})();

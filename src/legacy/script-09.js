/* v5.3 - Single JSON, local-first. Capacity, map filtering and diagnostics share source FIDs. */
(function(){
'use strict';
const EMBEDDED=window.__LINE_CAPACITY_DATA__||{};
const $53=id=>document.getElementById(id);
const f53=n=>Number.isFinite(n)?n.toLocaleString('tr-TR',{maximumFractionDigits:2}):'—';
const safe=s=>h(s==null?'—':s);
const stamp=()=>active?active.date+' '+active.time:'Model bekleniyor';
const state={model:null,capacity:new Map(),siteVolts:new Map(),restoredEnds:new Set(),spatial:null,spatialKey:'',lastTip:0,page:0,query:'',source:'all',filter:'all',modelReport:null};
const value=(set,cls,id,metric,terminal='')=>{
 if(!set||!set.index||set.modelId!==active?.rid)return null;
 const keys=[`${cls}|${id}|${metric}|${terminal}`];
 for(const key of keys){for(const r of set.index.get(key)||[]){if(r.usable&&Number.isFinite(Number(r.value))&&r.quality!=='INVALID')return Number(r.value);}}
 return null;
};
function setup(){
 if(!active||state.model===active)return;
 state.model=active;state.capacity=new Map();state.siteVolts=new Map();state.restoredEnds=new Set();state.spatial=null;state.spatialKey='';state.page=0;
 const term=active.t('ElmTerm');if(term){let fi=active.attrAt('ElmTerm','FID'),vk=active.attrAt('ElmTerm','uknom'),out=active.attrAt('ElmTerm','outserv');
  for(const row of term.Values){if(row[out]===1)continue;const voltage=Number(row[vk]);if(!(voltage>0))continue;const sid=active.resolveSiteByClass('ElmTerm',String(row[fi]));if(!sid||!active.stationGroups.has(sid))continue;
   if(!state.siteVolts.has(sid))state.siteVolts.set(sid,new Set());state.siteVolts.get(sid).add(String(voltage));
  }
 }
 for(const site of active.sites){if(!state.siteVolts.has(site.FID))state.siteVolts.set(site.FID,new Set());for(const u of site.volts||[]){if(Number.isFinite(Number(u))&&Number(u)>0)state.siteVolts.get(site.FID).add(String(u));}}
 const parts=new Map(),table=active.t('ElmLnesec');if(table){const attrs=table.Attributes,fi=attrs.indexOf('FID'),fold=attrs.indexOf('fold_id'),typ=attrs.indexOf('typ_id'),f=attrs.indexOf('fline'),idx=attrs.indexOf('index');for(const r of table.Values){const id=String(r[fold]);if(!parts.has(id))parts.set(id,[]);parts.get(id).push({id:String(r[fi]),type:String(r[typ]),factor:r[f],index:Number(r[idx])});}}
 const totals={all:active.lines.length,covered:0,excel:0,summerMatches:0,capacityMissing:0,sections:0,voltageMismatch:0,unverifiedOperational:0};
 for(const line of active.lines){const base=active.get('TypLne',line.typ_id);const rows=parts.get(line.FID)||[];const entries=rows.length?rows:[{id:null,type:line.typ_id,factor:line.fline,index:0}];
  const segs=entries.map(item=>{const t=active.get('TypLne',item.type),I=Number(t?.sline),F=Number(item.factor),LF=Number(line.fline),voltage=Number(line.voltage);const current=I>0&&F>0&&LF>0?I*F*(rows.length?LF:1):null;
   return {id:item.id,type:item.type,conductor:t?.loc_name||null,nominalCurrentKA:current,nominalMVA:current&&voltage>0?Math.sqrt(3)*voltage*current:null,rawCurrentKA:I,factor:F,lineFactor:LF,index:item.index};}).sort((a,b)=>a.index-b.index);
  const lim=segs.filter(x=>x.nominalCurrentKA>0).sort((a,b)=>a.nominalCurrentKA-b.nominalCurrentKA)[0]||null;
  const nominal=lim?.nominalMVA??null;
  if(rows.length)totals.sections++;
  if(nominal!==null)totals.covered++;else totals.capacityMissing++;
  const xl=EMBEDDED[line.FID]||null;let excel=null,match=false,reason='Bu hat 315 kayıtlık envanterde yer almıyor';
  if(xl){totals.excel++;match=Number(xl[1])===Number(line.voltage)&&Number.isFinite(nominal)&&Math.abs(nominal-Number(xl[4]))<=1;
   if(match){totals.summerMatches++;reason='FID + gerilim + nominal/yaz kapasitesi uyumlu';}else {reason='FID eşleşti; gerilim/kapasite farklı, mevsimsel kayıt bu model için uygulanmaz';totals.voltageMismatch++;}
   excel={name:xl[0],voltage:xl[1],stationA:xl[2],stationB:xl[3],summerMVA:xl[4],winterMVA:xl[5],operationalCandidateMVA:xl[6],matched:match,reason};
   if(xl[6]!==null)totals.unverifiedOperational++;
  }
  state.capacity.set(line.FID,{id:line.FID,name:line.loc_name,voltage:line.voltage,type:base?.loc_name||'',nominalMVA:nominal,nominalCurrentKA:lim?.nominalCurrentKA??null,limitSection:lim?.id||null,sections:segs,excel,quality:nominal===null?'CAPACITY_UNAVAILABLE':rows.length?'SECTION_LIMITED':'DGS_MAIN_TYPE'});
 }
 state.modelReport=totals;
}
function stationVisible(site,selected){setup();if(!selected||!selected.size)return false;const levels=state.siteVolts.get(site.FID)||site.volts||new Set();return [...levels].some(v=>selected.has(String(v)));}
function isTerminalRestored(id){return state.restoredEnds.has(String(id));}
function refreshRestoredEnds(){state.restoredEnds.clear();if(!active||!$53('v53AutoTerm')?.checked)return;for(const [fid,on] of v4.overrides){const l=active.lineById(fid);if(!l||Number(l.outserv)!==1||Number(on)!==0)continue;for(const key of ['bus1','bus2']){const tid=active.get('StaCubic',l[key])?.fold_id,t=tid&&active.get('ElmTerm',tid);if(t&&Number(t.outserv)===1)state.restoredEnds.add(String(tid));}}}
function transformerVisible(r,selected){if(!selected.size)return false;const typ=active?.get('TypTr2',r.typ_id);if(!typ)return false;return [typ.utrn_h,typ.utrn_l].some(v=>selected.has(String(Number(v))));}
function capFor(line){setup();if(!line)return null;return state.capacity.get(typeof line==='string'?line:line.FID)||null;}
function capacityLimit(line,season){const c=capFor(line);if(!c)return null;const manual=v4.capacities.get(c.id),k=season||$53('v4Season')?.value||'nominal';if(k==='nominal')return c.nominalCurrentKA>0?{currentKA:c.nominalCurrentKA,mva:c.nominalMVA,source:'DGS nominal akım · sınırlayıcı kesit',kind:k,section:c.limitSection}:null;
 if(manual&&Number(manual[k])>0){const mva=Number(manual[k]);return {mva,currentKA:mva/(Math.sqrt(3)*c.voltage),source:'Kullanıcı MVA parametresi',kind:k,section:null};}
 if(k==='operational')return null; // Unverified Excel values (incl. placeholder 29) are never authoritative operating limits.
 const mva=k==='summer'?c.excel?.summerMVA:c.excel?.winterMVA;
 if(c.excel?.matched&&Number(mva)>0)return {mva:Number(mva),currentKA:Number(mva)/(Math.sqrt(3)*c.voltage),source:'315 hatlık Excel envanteri · FID/gerilim/nominal kapasite doğrulandı',kind:k,section:c.limitSection};
 return null;
}
function loadingFromSet(set,line,season){if(!active||!line||!set||set.modelId!==active.rid)return null;const limit=capacityLimit(line,season);if(!limit||!(limit.currentKA>0))return null;
 let max=null;
 for(const end of ['from','to']){
  const amp=value(set,'ElmLne',line.FID,'I',end),p=value(set,'ElmLne',line.FID,'P',end),q=value(set,'ElmLne',line.FID,'Q',end);
  let current=amp===null?null:amp/1000,quality=amp!==null?'SOLVED_TERMINAL_VOLTAGE':null;
  if(current===null&&p!==null&&q!==null){const cub=active.get('StaCubic',end==='from'?line.bus1:line.bus2),term=cub?.fold_id,v=value(set,'ElmTerm',term,'V','');if(v>0){current=Math.hypot(p,q)/(Math.sqrt(3)*v);quality='DIRECT_TERMINAL_VOLTAGE';}}
  if(!(current>=0&&Number.isFinite(current)))continue;
  const o={percent:100*current/limit.currentKA,currentKA:current,amp:current*1000,p,q,terminal:end,quality,limit,capacity:limit.mva,source:limit.source,season:limit.kind};
  if(!max||o.percent>max.percent)max=o;
 }
 return max;
}
function loading(line,season){if(!active||!line||v4LineOut(line))return null;let set=resultSet();if(!set)return null;return loadingFromSet(set,line,season);}
window.LineCapacityEngine={get:capFor,capacityLimit,loadingFromSet,loading,build:setup,report:()=>{setup();return state.modelReport;},embeddedSize:Object.keys(EMBEDDED).length};
window.YTBS_V53={stationVisible,transformerVisible,isTerminalRestored,refreshRestoredEnds};
window.v4Loading=loading; // One capacity and current engine for map, lightning, SLD and analysis.
// The legacy result cards and P/Q/loading map coloring consume latestResult(metric='loading').
// Expose the same solved-current-based value there; never invent a loading row when absent.
const previousLatestResult=window.latestResult;
window.latestResult=function(cls,id,metric,terminal=null){
 if(cls==='ElmLne'&&metric==='loading'){
  const line=active?.lineById(id),set=resultSet();
  if(!line||!set)return null;
  if(v4LineOut(line)&&set===v4.scenario)return null;
  const o=loadingFromSet(set,line,$53('v4Season')?.value||'nominal');
  if(!o)return null;
  return {cls,id,metric,value:o.percent,unit:'%',terminal:o.terminal,quality:'CALCULATED',usable:true,source:'DGS/Excel kapasitesi + '+o.quality,orientation:'nominal_or_selected_capacity',timestamp:active.date+' '+active.time};
 }
 return previousLatestResult(cls,id,metric,terminal);
};
function patchSeason(){const el=$53('v4Season');if(!el)return;const options=[['nominal','Nominal akım (DGS)'],['summer','Yazlık (Excel / kullanıcı)'],['winter','Kışlık (Excel / kullanıcı)'],['operational','İşletme (yalnız doğrulanmış manuel)']];el.innerHTML=options.map(([v,t])=>`<option value="${v}">${t}</option>`).join('');el.value='nominal';el.addEventListener('change',()=>{drawMap();v42RenderLightning();refreshPanels();});}
function detailHTML(line){const c=capFor(line);if(!c)return '';const lim=capacityLimit(line);const L=loading(line);const source=c.excel?.matched?'Mevsimsel kapasite: eşleşmiş 315 hatlık Excel':'Bu hat için eşleşmiş mevsimsel kapasite yok';const manual=v4.capacities.get(line.FID);
 return `<section class="v53Detail" id="v53LineCapacity"><h4>⚡ Kapasite ve yüklenme <span class="v53Badge">${safe(c.quality)}</span></h4><div class="v53Metrics"><div><small>Nominal kapasite</small><b>${f53(c.nominalMVA)} MVA</b></div><div><small>Sınırlayıcı kesit</small><b>${safe(c.limitSection||'Ana hat türü')}</b></div><div><small>Nominal akım</small><b>${f53(c.nominalCurrentKA!==null?1000*c.nominalCurrentKA:null)} A</b></div><div><small>Nominal yüklenme</small><b>${f53(loading(line,'nominal')?.percent)} %</b></div><div><small>Yaz kapasitesi</small><b>${f53(capacityLimit(line,'summer')?.mva)} MVA</b></div><div><small>Kış kapasitesi</small><b>${f53(capacityLimit(line,'winter')?.mva)} MVA</b></div></div><div class="mini">${safe(source)} · ${lim?safe(lim.source):'Nominal akım yok'} · ${L?safe(L.quality):'Hesaplanmış terminal akımı yok'}.</div>${c.excel?.operationalCandidateMVA?`<div class="mini">Excel işletme kapasitesi adayı: ${f53(c.excel.operationalCandidateMVA)} MVA · kaynağın işletme sınırı anlamı bağımsız doğrulanmadı.</div>`:''}<details><summary>Hat parçaları ve kaynak veriler</summary><div class="v53Sections">${c.sections.map(s=>`<div>${safe(s.id||'Ana tür')} · ${safe(s.conductor)} · ${f53(s.nominalCurrentKA!==null?1000*s.nominalCurrentKA:null)} A · ${f53(s.nominalMVA)} MVA</div>`).join('')}</div></details></section>`;
}
function refreshDetail(){if(!selectedLine||!active||currentView!=='map')return;const box=$53('mapDetail'),line=active.lineById(selectedLine);if(!box||!line)return;box.querySelector('#v53LineCapacity')?.remove();box.insertAdjacentHTML('beforeend',detailHTML(line));}
const oldSelect=window.selectLine;window.selectLine=function(id){let r=oldSelect(id);refreshDetail();return r;};
// Base + scenario displays are not rewritten; a failed / pending scenario has no load results.
function renderCapacityTable(){const target=$53('v53CapTable'),stats=$53('v53CapStats');if(!target||!stats)return;if(!active){stats.textContent='Önce DGS JSON yükleyin.';target.innerHTML='';return;}setup();const report=state.modelReport,query=norm(state.query.trim());stats.textContent=`${report.all} hat · ${report.covered} nominal kapasite · ${report.excel} Excel eşleşmesi · ${report.summerMatches} yazlık/nominal uyumu · ${report.sections} kesitli hat. İşletme kapasitesi Excel adayları doğrulanmış limit olarak kullanılmaz.`;
 const filtered=active.lines.filter(l=>{const c=capFor(l);return (!query||norm(l.FID+' '+l.loc_name+' '+c.excel?.name).includes(query))&&(state.filter==='all'||state.filter==='excel'&&c.excel?.matched||state.filter==='missing'&&!c.nominalMVA);});const pp=50,npage=Math.max(1,Math.ceil(filtered.length/pp));state.page=Math.min(npage-1,Math.max(0,state.page));const arr=filtered.slice(state.page*pp,(state.page+1)*pp);
 target.innerHTML=`<div class="v53TableWrap"><table><thead><tr><th>Hat</th><th>Gerilim</th><th>Nominal A</th><th>Nominal MVA</th><th>Yaz MVA</th><th>Kış MVA</th><th>Sınırlayıcı kesit</th><th>Nominal yüklenme</th><th>Kaynak</th></tr></thead><tbody>${arr.map(l=>{const c=capFor(l),ld=loading(l,'nominal');return `<tr data-v53line="${safe(l.FID)}"><td>${safe(l.loc_name)}</td><td>${f53(l.voltage)} kV</td><td>${f53(c.nominalCurrentKA!==null?1000*c.nominalCurrentKA:null)}</td><td>${f53(c.nominalMVA)}</td><td>${f53(capacityLimit(l,'summer')?.mva)}</td><td>${f53(capacityLimit(l,'winter')?.mva)}</td><td>${safe(c.limitSection||'Ana hat türü')}</td><td>${f53(ld?.percent)}${ld?' %':''}</td><td>${c.excel?.matched?'Excel + DGS':'DGS nominal'}</td></tr>`;}).join('')}</tbody></table></div><div class="v53Pager"><button class="sm" id="v53CapPrev" ${state.page===0?'disabled':''}>←</button><span>${f53(filtered.length)} hat · Sayfa ${state.page+1}/${npage}</span><button class="sm" id="v53CapNext" ${state.page>=npage-1?'disabled':''}>→</button></div>`;
 target.querySelector('#v53CapPrev').onclick=()=>{state.page--;renderCapacityTable();};target.querySelector('#v53CapNext').onclick=()=>{state.page++;renderCapacityTable();};target.querySelectorAll('[data-v53line]').forEach(tr=>tr.onclick=()=>{selectLine(tr.dataset.v53line);setView('map');focusLine(tr.dataset.v53line);});
}
function refreshPanels(){if(currentView==='analysis')renderCapacityTable();if(selectedLine)refreshDetail();}
function initPanels(){const analysis=$53('view-analysis');const panel=document.createElement('section');panel.id='v53CapacityAnalysis';panel.className='panel v53CapPanel';panel.innerHTML='<div class="v53Title"><h3>Hat kapasiteleri ve nominal yüklenme</h3><span class="v53Badge">Kaynak: DGS TypLne / ElmLnesec + 315 hatlık Excel</span></div><p class="mini">Nominal kapasite: √3 × Un × sınırlandırıcı kesit akımı. Yüklenme yalnız geçerli hesap sonucu ve terminal akımı varsa gösterilir. Mevsimsel Excel değerleri model FID/gerilim/nominal kapasitesi ile tekrar doğrulanır. 29 işletme alanı tarih yer tutucusu olabileceğinden kullanılmaz.</p><div class="v53CapBar"><input type="search" id="v53CapSearch" placeholder="Hat veya TM adıyla ara" aria-label="Hat kapasitesi ara"><select id="v53CapFilter" aria-label="Kapasite kaydı filtresi"><option value="all">Tüm hatlar</option><option value="excel">Excel eşleşenler</option><option value="missing">Nominal kapasitesi eksikler</option></select><button class="sm" id="v53CapRefresh">Yenile</button></div><div id="v53CapStats" class="mini" role="status"></div><div id="v53CapTable"></div>';
 analysis.append(panel);$53('v53CapSearch').oninput=e=>{state.query=e.target.value;state.page=0;renderCapacityTable();};$53('v53CapFilter').onchange=e=>{state.filter=e.target.value;state.page=0;renderCapacityTable();};$53('v53CapRefresh').onclick=renderCapacityTable;
 const map=$53('view-map');const info=document.createElement('aside');info.id='v53MapLegend';info.className='v53Legend';info.innerHTML='⚡ <strong>Hat yüklenmesi:</strong> JSON nominal akımı varsayılan · yaz/kış yalnız doğrulanmış Excel eşleşmesi veya kullanıcı girişi · yüzde değerler deneysel AC sonuca bağlıdır. <button class="sm" id="v53ShowCap">Hat kapasitesi listesi</button>';
 map.querySelector('#geoMode')?.prepend(info);$53('v53ShowCap').onclick=()=>{setView('analysis');renderCapacityTable();$53('v53CapacityAnalysis').scrollIntoView({block:'start'});};
 const cb=$53('v4HoverZoom');if(cb){cb.checked=false;cb.closest('label')?.classList.add('v53OldHoverHidden');}
}
function spatialKey(){if(!active)return '';return [active.rid,mapCam.w,mapCam.h,mapCam.zoom,mapCam.panX,mapCam.panY,cfg.v4Geometry,$53('mapArea')?.value||'',Array.from(selectedVolts()).sort().join(','),$53('toggleOut')?.checked,$53('toggleSites')?.checked].join('|');}
function putGrid(grid,cx,cy,rec){const k=cx+'|'+cy;let a=grid.get(k);if(!a)grid.set(k,a=[]);a.push(rec);}
function makeSpatial(){const key=spatialKey();if(key===state.spatialKey&&state.spatial)return state.spatial;const grid=new Map(),cell=38,allowed=selectedVolts(),area=$53('mapArea')?.value;
 for(const line of active.lines){if(!visibleLine(line,allowed,area))continue;let pts=(cfg.v4Geometry==='simple'?null:line.coords)||[line.siteA?.lat!=null?[line.siteA.lat,line.siteA.lon]:null,line.siteB?.lat!=null?[line.siteB.lat,line.siteB.lon]:null].filter(Boolean);if(pts.length<2)continue;const step=Math.max(1,Math.floor(pts.length/145));let sampled=pts.filter((_,i)=>i%step===0||i===pts.length-1);for(let i=1;i<sampled.length;i++){const [a,b]=[coordsToPx(sampled[i-1][1],sampled[i-1][0]),coordsToPx(sampled[i][1],sampled[i][0])],minx=Math.min(a[0],b[0])-10,maxx=Math.max(a[0],b[0])+10,miny=Math.min(a[1],b[1])-10,maxy=Math.max(a[1],b[1])+10;if(maxx<0||minx>mapCam.w||maxy<0||miny>mapCam.h)continue;const rec={kind:'line',line,a,b};for(let x=Math.max(0,Math.floor(minx/cell));x<=Math.min(Math.ceil(mapCam.w/cell),Math.floor(maxx/cell));x++)for(let y=Math.max(0,Math.floor(miny/cell));y<=Math.min(Math.ceil(mapCam.h/cell),Math.floor(maxy/cell));y++)putGrid(grid,x,y,rec);}}
 if($53('toggleSites')?.checked)for(const site of active.sites){if(site.lat==null||site.lon==null||area&&site.ytmId!==area||!stationVisible(site,allowed))continue;let p=coordsToPx(site.lon,site.lat),x=Math.floor(p[0]/cell),y=Math.floor(p[1]/cell);for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++)putGrid(grid,x+i,y+j,{kind:'site',site,p});}
 state.spatialKey=key;state.spatial={grid,cell};return state.spatial;
}
function tipText(rec){if(rec.kind==='site'){let s=rec.site,levels=[...(state.siteVolts.get(s.FID)||[])].map(Number).sort((a,b)=>b-a);return `<strong>${safe(s.loc_name)}</strong><div class="mini">${safe(levels.join(' / '))} kV · ${f53(active.stationLines.get(s.FID)?.length||0)} bağlı hat · ${f53(s.transformerCount)} trafo</div><small>TM ayrıntısı için tıklayın</small>`;}
 const l=rec.line,load=loading(l),p=latestResult('ElmLne',l.FID,'P','from'),c=capFor(l);return `<strong>${safe(l.loc_name)}</strong><div class="mini">${safe(l.voltage)} kV · ${v4LineOut(l)?'Servis dışı':'Serviste'}</div><div class="v53TipValues"><span>Aktif güç</span><b>${p?f53(p.value)+' MW':'Veri yok'}</b><span>Nominal kapasite</span><b>${f53(c?.nominalMVA)} MVA</b><span>Nominal yüklenme</span><b>${load?f53(loading(l,'nominal')?.percent)+' %':'Hesap yok'}</b></div><small>${load?'Deneysel hesap · '+safe(load.quality):'Yüklenme için geçerli hesap gerekli'} · İncelemek için tıklayın</small>`;
}
function onPointer(e){if(!active||currentView!=='map'||mapMode!=='geo'||mapCam.dragging||e.buttons)return;const now=performance.now();if(now-state.lastTip<55)return;state.lastTip=now;const rect=$53('networkCanvas').getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top;if(x<0||y<0||x>rect.width||y>rect.height)return;
 const {grid,cell}=makeSpatial();const candidates=grid.get(Math.floor(x/cell)+'|'+Math.floor(y/cell))||[];let best=null,dist=13;for(const c of candidates){let d;if(c.kind==='site')d=Math.hypot(x-c.p[0],y-c.p[1]);else {let [ax,ay]=c.a,[bx,by]=c.b,vx=bx-ax,vy=by-ay,z=vx*vx+vy*vy,t=z?Math.max(0,Math.min(1,((x-ax)*vx+(y-ay)*vy)/z)):0;d=Math.hypot(x-ax-t*vx,y-ay-t*vy);}if(d<dist){dist=d;best=c;}}
 const tip=$53('v53Tip');if(!best){tip.hidden=true;state.hover=null;return;}state.hover=best;tip.hidden=false;tip.innerHTML=tipText(best);tip.style.left=Math.min(rect.width-275,Math.max(8,x+15))+'px';tip.style.top=Math.min(rect.height-145,Math.max(8,y+15))+'px';}
function initHover(){const canvas=$53('networkCanvas'),wrap=$53('mapWrap');if(!canvas||!wrap)return;const tip=document.createElement('div');tip.id='v53Tip';tip.className='v53Tip';tip.hidden=true;tip.setAttribute('role','tooltip');wrap.append(tip);canvas.addEventListener('pointermove',onPointer,{passive:true});canvas.addEventListener('pointerleave',()=>{tip.hidden=true;});canvas.addEventListener('pointerdown',()=>{tip.hidden=true;});}
function preflight(){if(!active)return null;refreshRestoredEnds();const changed=[...v4.overrides].filter(([id])=>active.lineById(id)),on=changed.filter(([id,v])=>Number(v)===0&&Number(active.lineById(id).outserv)===1);let text=on.length?`${on.length} başlangıçta servis dışı hat servise alındı. Hat servis durumu değişti; uç kesicilerin pozisyonu ayrıca korunur.`:'Hat servis senaryosu.';
 if(on.length&&v4.scenario&&!ScenarioController.pending){const missing=on.filter(([id])=>!v4.scenario.index?.get(`ElmLne|${id}|P|from`)?.length);if(missing.length)text+=' Genel çözüm yakınsamış olsa da servise alınan '+missing.length+' hat için akış sonucu oluşmadı; uç anahtarları ve hesap grafı incelenmeli.';}const samples=[];for(const [id] of on.slice(0,5)){const l=active.lineById(id),ends=[l.bus1,l.bus2].map(c=>active.get('StaCubic',c)?.fold_id||null);const disabled=ends.filter(tid=>tid&&Number(active.get('ElmTerm',tid)?.outserv)===1);samples.push({id,terminals:ends,terminalsResolved:ends.every(Boolean),disabledTerminals:disabled,restoredTerminals:disabled.filter(tid=>state.restoredEnds.has(tid))});if(disabled.length)text+=' '+l.loc_name+': '+disabled.length+' hat uç terminali kaynak modelde servis dışı; '+(state.restoredEnds.size?'senaryoda geçici etkinleştirildi.':'senaryoda etkinleştirilmedi.')+' Bağlı kesici ve ayırıcılar otomatik kapatılmaz.';if(!ends.every(Boolean))text+=' '+l.loc_name+': uç terminali çözülemedi.';}
 return {count:on.length,text,samples};}
function showPreflight(){const m=$53('v53ScenarioCheck');if(!m||!active)return;const f=preflight();m.textContent=f?.count?f.text:'Senaryo: Kaynak hat servis durumu ve sanal anahtar pozisyonu ayrı tutulur.';m.className='v53Preflight'+(f?.samples.some(x=>!x.terminalsResolved)?' v53Warn':'');}
function initPreflight(){const map=$53('view-map'),box=document.createElement('aside');box.id='v53ScenarioCheck';box.className='v53Preflight';map.querySelector('#geoMode')?.prepend(box);const lbl=document.createElement('label');lbl.className='v53TerminalToggle';lbl.innerHTML='<input id="v53AutoTerm" type="checkbox"> Servise alınan hatların servis dışı uç terminallerini yalnızca sanal hesap grafında etkinleştir (anahtar pozisyonları değişmez)';box.after(lbl);lbl.querySelector('input').onchange=()=>{refreshRestoredEnds();if(active&&(v4.overrides.size||v42.switchOverrides.size))ScenarioController.touch();showPreflight();};}
function renderSldCapacity(){const box=$53('v53SldCapacity'),fid=$53('sldLine')?.value;
 if(!box)return;const l=active?.lineById(fid);if(!l){box.innerHTML='<span class="mini">SLD kapasite ve akım bilgisi için bir bağlı hat seçin.</span>';return;}
 const c=capFor(l),ld=loading(l,'nominal'),su=capacityLimit(l,'summer'),wi=capacityLimit(l,'winter');
 box.innerHTML=`<b>${safe(l.loc_name)}</b> · ${f53(c?.voltage)} kV <div class="v53SldCapGrid"><span>Nominal sınır: <b>${f53(c?.nominalMVA)} MVA</b></span><span>Yaz: <b>${f53(su?.mva)} MVA</b></span><span>Kış: <b>${f53(wi?.mva)} MVA</b></span><span>Nominal yüklenme: <b>${f53(ld?.percent)} %</b></span></div><small>${safe(c?.limitSection||'Ana hat türü')} · ${ld?'Deneysel AC-PQ terminal akımı':'Bu hat için kullanılabilir hesap yok'} · işletme limiti bağımsız doğrulanmadı.</small>`;
}
function initSldCapacity(){const anchor=$53('sldInfo'),sel=$53('sldLine');if(!anchor||!sel)return;const el=document.createElement('aside');el.id='v53SldCapacity';el.className='v53Detail v53SldCap';anchor.after(el);sel.addEventListener('change',renderSldCapacity);renderSldCapacity();}
function refresh(){if(!active)return;setup();showPreflight();if(currentView==='analysis')renderCapacityTable();if(currentView==='map'&&selectedLine)refreshDetail();if(currentView==='sld')renderSldCapacity();}
const prevSetView=window.setView;window.setView=function(v){
 if(v==='sld'&&active&&selectedLine){const line=active.lineById(selectedLine);if(line?.siteA?.FID){const curr=active.stationLines.get(selectedSite)||[];if(!curr.some(l=>l.FID===selectedLine)){selectedSite=line.siteA.FID;$53('sldStation').value=selectedSite;}}}
 const out=prevSetView(v);if(v==='analysis')renderCapacityTable();if(v==='map'){showPreflight();refreshDetail();}
 if(v==='sld')setTimeout(()=>{const sel=$53('sldLine');if(sel&&selectedLine&&[...sel.options].some(opt=>opt.value===selectedLine))sel.value=selectedLine;renderSldCapacity();},0);
 return out;
};
const prevActivate=window.activateModel;window.activateModel=function(m){state.model=null;state.spatial=null;const out=prevActivate(m);if(m)setup();refreshRestoredEnds();return out;};
const prevDrawMap=window.drawMap;window.drawMap=function(){const out=prevDrawMap();if(active){showPreflight();}return out;};
const prevSCApply=window.ScenarioController.apply;window.ScenarioController.apply=function(...args){const out=prevSCApply.apply(this,args);if(out){refreshRestoredEnds();showPreflight();}return out;};
const prevSCRun=window.ScenarioController.run;window.ScenarioController.run=function(...args){showPreflight();refreshRestoredEnds();const r=prevSCRun.apply(this,args);return r;};
INFO.map+=(INFO.map||'').includes('v5.3 · Nominal')?'':'<h3>v5.3 · Nominal ve mevsimsel kapasite</h3><p>Nominal akım DGS TypLne.sline değerinden ve sınırlayıcı ElmLnesec kesitinden elde edilir. 315 hatlık kapasite envanteri gömülüdür; diğer hatlar için mevsimsel kapasite uydurulmaz. Yüklenme, geçerli yük akışının uç akımlarına dayalı deneysel bir göstergedir. Kaynak işletme limitleri bağımsız doğrulanmamıştır.</p>';
INFO.metrics+='<h3>v5.3 hesap kapsamı</h3><p>Yüklenme için iki uç akımı ve sınırlayıcı nominal akım kullanılır. Uç bara gerilimi yoksa nominal gerilimle sahte akım hesaplanmaz. Newton gerçek ulusal modelde yakınsamadığında yaklaşık çözücü sonuçları ayrı etiketlenir. Tek DGS JSON dosyası kullanılır.</p>';
const prevNotify=window.v4Notify;window.v4Notify=function(msg,bad=false){
 if(active&&v4.scenario&&String(msg).includes('Senaryo hesabi bitti')){const missing=[...v4.overrides].filter(([id,to])=>Number(to)===0&&Number(active.lineById(id)?.outserv)===1&&!v4.scenario.index?.get(`ElmLne|${id}|P|from`)?.length);if(missing.length){msg+=' ⚠ '+missing.map(([id])=>active.lineById(id)?.loc_name||id).join(', ')+': servisli senaryoda bile hat akışı çözülemedi. Kaynakta uç terminalleri servis dışı ve/veya kesiciler açık olabilir; anahtar topolojisini SLD’de inceleyin.';bad=true;}}
 return prevNotify(msg,bad);};
document.title='YTBS | Şebeke Görüntüleyici v5.4';document.querySelector('.apphead h1').textContent='YTBS Şebeke Görüntüleyici v5.4';$53('footerRight').textContent='YTBS · Tek HTML · v5.3 · DGS nominal kapasite + deneysel AC/DC';
patchSeason();initPanels();initHover();initPreflight();initSldCapacity();
window.YTBS_V53_TEST={state:()=>({model:active?.name,report:state.modelReport,hoverCount:state.spatial?.grid.size||0,scenario:preflight(),selected:selectedLine,season:$53('v4Season')?.value}),line:id=>capFor(id),loading:id=>loading(active?.lineById(id)),fromSet:(set,id,s)=>loadingFromSet(set,active?.lineById(id),s),station:(id,volts)=>stationVisible(active?.siteById(id),new Set(volts)),refresh};
})();
/* Optional 66kV+ lossless DC screening. Not a replacement for AC, reactive power or OPF. */
(function(){'use strict';
const box=()=>document.getElementById('v53DcResult');const nf=x=>Number.isFinite(x)?x.toLocaleString('tr-TR',{maximumFractionDigits:2}):'—';
function solveIslandDC(input){const n=input.busIds.length,slack=input.slack,base=input.baseMVA||100;if(!(n>1&&slack>=0&&slack<n))return {status:'NO_SLACK',n};
 const adj=Array.from({length:n},()=>[]),diag=new Float64Array(n),edgeList=[];
 for(const e of input.edges){const X=Number(e.x);if(!(X>0&&Number.isFinite(X))||!(e.a>=0&&e.b>=0&&e.a<n&&e.b<n))return {status:'INVALID_BRANCH',id:e.id,x:e.x,n};if(e.a===e.b)continue;const b=1/X;diag[e.a]+=b;diag[e.b]+=b;adj[e.a].push([e.b,b]);adj[e.b].push([e.a,b]);edgeList.push({e,b});}
 const b=new Float64Array(n);for(let i=0;i<n;i++)b[i]=Number(input.injections[i][0])/base;
 const x=new Float64Array(n),r=Float64Array.from(b),p=new Float64Array(n),z=new Float64Array(n),q=new Float64Array(n),mul=(vec,out)=>{for(let i=0;i<n;i++){if(i===slack){out[i]=vec[i];continue;}let w=diag[i]*vec[i];for(const [j,g] of adj[i])w-=g*vec[j];out[i]=w;}};
 r[slack]=0;for(let i=0;i<n;i++){if(i===slack)continue;if(!(diag[i]>0))return {status:'SINGULAR',id:input.busIds[i],n};z[i]=r[i]/diag[i];p[i]=z[i];}
 let rho=0;for(let i=0;i<n;i++)rho+=r[i]*z[i];const norm=()=>Math.max(...r.map(Math.abs));const bnorm=Math.max(1e-10,...b.map(Math.abs));let iterations=0;
 for(;iterations<Math.min(20000,Math.max(500,n*10));iterations++){
  if(norm()<=Math.max(1e-8,bnorm*1e-7))break;
  mul(p,q);let den=0;for(let i=0;i<n;i++)den+=p[i]*q[i];if(!(den>0))return {status:'SINGULAR_PCG',iterations,n};const alpha=rho/den;
  for(let i=0;i<n;i++){x[i]+=alpha*p[i];r[i]-=alpha*q[i];z[i]=i===slack?0:r[i]/diag[i];}
  let rhoNew=0;for(let i=0;i<n;i++)rhoNew+=r[i]*z[i];const beta=rho>0?rhoNew/rho:0;for(let i=0;i<n;i++)p[i]=z[i]+beta*p[i];rho=rhoNew;
 }
 let residual=norm(),limits=Math.max(1e-8,bnorm*1e-7);if(!(residual<=limits))return{status:'NOT_CONVERGED',residualPU:residual,iterations,n};
 const branches=edgeList.map(({e,b})=>({id:e.id,cls:e.cls,from:input.busIds[e.a],to:input.busIds[e.b],pMW:(x[e.a]-x[e.b])*b*base}));
 return {status:'CONVERGED_DC',iterations,residualPU:residual,n,slackBus:input.busIds[slack],angles:input.busIds.map((id,i)=>({id,angleRad:x[i]})),branches,remarks:'Kayıplar, Q, gerilim büyüklüğü ve faz kaydırma atlanır; 66 kV+ indirgenmiş model.'};
}
function run(){if(!active)throw Error('Önce DGS JSON dosyasını yükleyin.');const hasScenario=!!(v4.overrides.size||v42.switchOverrides.size);const net=hasScenario?YTBS_V52_TEST.graphScenario():YTBS_V52_TEST.graph(),sets=net.islands.map(solveIslandDC);return {model:active.name,modelFingerprint:YTBS_V43_TEST.fingerprint(),revision:ScenarioController.revision,method:'DC_LOSSLESS_REDUCED_GE66',scenario:hasScenario,scope:'66 kV+ indirgenmiş şebeke',results:sets,findings:net.findings};}
function runUI(){const el=box();if(!el)return;el.textContent='DC taraması çalışıyor…';try{const r=run();const yes=r.results.filter(x=>x.status==='CONVERGED_DC');let rows=yes.flatMap(x=>x.branches.filter(b=>b.cls==='ElmLne')).sort((a,b)=>Math.abs(b.pMW)-Math.abs(a.pMW)).slice(0,45);
 el.innerHTML=`<div class="v53DcBanner">${yes.length}/${r.results.length} ada DC hesabı · ${r.scenario?'Sanal senaryo':'Başlangıç'} · <b>DC yaklaşık tarama; AC gerilim/Q/kayıp/N-1 sonucu değildir.</b></div><div class="v53TableWrap"><table><thead><tr><th>Hat</th><th>DC P from (MW)</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${h(active.lineById(x.id)?.loc_name||x.id)}</td><td>${nf(x.pMW)}</td></tr>`).join('')}</tbody></table></div>`;
 }catch(e){el.textContent='DC taraması yapılamadı: '+String(e.message);}}
const root=document.getElementById('v53CapacityAnalysis');if(root){const sec=document.createElement('section');sec.className='v53DcSection';sec.innerHTML='<h3>DC yük akışı · hızlı yaklaşık tarama</h3><p class="mini">66 kV+ indirgenmiş modelden kayıpsız DC P/açı çözümü. Q, işletme V, termik yüklenme, AC ve OPF sonucu üretmez. AC motoruna otomatik geri dönüş olarak kullanılmaz.</p><button id="v53DcRun" class="sm">DC taramasını çalıştır</button><div id="v53DcResult" class="mini" role="status"></div>';root.append(sec);sec.querySelector('button').onclick=runUI;}
window.DCFlowEngine={run,solveIsland:solveIslandDC};
})();

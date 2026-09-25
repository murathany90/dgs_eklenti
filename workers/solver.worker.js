
/* Tarayıcı içi AC-PQ deneysel yük akışı: 100 MVA bazında, indirgenmiş 66 kV+ şebeke.
   Amaç: model girdilerinden sınırlı AC kestirim. PowerFactory eşdeğerliği iddia edilmez.
   Çözüm: sparse Ybus, B' = B'' yaklaşık matrisleri, CG, ardışık P/Q düzeltmeleri.
   Farklı adalar ayrı çözülür; başarısız ada için satır üretilmez. */
'use strict';
const finite=v=>typeof v==='number'&&Number.isFinite(v);
function solveIsland(input){
 const {busIds,edges,injections,shunts=[],slack,pv=[],slackSetpoint=1,baseMVA=100,iterations=110,threshold=0.005}=input;
 const n=busIds.length, V=new Float64Array(n).fill(1), ang=new Float64Array(n), p=new Float64Array(n),q=new Float64Array(n);
 const yr=new Float64Array(n),yi=new Float64Array(n),neighbors=Array.from({length:n},()=>[]),Bdiag=new Float64Array(n),Boff=Array.from({length:n},()=>[]);
 const pvSet=new Map(pv.map(x=>[x.bus,x.setpoint]));for(let i=0;i<n;i++){p[i]=injections[i][0]/baseMVA;q[i]=injections[i][1]/baseMVA;if(pvSet.has(i))V[i]=pvSet.get(i);}V[slack]=slackSetpoint;
 let bad=0;
 const branches=[];
 for(const e of edges){
   const a=e.a,b=e.b,R=e.r,X=e.x,bc=e.bc||0,t=e.tap||1;
   if(!(R>=0&&X>0&&finite(R)&&finite(X)&&R+X>0)){bad++;continue;}
   const div=R*R+X*X, gr=R/div,gi=-X/div;
   yr[a]+=gr/(t*t); yi[a]+=(gi+bc/2)/(t*t);yr[b]+=gr;yi[b]+=gi+bc/2;
   neighbors[a].push({to:b,gr:-gr/t,gi:-gi/t});neighbors[b].push({to:a,gr:-gr/t,gi:-gi/t});
   let w=X/div;if(w>0){Bdiag[a]+=w/(t*t);Bdiag[b]+=w;Boff[a].push([b,-w/t]);Boff[b].push([a,-w/t]);}
   branches.push({...e,gr,gi});
 }
 for(let i=0;i<n;i++){if(shunts[i])yi[i]+=shunts[i]/baseMVA;}
 if(bad)return {status:'INVALID_PARAMETERS',reason:`${bad} dalın R/X parametresi geçersiz`,buses:n,lines:edges.length};
 if(!(n>1&&slack>=0&&slack<n))return {status:'NO_SLACK',buses:n,lines:edges.length};
 for(let i=0;i<n;i++)if(i!==slack&&Bdiag[i]<1e-10)return {status:'SINGULAR',reason:`${i}. barada bağlı dal yok`,buses:n,lines:edges.length};
 let ii=new Int32Array(n).fill(-1),id=[];for(let i=0;i<n;i++)if(i!==slack){ii[i]=id.length;id.push(i);}const m=id.length;
 const diag=new Float64Array(m),adj=new Array(m);for(let j=0;j<m;j++){let i=id[j];diag[j]=Bdiag[i];adj[j]=Boff[i].filter(([k])=>k!==slack).map(([k,w])=>[ii[k],w]);}
 const vId=id.filter(i=>!pvSet.has(i)), vi=new Int32Array(n).fill(-1);vId.forEach((b,j)=>vi[b]=j);
 const vDiag=new Float64Array(vId.length),vAdj=new Array(vId.length);for(let j=0;j<vId.length;j++){let i=vId[j];vDiag[j]=Bdiag[i];vAdj[j]=Boff[i].filter(([k])=>vi[k]>=0).map(([k,w])=>[vi[k],w]);}
 function cg(rhs,which='angle'){const len=which==='angle'?m:vId.length,dg=which==='angle'?diag:vDiag,nb=which==='angle'?adj:vAdj;
  const matvec=(x,y)=>{for(let j=0;j<len;j++){let z=dg[j]*x[j];for(const [k,w] of nb[j])z+=w*x[k];y[j]=z;}};
  const x=new Float64Array(len),r=new Float64Array(rhs),z=new Float64Array(len),d=new Float64Array(len),out=new Float64Array(len);let rz=0;
  for(let j=0;j<len;j++){z[j]=r[j]/dg[j];d[j]=z[j];rz+=r[j]*z[j];}
  const goal=Math.max(1e-14,rz*1e-12);if(rz<goal)return x;
  for(let k=0;k<Math.min(350,Math.max(45,len*2));k++){
   matvec(d,out);let den=0;for(let j=0;j<len;j++)den+=d[j]*out[j];if(!(den>0&&finite(den)))return null;
   const alpha=rz/den,old=rz;rz=0;
   for(let j=0;j<len;j++){x[j]+=alpha*d[j];r[j]-=alpha*out[j];z[j]=r[j]/dg[j];rz+=r[j]*z[j];}
   if(!finite(rz))return null;if(rz<goal)break;
   const beta=rz/old;for(let j=0;j<len;j++)d[j]=z[j]+beta*d[j];
  }
  return x;
 }
 const P=new Float64Array(n),Q=new Float64Array(n),pm=new Float64Array(m),qm=new Float64Array(vId.length);
 function calc(){let largest=0;
  for(let i=0;i<n;i++){let pr=yr[i]*V[i]*V[i],qr=-yi[i]*V[i]*V[i];for(const v of neighbors[i]){let theta=ang[i]-ang[v.to],c=Math.cos(theta),s=Math.sin(theta),fac=V[i]*V[v.to];pr+=fac*(v.gr*c+v.gi*s);qr+=fac*(v.gr*s-v.gi*c);}P[i]=pr;Q[i]=qr;if(i!==slack){let err=Math.max(Math.abs(p[i]-pr),pvSet.has(i)?0:Math.abs(q[i]-qr));if(err>largest)largest=err;}}
  return largest;
 }
 let err=Infinity,it=0,prev=Infinity;let damping=.78;
 for(it=0;it<iterations;it++){
  err=calc();if(!finite(err))return {status:'DIVERGED',iterations:it,buses:n,lines:edges.length};
  if(err<threshold)break;
  if(err>prev*1.7)damping=Math.max(.12,damping*.65);else damping=Math.min(.83,damping*1.04);prev=err;
  for(let j=0;j<m;j++){let i=id[j];pm[j]=(p[i]-P[i])/Math.max(.4,V[i]);}
  let dth=cg(pm);if(!dth)return {status:'SINGULAR',iterations:it,buses:n,lines:edges.length};
  for(let j=0;j<m;j++)ang[id[j]]+=Math.max(-.15,Math.min(.15,dth[j]*damping/Math.max(.5,V[id[j]])));
  calc();for(let j=0;j<vId.length;j++){let i=vId[j];qm[j]=(q[i]-Q[i])/Math.max(.4,V[i]);}
  let dv=cg(qm,'voltage');if(!dv)return {status:'SINGULAR',iterations:it,buses:n,lines:edges.length};
  for(let j=0;j<vId.length;j++){let i=vId[j];V[i]+=Math.max(-.035,Math.min(.035,dv[j]*damping));if(!(V[i]>.65&&V[i]<1.45))return {status:'VOLTAGE_OUT_OF_RANGE',iterations:it,buses:n,lines:edges.length};}
 }
 err=calc();if(!(err<threshold))return {status:'NO_CONVERGENCE',iterations:it,misMW:err*baseMVA,buses:n,lines:edges.length};
 const results=[];
 for(const e of branches){let a=e.a,b=e.b,va=V[a],vb=V[b],theta=ang[a]-ang[b],c=Math.cos(theta),s=Math.sin(theta);
  let gd=e.gr,bd=e.gi,bc=e.bc||0,t=e.tap||1;
  let pf=(va*va*gd/(t*t)-va*vb/t*(gd*c+bd*s))*baseMVA;
  let qf=(-va*va*(bd+bc/2)/(t*t)-va*vb/t*(gd*s-bd*c))*baseMVA;
  let pt=(vb*vb*gd-va*vb/t*(gd*c-bd*s))*baseMVA;
  let qt=(-vb*vb*(bd+bc/2)+va*vb/t*(gd*s+bd*c))*baseMVA;
  if(![pf,qf,pt,qt].every(finite))return {status:'DIVERGED',iterations:it,buses:n,lines:edges.length};
  results.push({id:e.id,cls:e.cls,a:busIds[a],b:busIds[b],pf,qf,pt,qt});
 }
 return {status:'CONVERGED_PQ_APPROX',iterations:it,misMW:err*baseMVA,buses:n,lines:edges.length,slackBus:busIds[slack],slackMW:P[slack]*baseMVA,voltages:busIds.map((id,i)=>({id,pu:V[i],angle:ang[i]})),branches:results};
}
/* v5.2: sparse polar Newton correction with PV reactive-limit switching.
   This solves the existing reduced >=66 kV DGS graph, NOT the full DGS network.
   Initial values from independent legacy AC-PQ solve are used only as a warm start.
   Reference-validation status is separate from convergence. */
function solveIslandV52(input){
 const {busIds,edges,injections,shunts=[],slack,pv=[],pvLimits=[],baseMVA=100}=input;
 const n=busIds.length,old=solveIsland(input),finiteNum=x=>typeof x==='number'&&Number.isFinite(x);
 let V=Float64Array.from(old.voltages?.map(v=>v.pu)||Array(n).fill(1));
 let th=Float64Array.from(old.voltages?.map(v=>v.angle)||Array(n).fill(0));
 const targetP=Float64Array.from(injections.map(v=>v[0]/baseMVA)),targetQ=Float64Array.from(injections.map(v=>v[1]/baseMVA));
 const diagG=new Float64Array(n),diagB=new Float64Array(n),adj=Array.from({length:n},()=>new Map());
 const pvMap=new Map(pv.map(z=>[z.bus,z.setpoint])); const limits=new Map(pvLimits.map(z=>[z.bus,z]));
 const switched=new Set(),warnings=[];
 for(const e of edges){
  const {a,b}=e,t=e.tap||1,r=e.r,x=e.x,bc=e.bc||0;
  if(!(a>=0&&b>=0&&a<n&&b<n&&r>=0&&finiteNum(x)&&x>0&&finiteNum(t)&&t>0))return {...old,nrIterations:0,nrReason:'Dal parametresi Newton modelinde geçersiz'};
  const den=r*r+x*x,G=r/den,B=-x/den;
  diagG[a]+=G/(t*t);diagB[a]+=(B+bc/2)/(t*t);diagG[b]+=G;diagB[b]+=B+bc/2;
  function add(i,j,g,b){const z=adj[i].get(j)||[0,0];z[0]+=g;z[1]+=b;adj[i].set(j,z);}
  add(a,b,-G/t,-B/t);add(b,a,-G/t,-B/t);
 }
 for(let i=0;i<n;i++)if(shunts[i])diagB[i]+=shunts[i]/baseMVA;
 const P=new Float64Array(n),Q=new Float64Array(n);
 function calc(){
  for(let i=0;i<n;i++){
   let p=diagG[i]*V[i]*V[i],q=-diagB[i]*V[i]*V[i];
   for(const [j,[g,b]] of adj[i]){const d=th[i]-th[j],c=Math.cos(d),s=Math.sin(d),v=V[i]*V[j];p+=v*(g*c+b*s);q+=v*(g*s-b*c);}
   P[i]=p;Q[i]=q;
  }
 }
 function layout(){const angIndex=new Int32Array(n).fill(-1),vIndex=new Int32Array(n).fill(-1),angB=[],vB=[];
  for(let i=0;i<n;i++)if(i!==slack){angIndex[i]=angB.length;angB.push(i);}
  for(let i=0;i<n;i++)if(i!==slack&&!pvMap.has(i)){vIndex[i]=angB.length+vB.length;vB.push(i);}
  return {angIndex,vIndex,angB,vB,N:angB.length+vB.length};
 }
 function resid(L){let mx=0,sum=0,res=new Float64Array(L.N);
  for(let i=0;i<L.angB.length;i++){let bus=L.angB[i],d=targetP[bus]-P[bus];res[i]=d;mx=Math.max(mx,Math.abs(d));sum+=d*d;}
  for(let i=0;i<L.vB.length;i++){let bus=L.vB[i],d=targetQ[bus]-Q[bus];res[L.angB.length+i]=d;mx=Math.max(mx,Math.abs(d));sum+=d*d;}
  return {res,mx,norm:Math.sqrt(sum)};
 }
 function jac(L){let rows=Array.from({length:L.N},()=>new Map());
  function put(row,col,val){if(row<0||col<0)return;rows[row].set(col,(rows[row].get(col)||0)+val);}
  for(let i=0;i<n;i++){
   let ai=L.angIndex[i],vi=L.vIndex[i],v=V[i],vv=v*v;
   if(ai>=0){put(ai,ai,-Q[i]-diagB[i]*vv);put(ai,vi,P[i]/v+diagG[i]*v);}
   if(vi>=0){put(vi,ai,P[i]-diagG[i]*vv);put(vi,vi,Q[i]/v-diagB[i]*v);}
   for(const [j,[g,b]] of adj[i]){
    let aj=L.angIndex[j],vj=L.vIndex[j],d=th[i]-th[j],c=Math.cos(d),s=Math.sin(d),vij=v*V[j];
    if(ai>=0){put(ai,aj,vij*(g*s-b*c));put(ai,vj,v*(g*c+b*s));}
    if(vi>=0){put(vi,aj,-vij*(g*c+b*s));put(vi,vj,v*(g*s-b*c));}
   }
  }
  return rows.map((row,i)=>[...row].filter(([k,v])=>finiteNum(v)&&Math.abs(v)>1e-15));
 }
 function gmres(A,b,relTol=1e-7){
  const n=b.length,maxOuter=5,restart=38;
  const x=new Float64Array(n),d=new Float64Array(n),rhs=new Float64Array(n);
  for(let i=0;i<n;i++){const z=A[i].find(e=>e[0]===i)?.[1];d[i]=Number.isFinite(z)&&Math.abs(z)>1e-9?1/z:1;rhs[i]=b[i]*d[i];}
  function ax(y,out){for(let i=0;i<n;i++){let z=0;for(const [j,v] of A[i])z+=v*y[j];out[i]=z*d[i];}}
  const dot=(u,v)=>{let z=0;for(let i=0;i<n;i++)z+=u[i]*v[i];return z;};
  const norm=u=>Math.sqrt(dot(u,u));
  const bNorm=Math.max(1e-16,norm(rhs));let r=Float64Array.from(rhs),tmp=new Float64Array(n);
  for(let outer=0;outer<maxOuter;outer++){
    if(outer){ax(x,tmp);for(let i=0;i<n;i++)r[i]=rhs[i]-tmp[i];}
    const beta=norm(r);if(beta<Math.max(1e-10,relTol*bNorm))return x;
    const V=[Float64Array.from(r,v=>v/beta)],H=Array.from({length:restart+1},()=>new Float64Array(restart));
    const cs=new Float64Array(restart),sn=new Float64Array(restart),g=new Float64Array(restart+1);g[0]=beta;
    let used=0;
    for(let j=0;j<restart;j++){
      let w=new Float64Array(n);ax(V[j],w);
      for(let k=0;k<=j;k++){const h=dot(w,V[k]);H[k][j]=h;for(let i=0;i<n;i++)w[i]-=h*V[k][i];}
      H[j+1][j]=norm(w);
      V.push(H[j+1][j]>1e-14?Float64Array.from(w,v=>v/H[j+1][j]):new Float64Array(n));
      for(let k=0;k<j;k++){const z=cs[k]*H[k][j]+sn[k]*H[k+1][j];H[k+1][j]=-sn[k]*H[k][j]+cs[k]*H[k+1][j];H[k][j]=z;}
      const z=Math.hypot(H[j][j],H[j+1][j]);if(z<1e-23)break;
      cs[j]=H[j][j]/z;sn[j]=H[j+1][j]/z;H[j][j]=z;H[j+1][j]=0;
      g[j+1]=-sn[j]*g[j];g[j]=cs[j]*g[j];used=j+1;
      if(Math.abs(g[j+1])<Math.max(1e-10,relTol*bNorm))break;
    }
    if(!used)return null;
    const y=new Float64Array(used);
    for(let i=used-1;i>=0;i--){let z=g[i];for(let j=i+1;j<used;j++)z-=H[i][j]*y[j];if(Math.abs(H[i][i])<1e-22)return null;y[i]=z/H[i][i];}
    for(let j=0;j<used;j++)for(let i=0;i<n;i++)x[i]+=y[j]*V[j][i];
  }
  ax(x,tmp);for(let i=0;i<n;i++)r[i]=rhs[i]-tmp[i];
  return norm(r)<Math.max(1e-7,relTol*bNorm*100)?x:null;
 }
 function bicg(A,b,tol=1e-8){const len=b.length,x=new Float64Array(len),r=Float64Array.from(b),hat=Float64Array.from(b),diag=new Float64Array(len);
  let bn=0;for(let i=0;i<len;i++){bn+=b[i]*b[i];const d=A[i].find(t=>t[0]===i)?.[1];diag[i]=d&&Math.abs(d)>1e-10?1/d:1;}
  if(bn<1e-27)return x;
  const p=new Float64Array(len),v=new Float64Array(len),s=new Float64Array(len),t=new Float64Array(len),ph=new Float64Array(len),sh=new Float64Array(len);
  const dot=(a,b)=>{let z=0;for(let i=0;i<len;i++)z+=a[i]*b[i];return z;};
  const matvec=(u,out)=>{for(let i=0;i<len;i++){let val=0;for(const [j,a] of A[i])val+=a*u[j];out[i]=val;}};
  let rho=1,alpha=1,omega=1,norm0=Math.sqrt(bn),goal=Math.max(1e-11,tol*norm0);
  for(let k=0;k<Math.min(750,Math.max(50,len));k++){
   let newRho=dot(hat,r);if(Math.abs(newRho)<1e-28||!finiteNum(newRho))return null;
   const beta=(newRho/rho)*(alpha/omega);rho=newRho;
   for(let i=0;i<len;i++){p[i]=r[i]+beta*(p[i]-omega*v[i]);ph[i]=p[i]*diag[i];}
   matvec(ph,v);let den=dot(hat,v);if(Math.abs(den)<1e-29)return null;
   alpha=rho/den;let snorm=0;for(let i=0;i<len;i++){s[i]=r[i]-alpha*v[i];snorm+=s[i]*s[i];}
   if(Math.sqrt(snorm)<goal){for(let i=0;i<len;i++)x[i]+=alpha*ph[i];return x;}
   for(let i=0;i<len;i++)sh[i]=s[i]*diag[i];matvec(sh,t);
   let tt=dot(t,t);if(tt<1e-29)return null;omega=dot(t,s)/tt;
   for(let i=0;i<len;i++){x[i]+=alpha*ph[i]+omega*sh[i];r[i]=s[i]-omega*t[i];}
   if(Math.sqrt(dot(r,r))<goal)return x;
   if(Math.abs(omega)<1e-29||!finiteNum(omega))return null;
  }
  return null;
 }
 let nrIterations=0,err=Infinity,status='NR_NOT_CONVERGED',nrReason='',limitRounds=0;
 for(let round=0;round<5;round++){
  limitRounds=round;const L=layout();
  if(!L.N){nrReason='Serbest değişken bulunamadı';break;}
  let converged=false;
  for(let iter=0;iter<20;iter++){
   calc();let R=resid(L);err=R.mx;
   if(err<1e-5){converged=true;break;}
   const J=jac(L),dx=gmres(J,R.res,1e-7)||bicg(J,R.res,1e-7);if(!dx){nrReason='Seyrek Jacobian doğrusal çözümü başarısız';break;}
   let oldV=Float64Array.from(V),oldTh=Float64Array.from(th),accepted=false;
   for(let scale=1;scale>=1/128;scale/=2){
    for(let j=0;j<L.angB.length;j++)th[L.angB[j]]=oldTh[L.angB[j]]+Math.max(-.3,Math.min(.3,dx[j]))*scale;
    for(let j=0;j<L.vB.length;j++){let ix=L.angB.length+j;V[L.vB[j]]=oldV[L.vB[j]]+Math.max(-.12,Math.min(.12,dx[ix]))*scale;}
    if(V.some(x=>x<.45||x>1.8||!finiteNum(x)))continue;
    calc();if(resid(L).mx<R.mx*(1-1e-5*scale)){accepted=true;break;}
   }
   if(!accepted){V.set(oldV);th.set(oldTh);nrReason='Newton adımını azaltma yakınsamadı';break;}
   nrIterations++;
  }
  if(!converged){status='NR_NOT_CONVERGED';break;}
  // PV bus Q limits bound the total specified reactive injection (fixed load + controlled units).
  let changed=false;calc();
  for(const [bus,z] of limits){if(!pvMap.has(bus)||!z.hasLimits||!finiteNum(z.qMin)||!finiteNum(z.qMax))continue;
   const q=Q[bus]*baseMVA,lim=q<z.qMin-.01?z.qMin:q>z.qMax+.01?z.qMax:null;
   if(lim!==null){targetQ[bus]=lim/baseMVA;pvMap.delete(bus);switched.add(bus);changed=true;warnings.push('Bara '+busIds[bus]+' Q sınırında PV→PQ: '+q.toFixed(2)+' → '+lim.toFixed(2)+' MVAr');}
  }
  if(!changed){status='CONVERGED_NR_EXPERIMENTAL';break;}
 }
 if(status!=='CONVERGED_NR_EXPERIMENTAL'){
  if(old.status==='CONVERGED_PQ_APPROX')return {...old,nrIterations,nrReason:nrReason||'PV/PQ sınır geçişi yakınsamadı; eski yaklaşık çözüm korundu',pvToPq:[],unitQ:[],nrFallback:true};
  return {status:'NR_NOT_CONVERGED',nrIterations,misMW:err*baseMVA,buses:n,lines:edges.length,reason:nrReason||old.reason||''};
 }
 calc();const branches=[];
 for(const e of edges){const a=e.a,b=e.b,va=V[a],vb=V[b],d=th[a]-th[b],c=Math.cos(d),si=Math.sin(d),tap=e.tap||1,div=e.r*e.r+e.x*e.x,g=e.r/div,bi=-e.x/div,bc=e.bc||0;
  const pf=(va*va*g/(tap*tap)-va*vb/tap*(g*c+bi*si))*baseMVA;
  const qf=(-va*va*(bi+bc/2)/(tap*tap)-va*vb/tap*(g*si-bi*c))*baseMVA;
  const pt=(vb*vb*g-va*vb/tap*(g*c-bi*si))*baseMVA;
  const qt=(-vb*vb*(bi+bc/2)+va*vb/tap*(g*si+bi*c))*baseMVA;
  branches.push({id:e.id,cls:e.cls,a:busIds[a],b:busIds[b],pf,qf,pt,qt});
 }
 const unitQ=[];
 for(const [bus,z] of limits){if(!z.units||z.units.length!==1||bus===slack)continue;const u=z.units[0];if(!u.direct)continue;
  const q=Q[bus]*baseMVA-z.fixedQ;
  if(finiteNum(q))unitQ.push({id:u.id,cls:u.cls,value:q,limitHit:switched.has(bus)});
 }
 return {status,nrIterations,misMW:err*baseMVA,buses:n,lines:edges.length,slackBus:busIds[slack],slackMW:P[slack]*baseMVA,voltages:busIds.map((id,i)=>({id,pu:V[i],angle:th[i]})),branches,pvToPq:[...switched].map(i=>busIds[i]),unitQ,warnings};
}

self.onmessage=e=>{const msg=e.data;try{if(msg.action==='solve'){let out=[];for(let i=0;i<msg.islands.length;i++){out.push(solveIslandV52(msg.islands[i]));self.postMessage({progress:i+1,total:msg.islands.length});}self.postMessage({done:true,out});}}catch(err){self.postMessage({error:String(err?.stack||err)});}};

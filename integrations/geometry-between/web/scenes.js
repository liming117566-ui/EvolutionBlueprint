const MathLab = (() => {
 const W=760,H=400,green='#4f9677',orange='#c8a16f',gray='#adbaac';
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)), dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]), lerp=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
 const fmt=(v,n=2)=>Number(v).toFixed(n), pos=p=>p.map(v=>Number(v).toFixed(2)).join(',');
 function line(a,b,cls='main-line',extra=''){return `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" class="${cls}" ${extra}/>`}
 function poly(ps,cls='fill-main'){return `<polygon points="${ps.map(pos).join(' ')}" class="${cls}"/>`}
 function text(p,s,cls='',dx=0,dy=0){return `<text x="${p[0]+dx}" y="${p[1]+dy}" class="${cls}">${s}</text>`}
 function point(p,label,key=null,color=green,dx=12,dy=-13){return `<g>${key?`<circle class="point-halo" cx="${p[0]}" cy="${p[1]}" r="12"/>`:''}<circle cx="${p[0]}" cy="${p[1]}" r="${key?5:4}" fill="${color}" stroke="#fff" stroke-width="2"/>${text(p,label,color===orange?'point-label aux-label':'point-label',dx,dy)}</g>`}
 function angleArc(c,r,a,b,color=orange){let p=[c[0]+r*Math.cos(a),c[1]-r*Math.sin(a)],q=[c[0]+r*Math.cos(b),c[1]-r*Math.sin(b)];return `<path d="M ${pos(p)} A ${r} ${r} 0 ${Math.abs(b-a)>Math.PI?1:0} ${b>a?0:1} ${pos(q)}" fill="none" stroke="${color}" stroke-width="1.5"/>`}
 function rectAngle(p,u=[1,0],v=[0,-1],size=10){const a=[p[0]+u[0]*size,p[1]+u[1]*size],b=[a[0]+v[0]*size,a[1]+v[1]*size],c=[p[0]+v[0]*size,p[1]+v[1]*size];return `<polyline points="${[a,b,c].map(pos).join(' ')}" class="neutral-line"/>`}
 function metric(label,value,unit='',extra=''){return {label,value,unit,extra}}
 const configs={
 reflection:{initial:{p:490,aux:true},ranges:[['p','河岸上的位置 P',95,665,1,v=>fmt((v-95)/570*100,0)+'%']]},
 midpoint:{initial:{c:390,aux:true},ranges:[['c','点 C 的位置',80,680,1,v=>fmt((v-180)/40)+' 单位']]},
 bisector:{initial:{angle:110,t:45,aux:true},ranges:[['angle','∠AOB',60,145,1,v=>v+'°'],['t','内部射线 OP 的角度',10,90,1,v=>v+'%']]},
 median:{initial:{x:300,y:100,aux:true},ranges:[]},
 altitude:{initial:{a:6,b:4,aux:true},ranges:[['a','直角边 a',2,8,.1,v=>fmt(v,1)],['b','直角边 b',2,6,.1,v=>fmt(v,1)]]},
 midline:{initial:{x:325,y:85,aux:true},ranges:[]},
 circle:{initial:{t:125,aux:true},ranges:[['t','圆上点 P 的位置',65,265,1,v=>v+'°']]},
 chord:{initial:{d:1.8,aux:true},ranges:[['d','弦心距 OM（半径 r = 5）',0,4.6,.1,v=>fmt(v,1)]]},
 similarity:{initial:{t:.52,aux:true},ranges:[['t','相似比 t',.15,.85,.01,v=>fmt(v)]]},
 shortest:{initial:{x:360,y:100,aux:true},ranges:[]},
 perpendicular:{initial:{p:490,aux:true},ranges:[['p','直线上的位置 P',100,660,1,v=>fmt((v-280)/45)+' 单位']]},
 linear:{initial:{k:-1,b:4,aux:true},ranges:[['k','斜率 k',-2,-.5,.1,v=>fmt(v,1)],['b','纵截距 b',2,5,.1,v=>fmt(v,1)]]},
 quadratic:{initial:{x:1.8,aux:true},ranges:[['x','点 P 的横坐标 x',0,6,.05,v=>fmt(v)]]},
 inverse:{initial:{x:3,k:6,aux:true},ranges:[['x','点 P 的横坐标 x',1.5,6,.05,v=>fmt(v)],['k','比例系数 k',2,8,.5,v=>fmt(v,1)]]},
 trig:{initial:{angle:35,aux:true},ranges:[['angle','锐角 θ',15,65,1,v=>v+'°']]},
 equation:{initial:{k:1,b:1,c:5,aux:true},ranges:[['k','y₁ 的斜率 k',.5,2,.1,v=>fmt(v,1)],['b','y₁ 的截距 b',-1,4,.1,v=>fmt(v,1)],['c','y₂ 的截距 c',2,6,.1,v=>fmt(v,1)]]}
 };
 function axes(origin,sx=45,sy=45,xmin=-2,xmax=10,ymin=-1,ymax=6){const p=(x,y)=>[origin[0]+x*sx,origin[1]-y*sy];let s=line(p(xmin,0),p(xmax,0),'neutral-line','marker-end="url(#axis-arrow)"')+line(p(0,ymin),p(0,ymax),'neutral-line','marker-end="url(#axis-arrow)"');s+=text(p(xmax,0),'x','small-label',7,4)+text(p(0,ymax),'y','small-label',-15,-3)+text(p(0,0),'O','small-label',-18,17);for(let x=Math.ceil(xmin);x<xmax;x++){if(x===0)continue;s+=line(p(x,0),p(x,.09),'neutral-line')+text(p(x,0),String(x),'small-label',-4,19)}for(let y=Math.ceil(ymin);y<ymax;y++){if(y===0)continue;s+=line(p(0,y),p(.09,y),'neutral-line')+text(p(0,y),String(y),'small-label',-23,4)}return {p,s}}
 function pathFn(p,f,min,max,color=green){let points=[];for(let x=min;x<=max+.0001;x+=(max-min)/150)points.push(p(x,f(x)));return `<polyline points="${points.map(pos).join(' ')}" stroke="${color}" stroke-width="2.5" fill="none"/>`}
 function draw(kind,s){let html='',metrics=[],optimal=null;const aux=s.aux;
 if(kind==='reflection'){
  const A=[190,95],B=[575,130],P=[s.p,230],R=[190,365],t=135/235,Q=[190+385*t,230],ap=dist(A,P)/50,bp=dist(B,P)/50,min=dist(R,B)/50;
  html=`<rect x="0" y="231" width="760" height="169" fill="#edf4ed" opacity=".48"/>`+line([45,230],[715,230],'neutral-line')+text([50,216],'河岸 ℓ','small-label');
  if(aux)html+=line(A,R,'aux-line')+line(R,B,'aux-line')+line(R,P,'aux-line')+point(R,'A′',null,orange)+rectAngle([190,230])+text([70,361],'对称后，折线可以拉直','small-label');
  html+=line(A,P)+line(P,B)+point(A,'A')+point(B,'B')+point(P,'P','p')+text([190,95],'起点','small-label',-37,-10)+text([575,130],'终点','small-label',15,17);
  metrics=[metric('当前路程 AP + PB',fmt(ap+bp),'单位'),metric('理论最短路程',fmt(min),'单位'),metric('比最短路程多',fmt(Math.max(0,ap+bp-min)),'单位',Math.abs(s.p-Q[0])<2?'已找到最优位置！':'点击“寻找最优位置”验证')];optimal=()=>{s.p=Q[0]};
 }else if(kind==='midpoint'){
  let A=[180,230],B=[580,230],C=[s.c,230],M=lerp(A,C,.5),N=lerp(B,C,.5);html=line([55,230],[710,230],'neutral-line')+line(M,N,'main-line','stroke-width="5"')+point(A,'A',null,green,-9,32)+point(B,'B',null,green,-8,32)+point(M,'M',null,orange,-7,-22)+point(N,'N',null,orange,-7,-22)+point(C,'C','c',green,-5,-50);if(aux)html+=line([M[0],155],[N[0],155],'aux-line')+text([(M[0]+N[0])/2-44,139],'MN = 5','point-label');html+=text([310,320],'M、N 始终分别是 AC、BC 的中点','small-label');metrics=[metric('固定长度 AB','10.00','单位'),metric('中点距离 MN','5.00','单位'),metric('比值 MN / AB','0.50','','始终保持不变')];
 }else if(kind==='bisector'){
  const O=[245,315],r=260,a=s.angle*Math.PI/180,b=a*s.t/100,p=t=>[O[0]+r*Math.cos(t),O[1]-r*Math.sin(t)],A=p(a),B=p(0),P=p(b),M=p(b/2),N=p((a+b)/2);html=line(O,A)+line(O,B)+line(O,P,'neutral-line')+angleArc(O,52,0,a)+point(O,'O',null,green,-20,20)+point(A,'A')+point(B,'B')+point(P,'P','angle');if(aux)html+=line(O,M,'aux-line')+line(O,N,'aux-line')+point(M,'M',null,orange)+point(N,'N',null,orange)+angleArc(O,90,b/2,(a+b)/2,green)+text([360,350],`∠MON = ${fmt(s.angle/2,1)}°`,'point-label');metrics=[metric('∠AOB',fmt(s.angle,0),'°'),metric('∠BOP',fmt(s.angle*s.t/100,1),'°'),metric('∠MON',fmt(s.angle/2,1),'°','恒为总角的一半')];
 }else if(kind==='median'||kind==='midline'||kind==='similarity'){
  const A=kind==='similarity'?[325,65]:[s.x,s.y],B=[180,305],C=[600,305],M=kind==='median'?lerp(B,C,.5):lerp(A,B,kind==='similarity'?s.t:.5),N=lerp(A,C,kind==='similarity'?s.t:.5),D=[2*M[0]-A[0],2*M[1]-A[1]];
  html=poly([A,B,C])+point(B,'B',null,green,-18,23)+point(C,'C',null,green,8,23);
  if(kind==='median'){
   html=line(A,B)+line(A,C)+line(B,C)+line(A,M)+point(M,'M',null,orange,10,-8);
   // A and D are shown about the midpoint with an adaptive vertical scale.
   const scale=.58,trans=p=>[380+(p[0]-380)*.95,205+(p[1]-205)*scale],a=trans(A),b=trans(B),c=trans(C),m=trans(M),d=trans(D);
   html=poly([a,b,d,c])+line(b,c,'neutral-line')+line(a,d,'aux-line')+point(a,'A','A')+point(b,'B',null,green,-18,16)+point(c,'C',null,green,10,16)+point(m,'M',null,orange,12,-8)+point(d,'D',null,orange,12,20);if(!aux)html=line(a,b)+line(b,c)+line(c,a)+line(a,m)+point(a,'A','A')+point(b,'B')+point(c,'C')+point(m,'M');metrics=[metric('AM / MD','1.00'),metric('BM / MC','1.00'),metric('补全后的图形','平行四边形')];
  }else{
   html+=line(M,N,'main-line','stroke-width="3.5"')+point(A,'A',kind==='midline'?'A':null)+point(M,'M',kind==='similarity'?'ratio':null,orange,-24,-2)+point(N,'N',null,orange,12,-2);if(aux)html+=poly([A,M,N],'fill-main')+text([310,352],kind==='midline'?'中位线与底边平行':'MN ∥ BC','small-label');let t=kind==='midline'?.5:s.t;metrics=[metric('底边 BC','10.00','单位'),metric('截线 MN',fmt(t*10),'单位'),metric('相似比',fmt(t),'',kind==='midline'?'两个中点，锁定二分之一':'三组对应边，同一个比例')];
  }
 }else if(kind==='altitude'){
  const u=43,A=[210,315],B=[210+s.a*u,315],C=[210,315-s.b*u],v=[B[0]-C[0],B[1]-C[1]],t=((A[0]-C[0])*v[0]+(A[1]-C[1])*v[1])/(v[0]*v[0]+v[1]*v[1]),D=lerp(C,B,t),c=Math.hypot(s.a,s.b),h=s.a*s.b/c;
  html=poly([A,B,C])+rectAngle(A)+point(A,'A',null,green,-20,20)+point(B,'B',null,green,10,20)+point(C,'C',null,green,-20,-12)+text(lerp(A,B,.5),`a = ${fmt(s.a,1)}`,'',-25,30)+text(lerp(A,C,.5),`b = ${fmt(s.b,1)}`,'',-80,0);if(aux){let len=dist(A,D),un=[(A[0]-D[0])/len,(A[1]-D[1])/len],vl=dist(C,B),vn=[v[0]/vl,v[1]/vl];html+=line(A,D,'aux-line')+rectAngle(D,un,vn)+point(D,'H',null,orange)+text(lerp(A,D,.5),`h = ${fmt(h)}`,'aux-label',12,-7)}metrics=[metric('面积 ab / 2',fmt(s.a*s.b/2)),metric('斜边 c',fmt(c)),metric('斜边上的高 h',fmt(h),'','面积恒等：ab = ch')];
 }else if(kind==='circle'){
  const O=[385,200],r=148,p=a=>[O[0]+r*Math.cos(a*Math.PI/180),O[1]-r*Math.sin(a*Math.PI/180)],A=p(-55),B=p(45),P=p(s.t);
  html=`<circle cx="385" cy="200" r="148" class="neutral-line"/>`+line(A,P)+line(P,B)+line(A,B,'neutral-line')+point(A,'A',null,green,12,16)+point(B,'B')+point(P,'P','circle',green,-23,-13);if(aux)html+=line(O,A,'aux-line')+line(O,B,'aux-line')+angleArc(O,34,-55*Math.PI/180,45*Math.PI/180)+point(O,'O',null,orange,-23,8)+text([440,212],'100°','aux-label');metrics=[metric('圆心角 ∠AOB','100','°'),metric('圆周角 ∠APB','50','°'),metric('圆周角 / 圆心角','0.50','','同弧所对，始终不变')];
 }else if(kind==='chord'){
  const O=[380,190],r=150,d=s.d*30,x=Math.sqrt(r*r-d*d),M=[380,190+d],A=[380-x,190+d],B=[380+x,190+d];html=`<circle cx="380" cy="190" r="150" class="neutral-line"/>`+line(A,B)+point(O,'O',null,green,-24,5)+point(A,'A',null,green,-22,19)+point(B,'B',null,green,12,19);if(aux)html+=line(O,A,'aux-line')+line(O,B,'aux-line')+line(O,M,'aux-line')+rectAngle(M)+point(M,'M','chord',orange,12,20);else html+=point(M,'M','chord',orange,12,20);metrics=[metric('半径 r','5.00'),metric('半弦 AM = MB',fmt(x/30)),metric('整弦长 AB',fmt(2*x/30),'','弦心距越大，弦越短')];
 }else if(kind==='shortest'){
  const A=[140,260],B=[630,260],P=[s.x,s.y];html=aux?line(A,B,'aux-line'):'';html+=line(A,P)+line(P,B)+point(A,'A',null,green,-20,25)+point(B,'B',null,green,10,25)+point(P,'P','free');let total=(dist(A,P)+dist(B,P))/50;metrics=[metric('绕行距离 AP + PB',fmt(total)),metric('直线距离 AB','9.80'),metric('多走的距离',fmt(Math.max(0,total-9.8)),'',Math.abs(s.y-260)<1?'折线已拉直':'点击按钮比较共线的情况')];optimal=()=>{s.x=385;s.y=260};
 }else if(kind==='perpendicular'){
  const A=[280,90],H=[280,285],P=[s.p,285];html=line([65,285],[700,285],'neutral-line')+text([65,270],'直线 ℓ','small-label')+line(A,P)+point(A,'A')+point(P,'P','p',green,10,25);if(aux)html+=line(A,H,'aux-line')+rectAngle(H)+point(H,'H',null,orange,-24,25);metrics=[metric('当前距离 AP',fmt(dist(A,P)/45)),metric('垂线段 AH',fmt(195/45)),metric('距垂足 HP',fmt(Math.abs(s.p-280)/45),'','HP = 0 时路程最短')];optimal=()=>{s.p=280};
 }else if(kind==='linear'){
  const {p,s:ax}=axes([165,325],47,47,-1.8,10,-.7,6),x0=-s.b/s.k,A=p(x0,0),B=p(0,s.b);html=ax+poly([p(0,0),A,B])+pathFn(p,x=>s.k*x+s.b,-.6,Math.min(x0+1.1,10))+point(A,'A',null,green,8,25)+point(B,'B',null,green,-24,-14)+text([465,90],`y = ${fmt(s.k,1)}x + ${fmt(s.b,1)}`,'point-label');metrics=[metric('横截距 OA',fmt(x0)),metric('纵截距 OB',fmt(s.b)),metric('三角形面积',fmt(x0*s.b/2),'平方单位')];
 }else if(kind==='quadratic'){
  const {p,s:ax}=axes([165,330],70,27,-.8,7.2,-1,11),y=-s.x*s.x+6*s.x,P=p(s.x,y),Q=p(s.x,0);html=ax+pathFn(p,x=>-x*x+6*x,-.2,6.2)+line(P,Q,'main-line','stroke-width="3"')+point(P,'P','quadratic')+point(Q,'Q',null,orange,10,25);if(aux)html+=line(p(3,0),p(3,10),'aux-line')+point(p(3,9),'V',null,orange,-23,-13)+text([455,77],'h = −(x − 3)² + 9','small-label');metrics=[metric('横坐标 x',fmt(s.x)),metric('当前铅垂线段 h',fmt(y)),metric('区间内最大值','9.00','','在 x = 3 处取得')];optimal=()=>{s.x=3};
 }else if(kind==='inverse'){
  const {p,s:ax}=axes([310,260],43,35,-5.5,8,-3,6.5),y=s.k/s.x,P=p(s.x,y);html=ax+poly([p(0,0),p(s.x,0),P,p(0,y)])+poly([p(0,0),p(s.x,0),P])+pathFn(p,x=>s.k/x,Math.max(.85,s.k/6.4),7.3)+pathFn(p,x=>s.k/x,-5.5,-Math.max(.85,s.k/3.8))+point(P,'P','inverse')+text([490,65],`y = ${fmt(s.k,1)} / x`,'point-label');if(aux)html+=line(P,p(0,y),'aux-line')+text(p(s.x,0),fmt(s.x),'small-label',-10,22)+text(p(0,y),fmt(y),'small-label',-44,3);metrics=[metric('点 P 的纵坐标 y',fmt(y)),metric('矩形面积 |xy|',fmt(s.k)),metric('三角形面积',fmt(s.k/2),'','位置改变，面积保持不变')];
 }else if(kind==='trig'){
  let theta=s.angle*Math.PI/180,O=[180,320],B,P;
  const length=315;B=[O[0]+length*Math.cos(theta),O[1]];P=[B[0],O[1]-length*Math.sin(theta)];html=poly([O,B,P])+rectAngle(B,[-1,0],[0,-1])+angleArc(O,47,0,theta,green)+point(O,'O',null,green,-20,21)+point(B,'H',null,green,8,22)+point(P,'P','trig')+text([232,306],`${s.angle}°`,'point-label')+text(lerp(O,B,.5),'邻边','small-label',-10,30)+text(lerp(B,P,.5),'对边','small-label',15,0)+text(lerp(O,P,.5),'斜边','small-label',-28,-16);metrics=[metric('sin θ',fmt(Math.sin(theta),3)),metric('cos θ',fmt(Math.cos(theta),3)),metric('tan θ',fmt(Math.tan(theta),3),'','角度固定时，边长比固定')];
 }else if(kind==='equation'){
  const {p,s:ax}=axes([260,295],50,35,-3,8,-2,7.5),x=(s.c-s.b)/(s.k+1),y=s.k*x+s.b;
  const cut=(k,b)=>[Math.max(-3,(-2-b)/k),Math.min(8,(7.4-b)/k)].sort((a,b)=>a-b);let l=cut(s.k,s.b);html=ax+pathFn(p,z=>s.k*z+s.b,l[0],l[1])+pathFn(p,z=>-z+s.c,Math.max(-3,s.c-7.4),Math.min(8,s.c+2),orange)+point(p(x,y),'P',null,green,12,-13)+text([510,76],`y₁ = ${fmt(s.k,1)}x ${s.b<0?"−":"+"} ${fmt(Math.abs(s.b),1)}`,'point-label')+text([510,103],`y₂ = −x + ${fmt(s.c,1)}`,'aux-label');if(aux)html+=line(p(x,y),p(x,0),'aux-line');metrics=[metric('交点横坐标 x',fmt(x)),metric('交点纵坐标 y',fmt(y)),metric('y₁ > y₂ 的范围',`x > ${fmt(x)}`)];
 }
 return {html,metrics,optimal};
 }
 class Scene {
  constructor(host,kind,onInteract=()=>{}){this.host=host;this.kind=kind;this.config=configs[kind];this.state={...this.config.initial};this.onInteract=onInteract;this.mount()}
  mount(){this.host.innerHTML=`<div class="stage"><svg class="math-stage" viewBox="0 0 ${W} ${H}" role="img" aria-label="${EXPERIMENTS[this.kind].hint}"><title>${EXPERIMENTS[this.kind].name}交互图形</title><defs><pattern id="dot-grid" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".65" fill="#c8d4c2" opacity=".6"/></pattern><marker id="axis-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 1 1 L 9 5 L 1 9" fill="none" stroke="#a9b6a9" stroke-width="1.2"/></marker><clipPath id="scene-clip"><rect x="15" y="15" width="730" height="365"/></clipPath></defs><rect width="760" height="400" fill="url(#dot-grid)"/><g id="drawing" clip-path="url(#scene-clip)"></g></svg><div class="stage-hint">${icon('hand')}<span>观察图形，理解每一步推导</span></div><div class="stage-coordinate">INTERACTIVE CANVAS</div></div><div class="measure-row" aria-live="off"></div><div class="scene-controls" ${this.config.ranges.length?'':'hidden'}>${this.config.ranges.map(([key,label,min,max,step])=>`<label class="range-control"><span class="range-head"><span>${label}</span><output id="out-${key}"></output></span><input aria-label="${label}" class="range-input" data-param="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${this.state[key]}"></label>`).join('')}</div>`;
   this.svg=this.host.querySelector('svg.math-stage');this.drawing=this.host.querySelector('#drawing');this.metrics=this.host.querySelector('.measure-row');
   this.host.querySelectorAll('[data-param]').forEach(input=>input.addEventListener('input',()=>{this.state[input.dataset.param]=Number(input.value);this.render();this.onInteract()}));
   this.host.querySelector('.stage-hint').innerHTML=icon('eye')+'<span>观察图形，结合右侧推导理解结论</span>';this.render();
  }
  render(){let res=draw(this.kind,this.state);this.drawing.innerHTML=res.html;this.optimal=res.optimal;this.metrics.innerHTML=res.metrics.map((m,i)=>`<div class="measure ${i===2?'highlight':''}"><div class="measure-label">${m.label}</div><div class="measure-value" style="${String(m.value).length>10?'font-size:14px':''}">${m.value}<span>${m.unit}</span></div>${m.extra?`<div class="measure-extra">${m.extra}</div>`:''}</div>`).join('');this.config.ranges.forEach(([key,label,min,max,step,format])=>{let input=this.host.querySelector(`[data-param="${key}"]`);input.value=this.state[key];this.host.querySelector('#out-'+key).textContent=format(this.state[key])})}
  changeConditions(){const presets={median:[[240,70],[400,120],[510,85]],midline:[[240,70],[400,120],[510,85]],shortest:[[330,100],[440,180],[385,260]]};let options=presets[this.kind];if(options){this.presetIndex=((this.presetIndex??-1)+1)%options.length;[this.state.x,this.state.y]=options[this.presetIndex]}else{this.config.ranges.forEach(([key,label,min,max,step])=>{const count=Math.round((max-min)/step);this.state[key]=Number((min+Math.round(Math.random()*count)*step).toFixed(4))})}this.render();this.onInteract()}
  reset(){this.state={...this.config.initial};this.render()}
  setAux(v){this.state.aux=v;this.render()}
  solve(){if(this.optimal){this.optimal();this.render();this.onInteract();return true}return false}
 }
 return {Scene,draw,configs,clamp};
})();

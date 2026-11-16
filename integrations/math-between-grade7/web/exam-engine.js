(function(root){
'use strict';
const types=['choice','fill','solution'], labels={choice:'选择题',fill:'填空题',solution:'解答题'},levels={basic:'基础巩固',standard:'常规应用',advanced:'综合提升'};
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function random(seed){let n=seed>>>0;return()=>{n+=0x6D2B79F5;let t=n;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296}}
function shuffle(a,r){a=[...a];for(let i=a.length-1;i>0;i--){let j=Math.floor(r()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
const signed=n=>n<0?'−'+Math.abs(n):String(n),paren=n=>n<0?'('+signed(n)+')':String(n);
function makeQuestion(chapter,level,r){
 const d=['basic','standard','advanced'].indexOf(level),int=(a,b)=>a+Math.floor(r()*(b-a+1)),a=int(3,25+10*d),b=int(2,9+5*d),k=int(2,8),variant=int(0,2);
 let text,answer,explanation,unit='',template,values;
 const set=(id,t,v,e,u='',params=[])=>{template=id;text=t;answer=v;explanation=e;unit=u;values=params};
 if(chapter===1){
  if(variant===0){const n=int(3,30);if(d===0)set('prism-edges',`一个 ${n} 棱柱共有多少条棱？`,3*n,`两个底面各有 ${n} 条棱，另有 ${n} 条侧棱，共 3×${n}＝${3*n} 条。`,'条',[n]);else if(d===1)set('prism-total',`一个 ${n} 棱柱的顶点数、棱数与面数之和是多少？`,6*n+2,`顶点数为 2×${n}，棱数为 3×${n}，面数为 ${n}＋2，三者相加得 ${6*n+2}。`,'',[n]);else set('prism-inverse',`一个棱柱的顶点数、棱数与面数之和为 ${6*n+2}，它有多少条侧棱？`,n,`设底面有 n 条边，则 2n＋3n＋(n＋2)＝${6*n+2}，解得 n＝${n}。侧棱数为 ${n}。`,'条',[n]);}
  else if(variant===1){if(d===0)set('cube-edges',`一个正方体的棱长为 ${a} cm，求所有棱的长度之和。`,12*a,`正方体共有 12 条棱，总长度为 12×${a}＝${12*a} cm。`,'cm',[a]);else if(d===1)set('cuboid-edges',`长方体的长、宽、高分别为 ${a} cm、${b} cm、${k} cm，求所有棱的长度之和。`,4*(a+b+k),`长、宽、高各有 4 条棱，总长度为 4×(${a}＋${b}＋${k})＝${4*(a+b+k)} cm。`,'cm',[a,b,k]);else{const n=int(3,15);set('paint-cube',`把正方体六个面涂色，再沿每条棱等分为 ${n} 份，切成 ${n**3} 个相同小正方体。恰有一个面涂色的有多少个？`,6*(n-2)**2,`每个大面除去四周一圈后有 (${n}−2)² 个，六个面共 6×(${n}−2)²＝${6*(n-2)**2} 个。`,'个',[n]);}}
  else{const n=int(2,20);set('cube-stack',d===0?`用棱长 1 cm 的小正方体拼成棱长 ${n} cm 的大正方体，需要多少个小正方体？`:d===1?`用棱长 1 cm 的小正方体拼成棱长 ${n} cm 的实心正方体，最上面一层有多少个小正方体？`:`用棱长 1 cm 的小正方体拼成棱长 ${n+2} cm 的实心正方体，去掉最外面一层后，内部还剩多少个小正方体？`,d===1?n*n:n**3,d===1?`每行 ${n} 个，共 ${n} 行，所以有 ${n}×${n}＝${n*n} 个。`:`${d===2?`内部每条棱上剩 ${n+2}−2＝${n} 个。`:''}共有 ${n}×${n}×${n}＝${n**3} 个。`,'个',[n]);}
 }else if(chapter===2){
  if(variant===0){const x=-a,y=d===0?b:-b;set('rational-sum',`计算：${paren(x)}＋${paren(y)}${d===2?`×${k} − ${a}`:''}。`,d===2?x+y*k-a:x+y,d===2?`先算乘法：${paren(y)}×${k}＝${y*k}；再算加减：${signed(x)}＋${paren(y*k)}−${a}＝${x+y*k-a}。`:`${x<0&&y<0?'同号两数相加，取相同符号，并把绝对值相加。':'异号两数相加，取绝对值较大数的符号，再用较大绝对值减去较小绝对值。'}结果为 ${signed(x+y)}。`,'',[x,y,k]);}
  else if(variant===1)set('absolute-distance',d===0?`求 −${a} 的绝对值。`:d===1?`数轴上两点表示的数分别是 −${a} 和 ${b}，求两点间的距离。`:`数轴上 A、B 两点表示的数分别是 −${a} 和 ${b}。点 P 在 A 左侧，到 A 的距离是 ${k}，求 P 到 B 的距离。`,d===0?a:d===1?a+b:a+b+k,d===0?`负数的绝对值是它的相反数，∣−${a}∣＝${a}。`:`${d===2?`P 表示 −${a}−${k}＝${-a-k}。`:''}两点距离等于右侧数减左侧数，得 ${d===1?a+b:a+b+k}。`,'',[a,b,k]);
  else{const p=int(2,6),n=d===0?2:3;set('powers',`计算：${d===2?`−${p}²＋(${signed(-b)})²`:`(−${p})${n===2?'²':'³'}` }。`,d===2?-p*p+b*b:(-p)**n,d===2?`−${p}²＝−${p*p}，(−${b})²＝${b*b}，所以结果是 ${-p*p+b*b}。`:`${n===2?'偶数':'奇数'}个负数相乘得${n===2?'正':'负'}数，结果为 ${(-p)**n}。`,'',[p,b,n]);}
 }else if(chapter===3){
  if(variant===0){const x=int(-8,8);set('like-terms',`当 x＝${signed(x)} 时，求 ${a}x${d>0?`−${b}(x−${k})`:`＋${b}x`} 的值。`,d>0?(a-b)*x+b*k:(a+b)*x,d>0?`去括号、合并同类项，得 (${a}−${b})x＋${b*k}；代入 x＝${signed(x)}，得 ${(a-b)*x+b*k}。`:`合并同类项，得 ${a+b}x；代入 x＝${signed(x)}，得 ${(a+b)*x}。`,'',[a,b,k,x]);}
  else if(variant===1){const n=int(3,30);set('match-pattern',d<2?`用火柴棒沿一直线依次拼接正方形，相邻两个正方形恰好共用一条边。拼成 ${n} 个正方形需多少根火柴棒？`:`用火柴棒沿一直线拼接正方形，相邻两个正方形恰好共用一条边。现有 ${3*n+1} 根火柴棒，全部用完可以拼成多少个正方形？`,d<2?3*n+1:n,`第一个正方形用 4 根，以后每增加一个加 3 根，所以 m 个需要 3m＋1 根。${d<2?`代入 m＝${n}，得 ${3*n+1} 根。`:`解 3m＋1＝${3*n+1}，得 m＝${n}。`}`,d<2?'根':'个',[n]);}
  else set('expression',`某长方形的长为 (${a}x＋${b}) cm，宽为 ${k}x cm。当 x＝${d+2} 时，求${d===0?'周长':d===1?'面积':'面积与周长的数值之差'}。`,d===0?2*((a+k)*2+b):d===1?(a*3+b)*k*3:(a*4+b)*k*4-2*((a+k)*4+b),`先代入 x＝${d+2}，长为 ${a*(d+2)+b} cm，宽为 ${k*(d+2)} cm。${d===0?`周长＝2×(长＋宽)＝${2*((a+k)*2+b)} cm。`:d===1?`面积＝长×宽＝${(a*3+b)*k*3} cm²。`:`面积的数值为 ${(a*4+b)*k*4}，周长的数值为 ${2*((a+k)*4+b)}，相减得 ${(a*4+b)*k*4-2*((a+k)*4+b)}。`}`,d===0?'cm':d===1?'cm²':'',[a,b,k,d+2]);
 }else if(chapter===4){
  if(variant===0)set('midpoint',d===0?`线段 AB 长 ${2*a} cm，M 是 AB 的中点，求 AM。`:d===1?`点 A、B、C 依次在同一直线上，AB＝${a} cm，BC＝${2*b} cm，M 是 BC 的中点，求 AM。`:`线段 AB 长 ${2*a} cm，M 为 AB 的中点，N 为 MB 的中点，求 AN。`,d===0?a:d===1?a+b:1.5*a,d===0?`AM＝AB÷2＝${a} cm。`:d===1?`BM＝BC÷2＝${b} cm，AM＝AB＋BM＝${a+b} cm。`:`AM＝${a} cm，MN＝MB÷2＝${a/2} cm，AN＝AM＋MN＝${1.5*a} cm。`,'cm',[a,b]);
  else if(variant===1){const theta=2*int(10,80);set('angles',d===0?`一个角为 ${theta}°，求它的补角。`:d===1?`∠AOB＝${theta}°，OC 平分 ∠AOB，求 ∠AOC。`:`射线 OA、OB 方向相反，∠AOC＝${theta}°，OD 平分 ∠COB，求 ∠AOD。`,d===0?180-theta:d===1?theta/2:90+theta/2,d===0?`互补两角的和为 180°，所以补角为 180°−${theta}°＝${180-theta}°。`:d===1?`角平分线把角分成相等的两部分，所以 ∠AOC＝${theta}°÷2＝${theta/2}°。`:`∠COB＝180°−${theta}°＝${180-theta}°，∠BOD＝${(180-theta)/2}°，所以 ∠AOD＝180°−${(180-theta)/2}°＝${90+theta/2}°。`,'°',[theta]);}
  else{const n=int(4,20);set('polygon',d===0?`一个 ${n} 边形从同一个顶点能引出多少条对角线？`:d===1?`一个 ${n} 边形共有多少条对角线？`:`一个多边形从一个顶点出发的对角线将它分成 ${n-2} 个三角形，求这个多边形的对角线总数。`,d===0?n-3:n*(n-3)/2,d===0?`不能连向本身和两个相邻顶点，所以有 ${n}−3＝${n-3} 条。`:`${d===2?`边数为 ${n-2}＋2＝${n}。`:''}每个顶点引出 ${n-3} 条，每条被计算两次，共 ${n}×${n-3}÷2＝${n*(n-3)/2} 条。`,'条',[n]);}
 }else if(chapter===5){
  if(variant===0){const x=int(-12,12),rhs=a*x+b;set('linear-equation',d===0?`解方程：${a}x＋${b}＝${rhs}。`:d===1?`解方程：${a}(x−${k})＋${b}＝${rhs-a*k}。`:`解方程：(${a}x＋${b})/${k}＝${rhs}/${k}。`,x,`${d===1?'去括号并合并常数项，':d===2?`两边同乘 ${k}，`:''}得 ${a}x＋${b}＝${rhs}；移项得 ${a}x＝${a*x}；两边同除以 ${a}，得 x＝${x}。`,'',[a,b,k,x]);}
  else if(variant===1){const price=10*int(5,30),rate=5*int(1,6),profit=price*rate/100;set('profit',d===0?`某商品进价为 ${price} 元，售价为 ${price+profit} 元，求利润。`:d===1?`某商品进价为 ${price} 元，售价为 ${price+profit} 元，求利润率（以进价为基数）。`:`某商品按标价的八折出售，售价为 ${price+profit} 元，利润率为 ${rate}%（以进价为基数），求进价。`,d===0?profit:d===1?rate:price,d===0?`利润＝售价−进价＝${price+profit}−${price}＝${profit} 元。`:d===1?`利润率＝(售价−进价)÷进价×100%＝${rate}%。`:`设进价为 x 元，有 (1＋${rate}%)x＝${price+profit}，解得 x＝${price}。` ,d===1?'%':'元',[price,rate]);}
  else{const t=int(2,15),speed=a+b;set('journey',d===0?`甲、乙两人从相距 ${speed*t} km 的两地同时相向而行，速度分别为 ${a} km/h 和 ${b} km/h。几小时后相遇？`:d===1?`甲、乙两人从相距 ${speed*t} km 的两地同时相向而行，${t} 小时后相遇。甲的速度为 ${a} km/h，求乙的速度。`:`甲、乙两人从同一地点同时同向出发，甲的速度为 ${a+b} km/h，乙的速度为 ${b} km/h。几小时后甲领先乙 ${a*t} km？`,d===1?b:t,d===1?`设乙的速度为 v km/h，(${a}＋v)×${t}＝${speed*t}，解得 v＝${b}。`:d===0?`相向而行速度和为 ${speed} km/h，时间＝${speed*t}÷${speed}＝${t} h。`:`同向运动的速度差为 ${a+b}−${b}＝${a} km/h，时间＝${a*t}÷${a}＝${t} h。`,d===1?'km/h':'h',[a,b,t]);}
 }else{
  if(variant===0){const total=20*int(3,20),p=5*int(1,15),n=total*p/100;set('survey',d===0?`调查 ${total} 名学生，其中 ${n} 人选择篮球。求选择篮球的人数占比。`:d===1?`调查中 ${n} 人选择篮球，占被调查人数的 ${p}%。求被调查总人数。`:`随机调查 ${total} 名学生，其中 ${n} 人选择篮球。若全校有 ${total*10} 名学生，按此样本比例估计全校选择篮球的有多少人？`,d===0?p:d===1?total:n*10,d===0?`占比＝${n}÷${total}×100%＝${p}%。`:d===1?`设总人数为 x，${p}%×x＝${n}，所以 x＝${total}。`:`样本中选择篮球的比例为 ${n}÷${total}＝${p}%，估计全校有 ${total*10}×${p}%＝${n*10} 人。`,d===0?'%':'人',[total,p]);}
  else if(variant===1){const p=5*int(1,16),total=20*int(4,20);set('sector',d===0?`扇形统计图中某项目占 ${p}%，求该扇形的圆心角。`:d===1?`扇形统计图中某项目的圆心角为 ${18*(p/5)}°，求该项目的百分比。`:`某项目在扇形统计图中的圆心角为 ${18*(p/5)}°。若调查总人数为 ${total} 人，求该项目的人数。`,d===0?18*(p/5):d===1?p:total*p/100,d===0?`圆心角＝360°×${p}%＝${18*(p/5)}°。`:d===1?`占比＝${18*(p/5)}°÷360°×100%＝${p}%。`:`占比＝${18*(p/5)}°÷360°＝${p}%，人数＝${total}×${p}%＝${total*p/100}。`,d===0?'°':d===1?'%':'人',[total,p]);}
  else{const x=5*int(4,20),y=5*int(4,20),z=5*int(4,20);set('chart-read',d===0?`某班参加三个兴趣小组的人数分别为 ${x} 人、${y} 人、${z} 人，每人只参加一个小组。求参加小组的总人数。`:d===1?`某班参加三个兴趣小组的人数分别为 ${x} 人、${y} 人、${z} 人，每人只参加一个小组。人数最多与最少的小组相差多少人？`:`某校调查兴趣小组，A 组 ${x} 人，B 组 ${y} 人，C 组人数是 A、B 两组人数之和的 2 倍，每人只参加一个小组。若画条形统计图每格代表 5 人，C 组条形需画多少格？`,d===0?x+y+z:d===1?Math.max(x,y,z)-Math.min(x,y,z):2*(x+y)/5,d===0?`总人数＝${x}＋${y}＋${z}＝${x+y+z} 人。`:d===1?`最大值为 ${Math.max(x,y,z)}，最小值为 ${Math.min(x,y,z)}，差为 ${Math.max(x,y,z)-Math.min(x,y,z)} 人。`:`C 组人数＝2×(${x}＋${y})＝${2*(x+y)} 人，每格 5 人，需要 ${2*(x+y)}÷5＝${2*(x+y)/5} 格。`,d===2?'格':'人',[x,y,z]);}
 }
 return {chapter,level,template,values,text,answer:Number(answer.toFixed(6)),unit,explanation};
}
function validate(s){
 if(!s||typeof s.title!=='string'||s.title.length>80)throw Error('试卷标题最多 80 个字符。');
 if(!Array.isArray(s.chapters)||!s.chapters.length||s.chapters.some(c=>!Number.isInteger(c)||c<1||c>6)||new Set(s.chapters).size!==s.chapters.length)throw Error('请至少选择一个章节。');
 if(!levels[s.level])throw Error('请选择有效难度。');
 if(!s.counts||types.some(t=>!Number.isInteger(s.counts[t])||s.counts[t]<0||s.counts[t]>30))throw Error('每种题型的题数须为 0～30 的整数。');
 if(types.reduce((n,t)=>n+s.counts[t],0)<1||types.reduce((n,t)=>n+s.counts[t],0)>60)throw Error('每份试卷共 1～60 题。');
 if(!s.scores||types.some(t=>!Number.isInteger(s.scores[t])||s.scores[t]<1||s.scores[t]>20))throw Error('每题分值须为 1～20 的整数。');
 if(!Number.isInteger(s.minutes)||s.minutes<5||s.minutes>180)throw Error('考试时间须为 5～180 分钟。');
}
function generate(settings,seed){validate(settings);const s=JSON.parse(JSON.stringify(settings)),r=random(seed),questions=[],seen=new Set(),order=shuffle(s.chapters,r);let idx=0;
 for(const type of types)for(let i=0;i<s.counts[type];i++){
  const c=order[idx++%order.length];let q,tries=0;
  do{q=makeQuestion(c,s.level,r);if(++tries>2000)throw Error('当前章节的题目变化不足，请减少题量或增加章节。')}while(seen.has(q.text));seen.add(q.text);
  q.type=type;q.number=questions.length+1;q.score=s.scores[type];q.displayAnswer=String(q.answer)+q.unit;
  if(type==='choice'){const nums=new Set([q.answer]);const step=Number.isInteger(q.answer)?1:.5;while(nums.size<4){const candidate=Number((q.answer+(Math.floor(r()*12)-6)*step).toFixed(6));if(q.unit&&candidate<0)continue;nums.add(candidate)}q.options=shuffle([...nums],r).map(n=>String(n)+q.unit);q.correct=q.options.indexOf(q.displayAnswer);}
  questions.push(q);
 }
 return {version:1,seed:seed>>>0,settings:s,questions,total:questions.reduce((n,q)=>n+q.score,0),created:new Date().toISOString()};
}
function body(p,answers=false){return `<article class="exam-paper${answers?' answer-paper':''}"><header class="paper-head"><small>数学之间 · 北师大版七年级上册 · ${answers?'教师用参考答案':'学生试卷'}</small><h1>${esc(p.settings.title.trim()||'七年级数学练习卷')}${answers?' · 参考答案':''}</h1><p>${p.questions.length} 题 · 满分 ${p.total} 分 · 建议用时 ${p.settings.minutes} 分钟 · ${levels[p.settings.level]}</p><small>试卷编号 ${p.seed}</small>${answers?'':'<div class="student-line">班级：____________　姓名：____________　学号：____________</div>'}</header>${types.filter(t=>p.settings.counts[t]).map((t,i)=>`<section class="paper-section"><h2>${['一','二','三'][i]}、${labels[t]} <small>（共 ${p.settings.counts[t]} 题，每题 ${p.settings.scores[t]} 分，共 ${p.settings.counts[t]*p.settings.scores[t]} 分）</small></h2>${p.questions.filter(q=>q.type===t).map(q=>`<div class="paper-question"><p><b>${q.number}.</b> ${esc(q.text)}${t==='choice'?'（　　）':t==='fill'?'　________':''}</p>${t==='choice'?`<div class="paper-options">${q.options.map((o,j)=>`<span>${'ABCD'[j]}. ${esc(o)}</span>`).join('')}</div>`:''}${answers?`<div class="paper-answer"><strong>答案：${t==='choice'?'ABCD'[q.correct]+'（'+esc(q.displayAnswer)+'）':esc(q.displayAnswer)}</strong><p>${esc(q.explanation)}</p></div>`:t==='solution'?'<div class="working-space" aria-label="解答区域"></div>':''}</div>`).join('')}</section>`).join('')}<footer class="paper-footer">${answers?'参考解析可用于核对解题过程；解答题按过程酌情给分。':'请写清计算过程，完成后再检查一次。'} · 参数化原创练习</footer></article>`}
function documentHTML(p,answers=false){return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${esc(p.settings.title||'数学试卷')}${answers?'答案':''}</title><link rel="stylesheet" href="exam.css"></head><body class="paper-document">${body(p,answers)}</body></html>`}
root.EXAM_ENGINE={types,labels,levels,generate,validate,body,documentHTML,makeQuestion};
})(typeof window==='undefined'?globalThis:window);

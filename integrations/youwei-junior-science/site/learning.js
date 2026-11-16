(()=>{'use strict';
const D=window.SCIENCE,E=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const P=x=>String(x||'').split('\n').filter(Boolean).map(x=>'<p>'+E(x)+'</p>').join('');
const UL=x=>'<ul>'+(Array.isArray(x)?x:x&&typeof x==='object'?Object.entries(x).map(([k,v])=>k+'：'+v):x?[x]:[]).map(v=>'<li>'+E(v)+'</li>').join('')+'</ul>';
const prefix='zj-science-learning-v1:',memory=new Map();let storageOK=true;
function get(key,fallback=null){if(memory.has(key))return memory.get(key);try{const raw=localStorage.getItem(prefix+key);return raw===null?(memory.has(key)?memory.get(key):fallback):JSON.parse(raw);}catch(e){storageOK=false;return memory.has(key)?memory.get(key):fallback;}}
function put(key,value){try{localStorage.setItem(prefix+key,JSON.stringify(value));memory.delete(key);storageOK=memory.size===0;return true;}catch(e){memory.set(key,value);storageOK=false;return false;}}
function records(){const all=new Map(memory);try{for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k?.startsWith(prefix)){try{all.set(k.slice(prefix.length),JSON.parse(localStorage.getItem(k)));}catch(e){storageOK=false;}}}}catch(e){storageOK=false;}for(const [k,v] of memory)all.set(k,v);return all;}
const book=id=>D.books.find(b=>b.id===id),lesson=id=>D.lessons.find(l=>l.id===id);
const names={physics:'物理',chemistry:'化学',biology:'生物',earth:'地球与宇宙',shared:'探究与工程'};
const bank=D.lessons.flatMap(l=>l.checks.map(q=>({...q,lesson:l,kind:q.practice?'精选训练':'概念自测'}))).concat((D.illustrations||[]).filter(f=>f.status==='reviewed').map(f=>({id:f.id+'-reading',question:f.question,answer:f.answer,figure:f,lesson:lesson(f.lessonIds[0]),kind:'看图自测',hint:f.hint,rubric:f.rubric,goalIndexes:f.goalIndexes||[],remediationSection:f.remediationSection||'general'})));
const safeReturn=x=>typeof x==='string'&&x.length<1800&&/^#(?:home|preview|review|study|lesson|practice|notes|question|questions|paper|papers|books|book|subject|search|shared|bridges|coverage|curriculum|sources|print)(?:[/?]|$)/.test(x)?x:'';
function linked(hash,from=location.hash){const [p,q='']=hash.split('?'),params=new URLSearchParams(q);const back=safeReturn(from);if(back&&back!==hash)params.set('return',back);return p+(params.size?'?'+params.toString():'');}
const pendingMessage='仍有学习记录未写入浏览器存储，仅临时保留；请及时导出学习记录。';
const statusLine=()=>'<p class="save-message" role="status">'+(storageOK?'自动保存在此浏览器；更换浏览器或清理数据前，请导出学习记录。':pendingMessage)+'</p>';
function saved(el){const t=el?.closest('section,article,details')?.querySelector('.save-message')||document.querySelector('.save-message');if(t)t.textContent=storageOK?'已保存到此浏览器 · '+new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',second:'2-digit'}):pendingMessage;}
function noteBox(kind,id,section,title,source=''){const key='note:'+kind+':'+id+(section?':'+section:''),n=get(key,{})||{};return '<details class="personal-note no-print" data-note-key="'+E(key)+'"><summary>记笔记 / 写成自己的解释</summary><label>我的笔记<textarea data-note-field="note" rows="3" maxlength="20000" placeholder="哪里没懂？用什么证据解释？">'+E(n.note)+'</textarea></label>'+(source?'<button type="button" data-copy-source>以本段讲解为起点改写</button><label>我的改写 · 个人版本<textarea data-note-field="rewrite" rows="4" maxlength="20000" placeholder="保留必要条件，用自己的话重新解释。">'+E(n.rewrite)+'</textarea></label><p class="meta">原讲解在上方保留对照；此处修改只属于你的学习记录。</p>':'')+'<input type="hidden" data-note-title value="'+E(title)+'"><textarea hidden data-note-source>'+E(source)+'</textarea>'+statusLine()+'</details>';}
function bindNotes(root=document){root.querySelectorAll('[data-note-key]').forEach(box=>{const save=()=>{const val={...get(box.dataset.noteKey,{}),title:box.querySelector('[data-note-title]').value,updatedAt:new Date().toISOString()};box.querySelectorAll('[data-note-field]').forEach(t=>val[t.dataset.noteField]=t.value);put(box.dataset.noteKey,val);saved(box.querySelector('textarea'));};box.querySelectorAll('[data-note-field]').forEach(t=>t.oninput=save);const b=box.querySelector('[data-copy-source]');if(b)b.onclick=()=>{const t=box.querySelector('[data-note-field="rewrite"]');if(t.value.trim()){b.textContent='已有个人改写，已保留；可手动选择原文补充';return;}t.value=box.querySelector('[data-note-source]').value;save();t.focus();};});}
function attempt(qid,grade,entry={}){
 const old=get('attempt:'+qid,{})||{},at=new Date().toISOString(),run=entry.run||at;
 const previous=old.at?{...old}:null;if(previous)delete previous.history;
 const history=old.run===run?(old.history||[]):[...(old.history||[]),...(previous?[previous]:[])].slice(-10);
 const days=[1,3,7].includes(Number(entry.days))?Number(entry.days):1;
 return put('attempt:'+qid,{...entry,grade,at,updatedAt:at,run,history,days,due:new Date(Date.parse(at)+days*86400000).toISOString()});
}
function reviseAttempt(qid,entry={}){
 const old=get('attempt:'+qid);if(!old||old.run!==entry.run)return true;
 const days=[1,3,7].includes(Number(entry.days))?Number(entry.days):(old.days||1);
 return put('attempt:'+qid,{...old,...entry,days,updatedAt:new Date().toISOString(),due:new Date(Date.parse(old.at)+days*86400000).toISOString()});
}
function goalState(l,index){
 const qs=bank.filter(q=>q.lesson.id===l.id&&(q.goalIndexes||[]).includes(index)),rs=qs.map(q=>get('attempt:'+q.id));
 const count=rs.filter(Boolean).length,weak=rs.some(r=>r&&r.grade!=='independent'),due=rs.some(r=>r?.due&&Date.parse(r.due)<=Date.now());
 return {count,total:qs.length,weak,due,label:!qs.length?'对应检查待补':weak?'需要再练':due?'到了复测时间':!count?'尚未检索':count<qs.length?'部分题有记录':'本目标题目均有自评'};
}
function courseState(id){const l=lesson(id),qs=bank.filter(q=>q.lesson.id===id),rs=qs.map(q=>get('attempt:'+q.id));const count=rs.filter(Boolean).length;const weak=rs.some(r=>r&&r.grade!=='independent');const due=rs.some(r=>r?.due&&Date.parse(r.due)<=Date.now());const unseenGoals=l.goals.filter((_,i)=>!goalState(l,i).count).length;return {count,total:qs.length,weak,due,unseenGoals,label:weak?'需要复习':!count?'尚未检索':count===qs.length?'本课题目均有自评':'已检索 '+count+'/'+qs.length};}
function objectivePlan(l,selected){
 const goals=Array.isArray(selected)&&selected.length?[...new Set(selected)].filter(i=>Number.isInteger(i)&&i>=0&&i<l.goals.length):l.goals.map((_,i)=>i);
 const routes=goals.map(i=>(l.goalRoutes||[]).find(r=>r.goalIndex===i));
 const sections=[...new Set(routes.flatMap(r=>r?.sectionIndexes||[]))].filter(i=>l.sections[i]);
 const checks=routes.map(r=>(r?.checkIndexes||[]).filter(i=>l.checks[i]));
 return {goals,sections,first:[...new Set(checks.map(c=>c[0]).filter(i=>i!==undefined))],exit:[...new Set(checks.map(c=>c[c.length-1]).filter(i=>i!==undefined))],unmapped:goals.filter((_,i)=>!checks[i].length),same:goals.filter((_,i)=>checks[i].length===1)};
}
function archivePractice(s){
 if(!s?.run||!s.records||!Object.values(s.records).some(r=>r.draft||r.paper||r.correction||r.grade||r.hintUsed||r.mistake))return;
 const old=get('practice:archive',{sessions:[]});const sessions=(old.sessions||[]).filter(x=>x.run!==s.run);sessions.push(JSON.parse(JSON.stringify(s)));
 put('practice:archive',{sessions,updatedAt:new Date().toISOString()});
}
function field(key,label,rows=3,value=''){return '<label class="study-field">'+E(label)+'<textarea data-study-field="'+E(key)+'" rows="'+rows+'" maxlength="20000">'+E(value)+'</textarea></label>';}
function studyURL(id,mode='preview',step=0,from=''){return linked('#study/'+id+'?mode='+mode+'&step='+step,from);}
function planner(mode,params){
 const review=mode==='review',scoped=['subject','book','chapter','state'].some(k=>params.get(k));
 const select=(key,label,options)=>'<label>'+label+'<select name="'+key+'">'+options.map(([id,title])=>'<option value="'+E(id)+'" '+(params.get(key)===String(id)?'selected':'')+'>'+E(title)+'</option>').join('')+'</select></label>';
 return '<div class="eyebrow">'+(review?'逐个目标检索，再把知识连起来':'本次重点决定问题与阅读内容')+'</div><h1>'+(review?'复习全貌与薄弱点':'选好这一课，带问去上课')+'</h1><p class="lead">'+(review?'从本章目标查遗漏，先闭卷解释，再按错因回看。':'选课与目标，先尝试对应问题，再阅读需要的段落。')+'</p><details class="planner-settings" '+(!scoped?'open':'')+'><summary>学习范围 · <span id="scope-label">修改学科、册别和章节</span></summary><form class="filters" id="study-filter">'+select('subject','学科',[['','全部学科'],...Object.entries(names)])+select('book','册别',[['','六册总览'],...D.books.map(b=>[b.id,b.title+(b.available?'':' · 原文待补')])])+select('chapter','章节',[['','全部章节'],...[1,2,3,4,5,6].map(n=>[n,'第'+n+'章'])])+select('state','学习状态',[['','全部内容'],['unseen','含尚未检索的目标'],['weak','需要复习'],['due','已到自定复测时间']])+'<button type="submit">按此范围学习</button></form></details><div id="study-list"></div>';
}
function mountPlanner(mode,params){
 const f=document.querySelector('#study-filter'),host=document.querySelector('#study-list');
 const draw=()=>{
  const p=new URLSearchParams(new FormData(f));history.replaceState(null,'','#'+mode+'?'+p.toString());
  const scope=D.lessons.filter(l=>(!p.get('subject')||l.subject===p.get('subject'))&&(!p.get('book')||l.book===p.get('book'))&&(!p.get('chapter')||String(l.chapter)===p.get('chapter')));
  const view=scope.filter(l=>{const st=courseState(l.id);return !p.get('state')||p.get('state')==='unseen'&&st.unseenGoals>0||p.get('state')==='weak'&&st.weak||p.get('state')==='due'&&st.due;});
  const total=scope.reduce((n,l)=>n+l.goals.length,0),seen=scope.reduce((n,l)=>n+l.goals.filter((_,i)=>goalState(l,i).count).length,0);
  document.querySelector('#scope-label').textContent=[names[p.get('subject')]||'全部学科',book(p.get('book'))?.title||'全部册别',p.get('chapter')?'第'+p.get('chapter')+'章':''].filter(Boolean).join(' · ');
  const rows=view.map(l=>{
   const st=courseState(l.id),targets=l.goals.map((g,i)=>{const gs=goalState(l,i);const url=linked('#practice?lesson='+l.id+'&goal='+i,location.hash);return '<li><span>'+E(g)+'</span><small>'+E(gs.label)+' · '+gs.count+'/'+gs.total+'题有记录</small><a href="'+E(url)+'">练此目标 →</a></li>';}).join('');
   return '<article class="review-row"><div><span class="tag">'+E(book(l.book)?.title)+' · 第'+l.chapter+'章</span><span class="tag '+(st.weak?'needs-review':'')+'">'+E(st.label)+'</span><h2>'+E(l.title)+'</h2>'+(mode==='review'?'<details class="goal-blueprint"><summary>'+l.goals.length+' 个学习目标 · '+st.unseenGoals+' 个尚未检索</summary><ul>'+targets+'</ul></details>':'<p class="meta">'+E(l.goals.join('；'))+'</p>')+'</div><div class="actions"><a class="button primary" href="'+E(studyURL(l.id,mode,0,location.hash))+'">'+(mode==='review'?'闭卷检索本课':'开始预习')+'</a><a href="'+E(linked('#lesson/'+l.id))+'">完整讲解</a><a href="'+E(linked('#practice?lesson='+l.id))+'">练本课</a></div></article>';
  }).join('');
  const relations=mode==='review'&&p.get('book')&&p.get('chapter')?scope.flatMap(l=>(D.support.prerequisiteLessons[l.id]||[]).filter(id=>scope.some(x=>x.id===id)).map(id=>'<li><a href="'+E(linked('#lesson/'+id))+'">'+E(lesson(id)?.title)+'</a> → <a href="'+E(linked('#lesson/'+l.id))+'">'+E(l.title)+'</a></li>')):[];
  host.innerHTML='<p class="scope-summary"><strong>'+view.length+' 课</strong> · '+seen+'/'+total+' 个现有目标涉及已自评题目</p><p class="meta">此处是现有课程目标清单，不是全教材覆盖率或掌握率。'+(mode==='review'?'复习时也要检查未练目标，不只筛错题。':'')+'</p>'+(!p.get('book')||p.get('book')==='9x'?'<p class="note">新版九下原文待补。<a href="#coverage">查看覆盖缺口 →</a></p>':'')+(mode==='review'&&scope.length?'<div class="actions review-scope-actions"><a class="button" href="'+E(linked('#practice?'+new URLSearchParams({subject:p.get('subject')||'',book:p.get('book')||'',chapter:p.get('chapter')||'',focus:'coverage'})))+'">按目标均衡检索本范围 →</a></div>':'')+(rows||'<p class="empty">当前范围没有匹配单元；请扩大范围。没有记录不代表已经学会。</p>')+(relations.length?'<details class="panel"><summary>本章概念衔接 · 建议前置关系</summary><p>先解释前一概念怎样帮助后一概念，再打开讲解核对。这些关系不是全章知识图谱的完整性证明。</p><ul>'+relations.join('')+'</ul></details>':'');
 };
 f.onchange=draw;f.onsubmit=e=>{e.preventDefault();draw();f.closest('details').open=false;};draw();
}
const activities={
 buoyancy:['固定总体积500 cm³，只改变浸入比例40%、60%、100%。','预测浮力怎样变化；记录三次V排与F浮，再解释完全浸没后的排液体积。'],
 density:['固定体积100 cm³，把质量从100 g改为200 g。然后固定质量，再改变体积。','每次只改一个量，写出两组密度；区分“换材料模型”与“同一材料切开”。'],
 ohm:['固定电阻10 Ω，把电压由3 V改为6 V。','先预测电流的倍数，再检查I；说明同一元件、温度不变的条件。'],
 lenses:['依次选择u/f＝3、2、1.5、0.75，每次用步进画出两条光线。','预测像的虚实与大小，再观察交点；不把模型公式列为必背要求。'],
 series:['把变阻器接入电阻由10 Ω改为20 Ω，电源保持6 V。','预测电流和两段分压的方向，记录数值，再检查两段电压之和。'],
 neutralization:['分别比较加入NaOH溶液50 g、100 g、150 g的状态。','逐一记录剩余H⁺或OH⁻；对照模型条件辨认反应发生和恰好完全。'],
 motion:['分别设速度为5 m/s、0、−5 m/s，步进相同次数。','比较位置变化，说明负号表示方向，不表示速率小于零。'],
 thermal:['固定质量和比热容，比较升温10 ℃与20 ℃。','预测吸热量关系；说明Q＝cmΔt不能直接描述正在发生相变的吸热过程。'],
 reflection:['固定两种介质，改变入射角；角度从法线量起。','画出入射、反射与折射光线的相对关系，再用模型核对；数值折射率属理解补充。'],
 energy:['固定质量1 kg、高度10 m，先预测从顶部运动到底部时两种机械能的变化。','暂停或步进，比较动能与势能；确认模型没有摩擦损失。'],
 electromagnet:['先固定100匝比较1 A与2 A；再把电流改为−1 A。','分别记录相对强弱和方向，区别增大电流与改变电流方向。'],
 inheritance:['先比较Aa×Aa，再固定一个亲本Aa，把另一个改为aa。','操作前写出配子，再逐格数基因型与表型；比例是概率，不是固定配额。'],
 earth:['选择地球上的同一位置，播放后暂停，追踪它进入明暗区域。','记录昼夜变化由自转造成；演示速度只是播放快慢，不是地球实际转速变化。'],
 diffusion:['先预测粒子分布，再播放、暂停或步进观察。','看总体分布与单个粒子方向是否相同；不把理想运动动画当真实扩散速率测量。']
};
function activity(l,st){const a=activities[l.lab];return a?'<section class="panel activity-sheet"><h2>先预测，再动手</h2><p>'+E(a[0])+'</p>'+field('prediction','操作前，我预测',2,st.prediction)+'<p>'+E(a[1])+'</p></section><section class="lab" id="lab-host" data-lab="'+E(l.lab)+'"></section><section class="panel">'+field('observation','我改变了什么，观察到了什么？',3,st.observation)+field('explanation','怎样用概念解释？条件是什么？',3,st.explanation)+statusLine()+'</section>':'';}
function sectionBody(s){return (s.level?'<p class="meta">'+(s.level==='textbook'?'教材基础':'理解与运用补充 · 不增加教材必记公式')+'</p>':'')+P(s.body)+(s.formula?'<div class="formula">'+E(s.formula)+'</div>':'')+(s.steps?.length?'<ol>'+s.steps.map(x=>'<li>'+P(x)+'</li>').join('')+'</ol>':'')+(s.table?'<div class="table-wrap"><table>'+s.table.map((r,i)=>'<tr>'+r.map(x=>'<'+(i?'td':'th')+'>'+E(x)+'</'+(i?'td':'th')+'>').join('')+'</tr>').join('')+'</table></div>':'');}
function figureHTML(l){return (D.illustrations||[]).filter(f=>f.lessonIds.includes(l.id)&&f.status==='reviewed').map(f=>'<figure class="panel generated-figure"><h2>'+E(f.title)+'</h2><a href="'+E(f.file)+'" target="_blank" rel="noopener"><img src="'+E(f.file)+'" width="1536" height="1024" alt="'+E(f.alt)+'"></a><figcaption><a class="button no-print" href="'+E(f.file)+'" target="_blank" rel="noopener">放大读图 ↗</a><p class="meta">原创示意图 · 先观察，再读下方解释。</p><details><summary>展开读图步骤与条件</summary>'+UL(f.readingSteps)+P(f.caption)+'</details></figcaption></figure>').join('');}
function studyQuestion(l,index,mode,stage,st){
 const q=l.checks[index],key=mode+':'+stage+':'+q.id,r=st.work?.[key]||{};
 return '<article class="panel retrieval-card" data-study-question="'+E(key)+'" data-qid="'+E(q.id)+'"><p class="meta">'+E((q.goalIndexes||[]).map(i=>l.goals[i]).filter(Boolean).join('；'))+' · 本站原创</p><h2>'+E(q.question)+'</h2><label>我的判断与过程<textarea data-work-field="draft" rows="4" maxlength="20000">'+E(r.draft)+'</textarea></label><label class="goal-option"><input type="checkbox" data-work-paper '+(r.paper?'checked':'')+'>已在纸上独立尝试</label><details class="study-hint"><summary>卡住时看提示</summary><p>'+E(q.hint||'本题专门提示仍待补充，可回看下面关联的讲解。')+'</p></details><details class="solution"><summary>已经尝试，核对解释与条件</summary><div class="answer">'+P(q.answer)+P(q.reason)+(q.rubric?'<h3>逐项核对</h3>'+UL(q.rubric):'')+'</div><label>我发现的缺口 / 订正<textarea data-work-field="gap" rows="3" maxlength="20000">'+E(r.gap)+'</textarea></label><div class="actions">'+[['independent','独立完成'],['hint','提示后完成'],['retry','仍需回课']].map(([k,v])=>'<button data-work-grade="'+k+'" aria-pressed="'+(r.grade===k)+'">'+v+'</button>').join('')+'</div></details><div class="actions"><a href="'+E(linked('#lesson/'+l.id+'?section='+(q.remediationSection||'general'),location.hash))+'">回看本题对应讲解 →</a></div><p class="save-message" role="status">'+(r.grade?'已记录本题自评；不代表长期掌握。':'草稿自动保存；空白不计为已检索。')+'</p></article>';
}
function study(l,params){
 if(!l)return '<h1>未找到学习单元</h1><a href="#preview">返回预习目录</a>';
 const mode=params.get('mode')==='review'?'review':'preview',st=get('study:'+l.id,{})||{},step=Math.max(0,Math.min(3,Math.trunc(Number(params.get('step'))||0)));
 const plan=objectivePlan(l,st.goals),back=safeReturn(params.get('return'))||'#'+mode;
 const steps=mode==='review'?['检查目标全貌','闭卷逐项检索','按缺口回看','出口检查与再测']:['选择目标','先试对应问题','定向阅读与探究','出口检查与追问'];
 let body='';
 if(step===0){
  body='<section class="panel"><h2>'+(mode==='review'?'本课哪些目标还没有独立解释过？':'这次重点解决什么？')+'</h2><p class="meta">未勾选时学习全部目标；勾选后，问题与讲解会按目标调整。选择是计划，不是完成记录。</p>'+l.goals.map((g,i)=>'<label class="goal-option"><input type="checkbox" data-goal="'+i+'" '+((st.goals||[]).includes(i)?'checked':'')+'><span>'+E(g)+(mode==='review'?'<small>'+E(goalState(l,i).label)+'</small>':'')+'</span></label>').join('')+'<p><button data-all-goals>选择全部目标</button></p>'+field('question','我现在最想弄懂的问题',2,st.question)+statusLine()+'</section>';
  if(mode==='review')body+='<section class="panel"><h2>先闭卷，再查缺</h2><p>下一步逐个目标尝试。使用提示、完成订正和自评会分别保留；已有作答可继续编辑，也可保留旧稿后开始新尝试。</p><button data-fresh-review>保留旧作答，开始新尝试</button></section>';
  else body+='<section class="panel"><h2>前置知识：卡住时再回来</h2>'+UL(l.prerequisites)+(D.support.prerequisiteLessons[l.id]||[]).map(lesson).filter(Boolean).map(p=>'<a class="prereq-link" href="'+E(linked('#lesson/'+p.id,location.hash))+'">'+E(p.title)+' →</a>').join('')+'</section>';
 }
 if(step===1||step===3){
  const ids=step===1?plan.first:plan.exit,stage=step===1?'first':'exit';
  body='<p class="focus-reminder">本次目标：'+E(plan.goals.map(i=>l.goals[i]).join('；'))+'</p>'+(step===3&&plan.same.length?'<p class="note">'+E(plan.same.map(i=>l.goals[i]).join('；'))+'：目前只有同目标题可核对，不把重做原题称为迁移；新变式仍待补。</p>':'')+ids.map(i=>studyQuestion(l,i,mode,stage,st)).join('');
  if(plan.unmapped.length)body+='<p class="note">以下目标题目待补，不能据此判断完成：'+E(plan.unmapped.map(i=>l.goals[i]).join('；'))+'</p>';
  if(step===3)body+='<section class="panel">'+field('nextQuestion',mode==='review'?'下次闭卷再测前，我要补哪一步？':'带去课堂：我还想追问什么？',3,st.nextQuestion)+'<div class="actions"><a class="button primary" href="'+E(linked('#practice?lesson='+l.id+'&focus=unseen'+'&goal='+plan.goals.join(','),location.hash))+'">练同目标尚未自评的题 →</a><a href="#notes">查看与导出记录</a></div></section>';
 }
 if(step===2){
  const chosen=plan.sections.length?plan.sections:l.sections.map((_,i)=>i);
  body='<p class="focus-reminder">本次重点：'+E(plan.goals.map(i=>l.goals[i]).join('；'))+'</p><section class="panel intuition"><h2>先用现象提出问题</h2>'+P(l.intuition)+'</section><section class="panel"><h2>与所选目标对应的讲解</h2><p class="meta">共 '+chosen.length+' 段。先合上答案解释，再展开核对；需要完整上下文时可打开完整讲解。</p>'+chosen.map(i=>{const v=l.sections[i];return '<details class="reading-part" id="read-s'+i+'"><summary>'+E(v.title)+'</summary>'+sectionBody(v)+noteBox('lesson',l.id,'s'+i,v.title,v.body)+'</details>';}).join('')+'</section>'+figureHTML(l)+(window.ScienceDiagrams?.render(l.id)||'')+(l.conditions?.length?'<section class="panel conditions"><h2>使用结论前检查条件</h2>'+UL(l.conditions)+'</section>':'')+(l.lab?'<details class="supplementary-activity"><summary>本课演示与探究 · 按需要操作</summary>'+activity(l,st)+'</details>':'')+(l.experiment?'<details class="panel"><summary>教材实验：'+E(l.experiment.title)+'</summary>'+P(l.experiment.question)+'<h3>变量与控制</h3>'+UL(l.experiment.variables||[])+'<h3>操作</h3>'+UL(l.experiment.steps||[])+'<h3>现象与结论</h3>'+P(l.experiment.observation)+P(l.experiment.conclusion)+UL(l.experiment.errors||[])+'</details>':'')+(l.misconceptions?.length?'<details class="panel"><summary>易错辨析</summary>'+l.misconceptions.map(m=>'<p>判断这句话：'+E(m.wrong)+'</p><details><summary>核对条件与理由</summary>'+P(m.correct)+P(m.why)+'</details>').join('')+'</details>':'')+field('explainBack','合上讲解，用自己的话解释本次目标',3,st.explainBack);
 }
 return '<div class="breadcrumbs"><a href="'+E(back)+'">← 返回学习清单</a> / '+E(book(l.book)?.title)+' · 第'+l.chapter+'章</div><div class="eyebrow">'+names[l.subject]+' · '+(mode==='review'?'复习任务':'预习任务')+'</div><h1>'+E(l.title)+'</h1><nav class="study-steps" aria-label="本课学习步骤">'+steps.map((v,i)=>'<a '+(step===i?'aria-current="step"':'')+' href="'+E(studyURL(l.id,mode,i,back))+'"><span>'+String(i+1).padStart(2,'0')+'</span>'+v+'</a>').join('')+'</nav><p class="meta">第 '+(step+1)+' / 4 步 · 步数仅表示位置，题目自评不代表长期掌握。</p><div id="study-work" data-lesson="'+E(l.id)+'">'+body+'</div><div class="study-bottom actions"><a class="button" href="'+E(step?studyURL(l.id,mode,step-1,back):back)+'">'+(step?'上一步':'返回清单')+'</a>'+(step<3?'<a class="button primary" href="'+E(studyURL(l.id,mode,step+1,back))+'">下一步：'+steps[step+1]+' →</a>':'')+'<a href="'+E(linked('#lesson/'+l.id,location.hash))+'">完整讲解与真题</a></div>';
}
function mountStudy(l,params){
 if(!l)return;let st=get('study:'+l.id,{})||{};const host=document.querySelector('#study-work');
 st.lastRoute=location.hash;st.updatedAt=new Date().toISOString();put('study:'+l.id,st);
 const save=el=>{st.updatedAt=new Date().toISOString();put('study:'+l.id,st);saved(el);};
 host.querySelectorAll('[data-study-field]').forEach(t=>t.oninput=()=>{st[t.dataset.studyField]=t.value;save(t);});
 host.querySelectorAll('[data-goal]').forEach(t=>t.onchange=()=>{st.goals=[...host.querySelectorAll('[data-goal]:checked')].map(t=>Number(t.dataset.goal));save(t);});
 const all=host.querySelector('[data-all-goals]');if(all)all.onclick=()=>{host.querySelectorAll('[data-goal]').forEach(t=>t.checked=true);st.goals=l.goals.map((_,i)=>i);save(all);};
 const fresh=host.querySelector('[data-fresh-review]');if(fresh)fresh.onclick=()=>{
  const key='note:lesson:'+l.id+':general',note=get(key,{})||{};
  const old=[...Object.entries(st.work||{}).map(([key,r])=>key+'\n'+(r.draft||'')+'\n订正：'+(r.gap||'')),...['firstAnswer','firstGap','prediction','observation','explanation','explainBack','exitAnswer','nextQuestion'].filter(k=>st[k]).map(k=>k+'：'+st[k])].join('\n\n');
  if(old)put(key,{...note,title:l.title+' · 回忆记录',note:(note.note?note.note+'\n\n':'')+new Date().toLocaleString('zh-CN')+'\n'+old});
  st={goals:st.goals||[],question:st.question||'',lastRoute:location.hash,updatedAt:new Date().toISOString()};save(fresh);fresh.textContent='旧作答已保留，新尝试为空白';
 };
 host.querySelectorAll('[data-study-question]').forEach(card=>{
  const key=card.dataset.studyQuestion,qid=card.dataset.qid;st.work=st.work||{};const r=st.work[key]||(st.work[key]={draft:'',gap:'',paper:false,hintUsed:false});
  const sync=()=>{if(r.grade)reviseAttempt(qid,{run:r.run,draft:r.draft,correction:r.gap,paper:r.paper,hintUsed:r.hintUsed});save(card.querySelector('textarea'));};
  card.querySelectorAll('[data-work-field]').forEach(t=>t.oninput=()=>{r[t.dataset.workField]=t.value;sync();});
  card.querySelector('[data-work-paper]').onchange=e=>{r.paper=e.target.checked;sync();};
  card.querySelector('.study-hint').ontoggle=e=>{if(e.target.open){r.hintUsed=true;if(r.grade==='independent'){r.grade='hint';reviseAttempt(qid,{run:r.run,grade:'hint',hintUsed:true});card.querySelectorAll('[data-work-grade]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.workGrade===r.grade)));}sync();}};
  card.querySelectorAll('[data-work-grade]').forEach(b=>b.onclick=()=>{
   if(!r.draft.trim()&&!r.paper){card.querySelector('.save-message').textContent='请先作答或记录纸上尝试，空白不能计为已检索。';return;}
   r.grade=b.dataset.workGrade==='independent'&&r.hintUsed?'hint':b.dataset.workGrade;r.run=r.run||Date.now()+'-'+key;
   attempt(qid,r.grade,{run:r.run,draft:r.draft,correction:r.gap,paper:r.paper,hintUsed:r.hintUsed,days:1});save(b);
   card.querySelectorAll('[data-work-grade]').forEach(x=>x.setAttribute('aria-pressed',String(x===b&&r.grade===b.dataset.workGrade||x.dataset.workGrade===r.grade)));
   card.querySelector('.save-message').textContent=storageOK?'已记录：'+{independent:'独立完成',hint:'提示后完成',retry:'仍需回课'}[r.grade]+'；可在练习页调整复测日期。':pendingMessage;
  });
 });bindNotes(host);
}
function enhanceLesson(l,params){const main=document.querySelector('#main'),intro=main.querySelector('.intro-explanation');if(!intro)return;const back=safeReturn(params.get('return'));const toolbar=document.createElement('section');toolbar.className='reader-tools no-print';toolbar.innerHTML=(back?'<a class="return-link" href="'+E(back)+'">← 返回刚才的学习任务 / 题目</a>':'')+'<div class="actions"><a class="button primary" href="'+E(studyURL(l.id,'preview',0,location.hash))+'">带着任务预习</a><a class="button" href="'+E(studyURL(l.id,'review',0,location.hash))+'">闭卷回忆这课</a><a class="button" href="'+E(linked('#practice?lesson='+l.id))+'">精准练习</a><label>字号 <select data-reader-font><option value="16">标准</option><option value="18">较大</option><option value="20">大字</option></select></label></div><details class="reader-toc"><summary>本课阅读目录 · 直接到需要的位置</summary>'+l.sections.map((s,i)=>'<a href="'+E('#lesson/'+l.id+'?section=s'+i+(back?'&return='+encodeURIComponent(back):''))+'">'+E(s.title)+'</a>').join('')+'<a href="'+E('#lesson/'+l.id+'?section=conditions'+(back?'&return='+encodeURIComponent(back):''))+'">公式与结论的适用条件</a></details>';intro.before(toolbar);if(back){const strip=document.createElement('div');strip.className='reader-return no-print';strip.innerHTML='<a href="'+E(back)+'">← 返回刚才的题目 / 学习任务</a>';main.prepend(strip);}const font=get('setting:reader',{font:16}).font;intro.style.fontSize=([16,18,20].includes(Number(font))?font:16)+'px';toolbar.querySelector('select').value=font;toolbar.querySelector('select').onchange=e=>{intro.style.fontSize=e.target.value+'px';put('setting:reader',{font:Number(e.target.value)});};l.sections.forEach((s,i)=>{const node=[...intro.children].find(n=>n.querySelector('h2')?.textContent===s.title);if(node){node.id='read-s'+i;node.insertAdjacentHTML('beforeend',noteBox('lesson',l.id,'s'+i,s.title,s.body));}});const conditions=intro.querySelector('.conditions');if(conditions)conditions.id='read-conditions';intro.insertAdjacentHTML('beforeend',noteBox('lesson',l.id,'general',l.title));const general=intro.querySelector('[data-note-key="note:lesson:'+l.id+':general"]');if(general)general.id='read-general';bindNotes(intro);if(params.get('section'))requestAnimationFrame(()=>{const target=document.getElementById('read-'+params.get('section'));target?.scrollIntoView({block:'start'});});}
function enhanceQuestion(q,params){if(!q)return;const main=document.querySelector('#main'),back=safeReturn(params.get('return'));const section=document.createElement('section');section.className='panel question-work no-print';section.innerHTML=(back?'<a href="'+E(back)+'">← 返回刚才的练习 / 清单</a>':'')+'<h2>边读原题，边记录自己的推理</h2><p class="meta">'+(D.publicSite?'本站索引不是完整题面。请从上方原出处按卷名、题号查题，完整阅读选项与图表，再记录自己的推理。':'本站索引不是完整题面。先打开上方原卷所在页；题目跨页时继续阅读。个人笔记可编辑，原卷PDF保持来源原貌。')+'</p>'+noteBox('question',q.id,'work',q.year+'年第'+q.number+'题')+(q.lessonIds.length?'<div class="actions">'+q.lessonIds.slice(0,3).map(id=>'<a href="'+E(linked('#lesson/'+id+'?section=conditions'))+'">回看条件：'+E(lesson(id)?.title)+'</a>').join('')+'</div>':'');const analysis=main.querySelector('.exam-analysis');if(analysis)analysis.before(section);else main.append(section);bindNotes(section);}
function dashboard(){const attempted=D.lessons.filter(l=>courseState(l.id).count).length;const due=bank.filter(q=>{const a=get('attempt:'+q.id);return a?.due&&Date.parse(a.due)<=Date.now();}).length;const recent=[...records()].filter(([k,v])=>k.startsWith('study:')&&v.lastRoute).sort((a,b)=>String(b[1].updatedAt).localeCompare(String(a[1].updatedAt)))[0];return '<div class="home-learning"><div class="eyebrow">科学学习工作台 · 浙教版新版教材</div><h1>今天，你想学会什么？</h1><p class="lead">预习时带着问题，复习时先试着回忆，练习后找到真正卡住的一步。</p><div class="learning-modes"><a class="mode-card" href="#preview"><span class="mode-number">01 / 课前</span><h2>有重点地预习</h2><p>选课次 → 定目标 → 看图探究<br>带着自己的问题去上课</p><strong>选这一课 →</strong></a><a class="mode-card" href="#review"><span class="mode-number">02 / 回顾</span><h2>有全貌地复习</h2><p>按册章查遗漏，闭卷检索<br>把薄弱点重新连回知识体系</p><strong>打开复习清单 →</strong></a><a class="mode-card" href="#practice"><span class="mode-number">03 / 运用</span><h2>有反馈地练习</h2><p>先做 → 提示 → 订正 → 再测<br>一道题弄清一个问题</p><strong>开始刻意练习 →</strong></a></div><div class="learning-resume"><p><strong>'+attempted+'</strong> 个单元有检索记录 · <strong>'+due+'</strong> 题到了自定复测时间</p><div class="actions">'+(recent?'<a class="button primary" href="'+E(safeReturn(recent[1].lastRoute)||'#preview')+'">继续上次学习 →</a>':'')+'<a href="#notes">我的笔记与学习单</a><a href="#review?state=unseen">看看哪些还没练过</a></div><p class="meta">记录来自你的作答与自评；浏览页面不会增加掌握进度。</p></div></div>';}
function download(name,text,type){const a=document.createElement('a'),url=URL.createObjectURL(new Blob([text],{type}));a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function workText(st){return Object.entries(st.work||{}).filter(([,r])=>r.draft||r.gap||r.paper).map(([key,r])=>{const q=bank.find(q=>q.id===key.split(':').slice(2).join(':'));return '### '+(q?.question||key)+'\n\n'+(r.draft||'已在纸上尝试')+'\n\n订正：'+(r.gap||'')+'\n\n';}).join('');}
function exportMarkdown(){
 let md='# 我的科学学习单\n\n导出日期：'+new Date().toLocaleDateString('zh-CN')+'\n\n';
 const group=s=>'## 练习组 '+s.run+'\n\n'+Object.entries(s.records||{}).map(([id,r])=>'### '+(bank.find(q=>q.id===id)?.question||id)+'\n\n'+(r.draft||'（未填写文字）')+'\n\n订正：'+(r.correction||'')+'\n\n').join('');
 for(const [k,v] of records()){
  if(k.startsWith('note:'))md+='## '+(v.title||k)+'\n\n'+(v.note||'')+'\n\n### 我的改写\n\n'+(v.rewrite||'')+'\n\n';
  if(k==='practice:active')md+=group(v);
  if(k==='practice:archive')md+=(v.sessions||[]).map(group).join('');
  if(k.startsWith('attempt:')){const q=bank.find(q=>q.id===k.slice(8));md+='## 练习：'+(q?.question||k)+'\n\n我的作答：'+(v.draft||'（纸上作答）')+'\n\n我的订正：'+(v.correction||'')+'\n\n错因：'+(v.mistake||'未填写')+'\n\n'+(v.history||[]).filter(r=>r.draft||r.correction).map(r=>'较早尝试 '+r.at+'\n\n'+(r.draft||'')+'\n\n订正：'+(r.correction||'')+'\n\n').join('');}
  if(k.startsWith('study:')){const l=lesson(k.slice(6));md+='## '+(l?.title||k)+'\n\n'+Object.entries(v).filter(([k,v])=>['question','firstAnswer','firstGap','prediction','observation','explanation','explainBack','exitAnswer','nextQuestion'].includes(k)&&v).map(([k,v])=>'### '+({question:'我的问题',firstAnswer:'先试一问',firstGap:'发现的缺口',prediction:'预测',observation:'观察',explanation:'解释',explainBack:'自己的理解',exitAnswer:'出口作答',nextQuestion:'待追问'}[k])+'\n\n'+v+'\n\n').join('')+workText(v);}
 }return md;
}
function practiceNotes(){const attempts=[...records()].filter(([k])=>k.startsWith('attempt:')).sort((a,b)=>String(b[1].at).localeCompare(String(a[1].at)));const active=get('practice:active'),archive=get('practice:archive',{sessions:[]});return '<section class="panel"><h2>练习作答与订正</h2>'+((archive.sessions||[]).length?'<details><summary>保留的旧练习组 · '+archive.sessions.length+' 组</summary>'+archive.sessions.map(v=>'<p class="archive-description">'+E([...new Set(v.ids.map(id=>bank.find(q=>q.id===id)?.lesson.title).filter(Boolean))].slice(0,2).join('；'))+'</p><p><a href="#practice?archive='+E(encodeURIComponent(v.run))+'">返回 '+v.ids.length+' 题的旧组，继续编辑 →</a></p>').join('')+'</details>':'')+(active?'<p><a href="#practice?resume=1">继续当前题组，修改尚未提交的草稿 →</a></p>':'')+(attempts.length?attempts.map(([key,a])=>{const q=bank.find(q=>q.id===key.slice(8));return q?'<details><summary>'+E(q.question)+'</summary><p>本次自评：'+E({independent:'独立完成',hint:'提示后完成',retry:'仍需回课'}[a.grade])+'</p><h3>我的作答</h3>'+P(a.draft||'已记录纸上尝试')+'<h3>订正与错因</h3>'+P(a.correction||'暂未填写')+P(a.mistake)+'<p>自定复测：'+E(a.due?new Date(a.due).toLocaleDateString('zh-CN'):'未安排')+'</p>'+'<a class="no-print" href="'+E(linked('#practice?edit='+q.id,'#notes'))+'">修改这道题的记录 →</a></details>':'';}).join(''):'<p>尚无自评记录。先独立尝试，再对照过程；未作答不会自动计为完成。</p>')+'</section>';}
function notesPage(){const rows=[...records()].filter(([k,v])=>k.startsWith('note:')&&(v.note||v.rewrite));const studies=[...records()].filter(([k,v])=>k.startsWith('study:')&&Object.keys(v).some(x=>!['lastRoute','updatedAt'].includes(x)));return '<div class="eyebrow">我的表达，可以反复修改</div><h1>笔记、学习单与订正</h1><p class="lead">内容只保存在当前浏览器。定期导出，可继续编辑，也可把备份带到另一台设备。</p>'+statusLine()+'<div class="actions no-print"><button id="export-md">导出可编辑Markdown</button><button id="export-json">导出完整备份JSON</button><button id="import-open">导入学习备份</button><input id="import-records" type="file" accept=".json,application/json" hidden><button id="print-notes">打印学习单</button></div><p class="meta">导入会保留本机同名记录，仅加入新记录；不会改教材正文。JSON含作答和自评，Markdown适合继续写作。</p><div id="import-status" role="status"></div><div class="notes-list">'+practiceNotes()+(rows.length?rows.map(([k,v])=>{const [,kind,id,section]=k.split(':');const href=kind==='lesson'?'#lesson/'+id+'?section='+section:'#question/'+id;return '<section class="panel"><h2>'+E(v.title)+'</h2>'+P(v.note)+(v.rewrite?'<h3>我的改写</h3>'+P(v.rewrite):'')+'<a class="no-print" href="'+E(linked(href))+'">回到原位置修改 →</a></section>';}).join(''):'<p>还没有笔记。打开课程的一段讲解，使用“记笔记 / 写成自己的解释”。</p>')+studies.map(([k,v])=>{const l=lesson(k.slice(6));if(!l)return '';return '<section class="panel"><h2>'+E(l.title)+' · 学习单</h2>'+['question','firstAnswer','firstGap','prediction','observation','explanation','explainBack','exitAnswer','nextQuestion'].filter(k=>v[k]).map(k=>'<h3>'+({question:'我的问题',firstAnswer:'先试一问',firstGap:'发现的缺口',prediction:'预测',observation:'观察',explanation:'解释',explainBack:'自己的理解',exitAnswer:'出口作答',nextQuestion:'待追问'}[k])+'</h3>'+P(v[k])).join('')+(v.work?'<div class="saved-question-work">'+Object.entries(v.work).filter(([,r])=>r.draft||r.gap||r.paper).map(([key,r])=>{const q=bank.find(q=>q.id===key.split(':').slice(2).join(':'));return '<h3>'+E(q?.question||key)+'</h3>'+P(r.draft||'已在纸上尝试')+P(r.gap);}).join('')+'</div>':'')+'<a class="no-print" href="'+E(safeReturn(v.lastRoute)||studyURL(l.id))+'">继续编辑学习单 →</a></section>';}).join('')+'</div>';}
function validWork(l,work){
 return work&&typeof work==='object'&&!Array.isArray(work)&&Object.entries(work).every(([key,r])=>/^(preview|review):(first|exit):/.test(key)&&l.checks.some(q=>q.id===key.split(':').slice(2).join(':'))&&r&&typeof r==='object'&&!Array.isArray(r)&&Object.keys(r).every(k=>['draft','gap','paper','hintUsed','grade','run'].includes(k))&&Object.entries(r).every(([k,v])=>['paper','hintUsed'].includes(k)?typeof v==='boolean':typeof v==='string'&&v.length<=20000)&&(!r.grade||['independent','hint','retry'].includes(r.grade)));
}
const isRecord=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const textValue=v=>typeof v==='string'&&v.length<=20000;
const dateValue=v=>typeof v==='string'&&Number.isFinite(Date.parse(v));
const gradeValue=v=>['independent','hint','retry'].includes(v);
function validAttempt(v,historyEntry=false){
 if(!isRecord(v)||!gradeValue(v.grade)||!dateValue(v.at)||!dateValue(v.due))return false;
 return Object.entries(v).every(([k,x])=>{
  if(['draft','correction','mistake','run'].includes(k))return textValue(x);
  if(['paper','hintUsed'].includes(k))return typeof x==='boolean';
  if(k==='grade')return gradeValue(x);
  if(['at','updatedAt','due'].includes(k))return dateValue(x);
  if(k==='days')return [1,3,7].includes(x);
  if(k==='history')return !historyEntry&&Array.isArray(x)&&x.length<=10&&x.every(r=>validAttempt(r,true));
  return false;
 });
}
function validSession(v){
 if(!isRecord(v)||!Object.keys(v).every(k=>['ids','index','records','finished','run','ui'].includes(k)))return false;
 if(!Array.isArray(v.ids)||!v.ids.length||v.ids.length>bank.length||new Set(v.ids).size!==v.ids.length||!v.ids.every(id=>bank.some(q=>q.id===id))||!Number.isInteger(v.index)||v.index<0||v.index>=v.ids.length||!textValue(v.run)||typeof v.finished!=='boolean'||!isRecord(v.ui)||!isRecord(v.records))return false;
 if(!Object.entries(v.ui).every(([k,x])=>['subject','book','chapter','lesson','goal','kind','level','focus','amount'].includes(k)&&typeof x==='string'&&x.length<2000))return false;
 return Object.entries(v.records).every(([id,r])=>v.ids.includes(id)&&isRecord(r)&&Object.entries(r).every(([k,x])=>{
  if(['draft','correction','mistake'].includes(k))return textValue(x);
  if(['hintUsed','paper'].includes(k))return typeof x==='boolean';
  if(k==='grade')return x===null||gradeValue(x);
  return k==='days'&&['1','3','7'].includes(x);
 }));
}
function validEntry(k,v){
 if(typeof k!=='string'||!isRecord(v))return false;
 if(k.startsWith('note:')){const [,kind,id,section,...extra]=k.split(':');if(extra.length||!['lesson','question'].includes(kind)||!(kind==='lesson'?lesson(id):D.questions.find(q=>q.id===id)))return false;return Object.keys(v).every(k=>['note','rewrite','title','updatedAt'].includes(k))&&Object.values(v).every(x=>typeof x==='string'&&x.length<=2000000)&&(!section||/^(s\d+|general|work)$/.test(section));}
 if(k.startsWith('study:')){const l=lesson(k.slice(6));return !!l&&Object.entries(v).every(([k,x])=>{
  if(k==='goals')return Array.isArray(x)&&x.every(i=>Number.isInteger(i)&&i>=0&&i<l.goals.length);
  if(k==='work')return validWork(l,x);
  if(k==='paper')return typeof x==='boolean';
  if(k==='lastRoute')return textValue(x)&&(!x||!!safeReturn(x));
  if(k==='exitGrade')return textValue(x)&&(!x||gradeValue(x));
  return ['question','firstAnswer','firstGap','prediction','observation','explanation','explainBack','exitAnswer','nextQuestion','exitRun','updatedAt'].includes(k)&&textValue(x);
 });}
 if(k.startsWith('attempt:'))return bank.some(q=>q.id===k.slice(8))&&validAttempt(v);
 if(k==='practice:active')return validSession(v);
 if(k==='practice:archive')return Object.keys(v).every(k=>['sessions','updatedAt'].includes(k))&&(!('updatedAt' in v)||dateValue(v.updatedAt))&&Array.isArray(v.sessions)&&v.sessions.every(validSession)&&new Set(v.sessions.map(s=>s.run)).size===v.sessions.length;
 return k==='setting:reader'&&Object.keys(v).every(k=>k==='font')&&[16,18,20].includes(v.font);
}
function parseImport(raw){const p=JSON.parse(raw);if(!isRecord(p)||p.format!=='zj-science-learning'||p.version!==1||!Array.isArray(p.entries)||p.entries.length>3000)throw Error('文件不是本网站的学习备份。');if(p.entries.some(x=>!Array.isArray(x)||x.length!==2))throw Error('备份条目结构无效，未导入。');const entries=p.entries;if(entries.some(x=>!validEntry(x[0],x[1])))throw Error('备份中有不认识或格式不正确的记录，未导入。');if(new Set(entries.map(x=>x[0])).size!==entries.length)throw Error('备份记录重复，未导入。');return entries;}
function mountNotes(){document.querySelector('#export-md').onclick=()=>download('科学学习单.md',exportMarkdown(),'text/markdown;charset=utf-8');document.querySelector('#export-json').onclick=()=>download('科学学习记录.json',JSON.stringify({format:'zj-science-learning',version:1,exportedAt:new Date().toISOString(),entries:[...records()]},null,2),'application/json');document.querySelector('#import-open').onclick=()=>document.querySelector('#import-records').click();document.querySelector('#print-notes').onclick=()=>{const items=[...document.querySelectorAll('.notes-list details')],states=items.map(x=>x.open);items.forEach(x=>x.open=true);const restore=()=>{items.forEach((x,i)=>x.open=states[i]);window.removeEventListener('afterprint',restore);};window.addEventListener('afterprint',restore);window.print();};document.querySelector('#import-records').onchange=async e=>{const out=document.querySelector('#import-status'),file=e.target.files?.[0];if(!file)return;try{if(file.size>8e6)throw Error('文件超过8 MB，未导入。');const entries=parseImport(await file.text()),fresh=entries.filter(([k])=>get(k)===null);let savedCount=0;fresh.forEach(([k,v])=>{if(put(k,v))savedCount++;});out.textContent='已写入 '+savedCount+' 条新记录，保留 '+(entries.length-fresh.length)+' 条本机同名记录。'+(savedCount<fresh.length?'部分未能持久保存，请导出当前记录。':'刷新后查看导入内容。');}catch(err){out.textContent=err.message||'备份读取失败，未导入。';}e.target.value='';};}
function contextualLinks(){document.querySelectorAll('#main a[href^="#lesson/"],#main a[href^="#question/"],#main a[href^="#paper/"]').forEach(a=>{if(!a.getAttribute('href').includes('return=')&&!a.closest('.reader-toc'))a.setAttribute('href',linked(a.getAttribute('href')));});}
window.ScienceLearning={get,put,records,bank,attempt,reviseAttempt,archivePractice,objectivePlan,goalState,courseState,linked,safeReturn,planner,mountPlanner,study,mountStudy,enhanceLesson,enhanceQuestion,dashboard,notesPage,mountNotes,noteBox,bindNotes,contextualLinks,parseImport,validEntry,exportMarkdown,activities};
})();

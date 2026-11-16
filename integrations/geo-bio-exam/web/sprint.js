/* Revision dashboard. Uses the same local learning records and quiz renderer. */
'use strict';
window.createSprint=function({getState,save,main,topic,book,singleQuiz,toast,go}){
 const C=SprintCore,plans=C.plans,$=selector=>main.querySelector(selector);
 const store=()=>getState().sprint;
 const entry=day=>store().days[day]||(store().days[day]={});
 const dateLabel=key=>`${Number(key.slice(5,7))}月${Number(key.slice(8,10))}日`;
 const completeCount=()=>plans.filter(p=>store().days[p.day]?.completedOn).length;
 const currentDay=()=>plans.find(p=>!store().days[p.day]?.completedOn)?.day||7;
 function updateCount(){const count=document.getElementById('sprint-count');if(count)count.textContent=`${completeCount()}/7`}
 function teaser(){return `<section class="sprint-teaser"><div><span class="eyebrow">7-DAY REVISION SPRINT</span><h2>复习冲刺，每天向前一步。</h2><p>先梳理重点，再完成配套练习。生物7天计划 · 地理板块待定。</p></div><div class="sprint-teaser-action"><span>${store().checkins[C.today()]?'✓ 今日已打卡':'今日待打卡'} · 已完成 ${completeCount()}/7 个任务</span><a href="#sprint" class="button primary">进入冲刺打卡 →</a></div></section>`}
 function render(value,mode){
  const plan=plans.find(p=>p.day===Number(value))||plans[currentDay()-1];
  if(mode==='practice'){exercise(plan);return}
  const key=C.today(),data=store(),task=entry(plan.day),reviewed=task.reviewedOn===key,result=task.lastResult,practiced=result?.date===key,checked=data.checkins[key]?.days.includes(plan.day),ready=C.canCheckin(task,key),attempt=task.attempt;
  const ongoing=attempt&&!attempt.finishedOn,completed=completeCount();
  main.innerHTML=`<div class="page-intro"><div><div class="tiny-label">7-DAY REVISION SPRINT · BIOLOGY</div><h1>复习冲刺打卡</h1><p>先复习，再练习，让每天的进步看得见。地理板块待定。</p></div><span class="badge">${dateLabel(key)} · 北京时间</span></div>
   <div class="stats-row sprint-stats">${[[completed+' / 7','已完成复习任务','✓'],[C.streak(data.checkins,key)+' 天','当前连续打卡','↗'],[Object.keys(data.checkins).filter(d=>d<=key).length+' 天','累计打卡','▦'],[(data.activity[key]?.answered||0)+' 题','今日冲刺作答','✎']].map(([v,l,i])=>`<div class="stat"><span class="stat-symbol">${i}</span><div><strong>${v}</strong><p>${l}</p></div></div>`).join('')}</div>
   <div class="section-head"><div><h2>7天生物复习计划</h2><p>按自己的节奏选择任务，全部任务覆盖现有66个生物知识点。</p></div><span class="badge">${completed} / 7 已完成</span></div>
   <nav class="sprint-plan" aria-label="选择冲刺复习任务">${plans.map(p=>`<a href="#sprint/${p.day}" class="sprint-day ${p.day===plan.day?'selected':''} ${data.days[p.day]?.completedOn?'completed':''}" ${p.day===plan.day?'aria-current="page"':''}><span>DAY ${String(p.day).padStart(2,'0')}</span><strong>${p.title}</strong><small>${data.days[p.day]?.completedOn?'✓ 已完成':p.ids.length+' 个知识点'}</small></a>`).join('')}</nav>
   <div class="sprint-workspace"><section class="panel sprint-task"><div class="sprint-task-heading"><div><span class="eyebrow">DAY ${String(plan.day).padStart(2,'0')}</span><h2>${plan.title}</h2><p>${plan.subtitle}</p></div><span class="sprint-day-number">${String(plan.day).padStart(2,'0')}</span></div>
    <div class="sprint-step"><span class="sprint-step-number ${reviewed?'done':''}">${reviewed?'✓':'1'}</span><div><h3>复习本任务的知识重点</h3><p>打开下方知识点，核对提要、易混概念和原书笔记。</p><details class="sprint-review" open><summary>查看 ${plan.ids.length} 个复习知识点</summary><div class="sprint-review-links">${plan.ids.map(id=>{const t=topic(id);return `<a href="#topic/${id}/learn"><span>${t.title}</span><small>${book(t.book).title} · ${getState().visited.includes(id)?'已读':'去复习'} ↗</small></a>`}).join('')}</div></details><label class="sprint-review-check"><input id="sprint-reviewed" type="checkbox" ${reviewed?'checked':''}>我已复习本任务的知识重点</label></div></div>
    <div class="sprint-step"><span class="sprint-step-number ${practiced?'done':''}">${practiced?'✓':'2'}</span><div><h3>完成配套练习 · ${C.questionCount(plan)} 题</h3><p>${plan.mixed?'本任务6题 + 前六天知识点随机回顾4题。':'从本任务知识点中随机抽题，每题作答后查看解析。'}答错内容同步加入错题回顾。</p>${practiced?`<div class="sprint-last-result">✓ 今日已完成一轮 · 答对 <strong>${result.score} / ${result.total}</strong> 题</div>`:''}${ongoing?`<p class="sprint-resume">有一轮尚未完成：已答 ${attempt.answers.filter(v=>v!==null).length} / ${attempt.ids.length} 题，刷新后也能继续。</p>`:''}<div class="sprint-inline-actions"><button class="button ${practiced?'':'primary'}" id="sprint-start">${ongoing?'继续这轮练习':practiced?'再练一轮':'开始配套练习 →'}</button><a class="button subtle" href="#practice">去错题回顾 ↗</a></div></div></div>
    <div class="sprint-checkin-box ${checked?'checked':''}"><div><h3>${checked?'今日打卡已完成':ready?'复习和练习已完成，可以打卡了':'完成复习与练习，记录今日打卡'}</h3><p>${checked?'同一天完成多个任务，打卡天数仍只计1天。':!reviewed?'请先确认复习重点，再完成今天的配套练习。':!practiced?'还需完成今天的一轮配套练习。':'打卡记录按北京时间保存，不设分数门槛。'}</p></div><button id="sprint-checkin" class="button primary" ${!ready||checked?'disabled':''}>${checked?'✓ 今日已打卡':data.checkins[key]?'记录本任务完成':'完成今日打卡'}</button></div>
   </section><aside class="sprint-side"><section class="side-panel"><span class="eyebrow">SHOW UP, STEP BY STEP</span><h3 style="margin-top:9px">最近14天打卡</h3><div class="sprint-calendar">${Array.from({length:14},(_,i)=>C.shiftDate(key,i-13)).map(date=>`<div class="sprint-calendar-day ${data.checkins[date]?'checked':''} ${date===key?'today':''}" aria-label="${dateLabel(date)}，${data.checkins[date]?'已打卡':'未打卡'}"><small>${date.slice(5).replace('-','/')}</small><span>${data.checkins[date]?'✓':'·'}</span></div>`).join('')}</div><p>按北京时间统计，每天计1次。连续天数按相邻自然日计算。</p></section><section class="side-panel"><h3>最近的打卡记录</h3>${Object.keys(data.checkins).filter(date=>date<=key).sort().reverse().slice(0,5).map(date=>`<div class="sprint-history"><strong>${dateLabel(date)}</strong><span>${data.checkins[date].days.map(d=>'第'+d+'天').join('、')}任务</span></div>`).join('')||'<p>完成配套练习后打卡，你的记录会出现在这里。</p>'}</section><section class="side-panel"><h3>这份计划怎么用？</h3><p>“7天”表示7个复习任务，可以按自己的节奏完成。错过一天也可继续，打卡以实际完成日期为准。练习沿用站内概念自测题，完成任务不代表所有知识点已掌握。</p></section></aside></div>`;
  $('#sprint-reviewed').onchange=e=>{entry(plan.day).reviewedOn=e.target.checked?C.today():null;save();render(plan.day)};
  $('#sprint-start').onclick=()=>{if(!ongoing)startAttempt(plan);go(`sprint/${plan.day}/practice`)};
  $('#sprint-checkin').onclick=()=>checkin(plan);
  updateCount();
 }
 function startAttempt(plan){entry(plan.day).attempt={ids:C.questions(plan,TOPICS),answers:Array(C.questionCount(plan)).fill(null),index:0};save()}
 function finishAttempt(plan,a){
  if(a.finishedOn||a.answers.some(v=>v===null))return;
  a.finishedOn=C.today();const score=a.ids.reduce((n,id,i)=>n+(a.answers[i]===topic(id).answer?1:0),0);
  entry(plan.day).lastResult={date:a.finishedOn,total:a.ids.length,score};save();
 }
 function exercise(plan){
  const task=entry(plan.day);if(!task.attempt)startAttempt(plan);
  const a=task.attempt;finishAttempt(plan,a);
  if(a.index>=a.ids.length){result(plan,a);return}
  const t=topic(a.ids[a.index]),answered=a.answers.filter(v=>v!==null).length;
  main.innerHTML=`<div class="page-intro"><div><div class="tiny-label">DAY ${String(plan.day).padStart(2,'0')} · SPRINT PRACTICE</div><h1>${plan.title}</h1><p>第 ${a.index+1} / ${a.ids.length} 题 · 已作答 ${answered} 题 · 进度自动保存</p></div><a href="#sprint/${plan.day}" class="button">暂停并返回任务</a></div><div class="progress-track" style="margin-bottom:24px"><i style="width:${100*answered/a.ids.length}%"></i></div><section class="panel quiz-panel" id="sprint-question"></section><div class="quiz-footer"><span>配套练习 · 作答后可查看解析</span><button class="button primary" id="sprint-next" ${a.answers[a.index]===null?'disabled':''}>${a.index===a.ids.length-1?'查看本轮结果':'下一题 →'}</button></div>`;
  singleQuiz($('#sprint-question'),t,(correct,chosen)=>{
   a.answers[a.index]=chosen;
   const key=C.today(),activity=store().activity[key]||(store().activity[key]={answered:0,correct:0});activity.answered++;if(correct)activity.correct++;
   finishAttempt(plan,a);save();$('#sprint-next').disabled=false;
  },a.answers[a.index]);
  $('#sprint-next').onclick=()=>{if(a.answers[a.index]===null)return;a.index++;save();exercise(plan);window.scrollTo(0,0)};
  updateCount();
 }
 function result(plan,a){
  const score=a.ids.reduce((n,id,i)=>n+(a.answers[i]===topic(id).answer?1:0),0),wrong=a.ids.filter((id,i)=>a.answers[i]!==topic(id).answer),task=entry(plan.day),ready=C.canCheckin(task),checked=store().checkins[C.today()]?.days.includes(plan.day);
  main.innerHTML=`<div class="page-intro"><div><div class="tiny-label">DAY ${String(plan.day).padStart(2,'0')} · ROUND COMPLETE</div><h1>这轮冲刺练习，完成了。</h1><p>${plan.title} · ${a.finishedOn?dateLabel(a.finishedOn):''}完成</p></div></div><section class="panel result-panel"><span class="eyebrow">REVIEW, PRACTICE, CHECK IN</span><div class="result-circle"><strong>${score}<small> / ${a.ids.length}</small></strong><span>本轮答对</span></div><p>${score===a.ids.length?'本轮全部答对，继续用原书核对概念的细节。':'错题已加入错题回顾，先看懂解析，再巩固对应知识点。'}</p><div class="sprint-result-actions"><button class="button primary" id="sprint-result-checkin" ${!ready||checked?'disabled':''}>${checked?'✓ 今日已打卡':ready?'完成今日打卡':'请先返回任务确认复习'}</button><a href="#sprint/${plan.day}" class="button">返回复习任务 →</a><button class="button" id="sprint-again">再练一轮</button></div>${!ready?`<p class="sprint-result-hint">${task.reviewedOn!==C.today()?'返回任务页，完成知识重点复习并勾选确认后，即可打卡。':'这轮练习已跨日，请完成今天的一轮练习后再打卡。'}</p>`:''}</section>${wrong.length?`<section class="section-block"><div class="section-head"><h2>本轮需要再巩固的知识点</h2></div><div class="wrong-list">${wrong.map(id=>`<article class="wrong-item"><div><h3>${topic(id).title}</h3><p>建议对照原书，再理解一次易混概念。</p></div><a class="button" href="#topic/${id}/learn">回到知识点 ↗</a></article>`).join('')}</div></section>`:''}`;
  $('#sprint-result-checkin').onclick=()=>checkin(plan);
  $('#sprint-again').onclick=()=>{startAttempt(plan);exercise(plan)};
 }
 function checkin(plan){
  const key=C.today(),task=entry(plan.day);
  if(!C.canCheckin(task,key)){toast('请完成今天的重点复习和配套练习');render(plan.day);return}
  const data=store(),record=data.checkins[key]||(data.checkins[key]={days:[]});
  if(!record.days.includes(plan.day))record.days.push(plan.day);
  task.completedOn=task.completedOn||key;save();updateCount();
  toast('✓ 打卡成功，今天又向前一步');
  if(location.hash===`#sprint/${plan.day}`)render(plan.day);else go(`sprint/${plan.day}`);
 }
 return {render,teaser,updateCount};
};

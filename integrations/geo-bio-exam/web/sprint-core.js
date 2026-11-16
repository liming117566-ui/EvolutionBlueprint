/* Date and progress rules for the seven-task biology revision plan. */
(() => {
 'use strict';
 const range=(book,first,last)=>Array.from({length:last-first+1},(_,i)=>`${book}-${first+i}`);
 const plans=[
  {day:1,title:'细胞与结构层次',subtitle:'从生命的基本单位入手',ids:range('7a',1,10)},
  {day:2,title:'生物类群与微生物',subtitle:'比较特征，理清分类',ids:range('7a',11,22)},
  {day:3,title:'植物生活与人体营养',subtitle:'串联物质、能量与结构',ids:range('7b',1,12)},
  {day:4,title:'呼吸、循环与排泄',subtitle:'跟踪人体内的物质变化',ids:range('7b',13,18)},
  {day:5,title:'调节、健康与生态',subtitle:'连接人体与外部环境',ids:range('8a',1,13)},
  {day:6,title:'生殖、遗传与变异',subtitle:'抓住遗传规律和易混概念',ids:range('8b',1,7)},
  {day:7,title:'进化、多样性与综合回顾',subtitle:'复习新主题，再回看前六天',ids:range('8b',8,13),mixed:4}
 ];
 const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
 function today(now=new Date()){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const value=type=>parts.find(p=>p.type===type).value;
  return `${value('year')}-${value('month')}-${value('day')}`;
 }
 function shiftDate(key,amount){const date=new Date(key+'T00:00:00Z');date.setUTCDate(date.getUTCDate()+amount);return date.toISOString().slice(0,10)}
 const initial=()=>({days:{},checkins:{},activity:{}});
 const questionCount=plan=>Math.min(10,plan.ids.length+(plan.mixed||0));
 function normalize(saved,topics){
  const result=initial(),validIds=new Set(topics.map(t=>t.id));
  if(!saved||typeof saved!=='object')return result;
  for(const plan of plans){
   const old=saved.days?.[plan.day];if(!old||typeof old!=='object')continue;
   const entry={};
   if(validDate(old.reviewedOn))entry.reviewedOn=old.reviewedOn;
   if(validDate(old.completedOn))entry.completedOn=old.completedOn;
   const last=old.lastResult;
   if(last&&validDate(last.date)&&Number.isInteger(last.total)&&last.total===questionCount(plan)&&Number.isInteger(last.score)&&last.score>=0&&last.score<=last.total)entry.lastResult={date:last.date,total:last.total,score:last.score};
   const a=old.attempt;
   const allowed=id=>plan.ids.includes(id)||(plan.mixed&&validIds.has(id));
   if(a&&Array.isArray(a.ids)&&a.ids.length===questionCount(plan)&&new Set(a.ids).size===a.ids.length&&a.ids.every(id=>validIds.has(id)&&allowed(id))&&Array.isArray(a.answers)&&a.answers.length===a.ids.length&&a.answers.every(v=>v===null||(Number.isInteger(v)&&v>=0&&v<3))){
    const firstUnanswered=a.answers.indexOf(null);
    if(firstUnanswered===-1||a.answers.slice(firstUnanswered).every(v=>v===null)){
     const answered=firstUnanswered===-1?a.ids.length:firstUnanswered;
     const index=Math.max(0,Math.min(answered,Number.isInteger(a.index)?a.index:answered));
     entry.attempt={ids:[...a.ids],answers:[...a.answers],index};
     if(validDate(a.finishedOn)&&answered===a.ids.length)entry.attempt.finishedOn=a.finishedOn;
    }
   }
   result.days[plan.day]=entry;
  }
  for(const [date,entry] of Object.entries(saved.checkins||{})){
   if(!validDate(date)||!entry||!Array.isArray(entry.days))continue;
   const days=[...new Set(entry.days.filter(d=>Number.isInteger(d)&&d>=1&&d<=7))];
   if(days.length)result.checkins[date]={days};
  }
  for(const [date,entry] of Object.entries(saved.activity||{})){
   if(validDate(date)&&entry&&Number.isInteger(entry.answered)&&entry.answered>=0&&Number.isInteger(entry.correct)&&entry.correct>=0&&entry.correct<=entry.answered)result.activity[date]={answered:entry.answered,correct:entry.correct};
  }
  return result;
 }
 function streak(checkins,key=today()){
  let cursor=checkins[key]?key:shiftDate(key,-1),n=0;
  while(checkins[cursor]){n++;cursor=shiftDate(cursor,-1)}
  return n;
 }
 function shuffled(values,rng=Math.random){const copy=[...values];for(let i=copy.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[copy[i],copy[j]]=[copy[j],copy[i]]}return copy}
 function questions(plan,topics,rng=Math.random){
  if(!plan.mixed)return shuffled(plan.ids,rng).slice(0,10);
  const other=topics.map(t=>t.id).filter(id=>!plan.ids.includes(id));
  return shuffled([...plan.ids,...shuffled(other,rng).slice(0,plan.mixed)],rng);
 }
 const canCheckin=(entry,key=today())=>entry?.reviewedOn===key&&entry?.lastResult?.date===key;
 window.SprintCore={plans,today,shiftDate,validDate,initial,normalize,streak,questions,questionCount,canCheckin};
})();

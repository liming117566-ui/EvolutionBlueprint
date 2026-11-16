/* A generated paper keeps its topic order and option order stable across reloads. */
(() => {
 'use strict';
 const shuffle=values=>{const out=[...values];for(let i=out.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[out[i],out[j]]=[out[j],out[i]]}return out};
 function pool(topics,books,group='all'){return topics.filter(t=>books.includes(t.book)&&(group==='all'||t.book+'|'+t.group===group))}
 function generate(topics,settings){
  const candidates=pool(topics,settings.books,settings.group);
  const count=Math.max(1,Math.min(66,Math.floor(Number(settings.count)||10)));
  if(candidates.length<count)throw Error(`所选范围有${candidates.length}道题，请减少题量或扩大范围。`);
  return {id:'p'+Date.now().toString(36)+Math.random().toString(36).slice(2,9),title:String(settings.title||'生物会考复习练习卷').trim().slice(0,60)||'生物会考复习练习卷',createdAt:new Date().toISOString(),minutes:Math.max(5,Math.min(180,Math.round(Number(settings.minutes)||30))),books:[...settings.books],group:settings.group||'all',questions:shuffle(candidates).slice(0,count).map(t=>({id:t.id,order:shuffle([0,1,2]),choice:null})),student:{name:'',className:'',number:''},submitted:false};
 }
 function normalize(saved,topics){
  if(!Array.isArray(saved))return [];
  const valid=new Set(topics.map(t=>t.id)),ids=new Set();
  return saved.filter(p=>{
   if(!p||typeof p.id!=='string'||!/^p[a-z0-9]+$/.test(p.id)||ids.has(p.id)||typeof p.title!=='string'||!Number.isFinite(Date.parse(p.createdAt))||!Number.isInteger(p.minutes)||p.minutes<5||p.minutes>180||!Array.isArray(p.questions)||p.questions.length<1||p.questions.length>66)return false;
   const qids=new Set();
   for(const q of p.questions){if(!q||!valid.has(q.id)||qids.has(q.id)||!Array.isArray(q.order)||q.order.length!==3||new Set(q.order).size!==3||!q.order.every(n=>Number.isInteger(n)&&n>=0&&n<3)||(q.choice!==null&&(!Number.isInteger(q.choice)||q.choice<0||q.choice>2)))return false;qids.add(q.id)}
   if(p.submitted&&p.questions.some(q=>q.choice===null))return false;
   ids.add(p.id);return true;
  }).slice(0,10).map(p=>({id:p.id,title:p.title.slice(0,60),createdAt:p.createdAt,minutes:p.minutes,books:Array.isArray(p.books)?p.books.filter(b=>['7a','7b','8a','8b'].includes(b)):[],group:typeof p.group==='string'?p.group:'all',questions:p.questions.map(q=>({id:q.id,order:[...q.order],choice:q.choice})),student:{name:String(p.student?.name||'').slice(0,40),className:String(p.student?.className||'').slice(0,40),number:String(p.student?.number||'').slice(0,40)},submitted:!!p.submitted}));
 }
 function result(p,topics){const lookup=new Map(topics.map(t=>[t.id,t]));let correct=0,answered=0;for(const q of p.questions){if(q.choice!==null){answered++;if(q.order[q.choice]===lookup.get(q.id).answer)correct++}}return {correct,answered,total:p.questions.length,score:Number((100*correct/p.questions.length).toFixed(1))}}
 window.PaperCore={pool,generate,normalize,result};
})();

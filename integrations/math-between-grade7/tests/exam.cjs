const assert=require('node:assert/strict');
require('../web/exam-engine.js');
const E=global.EXAM_ENGINE;
const defaults={title:'综合练习',chapters:[1,2,3,4,5,6],level:'standard',counts:{choice:10,fill:6,solution:4},scores:{choice:3,fill:5,solution:10},minutes:90};
// Independently recompute results from the mathematical models and generated parameters.
function expected(q){const [a,b,k,x]=q.values,d=['basic','standard','advanced'].indexOf(q.level);switch(q.template){
case'prism-edges':return a*3;case'prism-total':return 2*a+3*a+a+2;case'prism-inverse':return a;
case'cube-edges':return a*12;case'cuboid-edges':return 4*a+4*b+4*k;case'paint-cube':return 6*(a*a-4*a+4);case'cube-stack':return d===1?a*a:a*a*a;
case'rational-sum':return d===2?a+b*k+a:a+b;case'absolute-distance':return d===0?a:d===1?a+b:a+b+k;case'powers':return d===2?b*b-a*a:Math.pow(-a,k);
case'like-terms':return d>0?a*x-b*(x-k):a*x+b*x;case'match-pattern':return d<2?4+3*(a-1):a;
case'expression':{const len=a*x+b,width=k*x;return d===0?2*(len+width):d===1?len*width:len*width-2*len-2*width}
case'midpoint':return d===0?a:d===1?a+b:2*a-(a/2);case'angles':return d===0?180-a:d===1?a/2:a+(180-a)/2;case'polygon':return d===0?a-3:(a*(a-1)/2)-a;
case'linear-equation':return x;case'profit':return d===0?a*b/100:d===1?b:a;case'journey':return d===1?b:k;
case'survey':return d===0?b:d===1?a:(a*b/100)*10;case'sector':return d===0?360*b/100:d===1?b:a*b/100;
case'chart-read':return d===0?a+b+k:d===1?Math.max(a,b,k)-Math.min(a,b,k):(a+b)*2/5;
default:throw Error('Missing math model '+q.template)}}
const covered=new Set();let checked=0;
for(let seed=0;seed<100;seed++)for(const level of Object.keys(E.levels))for(let chapter=1;chapter<=6;chapter++){
const p=E.generate({...defaults,chapters:[chapter],level},seed);
assert.equal(p.questions.length,20);assert.equal(p.total,100);assert.equal(new Set(p.questions.map(q=>q.text)).size,20);
for(const q of p.questions){covered.add(q.template);assert.equal(q.chapter,chapter);assert.equal(q.level,level);assert(Math.abs(q.answer-expected(q))<1e-6,JSON.stringify(q));assert(q.explanation.length>8);assert(!/NaN|Infinity|undefined|\.\d{8}/.test(q.text+q.explanation));if(q.type==='choice'){assert.equal(q.options.length,4);assert.equal(new Set(q.options).size,4);assert.equal(q.options[q.correct],q.displayAnswer)}checked++;}
}
assert.equal(covered.size,22);
for(let seed=0;seed<100;seed++){const p=E.generate(defaults,seed),counts=defaults.chapters.map(c=>p.questions.filter(q=>q.chapter===c).length);assert(Math.max(...counts)-Math.min(...counts)<=1);assert.equal(JSON.stringify(p.questions),JSON.stringify(E.generate(defaults,seed).questions));}
const max=E.generate({...defaults,counts:{choice:30,fill:20,solution:10}},42);assert.equal(max.questions.length,60);
for(let seed=0;seed<30;seed++)for(const level of Object.keys(E.levels))for(let chapter=1;chapter<=6;chapter++)assert.equal(E.generate({...defaults,chapters:[chapter],level,counts:{choice:30,fill:20,solution:10}},seed).questions.length,60);
for(const changed of [{chapters:[]},{chapters:[1,1]},{level:'bad'},{counts:{choice:-1,fill:2,solution:2}},{counts:{choice:0,fill:0,solution:0}},{counts:{choice:30,fill:30,solution:1}},{minutes:0},{scores:{choice:0,fill:1,solution:1}}])assert.throws(()=>E.generate({...defaults,...changed},7));
const hostile=E.generate({...defaults,title:'<img src=x onerror=alert(1)>'},1),student=E.documentHTML(hostile),key=E.documentHTML(hostile,true);
assert(!student.includes('<img'));assert(student.includes('&lt;img'));assert(!student.includes('class="paper-answer"'));assert(key.includes('class="paper-answer"'));assert(student.includes('student-line'));assert(!key.includes('student-line'));assert.equal((student.match(/class="working-space"/g)||[]).length,4);
console.log(`PASS: ${checked} generated answers, ${covered.size} mathematical templates, 3 difficulty levels, deterministic seeds, chapter balance, limits and separate student/answer documents.`);

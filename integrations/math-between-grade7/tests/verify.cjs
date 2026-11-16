const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),web=path.join(root,'web'),ctx={window:{},console};vm.createContext(ctx);
for(const f of ['data.js','materials-data.js','scenes.js'])vm.runInContext(fs.readFileSync(path.join(web,f),'utf8'),ctx,{filename:f});
const {TOPICS:T,CHAPTERS:C,MATERIALS:M,SCENES:S}=ctx.window;
assert.equal(C.length,6);assert.equal(T.length,29);assert.equal(M.length,348);
assert.equal(new Set(T.map(t=>t.id)).size,T.length);assert.equal(new Set(M.map(m=>m.id)).size,M.length);
for(const t of T){assert(C.some(c=>c.id===t.chapter));assert(S.configs[t.scene]);assert.equal(t.quiz.length,2);for(const q of t.quiz){assert(q[0]&&q[3]);assert.equal(q[1].length,4);assert(Number.isInteger(q[2])&&q[2]>=0&&q[2]<4)}}
const checks=[['number',{a:-4},'|−4|'],['addition',{a:-3,b:5},'= 2'],['solid',{n:5,rot:30},'15 条棱'],['pattern',{n:5},'16 根'],['power',{a:2,n:3},'-8'],['segment',{length:12,percent:50},'中点'],['angle',{theta:0},'零角'],['angle',{theta:90},'直角'],['polygon',{n:6},'3 条对角线'],['journey',{t:4},'相遇'],['equation',{a:0,b:2,c:3,x:1},'无解'],['equation',{a:0,b:2,c:2,x:1},'任意 x'],['statistics',{a:0,b:0,c:0},'暂不能计算']];
for(const [type,v,expected] of checks){const r=S.render(type,v);if(type==='number')assert(r.out.includes('= 4'));else if(type==='power')assert(r.s.includes('−2')&&r.out.includes('-8'));else assert(r.out.includes(expected),type+': '+r.out);assert(!/NaN|undefined|Infinity/.test(r.s),type)}
for(const [type,c] of Object.entries(S.configs)){for(const bound of [2,3,5]){let v=Object.fromEntries(c.controls.map(r=>[r[0],r[bound]]));let r=S.render(type,v);assert(!/NaN|undefined|Infinity/.test(r.s+r.out+r.extra),type)}}
let refs=0,missing=[];const unique=new Set();
for(const m of M){assert(m.chapter===0||C.some(c=>c.id===m.chapter));const file=path.join(web,m.url);assert(fs.existsSync(file),m.url);const source=fs.readFileSync(file,'utf8');for(const match of source.matchAll(/src="([^"]+)"/g)){const target=path.resolve(path.dirname(file),match[1]);unique.add(target);refs++;}assert(!source.includes('.wmf'),'unconverted metafile URL')}
for(const target of unique)if(!fs.existsSync(target))missing.push(target);assert.equal(missing.length,0,missing.slice(0,8).join('\n'));
for(const f of ['index.html','reader.css','styles.css','app.js','favicon.svg'])assert(fs.existsSync(path.join(web,f)));
console.log(`PASS: ${T.length} topics, ${T.reduce((n,t)=>n+t.quiz.length,0)} quizzes, ${Object.keys(S.configs).length} scenes, ${M.length} materials; ${refs} image references / ${unique.size} unique images, no missing assets.`);

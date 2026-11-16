const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),ctx={};ctx.window=ctx;vm.createContext(ctx);
for(const name of ['books.js','data.js'])vm.runInContext(fs.readFileSync(path.join(root,'web',name),'utf8'),ctx,{filename:name});
assert.equal(ctx.BOOKS.length,4);
assert.equal(ctx.BOOKS.reduce((n,b)=>n+b.pages,0),535);
assert.equal(Object.keys(ctx.SCENE_META).length,11);
const ids=new Set();
for(const t of ctx.TOPICS){assert(!ids.has(t.id),'duplicate topic '+t.id);ids.add(t.id);const b=ctx.BOOKS.find(b=>b.id===t.book);assert(b);assert(t.title&&t.summary&&t.caution);assert(t.facts.length===3&&t.facts.every(Boolean));assert(t.options.length===3&&t.options.every(Boolean));assert.equal(new Set(t.options).size,3);assert(t.answer>=0&&t.answer<3);assert(t.page>0&&t.page+b.offset<=b.pages);assert(t.scene==='concept'||ctx.SCENE_META[t.scene]);assert(fs.existsSync(path.join(root,'web','pages',t.book,String(t.page+b.offset).padStart(3,'0')+'.jpg')))}
for(const b of ctx.BOOKS){for(let i=1;i<=b.pages;i++){const p=path.join(root,'web','pages',b.id,String(i).padStart(3,'0')+'.jpg');assert(fs.statSync(p).size>1000,'missing or empty page '+p)}let previous=0;for(const t of ctx.TOPICS.filter(t=>t.book===b.id)){assert(t.page>=previous);previous=t.page}}
for(const filename of ['app.js','scenes.js','data.js','books.js','server.js','sprint-core.js','sprint.js','papers-core.js','papers.js'])new vm.Script(fs.readFileSync(path.join(root,'web',filename),'utf8'),{filename});
function offspring(a,b){const counts={AA:0,Aa:0,aa:0};for(const x of a)for(const y of b)counts[[x,y].sort().join('')]++;return counts}
assert.deepEqual(offspring('Aa','Aa'),{AA:1,Aa:2,aa:1});assert.deepEqual(offspring('AA','aa'),{AA:0,Aa:4,aa:0});assert.deepEqual(offspring('aa','aa'),{AA:0,Aa:0,aa:4});
for(const t of ctx.TOPICS)assert(ctx.TOPICS.filter(x=>x.id===t.id).length===1);
console.log(JSON.stringify({topics:ctx.TOPICS.length,books:ctx.BOOKS.map(b=>({id:b.id,topics:ctx.TOPICS.filter(t=>t.book===b.id).length,pages:b.pages})),models:Object.keys(ctx.SCENE_META).length,pages:535,status:'PASS'},null,2));

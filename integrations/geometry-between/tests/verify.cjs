const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const ctx=vm.createContext({console});
for(const file of ['data.js','scenes.js'])vm.runInContext(fs.readFileSync(path.join(root,'web',file),'utf8'),ctx,{filename:file});
const {models,experiments,lab}=vm.runInContext('({models:MODELS,experiments:EXPERIMENTS,lab:MathLab})',ctx);
assert.equal(models.length,110);
assert.equal(new Set(models.map(m=>m.id)).size,110);
assert.equal(models.filter(m=>m.category==='geometry').length,60);
assert.equal(models.filter(m=>m.category==='optimum').length,18);
assert.equal(models.filter(m=>m.category==='functions').length,32);
assert.equal(models.filter(m=>m.scene).length,18);
for(const m of models){assert.ok(m.page>=1&&m.page<=296);assert.ok(fs.existsSync(path.join(root,'web','pages',String(m.page).padStart(3,'0')+'.jpg')));if(m.scene)assert.ok(experiments[m.scene]&&lab.configs[m.scene]);}
let count=0;
for(const [kind,config] of Object.entries(lab.configs)){
 const states=[{...config.initial}];
 for(const [key,,min,max] of config.ranges)for(const value of [min,max,(min+max)/2])states.push({...config.initial,[key]:value});
 for(const s of states){const result=lab.draw(kind,s);assert.ok(result.html.length>100);assert.ok(!/NaN|Infinity|undefined/.test(result.html),`${kind} invalid geometry`);assert.equal(result.metrics.length,3);for(const metric of result.metrics)assert.ok(!/NaN|Infinity|undefined/.test(String(metric.value)),`${kind} invalid metric`);count++;}
 if(kind==='reflection'||kind==='shortest'||kind==='perpendicular'){let s={...config.initial};lab.draw(kind,s).optimal();let metrics=lab.draw(kind,s).metrics;assert.ok(Math.abs(Number(metrics[0].value)-Number(metrics[1].value))<.011,`${kind} optimum`);}
}
// Verify values against independent mathematical calculations.
const close=(a,b)=>assert.ok(Math.abs(Number(a)-b)<.011,`${a} vs ${b}`);
close(lab.draw('altitude',{a:3,b:4,aux:true}).metrics[2].value,2.4);
close(lab.draw('chord',{d:3,aux:true}).metrics[2].value,8);
close(lab.draw('linear',{k:-1,b:4,aux:true}).metrics[2].value,8);
close(lab.draw('quadratic',{x:3,aux:true}).metrics[1].value,9);
close(lab.draw('inverse',{x:2,k:6,aux:true}).metrics[2].value,3);
close(lab.draw('equation',{k:1,b:1,c:5,aux:true}).metrics[0].value,2);
for(let i=1;i<=296;i++)assert.ok(fs.statSync(path.join(root,'web','pages',String(i).padStart(3,'0')+'.jpg')).size>1000);
assert.ok(!fs.readFileSync(path.join(root,'web','scenes.js'),'utf8').includes("addEventListener('pointer"),'Shape dragging must be absent');
console.log(`PASS: 110 unique topics, 18 demonstrations, ${count} geometry boundary cases, optimal paths, 6 independent calculations, 296 source pages, no shape dragging.`);

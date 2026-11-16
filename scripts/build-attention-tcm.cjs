'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const outputRoot = path.join(root, 'server', 'modules-web');
function source(slug) { return path.join(root, 'integrations', slug); }
function target(slug) { const dir = path.join(outputRoot, slug); fs.mkdirSync(dir, {recursive:true}); return dir; }
function copy(from, to) { fs.mkdirSync(path.dirname(to), {recursive:true}); fs.copyFileSync(from, to); }
function walk(dir) { return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]); }
function json(file, value) { fs.writeFileSync(file,JSON.stringify(value),'utf8'); }
function clean(text, title) {
  return text.replace(/^.*(?:github\.com|img\.shields\.io|GitHub|github-mark|关于本(?:站|应用|项目)|关于作者).*$/gim,'')
    .replace(/汉唐中医|Nihaisha|nihaisha|\$倪海厦中医/gi,title)
    .replace(/<[^>]+>/g,'');
}
function shell(slug,title) {
  const dir=target(slug), base=path.join(source('nihaixia-app'),'integration');
  for(const file of ['index.html','style.css','app.js'])copy(path.join(base,file),path.join(dir,file));
  fs.writeFileSync(path.join(dir,'index.html'),fs.readFileSync(path.join(dir,'index.html'),'utf8').replaceAll('倪师中医经方学习',title),'utf8');
  fs.mkdirSync(path.join(dir,'documents'),{recursive:true});
  return dir;
}
function catalogBuilder(slug,title,intro) {
  const dir=shell(slug,title), entries=[];
  return {dir, add(category,sourcePath,text,titleOverride) {
    text=clean(text,title); const id=String(entries.length+1);
    const label=titleOverride || /^#\s+(.+)$/m.exec(text)?.[1] || path.basename(sourcePath,'.md').replace(/^\d+[_\-]?/,'');
    entries.push({id,title:label,category,source:sourcePath,search:text.replace(/\s+/g,' ')});
    json(path.join(dir,'documents',id+'.json'),{text});
  }, finish() {
    json(path.join(dir,'catalog.json'),{title,intro,entries});
    console.log(slug+': '+entries.length+' 篇真实资料');
  }};
}
const adhd='adhd-training-platform';
for(const file of ['index.html','style.css','app.js','NOTICE.txt'])copy(path.join(source(adhd),'integration',file),path.join(target(adhd),file));
const tcm='nihaixia-app';
const library=catalogBuilder(tcm,'倪师中医经方学习','经方、本草与经典课程的本地资料库，支持检索、分类阅读、收藏和学习记录。');
const formulaData=JSON.parse(fs.readFileSync(path.join(source(tcm),'assets/data/formulas.json'),'utf8'));
for(const formula of formulaData.formulas) {
  const fields=[['别名',formula.alias],['六经',formula.meridian],['分类',formula.category],['课程方证',formula.indication],['方义',formula.explanation],['禁忌与注意',formula.contraindication]];
  let text='# '+formula.name+'\n\n'+fields.filter(([,v])=>v).map(([k,v])=>'## '+k+'\n\n'+v).join('\n\n');
  if(formula.components?.length)text+='\n\n## 组成药物（课程辨析）\n\n'+formula.components.map(v=>'- '+v.name+(v.role?'：'+v.role:'')).join('\n');
  library.add('经方方证','formulas/'+formula.id+'.md',text,formula.name);
}
const herbData=JSON.parse(fs.readFileSync(path.join(source(tcm),'assets/data/herbs.json'),'utf8'));
for(const herb of herbData.herbs) {
  const fields=[['古籍原文',herb.original],['课程药性',herb.action],['分类',herb.category],['性味',herb.nature_category],['禁忌与注意',herb.contraindication],['课程笔记',herb.clinical_notes],['历代注解',herb.historical_notes]];
  const text='# '+herb.name+'\n\n'+fields.filter(([,v])=>v).map(([k,v])=>'## '+k+'\n\n'+v).join('\n\n');
  library.add('本草学习','herbs/'+herb.name+'.md',text,herb.name);
}
const categories={neijing:'黄帝内经',shanghan:'伤寒论',jingui:'金匮要略',guji:'古籍研读',zhenjiu_lecture:'针灸课程',bencao_lecture:'神农本草',critical_illness:'专题课程',medical_cases:'课程医案'};
for(const [folder,label] of Object.entries(categories))for(const file of walk(path.join(source(tcm),'assets',folder)).filter(f=>f.endsWith('.md'))) {
  const relative=path.relative(path.join(source(tcm),'assets'),file).split(path.sep).join('/');
  library.add(label,relative,fs.readFileSync(file,'utf8'));
}
copy(path.join(source(tcm),'LICENSE'),path.join(library.dir,'LICENSE'));
copy(path.join(source(tcm),'integration/NOTICE.txt'),path.join(library.dir,'NOTICE.txt'));
library.finish();
const nishi='nihaisha-nishi-tcm';
const courses=catalogBuilder(nishi,'倪海厦中医','按课程、六经方证和学习主题检索真实课程整理资料与板书证据，支持收藏和已读记录。');
copy(path.join(source(nishi),'docs/USE_AND_RISK_NOTICE.md'),path.join(courses.dir,'USE_AND_RISK_NOTICE.md'));
fs.writeFileSync(path.join(courses.dir,'NOTICE.txt'),'资料改编自 JuneYaooo 维护的倪海厦中医课程资料库。原课程与整理材料的版权归各自权利人。\n\n'+fs.readFileSync(path.join(source(nishi),'docs/USE_AND_RISK_NOTICE.md'),'utf8'),'utf8');
const referenceRoot=path.join(source(nishi),'references');
for(const file of fs.readdirSync(referenceRoot).filter(name=>name.endsWith('.md')).sort((a,b)=>Number(b==='learning-entry.md')-Number(a==='learning-entry.md')||a.localeCompare(b))) {
  const text=fs.readFileSync(path.join(referenceRoot,file),'utf8');
  const category=file.includes('screenshot')?'板书证据':file.includes('notes-')?'课程笔记':file.includes('needle-depth')?'针灸安全资料':'课程学习';
  courses.add(category,'references/'+file,text);
}
// Course references use relative links to these locally bundled, unmodified evidence images.
const screenshots=path.join(source(nishi),'assets/screenshots');
for(const file of walk(screenshots).filter(f=>f.endsWith('.webp')))copy(file,path.join(courses.dir,'assets/screenshots',path.relative(screenshots,file)));
courses.finish();
console.log('ADHD training and TCM modules built without external runtime dependencies.');

const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.BIO_PLAYWRIGHT_PATH||'playwright');
const base=process.env.BIO_TEST_URL||'http://127.0.0.1:4174';
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:1060}});
 const page=await context.newPage();const errors=[],badRequests=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)badRequests.push(r.url()+' '+r.status())});
 const output=path.resolve(__dirname,'../work/qa');fs.mkdirSync(output,{recursive:true});
 const go=async hash=>{await page.goto(base+'/#'+hash);await page.locator('#main h1,#main .reader-heading').first().waitFor()};
 await go('home');assert.equal(await page.locator('.topic-card').count(),6);await page.screenshot({path:path.join(output,'home-desktop.png'),fullPage:true});
 const topics=await page.evaluate(()=>TOPICS),books=await page.evaluate(()=>BOOKS);
 await go('library');assert.equal(await page.locator('.topic-card').count(),topics.length);
 for(const b of books){await go('library/'+b.id);assert.equal(await page.locator('.topic-card').count(),topics.filter(t=>t.book===b.id).length)}
 // Search keyboard shortcut, filtering, and navigation.
 await page.keyboard.press('Control+k');await page.locator('#search-input').fill('光合作用');assert(await page.locator('#search-results a').count()>0);await page.locator('#search-results a').filter({hasText:'光合作用'}).first().click();await page.locator('#search-dialog').waitFor({state:'hidden'});
 // Every topic view renders real data, all models initialize, and every original start page exists.
 for(const t of topics){
  await go(`topic/${t.id}/learn`);assert.equal(await page.locator('.notes-list li').count(),3);
  await go(`topic/${t.id}/model`);assert(await page.locator('#scene').innerText());
  await go(`topic/${t.id}/quiz`);assert.equal(await page.locator('.quiz-option').count(),3);
  await go(`topic/${t.id}/source`);await page.locator('#book-page').evaluate(img=>img.complete&&img.naturalWidth?Promise.resolve():new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject}));
  assert((await page.locator('#book-page').getAttribute('src')).includes(String(t.page+books.find(b=>b.id===t.book).offset).padStart(3,'0')));
 }
 console.log('Rendered all topic tabs and source page starts.');
 const byScene=scene=>topics.find(t=>t.scene===scene);
 await go('topic/'+byScene('cell').id+'/model');await page.getByRole('button',{name:'动物细胞',exact:true}).click();assert(await page.locator('.model-svg').textContent().then(s=>s.includes('动物细胞')));await page.locator('.part-buttons [data-part="细胞膜"]').click();assert((await page.locator('.model-note').innerText()).includes('控制物质进出'));await page.screenshot({path:path.join(output,'cell-desktop.png'),fullPage:true});
 await go('topic/'+byScene('microscope').id+'/model');await page.locator('#objective').selectOption('40');assert((await page.locator('.model-note').innerText()).includes('400倍'));
 await go('topic/'+byScene('germination').id+'/model');await page.locator('#seed-water').selectOption('dry');assert((await page.locator('.model-note').innerText()).includes('缺少水分'));await page.locator('#seed-water').selectOption('flood');assert((await page.locator('.model-note').innerText()).includes('氧气不足'));
 await go('topic/'+byScene('photosynthesis').id+'/model');await page.locator('#light').fill('0');assert((await page.locator('.model-note').innerText()).includes('光照'));assert.equal(await page.locator('#light-val').innerText(),'0%');
 await go('topic/'+byScene('breathing').id+'/model');await page.locator('#breath').fill('0');assert((await page.locator('.model-note').innerText()).includes('舒张'));await page.locator('#breath').fill('100');assert((await page.locator('.model-note').innerText()).includes('膈肌收缩'));
 await go('topic/'+byScene('circulation').id+'/model');await page.locator('[data-next]').click();assert.equal(await page.locator('.route-node.current strong').innerText(),'肺动脉');
 await go('topic/'+byScene('nephron').id+'/model');await page.getByRole('button',{name:'尿液',exact:true}).click();assert.equal(await page.locator('.molecules .present').count(),3);
 await go('topic/'+byScene('reflex').id+'/model');await page.locator('#reflex-cut').selectOption('1');await page.locator('#signal-next').click();assert((await page.locator('.model-note').innerText()).includes('中断'));await page.locator('#signal-next').click();assert((await page.locator('.model-note').innerText()).includes('中断'));
 await go('topic/'+byScene('genetics').id+'/model');assert.deepEqual(await page.locator('.genetic-results>div>strong').allTextContents(),['25%','50%','25%']);await page.locator('#parent-0').selectOption('AA');await page.locator('#parent-1').selectOption('aa');assert.deepEqual(await page.locator('.genetic-results>div>strong').allTextContents(),['0%','100%','0%']);await page.screenshot({path:path.join(output,'genetics-desktop.png'),fullPage:true});
 await go('topic/'+byScene('foodweb').id+'/model');await page.locator('#efficiency').fill('20');assert((await page.locator('.energy-chain').innerText()).includes('400 kJ'));
 await go('topic/'+byScene('evolution').id+'/model');await page.getByRole('button',{name:'深色树皮',exact:true}).click();await page.locator('#generation').click();assert((await page.locator('.model-readout').innerText()).includes('60.0%'));
 // Notes, mastery, and favorites persist after reloading.
 const first=topics[0];await go('topic/'+first.id+'/learn');await page.locator('#personal-note').fill('记录：观察与推测要区分。');await page.locator('[data-favorite]').click();await page.locator('#mark-mastered').click();await page.reload();assert.equal(await page.locator('#personal-note').inputValue(),'记录：观察与推测要区分。');assert((await page.locator('#mark-mastered').innerText()).includes('已掌握'));assert.equal(await page.locator('[data-favorite]').getAttribute('aria-pressed'),'true');
 await go('topic/'+first.id+'/quiz');await page.locator(`[data-choice="${(first.answer+1)%3}"]`).click();assert.equal(await page.locator('.feedback.wrong').count(),1);await go('practice');assert.equal(await page.locator('.wrong-item').count(),1);await go('topic/'+first.id+'/quiz');await page.locator(`[data-choice="${first.answer}"]`).click();assert.equal(await page.locator('.feedback:not(.wrong)').count(),1);await go('practice');assert.equal(await page.locator('.wrong-item').count(),0);
 await page.locator('#start-quiz').click();for(let i=0;i<10;i++){let q=await page.locator('.quiz-prompt').innerText();let t=topics.find(t=>t.question===q);assert(t);await page.locator(`[data-choice="${t.answer}"]`).click();await page.locator('#next-question').click()}assert((await page.locator('.result-circle').innerText()).includes('10'));
 await go('read/7a/6');await page.locator('#page-next').click();assert.equal(await page.locator('#page-number').inputValue(),'7');await page.locator('#page-number').fill('999');await page.locator('#page-number').blur();assert.equal(await page.locator('#page-number').inputValue(),'141');await page.locator('#page-zoom').selectOption('150');assert.equal(await page.locator('#book-page').evaluate(el=>el.style.width),'150%');
 // Print modes keep the intended content and exclude navigation.
 await go('topic/'+first.id+'/learn');await page.emulateMedia({media:'print'});assert.equal(await page.locator('.sidebar').isVisible(),false);assert.equal(await page.locator('.notes-list').isVisible(),true);assert.equal(await page.locator('#print-note').isVisible(),true);await page.emulateMedia({media:'screen'});
 for(const width of [390,320,768]){await page.setViewportSize({width,height:844});for(const hash of ['home','library/7a','topic/'+byScene('genetics').id+'/model','topic/'+byScene('cell').id+'/model','read/8b/8','practice']){await go(hash);const size=await page.evaluate(()=>({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));assert(size.scroll<=size.width+1,`horizontal overflow ${width}px ${hash}: ${JSON.stringify(size)}`)}if(width===390){await go('home');await page.screenshot({path:path.join(output,'home-mobile.png'),fullPage:true});await page.locator('#menu-toggle').click();await page.waitForFunction(()=>document.querySelector('.sidebar').getBoundingClientRect().left>=-0.5);await page.locator('.main-nav a[href="#books"]').click();assert(!(await page.locator('.sidebar').getAttribute('class')).includes('open'))}}
 await page.setViewportSize({width:1440,height:1060});await go('home');
 assert.deepEqual(errors,[]);assert.deepEqual(badRequests,[]);await browser.close();console.log(JSON.stringify({status:'PASS',topics:topics.length,models:11,originalPages:535,viewports:[1440,768,390,320],checks:['all topic tabs','11 model interactions','search','favorites','mastery','notes persistence','wrong-answer review','10-question round','reader navigation/zoom','print layout','mobile navigation'],screenshots:output},null,2));
})().catch(error=>{console.error(error);process.exit(1)});

const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {chromium}=require(process.env.BIO_PLAYWRIGHT_PATH||'playwright');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1060},reducedMotion:'reduce'}),page=await context.newPage(),errors=[],badRequests=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)badRequests.push(r.url()+' '+r.status())});
  const base=process.env.BIO_TEST_URL||'http://localhost:4174',output=path.resolve(__dirname,'../work/qa');fs.mkdirSync(output,{recursive:true});
  const go=async hash=>{await page.goto(base+'/#'+hash);await page.locator('#main h1').first().waitFor()};
  await go('papers');assert.equal(await page.locator('[name="paper-book"]:checked').count(),4);assert((await page.locator('#paper-pool-info').innerText()).includes('66'));
  await page.screenshot({path:path.join(output,'papers-builder-desktop.png'),fullPage:true});
  for(const b of ['7b','8a','8b'])await page.locator(`[name="paper-book"][value="${b}"]`).uncheck();assert((await page.locator('#paper-pool-info').innerText()).includes('22'));
  await page.locator('#paper-group').selectOption('7a|认识生物');assert.equal(await page.locator('#paper-count').inputValue(),'2');await page.locator('#paper-group').selectOption('all');await page.locator('#paper-count').fill('5');await page.locator('#paper-title').fill('七上复习测试卷');await page.locator('#paper-minutes').fill('20');await page.locator('#paper-generate').click();
  await page.locator('.paper-sheet').waitFor();const paperHash=await page.evaluate(()=>location.hash);assert.equal(await page.locator('.paper-question').count(),5);assert(await page.locator('#paper-answer-section').isHidden());
  await page.locator('[data-student="name"]').fill('同学甲');await page.locator('[data-student="className"]').fill('八年级一班');
  const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('life-between-v1')).papers[0]);assert(before.questions.every(q=>q.id.startsWith('7a-')));
  await page.locator('#paper-submit').click();assert((await page.locator('#paper-submit-hint').innerText()).includes('还有 5 题'));
  await page.locator('[data-q="0"][value="1"]').check();await page.reload();await page.locator('.paper-sheet').waitFor();assert.equal(await page.locator('[data-student="name"]').inputValue(),'同学甲');assert(await page.locator('[data-q="0"][value="1"]').isChecked());const resumed=await page.evaluate(()=>JSON.parse(localStorage.getItem('life-between-v1')).papers[0]);assert.deepEqual(resumed.questions.map(q=>q.order),before.questions.map(q=>q.order));
  const topics=await page.evaluate(()=>TOPICS);
  for(let i=0;i<5;i++){const q=before.questions[i],t=topics.find(t=>t.id===q.id),correct=q.order.indexOf(t.answer),choice=i===0?(correct+1)%3:correct;await page.locator(`[data-q="${i}"][value="${choice}"]`).check()}
  await page.locator('#paper-submit').click();assert((await page.locator('#paper-submit-bar').innerText()).includes('80 / 100'));assert.equal(await page.locator('.paper-wrong').count(),1);assert(await page.locator('.paper-options input').first().isDisabled());const submitted=await page.evaluate(()=>JSON.parse(localStorage.getItem('life-between-v1')));assert.equal(submitted.attempts,5);assert(submitted.wrong.includes(before.questions[0].id));await page.reload();assert((await page.locator('#paper-submit-bar').innerText()).includes('80 / 100'));assert.equal((await page.evaluate(()=>JSON.parse(localStorage.getItem('life-between-v1')))).attempts,5);
  await page.locator('#paper-toggle-answers').click();assert(await page.locator('#paper-answer-section').isVisible());assert.equal(await page.locator('.paper-explanation').count(),5);
  await page.screenshot({path:path.join(output,'paper-graded-desktop.png'),fullPage:true});
  // Check the actual print buttons select independent student/teacher layouts.
  await page.evaluate(()=>{window.print=()=>{window.__printChecks={student:document.body.classList.contains('printing-paper-student'),answers:document.body.classList.contains('printing-paper-answers')}}});
  await page.locator('#paper-print-student').click();assert.deepEqual(await page.evaluate(()=>window.__printChecks),{student:true,answers:false});await page.locator('#paper-print-answers').click();assert.deepEqual(await page.evaluate(()=>window.__printChecks),{student:false,answers:true});
  await page.setViewportSize({width:794,height:1123});await page.emulateMedia({media:'print'});await page.evaluate(()=>document.body.classList.add('printing-paper-student'));assert(await page.locator('#paper-answer-section').isHidden());assert(await page.locator('.paper-questions').isVisible());assert(await page.locator('.paper-question-status').first().isHidden());assert(await page.locator('.paper-options input').first().isHidden());await page.screenshot({path:path.join(output,'paper-student-print.png'),fullPage:true});
  await page.evaluate(()=>{document.body.classList.remove('printing-paper-student');document.body.classList.add('printing-paper-answers');document.querySelector('#paper-answer-section').hidden=true});assert(await page.locator('.paper-questions').isHidden());assert(await page.locator('#paper-answer-section').isVisible());await page.screenshot({path:path.join(output,'paper-answers-print.png'),fullPage:true});await page.evaluate(()=>document.body.classList.remove('printing-paper-answers'));await page.emulateMedia({media:'screen'});
  await go('papers');assert.equal(await page.locator('.paper-history-item').count(),1);await page.locator('.paper-history-item').click();assert.equal(await page.evaluate(()=>location.hash),paperHash);
  for(const width of [768,390,320]){await page.setViewportSize({width,height:844});for(const hash of ['papers',paperHash.slice(1)]){await go(hash);await page.waitForFunction(()=>!document.querySelector('.sidebar').classList.contains('open'));assert(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1),`horizontal overflow ${width}px ${hash}`)}if(width===390){await go('papers');await page.screenshot({path:path.join(output,'papers-builder-mobile.png'),fullPage:true})}}
  await page.goto(base+'/#papers/doesnotexist');await page.locator('.empty h2').waitFor();assert((await page.locator('.empty h2').innerText()).includes('没有找到'));
  assert.deepEqual(errors,[]);assert.deepEqual(badRequests,[]);console.log('PASS: paper builder/scopes, stable question/option order, saved answers, incomplete submission, grading, wrong-answer sync, no repeated scoring, student/answer print separation, history, mobile layouts.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});

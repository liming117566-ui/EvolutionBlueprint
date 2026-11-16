const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {chromium}=require(process.env.BIO_PLAYWRIGHT_PATH||'playwright');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1060},reducedMotion:'reduce'}),page=await context.newPage(),errors=[],badRequests=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)badRequests.push(r.url()+' '+r.status())});
  const base=process.env.BIO_TEST_URL||'http://localhost:4174';const output=path.resolve(__dirname,'../work/qa');fs.mkdirSync(output,{recursive:true});
  const go=async hash=>{await page.goto(base+'/#'+hash);await page.locator('#main h1').first().waitFor()};
  const saved=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('life-between-v1')));
  await go('home');assert.equal(await page.locator('.sprint-teaser').count(),1);assert((await page.title()).includes('地生会考学习空间'));assert((await page.locator('#breadcrumb').innerText()).includes('会考学习首页'));
  await page.locator('.main-nav [data-nav="sprint"]').click();await page.locator('.sprint-plan').waitFor();
  assert.equal(await page.locator('.sprint-day').count(),7);assert(await page.locator('#sprint-checkin').isDisabled());
  const topics=await page.evaluate(()=>TOPICS),today=await page.evaluate(()=>SprintCore.today());
  await page.screenshot({path:path.join(output,'sprint-desktop.png'),fullPage:true});
  await go('sprint/1');await page.locator('#sprint-reviewed').check();assert(await page.locator('#sprint-checkin').isDisabled());
  await page.locator('#sprint-start').click();await page.locator('#sprint-question').waitFor();assert(await page.locator('#sprint-next').isDisabled());
  // First answer is deliberately incorrect; saved answer cannot be changed or counted twice on refresh.
  const firstQuestion=await page.locator('.quiz-prompt').innerText(),firstTopic=topics.find(t=>t.question===firstQuestion),wrongChoice=(firstTopic.answer+1)%3;
  await page.locator(`[data-choice="${wrongChoice}"]`).click();assert.equal(await page.locator('.feedback.wrong').count(),1);
  const beforeReload=await saved();assert.equal(beforeReload.attempts,1);assert.equal(beforeReload.sprint.activity[today].answered,1);assert(beforeReload.wrong.includes(firstTopic.id));
  await page.reload();await page.locator('#sprint-next').waitFor();assert.equal(await page.locator('.feedback.wrong').count(),1);assert.equal((await saved()).attempts,1);assert(await page.locator('.quiz-option').first().isDisabled());
  await page.locator('#sprint-next').click();await page.getByRole('link',{name:'暂停并返回任务'}).click();assert((await page.locator('#sprint-start').innerText()).includes('继续'));await page.reload();await page.locator('#sprint-start').click();assert((await page.locator('.page-intro p').innerText()).includes('第 2 / 10 题'));
  for(let i=1;i<10;i++){const question=await page.locator('.quiz-prompt').innerText(),t=topics.find(t=>t.question===question);await page.locator(`[data-choice="${t.answer}"]`).click();await page.locator('#sprint-next').click()}
  assert((await page.locator('.result-circle').innerText()).includes('9'));assert(!(await page.locator('#sprint-result-checkin').isDisabled()));
  await page.locator('#sprint-result-checkin').click();await page.locator('.sprint-calendar').waitFor();assert.equal(await page.locator('#sprint-checkin').innerText(),'✓ 今日已打卡');assert(await page.locator('#sprint-checkin').isDisabled());
  const afterFirst=await saved();assert.deepEqual(afterFirst.sprint.checkins[today].days,[1]);assert.equal(afterFirst.sprint.activity[today].answered,10);assert.equal(afterFirst.sprint.activity[today].correct,9);assert.equal(await page.locator('#sprint-count').innerText(),'1/7');
  await page.reload();assert.equal(await page.locator('#sprint-checkin').innerText(),'✓ 今日已打卡');
  // Same-day second task: completing exercises alone does not satisfy review confirmation.
  await go('sprint/4');await page.locator('#sprint-start').click();
  for(let i=0;i<6;i++){const question=await page.locator('.quiz-prompt').innerText(),t=topics.find(t=>t.question===question);await page.locator(`[data-choice="${t.answer}"]`).click();await page.locator('#sprint-next').click()}
  assert(await page.locator('#sprint-result-checkin').isDisabled());await page.getByRole('link',{name:'返回复习任务 →'}).click();await page.locator('#sprint-reviewed').check();assert(!(await page.locator('#sprint-checkin').isDisabled()));await page.locator('#sprint-checkin').click();
  assert.deepEqual((await saved()).sprint.checkins[today].days,[1,4]);assert.equal(await page.locator('#sprint-count').innerText(),'2/7');assert.equal(await page.locator('.sprint-stats .stat').nth(2).locator('strong').innerText(),'1 天');
  await page.screenshot({path:path.join(output,'sprint-checked-desktop.png'),fullPage:true});
  // Yesterday's result/review cannot be used for today's check-in; consecutive count handles midnight.
  await page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('life-between-v1'));const today=SprintCore.today(),yesterday=SprintCore.shiftDate(today,-1);s.sprint.checkins={[yesterday]:{days:[1]}};s.sprint.days[1].reviewedOn=yesterday;s.sprint.days[1].lastResult.date=yesterday;localStorage.setItem('life-between-v1',JSON.stringify(s))});
  await go('sprint/1');await page.reload();assert(!(await page.locator('#sprint-reviewed').isChecked()));assert(await page.locator('#sprint-checkin').isDisabled());assert.equal(await page.locator('.sprint-stats .stat').nth(1).locator('strong').innerText(),'1 天');await page.locator('#sprint-reviewed').check();assert(await page.locator('#sprint-checkin').isDisabled());
  // All task scopes and invalid day fallback render.
  for(let day=1;day<=7;day++){await go('sprint/'+day);assert.equal(await page.locator('.sprint-day.selected').count(),1);assert((await page.locator('.sprint-task-heading .eyebrow').innerText()).includes(String(day).padStart(2,'0')))}await go('sprint/999');assert.equal(await page.locator('.sprint-day.selected').count(),1);
  // Mobile and tablet layouts, sidebar route, and actual actionable controls.
  for(const width of [768,390,320]){await page.setViewportSize({width,height:844});for(const hash of ['home','sprint/1','sprint/7','sprint/6/practice','practice']){await go(hash);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1),`horizontal overflow ${width}px ${hash}`)}if(width===390){await go('sprint/1');await page.screenshot({path:path.join(output,'sprint-mobile.png'),fullPage:true})}}
  assert.deepEqual(errors,[]);assert.deepEqual(badRequests,[]);
  console.log('PASS: 7-day sprint navigation, prerequisites, saved/resumed answers, no duplicate scoring, wrong-answer sync, result/check-in, same-day deduplication, previous-day guards, invalid route, 1440/768/390/320 layouts.');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exit(1)});

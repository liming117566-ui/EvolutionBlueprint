/* New persistent backend verification. Requires an explicitly enabled local test API and a disposable card. */
const automator = require(process.env.MINIPROGRAM_AUTOMATOR_PATH || 'miniprogram-automator');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const out = path.resolve(__dirname, '../artifacts/ui');
const report = { checks: [], exceptions: [], screenshots: [], status: 'running' };
(async () => {
  if (!process.env.UI_TEST_CODE) throw new Error('Set UI_TEST_CODE to a disposable card from the isolated local test database; never use production cards.');
  fs.mkdirSync(out, { recursive: true });
  const mp = await automator.connect({ wsEndpoint: 'ws://127.0.0.1:9420' });
  let original;
  const check = (name, value) => { assert.ok(value, name); report.checks.push(name); console.log('PASS', name); };
  const invoke = (method, ...args) => mp.evaluate((name, values) => getCurrentPages().slice(-1)[0][name](...values), method, args);
  const shot = async name => { await mp.screenshot({ path: path.join(out, name + '.png') }); report.screenshots.push(name + '.png'); };
  const settle = async route => {
    let page = await mp.currentPage();
    await page.waitFor(async () => (await mp.currentPage()).path === route);
    page = await mp.currentPage();
    await page.waitFor(async () => !(await page.data('loading')));
    return page;
  };
  try {
    mp.on('exception', error => report.exceptions.push(error));
    original = await mp.evaluate(() => wx.getStorageInfoSync().keys.map(key => ({ key, value: wx.getStorageSync(key) })));
    fs.writeFileSync(path.join(out, 'test-storage-backup.json'), JSON.stringify(original));
    await mp.evaluate(() => wx.getStorageInfoSync().keys.filter(key => key.startsWith('blueprint') || key === 'currentCourse').forEach(key => wx.removeStorageSync(key)));
    await mp.reLaunch('/pages/gate/gate');
    let page = await settle('pages/gate/gate');
    await page.waitFor('.gate-form');
    await invoke('redeem');
    check('Empty card shows an error without granting access', Boolean(await page.data('error')));
    check('Explicit local test login is available only in devtools', await page.data('canDevLogin'));
    await invoke('devLogin');
    await page.waitFor(async () => Boolean(await page.data('signedIn')) && !(await page.data('loading')));
    check('Test identity is visibly distinguished from WeChat', await page.data('testSession'));
    const input = await page.$('.code-input'); await input.input(process.env.UI_TEST_CODE);
    await (await (await page.$('#redeem-action')).$('.button')).tap();
    page = await settle('pages/home/home');
    await page.waitFor('.board-grid');
    check('Real redemption reaches remote course home', !(await page.data('error')) && (await page.data('courses')).length > 0);
    await shot('cms-01-home');
    const courses = await page.data('courses');
    const chosen = courses.find(c => c.accessible && c.chapters && c.chapters.some(ch => ch.sections.length));
    check('A disposable card authorizes a real published course', chosen);
    const boards = await page.data('boards');
    const board = boards.find(b => b.categoryIds.includes(chosen.categoryId));
    check('The authorized course belongs to a published learning board', board);
    await mp.navigateTo('/pages/board/board?id=' + encodeURIComponent(board.id));
    page = await settle('pages/board/board');
    check('The secondary page only lists courses in its configured categories', (await page.data('courses')).every(c => board.categoryIds.includes(c.categoryId)));
    await shot('cms-02-board');
    await invoke('openCourse', { currentTarget: { dataset: { id: chosen.id } } });
    page = await settle('pages/course/course');
    const chapter = chosen.chapters.find(ch => ch.sections.length);
    await mp.pageScrollTo(500);
    await invoke('openChapter', { currentTarget: { dataset: { id: chapter.id } } });
    page = await settle('pages/lesson/lesson');
    check('Directory navigation preserves stable course and chapter IDs', (await page.data('course')).id === chosen.id && (await page.data('chapterId')) === chapter.id);
    check('Subsections appear directly without modes', Boolean(await page.$('.section-list')) && !(await page.$('.mode-card')));
    check('Subsection count is driven by backend content', (await page.data('sections')).length === chapter.sections.length);
    await shot('cms-02-directory');
    const section = chapter.sections[0];
    await invoke('openSection', { currentTarget: { dataset: { id: section.id } } });
    await page.waitFor('#section-reader');
    check('Remote subsection text matches the selected stable ID', (await page.data('section')).id === section.id);
    await shot('cms-03-reader');
    const materials = await page.$('#reading-materials');
    check('Authenticated course material component is mounted', materials);
    await page.waitFor(async () => !(await materials.data('loading')));
    check('Material list reaches the same authenticated backend', !(await materials.data('error')));
    await invoke('nextSection');
    check('Subsection completion returned without an error', !(await page.data('error')));
    await mp.reLaunch('/pages/profile/profile'); page = await settle('pages/profile/profile');
    await page.waitFor('.identity-card');
    check('Profile loads the real account', Boolean((await page.data('user')).id));
    await shot('cms-04-profile');
    check('No runtime exceptions', report.exceptions.length === 0);
    report.status = 'passed';
  } catch (error) {
    report.status = 'failed'; report.error = error.stack; console.error(error); process.exitCode = 1;
    try { await shot('cms-failure'); } catch (_) {}
  } finally {
    if (original) {
      await mp.evaluate(records => {
        const originalKeys = new Set(records.map(r => r.key));
        wx.getStorageInfoSync().keys.filter(key => (key.startsWith('blueprint') || key === 'currentCourse') && !originalKeys.has(key)).forEach(key => wx.removeStorageSync(key));
        records.forEach(r => wx.setStorageSync(r.key, r.value));
      }, original);
      await mp.reLaunch('/pages/home/home');
    }
    fs.writeFileSync(path.join(out, 'cms-verification.json'), JSON.stringify(report, null, 2));
    if (report.status === 'passed') fs.unlinkSync(path.join(out, 'test-storage-backup.json'));
    await mp.disconnect();
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });

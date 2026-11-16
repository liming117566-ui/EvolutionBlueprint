// End-to-end acceptance against the explicitly isolated DevTools backend.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const automator = require('../artifacts/devtools/node_modules/miniprogram-automator');
const out = path.resolve(__dirname, '../artifacts/ui/redemption');
fs.mkdirSync(out, { recursive: true });
const poll = async (fn, ms = 12000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await fn()) return true; await new Promise(resolve => setTimeout(resolve, 150)); }
  return false;
};
const bound = (promise, ms) => new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error('Screenshot timed out')), ms); promise.then(result => { clearTimeout(timer); resolve(result); }, error => { clearTimeout(timer); reject(error); }); });
(async () => {
  const codes = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../artifacts/devtools/redemption-test-codes.json')));
  const mp = await automator.connect({ wsEndpoint: 'ws://127.0.0.1:9420' });
  const report = { checks: [], exceptions: [], screenshots: [], status: 'running' };
  const check = (name, pass) => { assert(pass, name); report.checks.push(name); console.log('PASS', name); };
  const invoke = (name, ...args) => mp.evaluate((method, values) => getCurrentPages().slice(-1)[0][method](...values), name, args);
  const ready = async route => {
    check('Reached ' + route, await poll(async () => (await mp.currentPage()).path === route));
    check('Loaded ' + route, await poll(async () => !(await (await mp.currentPage()).data('loading'))));
    return mp.currentPage();
  };
  const shot = async name => { try { await bound(mp.screenshot({ path: path.join(out, name + '.png') }), 12000); report.screenshots.push(name + '.png'); } catch (error) { report.screenshotLimitation = error.message; } };
  try {
    mp.on('exception', error => report.exceptions.push(error.message || String(error)));
    const backup = await mp.evaluate(() => ({ session: wx.getStorageSync('blueprintSessionV2'), device: wx.getStorageSync('blueprintDevDeviceId') }));
    fs.writeFileSync(path.join(out, 'previous-session-backup.json'), JSON.stringify(backup));
    await mp.evaluate(device => { wx.setStorageSync('blueprintSessionV2', null); wx.setStorageSync('blueprintDevDeviceId', device); }, 'redemption-acceptance-' + Date.now());
    await mp.reLaunch('/pages/home/home'); let page = await ready('pages/home/home');
    check('Visitor sees only locked board summaries', (await page.data('boards')).every(board => !board.accessible));
    await invoke('openBoard', { detail: { id: 'module-english-chinese-words' } });
    page = await ready('pages/gate/gate');
    check('Visitor is sent to the English-word redemption gate', !(await page.data('signedIn')) && (await page.data('settings')).gateTitle.includes('英语单词'));
    await shot('01-locked-board');
    await invoke('devLogin'); page = await mp.currentPage();
    check('Disposable local test account logs in without entitlement', await page.data('testSession') && !(await page.data('hasAccess')));
    await invoke('onInput', { detail: { value: codes.autoBoardCode } }); await invoke('redeem');
    page = await ready('pages/home/home');
    let boards = await page.data('boards');
    check('Board-specific code unlocks exactly one board', boards.filter(board => board.accessible).length === 1 && boards.find(board => board.id === 'module-english-chinese-words').accessible);
    await mp.reLaunch('/pages/module/module?id=module-english-chinese-words'); page = await ready('pages/module/module');
    check('Unlocked board receives a local URL ticket', /^http:\/\/127\.0\.0\.1:3002\/web-access\/[A-Za-z0-9_-]+$/.test(await page.data('src')));
    check('Unlocked English-word webview loads', await poll(async () => await page.data('loaded'), 15000));
    await shot('02-single-board-unlocked');
    await mp.reLaunch('/pages/math/math?id=math-taxonomy'); page = await ready('pages/gate/gate');
    check('The same single-board code cannot open mathematics', (await page.data('settings')).gateTitle.includes('知识图谱'));
    await invoke('onInput', { detail: { value: codes.autoAllCode } }); await invoke('redeem');
    page = await ready('pages/home/home'); boards = await page.data('boards');
    check('All-board code unlocks every published board', boards.length >= 17 && boards.every(board => board.accessible));
    await shot('03-all-boards-unlocked');
    const saved = await mp.evaluate(() => wx.getStorageSync('blueprintSessionV2'));
    fs.writeFileSync(path.join(out, 'test-session.json'), JSON.stringify(saved));
    await mp.reLaunch('/pages/board/board?id=focus-space'); page = await ready('pages/board/board');
    check('All-board code also unlocks native course content', (await page.data('courses')).some(course => course.accessible && course.chapters?.length));
    await shot('04-native-course-unlocked');
    check('No native runtime exceptions', report.exceptions.length === 0);
    report.status = 'passed';
  } catch (error) { report.status = 'failed'; report.error = error.stack; process.exitCode = 1; console.error(error.message); await shot('failure'); }
  finally {
    fs.writeFileSync(path.join(out, 'verification.json'), JSON.stringify(report, null, 2));
    await mp.reLaunch('/pages/home/home'); await mp.disconnect();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

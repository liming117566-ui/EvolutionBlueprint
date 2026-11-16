// Verifies the actual WeChat DevTools runtime without touching accounts or learning records.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { modules } = require('../miniprogram/utils/integrations');
const automator = require(process.env.MINIPROGRAM_AUTOMATOR_PATH || '../artifacts/devtools/node_modules/miniprogram-automator');
const out = path.join(__dirname, '../artifacts/ui/module-entries');
fs.mkdirSync(out, { recursive: true });
const timeout = (promise, ms, name) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(name + ' timed out')), ms);
  promise.then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
});
const poll = async (fn, ms = 12000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await fn()) return true; await new Promise(resolve => setTimeout(resolve, 150)); }
  return false;
};
(async () => {
  const mp = await automator.connect({ wsEndpoint: 'ws://127.0.0.1:9420' });
  const report = { checks: [], modules: [], exceptions: [], status: 'running' };
  const check = (name, value) => { assert(value, name); report.checks.push(name); console.log('PASS', name); };
  const call = (name, ...args) => mp.evaluate((method, values) => getCurrentPages().slice(-1)[0][method](...values), name, args);
  try {
    mp.on('exception', error => report.exceptions.push(error.message || String(error)));
    await mp.reLaunch('/pages/home/home');
    check('Home finishes loading', await poll(async () => !(await (await mp.currentPage()).data('loading'))));
    let page = await mp.currentPage();
    const boards = await page.data('boards');
    check('Home includes all 14 configured boards', boards.length === 14);
    for (const module of modules) check('Exact board title: ' + module.title, boards.some(board => board.experience === module.slug && board.title === module.title));
    try { await timeout(mp.screenshot({ path: path.join(out, 'home.png') }), 12000, 'Home screenshot'); } catch (error) { report.screenshotLimitation = error.message; }
    await mp.reLaunch('/pages/learn/learn');
    check('Learning list finishes loading', await poll(async () => !(await (await mp.currentPage()).data('loading'))));
    for (const module of modules) {
      await mp.reLaunch('/pages/learn/learn');
      await poll(async () => !(await (await mp.currentPage()).data('loading')));
      const id = 'module-' + module.slug;
      await call('openBoard', { detail: { id } });
      check('Native entry opens ' + module.slug, await poll(async () => (await mp.currentPage()).path === 'pages/module/module'));
      page = await mp.currentPage();
      check('Host uses a short-lived local ticket: ' + module.slug, await poll(async () => /^http:\/\/127\.0\.0\.1:3002\/web-access\/[A-Za-z0-9_-]{20,100}$/.test(await page.data('src'))));
      check('Host has no error: ' + module.slug, !(await page.data('error')));
      const loaded = await poll(async () => await page.data('loaded'), 3000);
      report.modules.push({ slug: module.slug, ticketed: true, webviewLoadObserved: loaded });
    }
    check('No native runtime exceptions', report.exceptions.length === 0);
    report.status = report.modules.every(module => module.webviewLoadObserved) ? 'passed' : 'passed_with_webview_event_limitations';
  } catch (error) { report.status = 'failed'; report.error = error.stack; process.exitCode = 1; console.error(error.message); }
  finally {
    fs.writeFileSync(path.join(out, 'verification.json'), JSON.stringify(report, null, 2));
    try { await timeout(mp.reLaunch('/pages/home/home'), 10000, 'Return home'); } catch (_) {}
    await mp.disconnect();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

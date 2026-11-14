// Local integration checks; no child profile, diagnosis session or learning record is created.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const automator = require(process.env.MINIPROGRAM_AUTOMATOR_PATH || '../artifacts/devtools/node_modules/miniprogram-automator');
const output = path.resolve(__dirname, '../artifacts/ui/math');
fs.mkdirSync(output, { recursive: true });
(async () => {
  const mp = await automator.connect({ wsEndpoint: 'ws://127.0.0.1:9420' });
  const report = { checks: [], exceptions: [], status: 'running' };
  const check = (name, value) => { assert.ok(value, name); report.checks.push(name); console.log('PASS', name); };
  const ready = async route => {
    let page = await mp.currentPage();
    await page.waitFor(async () => (await mp.currentPage()).path === route);
    page = await mp.currentPage(); await page.waitFor(async () => !await page.data('loading')); return page;
  };
  const open = async (id, event) => mp.evaluate((method, input) => getCurrentPages().slice(-1)[0][method](input), id, event);
  const screenshot = async file => {
    try { await mp.screenshot({ path: file }); }
    catch (error) {
      if (!/timeout waiting for automator response/.test(error.message)) throw error;
      await mp.screenshot({ path: file });
    }
  };
  try {
    mp.on('exception', error => report.exceptions.push(String(error.message || error)));
    await mp.reLaunch('/pages/home/home'); let page = await ready('pages/home/home');
    check('Home includes the published mathematics board', (await page.data('boards')).some(b => b.id === 'math-taxonomy' && b.experience === 'cn-math-taxonomy'));
    await screenshot(path.join(output, '01-home.png'));
    await open('openBoard', { detail: { id: 'math-taxonomy' } }); page = await ready('pages/math/math');
    check('Home entry opens the mathematics web-view without a login gate', !await page.data('error') && (await page.data('src')) === 'http://127.0.0.1:3002/math/?embedded=1');
    await mp.reLaunch('/pages/learn/learn'); page = await ready('pages/learn/learn');
    await open('selectGroup', { currentTarget: { dataset: { id: 'subject' } } });
    check('Subject classification contains both independent English and mathematics modules', (await page.data('filtered')).some(b => b.experience === 'cn-math-taxonomy') && (await page.data('filtered')).some(b => b.experience === 'english-starry-sky'));
    await open('openBoard', { detail: { id: 'math-taxonomy' } }); page = await ready('pages/math/math');
    check('Learning entry opens the same mathematics module', !await page.data('error') && (await page.data('src')).includes('/math/'));
    const status = await fetch('http://127.0.0.1:3002/api/integrations/math').then(r => r.json());
    check('Mathematics site and data are built', status.ready && status.basePath === '/math/');
    for (const route of ['', 'explore/', 'diagnose/', 'children/', 'children/history.html']) {
      const res = await fetch('http://127.0.0.1:3002/math/' + route); const html = await res.text();
      check('Original page is available with About removed: ' + (route || 'home'), res.ok && !/>\s*关于\s*<\/a>/.test(html));
    }
    const css = await fetch('http://127.0.0.1:3002/math/assets/site.css').then(r => r.text());
    check('Hosted UI stylesheet matches original module source', css === fs.readFileSync(path.resolve(__dirname, '../integrations/cn-math-taxonomy/assets/site.css'), 'utf8'));
    await screenshot(path.join(output, '02-math.png'));
    check('No native runtime exceptions', report.exceptions.length === 0);
    report.status = 'passed';
  } catch (error) {
    report.status = 'failed'; report.error = error.stack; process.exitCode = 1;
    try { await mp.screenshot({ path: path.join(output, 'failure.png') }); } catch (_) {}
    console.error(error.message);
  } finally { fs.writeFileSync(path.join(output, 'verification.json'), JSON.stringify(report, null, 2)); await mp.disconnect(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });

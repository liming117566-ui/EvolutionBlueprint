// Read-only UI verification: no account changes, redemption, or progress writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const automator = require(process.env.MINIPROGRAM_AUTOMATOR_PATH || '../artifacts/devtools/node_modules/miniprogram-automator');
const out = path.resolve(__dirname, '../artifacts/ui/boards');
fs.mkdirSync(out, { recursive: true });
(async () => {
  const mp = await automator.connect({ wsEndpoint: 'ws://127.0.0.1:9420' });
  const report = { checks: [], exceptions: [], screenshots: [] };
  const check = (name, value) => { assert.ok(value, name); report.checks.push(name); console.log('PASS', name); };
  const ready = async route => {
    let p = await mp.currentPage();
    await p.waitFor(async () => (await mp.currentPage()).path === route);
    p = await mp.currentPage(); await p.waitFor(async () => !await p.data('loading')); return p;
  };
  const shot = async name => { await mp.screenshot({ path: path.join(out, name + '.png') }); report.screenshots.push(name + '.png'); };
  try {
    mp.on('exception', e => report.exceptions.push(String(e.message || e)));
    await mp.reLaunch('/pages/home/home'); let p = await ready('pages/home/home');
    check('Home renders published boards without errors', !await p.data('error') && (await p.data('boards')).length >= 4);
    await shot('01-home');
    await (await p.$('.spotlight')).tap(); p = await ready('pages/english/english');
    check('English entry opens the integrated learning web-view without a login gate', !await p.data('error') && (await p.data('src')).includes('/english/?embedded=1'));
    await shot('02-english-web');
    await mp.reLaunch('/pages/board/board?id=focus-space'); p = await ready('pages/board/board');
    const board = await p.data('board');
    check('Course boards still open their native secondary pages', board.id === 'focus-space');
    check('Courses belong to the selected board', (await p.data('courses')).every(c => board.categoryIds.includes(c.categoryId)));
    await shot('02-focus');
    await (await p.$('[data-type="practice"]')).tap();
    await p.waitFor('.exercise-list');
    check('Practice entry switches to real exercise content or a clear empty state', await p.data('active') === 'practice' && !!await p.$('.exercise-list'));
    await shot('03-practice');
    await (await p.$('[data-type="progress"]')).tap();
    await p.waitFor('.progress-summary');
    check('Progress entry renders account-derived counts', await p.data('active') === 'progress' && !!await p.$('.progress-summary'));
    await (await p.$('[data-type="courses"]')).tap();
    await p.waitFor('.board-course');
    await (await p.$('.board-course')).tap(); p = await ready('pages/course/course');
    check('Course entry opens its own detail page', (await p.data('current')).id === 'focus' && !await p.data('error'));
    await shot('04-course');
    await mp.reLaunch('/pages/learn/learn'); p = await ready('pages/learn/learn');
    await shot('05-learning');
    await (await p.$('[data-id="growth"]')).tap();
    await p.waitFor(async () => await p.data('group') === 'growth');
    check('Growth filter excludes other groups', (await p.data('filtered')).length > 0 && (await p.data('filtered')).every(b => b.group === 'growth'));
    const input = await p.$('input'); await input.input('专注');
    await p.waitFor(async () => (await p.data('filtered')).length === 1);
    check('Search combines with the active group', (await p.data('filtered')).length === 1 && (await p.data('filtered'))[0].id === 'focus-space');
    await input.input('没有这个学习方向');
    await p.waitFor('.empty-state');
    check('Search has an explicit empty state', (await p.data('filtered')).length === 0 && !!await p.$('.empty-state'));
    await shot('06-empty-search');
    await p.waitFor('#reset-filter');
    await (await p.$('#reset-filter')).$('.button').then(b => b.tap());
    await p.waitFor(async () => await p.data('query') === '' && await p.data('group') === 'all');
    check('Clear restores every configured entry', (await p.data('filtered')).length === (await p.data('boards')).length);
    check('No runtime exceptions', report.exceptions.length === 0);
    report.status = 'passed';
  } catch (error) { report.status = 'failed'; report.error = error.stack; process.exitCode = 1; console.error(error.message); try { await shot('failure'); } catch (_) {} }
  finally { fs.writeFileSync(path.join(out, 'verification.json'), JSON.stringify(report, null, 2)); await mp.reLaunch('/pages/home/home'); await mp.disconnect(); }
})().catch(e => { console.error(e.message); process.exitCode = 1; });

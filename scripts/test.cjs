const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const mini = path.resolve(__dirname, '../miniprogram');
const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);
const files = walk(mini);
test('All JavaScript and JSON files parse', () => {
  for (const file of files) {
    if (file.endsWith('.js')) new vm.Script(fs.readFileSync(file, 'utf8'), { filename: file });
    if (file.endsWith('.json')) JSON.parse(fs.readFileSync(file, 'utf8'));
  }
});
test('Every declared page and component has its complete native file set', () => {
  const config = JSON.parse(fs.readFileSync(path.join(mini, 'app.json'), 'utf8'));
  for (const entry of [...config.pages, ...Object.values(config.usingComponents)]) {
    for (const extension of ['.js', '.json', '.wxml', '.wxss']) assert.ok(fs.existsSync(path.join(mini, entry.replace(/^\//, '') + extension)), entry + extension);
  }
});
test('Styles and illustrations preserve the five approved base colors', () => {
  const allowed = new Set(['ffffff', 'f8f8f9', '191a1d', '143f32', 'e9eeeb']);
  for (const file of files.filter(file => /\.(wxss|svg)$/.test(file))) {
    for (const match of fs.readFileSync(file, 'utf8').matchAll(/#([a-f0-9]{6})\b/gi)) assert.ok(allowed.has(match[1].toLowerCase()), `${file}: ${match[0]}`);
    for (const match of fs.readFileSync(file, 'utf8').matchAll(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/g)) {
      const color = match.slice(1, 4).map(number => Number(number).toString(16).padStart(2, '0')).join('');
      assert.ok(allowed.has(color), `${file}: ${match[0]}`);
    }
  }
});
test('Glass material and safe-area navigation match the design contract', () => {
  for (const relative of ['app.wxss', 'components/glass-nav/glass-nav.wxss', 'components/ui-sheet/ui-sheet.wxss']) {
    const css = fs.readFileSync(path.join(mini, relative), 'utf8');
    assert.match(css, /backdrop-filter:\s*blur\(16px\)/);
    assert.match(css, /border:\s*1px solid rgba\(/);
  }
  const nav = fs.readFileSync(path.join(mini, 'components/glass-nav/glass-nav.wxss'), 'utf8');
  assert.match(nav, /env\(safe-area-inset-bottom\)/);
  assert.match(nav, /border-radius:\s*999rpx/);
});
test('No decorative English labels or character-placeholder course covers remain', () => {
  for (const file of files.filter(file => file.endsWith('.wxml'))) assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /YOUR BLUEPRINT|YOUR LEARNING|PATH TO BETTER|A FIELD GUIDE|course-color/);
});
const config = require('../miniprogram/utils/config');
const apiFor = (envVersion, platform) => ({ getAccountInfoSync: () => ({ miniProgram: { envVersion } }), getDeviceInfo: () => ({ platform }) });
test('Develop devtools and physical phones use the new API, with local auth loopback-only', () => {
  assert.equal(config.getApiBaseUrl(apiFor('develop', 'devtools')), 'http://127.0.0.1:3002');
  assert.equal(config.canDevLogin(apiFor('develop', 'devtools')), true);
  assert.equal(config.getApiBaseUrl(apiFor('develop', 'ios')), 'http://10.12.195.50:3002');
  assert.equal(config.canDevLogin(apiFor('develop', 'ios')), false);
});
test('Trial, release and unknown environments fail closed until HTTPS is configured', () => {
  for (const env of ['trial', 'release', undefined]) {
    const api = apiFor(env, 'devtools');
    assert.equal(config.getApiBaseUrl(api), '');
    assert.equal(config.canDevLogin(api), false);
    assert.equal(config.validOrigin('http://127.0.0.1:3002', api), false);
  }
  assert.equal(config.getApiBaseUrl({}), '');
  for (const origin of ['https://user:pass@example.com', 'https://example.com/path', 'https://example.com?x=1', 'https://example.com:99999', 'http://public.example.com', 'http://10.999.0.1']) assert.equal(config.validOrigin(origin, apiFor('develop', 'devtools')), false);
});
test('Legacy source content remains intact for seed and migration checks', () => {
  const seed = require('../server/seed.json');
  const getContent = require('../miniprogram/utils/lesson-content');
  for (const course of seed.courses) for (const chapter of course.chapters) {
    const source = getContent(course.id, chapter.legacyIndex);
    for (const paragraph of source.body) assert.ok(chapter.sections.some(s => s.body.includes(paragraph)));
    assert.ok(chapter.sections.some(s => s.practice === source.practice));
  }
});
test('Debug mode is enabled only for explicitly recognized develop builds', () => {
  const enableDebug = require('../miniprogram/utils/development-debug');
  for (const env of ['develop', 'trial', 'release', undefined]) {
    let calls = 0;
    assert.equal(enableDebug({ ...apiFor(env, 'ios'), setEnableDebug: () => calls++ }), env === 'develop');
    assert.equal(calls, env === 'develop' ? 1 : 0);
  }
  assert.equal(enableDebug({}), false);
});

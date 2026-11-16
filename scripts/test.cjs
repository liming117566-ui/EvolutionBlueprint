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
test('Native styles and new illustrations use the supplied reference palette', () => {
  // Frozen from the supplied UI export so this check also works without local artifacts.
  // b04432 is the existing validation/error state; the other values are reference colors.
  const reference = new Set([
    'ffffff', '242823', 'f8d849', '6e736f', 'f8f9fa', 'e9ece7', 'e7efe8', 'fff5c7',
    '333b31', '3c4239', '525a4f', '60571e', '606656', '61675d', '616b54', '617142',
    '62695e', '747b73', '78691c', '7c874c', '877019', '889476', '8e9e6e', 'c1c7b9',
    'c9d1c1', 'cfb42f', 'd1dc99', 'd6dbd0', 'd6ddce', 'd9ddd7', 'd9dfd2', 'dbe0d5',
    'dfe2de', 'e4ecdf', 'e4ece4', 'e4edf1', 'e6edf5', 'e7ecf3', 'e9eee3', 'e9eee5',
    'eaebee', 'eaf0e4', 'ebe8f2', 'edf0e9', 'edf0ec', 'eee8ee', 'f1e9d6', 'f3ecd3',
    'fcfff2', 'b04432'
  ]);
  const legacy = new Set(['ffffff', 'f8f8f9', '191a1d', '143f32', 'e9eeeb']);
  const legacyAssets = new Set([
    ...['energy', 'english', 'focus', 'math', 'thinking'].map(name => `assets/covers/${name}.svg`),
    ...['arrow', 'book', 'chart', 'check', 'close', 'focus', 'home', 'idea', 'language', 'leaf',
      'mark', 'math', 'pencil', 'play', 'search', 'user'].map(name => `assets/icons/${name}.svg`)
  ]);
  for (const file of files.filter(file => /\.(wxss|svg)$/.test(file))) {
    const relative = path.relative(mini, file).split(path.sep).join('/');
    const allowed = legacyAssets.has(relative) ? new Set([...reference, ...legacy]) : reference;
    // SVG paint-server IDs such as url(#fade) are references, not color literals.
    const text = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/url\([^)]*\)/gi, '');
    for (const match of text.matchAll(/#([a-f0-9]{8}|[a-f0-9]{6}|[a-f0-9]{4}|[a-f0-9]{3})\b/gi)) {
      const raw = match[1].toLowerCase();
      const expanded = raw.length <= 4 ? [...raw].map(char => char + char).join('') : raw;
      assert.ok(allowed.has(expanded.slice(0, 6)), `${relative}: ${match[0]}`);
    }
    for (const match of text.matchAll(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/gi)) {
      const color = match.slice(1, 4).map(number => Number(number).toString(16).padStart(2, '0')).join('');
      assert.ok(allowed.has(color), `${relative}: ${match[0]}`);
    }
  }
});
test('Shared tokens, branded custom headers and selected navigation match the reference', () => {
  const global = fs.readFileSync(path.join(mini, 'app.wxss'), 'utf8');
  for (const [token, color] of Object.entries({ mist: 'f8f9fa', ink: '242823', accent: 'f8d849', muted: '6e736f', line: 'e9ece7', mint: 'e7efe8' })) {
    const declarations = [...global.matchAll(new RegExp(`--${token}:\\s*#([a-f0-9]+)`, 'gi'))];
    assert.equal(declarations.at(-1)?.[1], color, `final --${token} token`);
  }
  for (const page of ['home', 'learn', 'profile']) {
    const json = JSON.parse(fs.readFileSync(path.join(mini, `pages/${page}/${page}.json`), 'utf8'));
    const wxml = fs.readFileSync(path.join(mini, `pages/${page}/${page}.wxml`), 'utf8');
    assert.equal(json.navigationStyle, 'custom', `${page} keeps a single branded header`);
    assert.match(wxml, /class="brand-bar"/);
    assert.match(wxml, /src="\{\{settings\.logo\}\}"/);
    assert.match(wxml, /\{\{settings\.brandName\}\}/);
    assert.equal((wxml.match(/<glass-nav\b/g) || []).length, 1, `${page} has one main navigation`);
    assert.match(wxml, new RegExp(`<glass-nav[^>]*active="${page}"[^>]*settings="\\{\\{settings\\}\\}"`));
  }
  const markup = fs.readFileSync(path.join(mini, 'components/glass-nav/glass-nav.wxml'), 'utf8');
  assert.match(markup, /role="navigation"/);
  assert.match(markup, /wx:for="\{\{tabs\}\}"/);
  assert.match(markup, /active === item\.id \? 'is-active' : ''/);
  assert.match(markup, /bindtap="navigate"/);
  const nav = fs.readFileSync(path.join(mini, 'components/glass-nav/glass-nav.wxss'), 'utf8');
  assert.match(nav, /env\(safe-area-inset-bottom\)/);
  assert.match(nav, /\.dock-wrap\s*\{[^}]*position:\s*fixed/);
  assert.match(nav, /\.dock\s*\{[^}]*display:\s*flex/);
  assert.match(nav, /\.dock\s*\{[^}]*border-radius:\s*96rpx/);
  assert.match(nav, /backdrop-filter:\s*blur\(22px\)/);
  const selected = nav.match(/\.dock-item\.is-active\s*\{([^}]*)\}/)?.[1] || '';
  assert.match(selected, /background:\s*#f8d849\b/);
  assert.match(selected, /color:\s*#242823\b/);
  const sheet = fs.readFileSync(path.join(mini, 'components/ui-sheet/ui-sheet.wxss'), 'utf8');
  assert.match(sheet, /env\(safe-area-inset-bottom\)/);
  assert.match(sheet, /backdrop-filter:\s*blur\(4px\)/);
});
test('Main navigation preserves only the three supported destinations and rejects arbitrary routes', () => {
  const catalog = require('../miniprogram/utils/catalog');
  assert.deepEqual(catalog.defaults.nav.map(tab => tab.id), ['home', 'learn', 'profile']);
  let component;
  const calls = [];
  const context = { Component: value => { component = value; }, require: () => catalog, wx: { redirectTo: options => calls.push(options) } };
  vm.runInNewContext(fs.readFileSync(path.join(mini, 'components/glass-nav/glass-nav.js'), 'utf8'), context);
  const instance = { data: { active: 'home', busy: false }, setData(values) { Object.assign(this.data, values); } };
  const navigate = page => component.methods.navigate.call(instance, { currentTarget: { dataset: { page } } });
  for (const page of ['home', '../gate/gate', 'module', '', undefined]) navigate(page);
  assert.equal(calls.length, 0);
  for (const page of ['learn', 'profile', 'home']) {
    instance.data.active = page === 'home' ? 'profile' : 'home';
    navigate(page);
    assert.equal(calls.at(-1).url, `/pages/${page}/${page}`);
    const count = calls.length;
    navigate('learn');
    assert.equal(calls.length, count, 'a pending redirect cannot start another navigation');
    calls.at(-1).complete();
    assert.equal(instance.data.busy, false);
  }
});
test('No decorative English labels or character-placeholder course covers remain', () => {
  for (const file of files.filter(file => file.endsWith('.wxml'))) assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /YOUR BLUEPRINT|YOUR LEARNING|PATH TO BETTER|A FIELD GUIDE|course-color/);
});
const config = require('../miniprogram/utils/config');
const apiFor = (envVersion, platform) => ({ getAccountInfoSync: () => ({ miniProgram: { envVersion } }), getDeviceInfo: () => ({ platform }) });
test('Develop devtools and physical phones can request test identities from local test APIs', () => {
  assert.equal(config.getApiBaseUrl(apiFor('develop', 'devtools')), 'http://127.0.0.1:3002');
  assert.equal(config.canDevLogin(apiFor('develop', 'devtools')), true);
  assert.equal(config.getApiBaseUrl(apiFor('develop', 'ios')), 'http://10.12.195.41:3002');
  assert.equal(config.canDevLogin(apiFor('develop', 'ios')), true);
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

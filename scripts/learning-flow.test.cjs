const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const mini = path.resolve(__dirname, '../miniprogram');
const seed = require('../server/seed.json');
const clone = value => JSON.parse(JSON.stringify(value));
const tap = dataset => ({ currentTarget: { dataset } });
function environment(options = {}) {
  const storage = new Map(Object.entries(options.storage || {}));
  const calls = [], navigation = [], scrolls = [], modals = [];
  const data = { courses: clone(seed.courses), settings: clone(seed.settings), access: options.access !== false, network: false, wechatStatus: options.wechatStatus || 200, learning: new Map() };
  const empty = () => ({ sections: [], positions: [], legacyChapters: [] });
  const state = id => { if (!data.learning.has(id)) data.learning.set(id, empty()); return data.learning.get(id); };
  const wx = {
    getAccountInfoSync: () => ({ miniProgram: { envVersion: options.env || 'develop' } }),
    getDeviceInfo: () => ({ platform: options.platform || 'devtools' }), getWindowInfo: () => ({ statusBarHeight: 24 }),
    getStorageSync: key => storage.get(key), setStorageSync: (key, value) => storage.set(key, value),
    redirectTo: ({ url }) => navigation.push(url), navigateTo: ({ url }) => navigation.push(url),
    setNavigationBarTitle() {}, showToast() {}, pageScrollTo: value => scrolls.push(value),
    showModal(value) { modals.push(value); value.success({ confirm: Boolean(options.confirm) }); },
    login(value) { calls.push({ login: true }); value.success({ code: 'real-wx-code' }); },
    request(value) {
      calls.push(value);
      let aborted = false;
      queueMicrotask(async () => {
        if (aborted) return value.fail({ errMsg: 'abort' });
        if (data.network) return value.fail({ errMsg: 'network refused' });
        const route = value.url.replace(/^https?:\/\/[^/]+/, '');
        const token = value.header && value.header.Authorization;
        const id = token && token.replace('Bearer token-', '');
        let response;
        if (options.respond) response = await options.respond(route, value, data);
        if (!response) {
          if (route === '/api/bootstrap') response = { settings: data.settings, categories: seed.categories, version: 1 };
          else if (route === '/api/auth/wechat') {
            if (data.wechatStatus !== 200) return value.success({ statusCode: data.wechatStatus, data: { error: '微信登录未配置 AppSecret', code: 'WECHAT_NOT_CONFIGURED' } });
            response = { token: 'token-wechat', user: { id: 'wechat', nickname: '微信学员' } };
          } else if (route === '/api/auth/dev') response = { token: 'token-local-test', user: { id: 'local-test', nickname: '本地测试' } };
          else if (route === '/api/courses') response = { courses: data.courses.map(({ chapters, published, ...course }) => ({ ...course, category: seed.categories.find(c => c.id === course.categoryId).title, lessons: chapters.length, accessible: Boolean(id && data.access) })) };
          else if (!id) return value.success({ statusCode: 401, data: { error: '未登录' } });
          else if (route === '/api/me') response = { user: { id, nickname: id }, grants: [], hasAccess: data.access };
          else if (route.startsWith('/api/courses/')) {
            if (!data.access) return value.success({ statusCode: 403, data: { error: '当前账号暂无此课程权限' } });
            const course = data.courses.find(c => c.id === decodeURIComponent(route.split('/').pop()));
            if (!course) return value.success({ statusCode: 404, data: { error: '课程已下架' } });
            response = { course, version: 1 };
          } else if (route === '/api/me/learning' && value.method === 'GET') response = state(id);
          else if (route === '/api/me/learning' && value.method === 'PUT') {
            if (!data.access) return value.success({ statusCode: 403, data: { error: '权限已撤销' } });
            const saved = state(id), record = value.data;
            saved.positions = [...saved.positions.filter(p => p.courseId !== record.courseId), record];
            if (record.completed && !saved.sections.some(s => s.sectionId === record.sectionId)) saved.sections.push({ sectionId: record.sectionId, completed: true });
            response = { ok: true };
          } else if (route === '/api/me/learning/import') {
            const saved = state(id);
            for (const sectionId of value.data.sections) if (!saved.sections.some(s => s.sectionId === sectionId)) saved.sections.push({ sectionId, completed: true });
            for (const chapterId of value.data.chapters) if (!saved.legacyChapters.some(c => c.chapterId === chapterId)) saved.legacyChapters.push({ chapterId });
            response = { ok: true };
          } else if (route === '/api/redeem') { data.access = true; response = { ok: true }; }
          else response = { ok: true };
        }
        value.success(response.statusCode ? response : { statusCode: 200, data: clone(response) });
      });
      return { abort() { aborted = true; } };
    }
  };
  let app = { globalData: {} };
  const cache = new Map();
  function load(file) {
    file = path.resolve(mini, file);
    if (!path.extname(file)) file += '.js';
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} }; cache.set(file, module);
    vm.runInNewContext(fs.readFileSync(file, 'utf8'), { module, wx, getApp: () => app,
      require: name => load(path.resolve(path.dirname(file), name)), console,
      App: value => { app = value; }
    }, { filename: file });
    return module.exports;
  }
  load('app.js');
  function page(name) {
    let definition;
    const file = path.join(mini, `pages/${name}/${name}.js`);
    vm.runInNewContext(fs.readFileSync(file, 'utf8'), { Page: value => { definition = value; }, wx,
      require: name => load(path.resolve(path.dirname(file), name))
    }, { filename: file });
    const instance = { ...definition, data: clone(definition.data), setData(update, callback) { Object.assign(this.data, update); if (callback) callback(); } };
    return instance;
  }
  function signIn(id = 'user-a') { storage.set('blueprintSessionV2', { origin: 'http://127.0.0.1:3002', token: 'token-' + id, user: { id }, test: false }); }
  if (options.signedIn !== false) signIn();
  return { wx, page, load, storage, data, calls, navigation, scrolls, modals, signIn, state };
}
async function lesson(env, course = 'focus', chapter = 'focus-chapter-0') {
  const page = env.page('lesson'); page.onLoad({ course, chapter }); await page.onShow(); return page;
}
test('Old unlock flags cannot authorize a session or protected requests', async () => {
  const env = environment({ signedIn: false, storage: { blueprintUnlocked: true, blueprintToken: 'old-token' } });
  assert.equal(env.load('utils/learning').authorized(), false);
  assert.equal(env.navigation[0], '/pages/gate/gate');
  await assert.rejects(env.load('utils/api').request('/api/me'), /请先登录/);
  assert.equal(env.calls.length, 0);
});
test('wx.login code is exchanged for a real Bearer session, not a redemption token', async () => {
  const env = environment({ signedIn: false });
  await env.load('utils/session').login();
  assert.equal(env.calls.find(c => c.url && c.url.endsWith('/api/auth/wechat')).data.code, 'real-wx-code');
  await env.load('utils/session').me();
  assert.equal(env.calls.at(-1).header.Authorization, 'Bearer token-wechat');
});
test('Unconfigured AppSecret 503 is accurate and never silently creates a dev user', async () => {
  const env = environment({ signedIn: false, wechatStatus: 503 });
  const gate = env.page('gate'); gate.data.code = 'CODE'; await gate.redeem();
  assert.match(gate.data.error, /AppSecret/);
  assert.equal(gate.data.loading, false);
  assert.equal(env.load('utils/session').current(), null);
  assert.equal(env.calls.some(c => c.url && c.url.includes('/api/auth/dev')), false);
  assert.equal(env.calls.some(c => c.url && c.url.endsWith('/api/redeem')), false);
});
test('Explicit devtools login is visibly a test session and forbidden on real phones', async () => {
  const env = environment({ signedIn: false });
  const gate = env.page('gate'); await gate.devLogin();
  assert.equal(gate.data.testSession, true);
  assert.equal(env.calls.some(c => c.url && c.url.endsWith('/api/auth/dev')), true);
  const phone = environment({ signedIn: false, platform: 'ios' });
  await assert.rejects(phone.load('utils/session').devLogin(), /仅允许开发工具/);
  assert.equal(phone.calls.length, 0);
});
test('Redemption requires Bearer and never writes local authorization flags', async () => {
  const env = environment({ signedIn: false, access: false });
  const gate = env.page('gate'); gate.data.code = 'VALID'; await gate.redeem();
  const redeem = env.calls.find(c => c.url && c.url.endsWith('/api/redeem'));
  assert.equal(redeem.header.Authorization, 'Bearer token-wechat');
  assert.equal(env.storage.has('blueprintUnlocked'), false);
  assert.equal(env.storage.has('blueprintToken'), false);
  assert.equal(env.navigation.at(-1), '/pages/home/home');
});
test('Explicit extra-course redemption does not redirect away just because another course is authorized', async () => {
  const env = environment(); const gate = env.page('gate'); await gate.onLoad({ redeem: '1' });
  assert.equal(env.navigation.length, 0);
  assert.equal(gate.data.signedIn, true);
});
test('Unconfigured production API shows configuration error without a network request', async () => {
  const env = environment({ signedIn: false, env: 'release' });
  await assert.rejects(env.load('utils/api').request('/api/bootstrap', { auth: false }), /尚未配置/);
  assert.equal(env.calls.length, 0);
});
test('Tokens are not sent to arbitrary origins, paths or prior API origins', async () => {
  const env = environment(), api = env.load('utils/api'), session = env.load('utils/session');
  for (const route of ['https://evil.example/api/me', '//evil.example/api/me', '/api/../me', '/api/me#x']) await assert.rejects(api.request(route));
  assert.throws(() => session.headers('http://127.0.0.1:3002.evil.example/api/me'), /其他服务/);
  const saved = env.storage.get('blueprintSessionV2'); saved.origin = 'https://old.example';
  assert.equal(session.current(), null);
  assert.equal(env.calls.length, 0);
});
test('401 revokes the current session rather than accepting cached access', async () => {
  const env = environment({ respond: route => route === '/api/me' ? { statusCode: 401, data: { error: '已过期' } } : null });
  await assert.rejects(env.load('utils/session').me(), /已过期/);
  assert.equal(env.load('utils/session').current(), null);
});
test('Theme directory links use stable chapter IDs, without a mode layer', async () => {
  const env = environment(), learn = env.page('learn'); await learn.onShow();
  learn.selectCourse(tap({ id: 'thinking' }));
  assert.equal(learn.data.current.id, 'thinking');
  learn.openChapter(tap({ id: 'thinking-chapter-2' }));
  assert.equal(env.navigation.at(-1), '/pages/lesson/lesson?course=thinking&chapter=thinking-chapter-2');
  const page = await lesson(env, 'thinking', 'thinking-chapter-2');
  assert.equal(page.data.active, 2); assert.equal(page.data.sections.length, 3); assert.equal(page.data.section, null);
  assert.equal(page.selectMode, undefined); assert.equal(page.changeMode, undefined);
});
test('Every initial body is loaded from the server with a Bearer header', async () => {
  const env = environment();
  for (const course of seed.courses) for (const chapter of course.chapters) {
    const page = await lesson(env, course.id, chapter.id);
    assert.equal(page.data.sections.length, chapter.sections.length);
    assert.deepEqual(clone(page.data.sections.map(s => s.body)), chapter.sections.map(s => s.body));
  }
  for (const call of env.calls.filter(c => c.url && /\/api\/courses\//.test(c.url))) assert.equal(call.header.Authorization, 'Bearer token-user-a');
});
test('Published titles, text, chapter order and arbitrary subsection counts drive the reader', async () => {
  const env = environment();
  env.data.courses[0].chapters.reverse();
  const chapter = env.data.courses[0].chapters.find(c => c.id === 'focus-chapter-0');
  chapter.title = '运营更新标题'; chapter.sections = [{ id: 'new-section', title: '新小节', question: '新问题', body: ['远程正文'], practice: '' }];
  const page = await lesson(env);
  assert.equal(page.data.active, 4); assert.equal(page.data.chapterTitle, '运营更新标题'); assert.equal(page.data.sections.length, 1);
  await page.openSection(tap({ id: 'new-section' }));
  assert.equal(page.data.section.body[0], '远程正文');
});
test('Any subsection opens directly, closing restores its directory, and chapter switching is remote', async () => {
  const env = environment(), page = await lesson(env, 'energy', 'energy-chapter-1');
  await page.openSection(tap({ id: 'energy-chapter-1-exercise' }));
  assert.equal(page.data.section.title, '随堂练习'); assert.equal(env.scrolls.at(-1).selector, '#section-reader');
  page.closeSection(); assert.equal(page.data.section, null); assert.equal(env.scrolls.at(-1).selector, '#section-directory');
  await page.selectLesson(tap({ id: 'energy-chapter-2' }));
  assert.equal(page.data.chapterId, 'energy-chapter-2'); assert.equal(page.data.section, null);
});
test('Reading only the last subsection cannot fabricate the other subsection completions', async () => {
  const env = environment(), page = await lesson(env);
  await page.openSection(tap({ id: 'focus-chapter-0-exercise' })); await page.nextSection();
  assert.equal(page.data.chapterId, 'focus-chapter-0');
  assert.equal(page.data.course.completed.length, 0);
  assert.equal(env.state('user-a').sections.length, 1);
});
test('Completing all current subsections is idempotent and proceeds directly to next chapter', async () => {
  const env = environment(), page = await lesson(env);
  await page.openSection(tap({ id: 'focus-chapter-0-question' }));
  await page.nextSection(); await page.nextSection(); await page.nextSection();
  assert.equal(page.data.chapterId, 'focus-chapter-1'); assert.equal(page.data.section, null);
  assert.equal(env.state('user-a').sections.length, 3);
  await env.load('utils/lesson-sections').complete('focus', 'focus-chapter-0', 'focus-chapter-0-question');
  assert.equal(env.state('user-a').sections.length, 3);
});
test('Revocation and outages never fall back to seed or previously rendered article text', async () => {
  const env = environment(), page = await lesson(env);
  env.data.access = false;
  await page.openSection(tap({ id: 'focus-chapter-0-reading' }));
  assert.equal(page.data.course, null); assert.equal(page.data.section, null); assert.match(page.data.error, /权限/);
  env.data.access = true; await page.retry(); env.data.network = true; await page.retry();
  assert.equal(page.data.course, null); assert.equal(page.data.sections.length, 0); assert.ok(page.data.error);
});
test('A removed stable chapter ID is an explicit error, never remapped by current sort order', async () => {
  const env = environment(), page = await lesson(env, 'focus', '2');
  assert.equal(page.data.course, null); assert.match(page.data.error, /调整|下架/);
});
test('Queues, current course and completion cache are isolated per user', async () => {
  const env = environment(), learning = env.load('utils/learning');
  await learning.record('focus', 'focus-chapter-0', 'focus-chapter-0-reading', true);
  assert.equal(learning.state().sections.length, 1);
  env.data.network = true;
  await assert.rejects(learning.record('focus', 'focus-chapter-0', 'focus-chapter-0-exercise', true), /当前账号/);
  const keyA = env.load('utils/session').userKey('queue'); assert.equal(env.storage.get(keyA).length, 1);
  env.signIn('user-b'); env.data.network = false; await learning.refresh();
  assert.equal(learning.state().sections.length, 0); assert.equal(learning.currentCourse(), undefined); assert.equal(env.storage.get(keyA).length, 1);
  env.signIn(); await learning.refresh(); assert.equal(learning.state().sections.length, 2); assert.equal(env.storage.get(keyA).length, 0);
});
test('A server permission denial is not cached as a completed subsection or queued for bypass', async () => {
  const env = environment({ access: false }), learning = env.load('utils/learning');
  await assert.rejects(learning.record('focus', 'focus-chapter-0', 'focus-chapter-0-reading', true), /权限/);
  assert.equal(learning.state().sections.length, 0); assert.equal(env.storage.get(env.load('utils/session').userKey('queue')).length, 0);
});
test('Legacy mapping is frozen to seed IDs and ignores current published order', () => {
  const old = { focus: { completed: [1, '0', -1, 999] } };
  const reading = { 'focus:0:practice': { completed: [0] }, 'focus:0:reflect': { completed: [0] }, 'focus:0:understand': { completed: [0] } };
  const env = environment({ storage: { blueprintLearning: old, blueprintReading: reading } });
  env.data.courses[0].chapters.reverse();
  const result = env.load('utils/legacy').payload();
  assert.deepEqual(clone(result.chapters), ['focus-chapter-1']);
  assert.deepEqual(clone(result.sections).sort(), ['focus-chapter-0-exercise', 'focus-chapter-0-question', 'focus-chapter-0-reading']);
  assert.equal(env.storage.get('blueprintLearning'), old); assert.equal(env.storage.get('blueprintReading'), reading);
  for (const [courseId, ids] of Object.entries(env.load('utils/legacy').seed)) for (const [index, id] of ids.entries()) assert.equal(seed.courses.find(c => c.id === courseId).chapters.find(c => c.legacyIndex === index).id, id);
});
test('Old chapter completion imports only after explicit confirmation and does not complete subsections', async () => {
  const storage = { blueprintLearning: { focus: { completed: [0] } }, blueprintReading: {} };
  const refused = environment({ storage });
  assert.equal(await refused.load('utils/legacy').offer([{ id: 'focus', accessible: true }]), false);
  assert.equal(refused.calls.length, 0);
  const env = environment({ storage, confirm: true });
  assert.equal(await env.load('utils/legacy').offer([{ id: 'focus', accessible: true }]), true);
  const imported = env.calls.find(c => c.url && c.url.endsWith('/import'));
  assert.equal(imported.header.Authorization, 'Bearer token-user-a'); assert.equal(imported.data.sections.length, 0);
  assert.deepEqual(clone(imported.data.chapters), ['focus-chapter-0']);
  assert.equal(env.state('user-a').sections.length, 0);
  assert.equal(await env.load('utils/legacy').offer([{ id: 'focus', accessible: true }]), false);
});
test('Brand, help, avatar and all three navigation names/icons use published configuration', async () => {
  const env = environment(); env.data.settings.brandName = '新品牌'; env.data.settings.help = ['更新帮助']; env.data.settings.nav[1] = { id: 'learn', label: '新学习', icon: '/api/assets/new-icon' };
  const page = env.page('profile'); await page.onShow(); page.showInfo(tap({ type: 'help' }));
  assert.equal(page.data.settings.brandName, '新品牌'); assert.equal(page.data.info.paragraphs[0], '更新帮助');
  assert.equal(page.data.settings.nav[1].icon, 'http://127.0.0.1:3002/api/assets/new-icon');
  assert.equal(page.data.settings.nav[1].label, '新学习');
});
test('Empty catalog, no access and failed refreshes have explicit state instead of crashing', async () => {
  const env = environment(); env.data.courses = [];
  for (const name of ['home', 'learn', 'profile']) { const page = env.page(name); await page.onShow(); assert.equal(page.data.courses.length, 0); assert.equal(page.data.error, ''); }
  const denied = environment({ access: false }), learn = denied.page('learn'); await learn.onShow();
  assert.equal(learn.data.chapters.length, 0); assert.equal(learn.data.current.accessible, false); learn.start(); assert.match(denied.navigation.at(-1), /gate.*redeem=1/);
});
test('Reader has no modes and registers authenticated materials at course, chapter and subsection scopes', () => {
  const config = require('../miniprogram/pages/lesson/lesson.json');
  assert.equal(config.usingComponents['reading-materials'], '/components/reading-materials/reading-materials');
  const text = fs.readFileSync(path.join(mini, 'pages/lesson/lesson.wxml'), 'utf8');
  assert.doesNotMatch(text, /思维模式|理解模式|实践模式|复盘模式|selectMode|changeMode|mode-card/);
  for (const scope of ['course', 'chapter', 'section']) assert.match(text, new RegExp('scope="' + scope + '"'));
  for (const name of ['home', 'learn', 'profile']) assert.doesNotMatch(fs.readFileSync(path.join(mini, `pages/${name}/${name}.wxml`), 'utf8'), /内容已解锁，选择一门课程开始学习|课程与学习记录[，,]?都在这里|学习记录仅保存在当前设备|课程可以反复学习，不必一次学完/);
});

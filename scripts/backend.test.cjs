'use strict';

// Contract tests only: every app/database/upload lives below its own OS temp directory.
// Run directly with: node --test scripts/backend.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { once } = require('node:events');
const { createApp } = require('../server/app');
const { passwordHash, hash } = require('../server/security');
const seed = require('../server/seed.json');
const sharp = require('sharp');
const catalogModule = require('../server/catalog');
const binary = require('./backend-fixtures.cjs');

const ORIGIN = 'http://127.0.0.1:3002';
const clone = value => structuredClone(value);
const past = () => new Date(Date.now() - 86400000).toISOString();
const future = () => new Date(Date.now() + 86400000).toISOString();
const firstCourse = tree => tree.courses.find(c => c.published && c.chapters.some(ch => ch.sections.length >= 2));
const locationOf = course => ({ courseId: course.id, chapterId: course.chapters[0].id, sectionId: course.chapters[0].sections[0].id });

async function fixture(t, overrides = {}) {
  const dataDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'blueprint-backend-test-')));
  assert(path.isAbsolute(dataDir));
  assert.notEqual(dataDir, path.resolve(__dirname, '../server/data'));
  let app, server;
  const f = { dataDir, origin: overrides.publicOrigin || ORIGIN, password: crypto.randomBytes(24).toString('base64url'), username: 'test-admin', cookie: '', csrf: '' };
  f.stop = async () => {
    if (server) {
      const current = server; server = undefined;
      await new Promise((resolve, reject) => {
        current.close(error => error ? reject(error) : resolve());
        current.closeAllConnections();
      });
    }
    if (app) { const current = app; app = undefined; current.locals.close(); }
  };
  t.after(async () => {
    try { await f.stop(); }
    finally { fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
  });
  f.start = async () => {
    // Override environmental auth/secrets/paths explicitly; never inherit a user's DATA_DIR.
    app = createApp({ dataDir, port: 3002, production: false, devAuth: true, appSecret: '', publicOrigin: ORIGIN, ...overrides });
    f.app = app; f.store = app.locals.store;
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    f.base = 'http://127.0.0.1:' + server.address().port;
  };
  f.request = async (route, options = {}) => {
    const { method = 'GET', json, token, admin = false, headers: extra = {}, body, status = 200 } = options;
    const headers = { ...extra };
    if (options.webCookie) headers.Cookie = options.webCookie;
    if (token) headers.Authorization = 'Bearer ' + token;
    if (admin) { headers.Cookie = f.cookie; if (method !== 'GET') { headers.Origin = f.origin; headers['X-CSRF-Token'] = f.csrf; } }
    Object.assign(headers, extra);
    if (json !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(f.base + route, {
      method, headers, body: json === undefined ? body : JSON.stringify(json), redirect: 'manual', signal: AbortSignal.timeout(15000)
    });
    const bytes = Buffer.from(await response.arrayBuffer());
    const result = response.headers.get('content-type')?.includes('application/json') ? JSON.parse(bytes.toString()) : bytes;
    assert.equal(response.status, status, `${method} ${route}: expected ${status}, received ${response.status}${result?.error ? ' (' + result.error + ')' : ''}`);
    if (status >= 400) assert.equal(typeof result.error, 'string', 'errors use the contract JSON envelope');
    return { body: result, headers: response.headers, bytes };
  };
  f.admin = async (route, options = {}) => (await f.request('/api/admin' + route, { ...options, admin: true })).body;
  f.login = async () => {
    const anon = await f.request('/api/admin/session');
    assert.equal(anon.body.authenticated, false);
    assert.equal(typeof anon.body.csrf, 'string');
    const loginCookie = anon.headers.getSetCookie().find(c => c.startsWith('blueprint_login='));
    assert(loginCookie); assert.match(loginCookie, /HttpOnly/i); assert.match(loginCookie, /SameSite=Strict/i);
    const response = await f.request('/api/admin/session', {
      method: 'POST', json: { username: f.username, password: f.password },
      headers: { Cookie: loginCookie.split(';')[0], Origin: f.origin, 'X-CSRF-Token': anon.body.csrf }
    });
    const cookie = response.headers.getSetCookie().find(c => c.startsWith('blueprint_admin='));
    assert(cookie); assert.match(cookie, /HttpOnly/i); assert.match(cookie, /SameSite=Strict/i); assert.match(cookie, /Path=\/api\/admin/i);
    f.cookie = cookie.split(';')[0]; f.csrf = response.body.csrf;
    assert.notEqual(f.csrf, anon.body.csrf, 'login rotates CSRF token');
    assert.deepEqual(response.body.admin, { id: 'fixture-admin', username: f.username });
    assert(!Object.hasOwn(response.body.admin, 'password'));
    const authed = await f.admin('/session');
    assert.equal(authed.authenticated, true); assert.equal(authed.csrf, f.csrf);
    return { anon, loginCookie, response };
  };
  f.user = async (label = crypto.randomUUID()) => (await f.request('/api/auth/dev', { method: 'POST', json: { deviceId: 'fixture-' + label } })).body;
  f.grant = async (user, options = {}) => (await f.admin(`/users/${user.user.id}/grants`, {
    method: 'POST', status: 201, json: { scope: 'all', courseIds: [], expiresAt: null, reason: 'isolated contract test', ...options }
  })).grant;
  f.batch = async (options = {}) => f.admin('/card-batches', {
    method: 'POST', status: 201, json: { title: 'Fixture batch', count: 1, scope: 'all', courseIds: [], redeemExpiresAt: null, accessDays: null, ...options }
  });
  f.web = async (boardId, user) => {
    if (!user) {
      if (!f.webUser) { f.webUser = await f.user('web-reader'); await f.grant(f.webUser); }
      user = f.webUser;
    }
    const opened = await f.request('/api/boards/' + boardId + '/open', { method: 'POST', token: user.token, json: {} });
    assert.match(opened.body.launchPath, /^\/web-access\/[A-Za-z0-9_-]+$/);
    assert(!opened.body.launchPath.includes(user.token));
    const landing = await f.request(opened.body.launchPath);
    assert.match(landing.bytes.toString(), /web-access-client\.js/);
    assert.equal(landing.headers.getSetCookie().length, 0);
    const exchanged = await f.request('/web-session', { method: 'POST', json: { ticket: opened.body.launchPath.split('/').at(-1) }, headers: { Origin: f.origin } });
    const cookie = exchanged.headers.getSetCookie().find(value => value.startsWith('blueprint_web_'));
    assert(cookie); assert.match(cookie, /HttpOnly/i); assert.match(cookie, /SameSite=Lax/i);
    return cookie.split(';')[0];
  };
  f.upload = async (filename, bytes, options = {}) => {
    const form = new FormData();
    form.append('file', new Blob([bytes], { type: options.mime || 'application/octet-stream' }), filename);
    if (options.title !== undefined) form.append('title', options.title);
    return (await f.request('/api/admin/assets', { admin: true, method: 'POST', body: form, status: options.status || 201 })).body;
  };
  f.material = async (asset, scope, ownerId, options = {}) => (await f.admin('/materials', {
    method: 'POST', status: 201, json: { assetId: asset.id, title: 'Fixture ' + scope, scope, ownerId, published: true, ...options }
  })).material;
  f.tree = () => f.admin('/catalog');
  f.save = tree => f.admin('/catalog', { method: 'PUT', json: tree });
  f.publish = tree => f.admin('/publish', { method: 'POST', json: { version: tree.version } });
  f.me = user => f.request('/api/me', { token: user.token }).then(r => r.body);
  await f.start();
  f.store.run('INSERT INTO admins VALUES(?,?,?,?)', 'fixture-admin', f.username, await passwordHash(f.password), new Date().toISOString());
  await f.login();
  return f;
}

test('course creation: online text, PDF, Word and website uploads create private drafts, associated materials and ordered board entries', async t => {
  const f = await fixture(t);
  const initial = await f.tree(), originalCount = initial.courses.length;
  const create = async (kind, extra = {}) => {
    const tree = await f.tree();
    return f.admin('/course-imports', { method: 'POST', status: 201, json: { version: tree.version, kind, title: 'Fixture ' + kind, categoryId: 'new', boardId: 'new', position: 'first', ...extra } });
  };
  const textCourse = await create('text', { body: '第一段课程正文\n第二段文字', home: false });
  assert.equal(textCourse.catalog.courses[0].id, textCourse.courseId);
  assert.equal(textCourse.catalog.boards[0].id, textCourse.boardId);
  assert.equal(textCourse.catalog.boards[0].home, false);
  assert.deepEqual(textCourse.catalog.courses[0].chapters[0].sections[0].body, ['第一段课程正文', '第二段文字']);
  assert.equal((await f.request('/api/courses')).body.courses.length, originalCount);
  assert.equal((await f.request('/api/bootstrap')).body.boards.some(b => b.id === textCourse.boardId), false);
  for (const [name, data] of [['lesson.pdf', binary.pdf()], ['lesson.docx', binary.docx()]]) {
    const { asset } = await f.upload(name, data);
    const created = await create('document', { assetId: asset.id });
    const material = (await f.admin('/materials')).items.find(m => m.id === created.materialId);
    assert.equal(material.ownerId, created.courseId); assert.equal(material.assetId, asset.id); assert.equal(material.published, true);
    assert.equal((await f.request('/api/materials/' + material.id + '/file', { token: (await f.user()).token, status: 404 })).body.error.length > 0, true);
  }
  const form = new FormData(); form.append('file', new Blob([binary.zip({ 'index.html': '<html><body>互动学习</body></html>', 'app.js': 'document.title="课程"' })]), 'lesson.zip');
  const website = (await f.request('/api/admin/websites', { admin: true, method: 'POST', body: form, status: 201 })).body.website;
  const web = await create('website', { websiteId: website.id });
  assert.equal(web.catalog.boards[0].experience, website.slug);
  await f.publish(web.catalog);
  const user = await f.user(); await f.grant(user);
  const cookie = await f.web(web.boardId, user);
  const page = await f.request(website.basePath, { webCookie: cookie }); assert.match(page.bytes.toString(), /互动学习/);
  const current = await f.tree(); current.boards.reverse(); current.courses.reverse(); current.categories.reverse();
  const ordered = await f.save(current); await f.publish(ordered);
  const front = (await f.request('/api/bootstrap')).body;
  assert.deepEqual(front.boards.map(b => b.id), ordered.boards.filter(b => b.enabled).map(b => b.id));
  assert.deepEqual(front.categories.map(c => c.id), ordered.categories.map(c => c.id));
  assert.equal((await f.admin('/overview')).courses, originalCount + 4);
});

test('course creation: invalid files, missing body, stale versions and invalid references never leave partial course records', async t => {
  const f = await fixture(t), tree = await f.tree();
  const create = body => f.admin('/course-imports', { method: 'POST', status: 400, json: { version: tree.version, kind: 'text', title: 'Fixture', categoryId: 'new', boardId: 'new', ...body } });
  await create({ body: '' }); await create({ body: '课程', categoryId: 'missing' });
  await create({ kind: 'document', assetId: 'missing' }); await create({ kind: 'video', assetId: 'missing' }); await create({ kind: 'website', websiteId: 'missing' });
  await f.admin('/course-imports', { method: 'POST', status: 409, json: { version: -1, kind: 'text', title: 'Fixture', body: '课程' } });
  assert.equal((await f.tree()).courses.length, tree.courses.length); assert.equal((await f.tree()).categories.length, tree.categories.length);
  assert.equal((await f.admin('/materials')).items.length, 0);
});

test('video courses: disk upload, entitlement, playback ranges, revocation and unpublishing stay enforced', async t => {
  const f = await fixture(t);
  const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom'), Buffer.alloc(4096)]);
  async function upload(filename, data, status = 201) {
    const form = new FormData(); form.append('file', new Blob([data]), filename); form.append('title', 'Video fixture');
    return (await f.request('/api/admin/videos', { method: 'POST', admin: true, body: form, status })).body;
  }
  await f.request('/api/admin/videos', { method: 'POST', status: 401 });
  await upload('invalid.mp4', Buffer.from('not a video'), 400); await upload('wrong.exe', mp4, 400);
  assert.equal(fs.readdirSync(path.join(f.dataDir, 'uploads')).some(n => n.startsWith('pending-')), false);
  const { asset } = await upload('lesson.mp4', mp4); assert.equal(asset.kind, 'video');
  const tree = await f.tree();
  const created = await f.admin('/course-imports', { method: 'POST', status: 201, json: { version: tree.version, kind: 'video', title: '视频课程', assetId: asset.id, categoryId: 'new', boardId: 'new' } });
  const user = await f.user(), pathToVideo = '/api/videos/' + created.materialId;
  await f.request(pathToVideo + '/play', { method: 'POST', token: user.token, json: {}, status: 404 });
  await f.publish(created.catalog);
  await f.request(pathToVideo + '/play', { method: 'POST', token: user.token, json: {}, status: 403 });
  const grant = await f.grant(user, { scope: 'boards', boardIds: [created.boardId] });
  const listing = (await f.request('/api/videos?scope=course&ownerId=' + created.courseId, { token: user.token })).body;
  assert.equal(listing.videos[0].id, created.materialId);
  const playback = (await f.request(pathToVideo + '/play', { method: 'POST', token: user.token, json: {} })).body;
  assert(!playback.playbackPath.includes(user.token));
  const range = await f.request(playback.playbackPath, { headers: { Range: 'bytes=0-15' }, status: 206 });
  assert.equal(range.bytes.length, 16); assert.match(range.headers.get('content-type'), /video\/mp4/); assert.match(range.headers.get('content-range'), /bytes 0-15\//);
  await f.admin('/grants/' + grant.id + '/revoke', { method: 'POST', json: { reason: 'Fixture revocation' } });
  await f.request(playback.playbackPath, { status: 403 });
  await f.grant(user);
  const material = (await f.admin('/materials')).items.find(m => m.id === created.materialId);
  await f.admin('/materials/' + material.id, { method: 'PUT', json: { ...material, published: false } });
  await f.request(playback.playbackPath, { status: 404 });
  assert.equal((await f.request('/api/materials?scope=course&ownerId=' + created.courseId, { token: user.token })).body.materials.length, 0);
});

test('boards: draft edits remain private until publish, order and placements survive restart, hidden boards disappear', async t => {
  const f = await fixture(t);
  const before = (await f.request('/api/bootstrap')).body;
  assert.equal(before.boards.length, 17);
  assert(!before.boards.some(b => ['focus-space', 'thinking-space', 'energy-space'].includes(b.id)));
  const tree = await f.tree();
  tree.boards[0].title = '英语进阶空间'; tree.boards[0].home = false;
  tree.boards[0].features[0].title = '我的英语课程';
  tree.boards[1].enabled = false;
  tree.boards.reverse();
  const saved = await f.save(tree);
  assert.equal((await f.request('/api/bootstrap')).body.boards[0].title, before.boards[0].title);
  await f.publish(saved);
  await f.stop(); await f.start(); await f.login();
  const boot = (await f.request('/api/bootstrap')).body;
  assert.equal(boot.boards.length, before.boards.length - 1); assert.equal(boot.boards[0].id, before.boards.at(-1).id);
  const english = boot.boards.find(b => b.id === 'junior-english');
  assert.equal(english.title, '英语进阶空间'); assert.equal(english.home, false); assert.equal(english.learn, true);
  assert.equal(english.features[0].title, '我的英语课程');
  noContent(boot);
});
test('boards: reject unknown targets, invalid features, duplicate IDs and non-image asset references', async t => {
  const f = await fixture(t), original = await f.tree();
  for (const mutate of [
    tree => { tree.boards[0].categoryIds = ['missing']; },
    tree => { tree.boards[0].features = []; },
    tree => { tree.boards[0].features[0].type = 'https://untrusted.example'; },
    tree => { tree.boards[0].features[1].id = tree.boards[0].features[0].id; },
    tree => { tree.boards[0].id = tree.categories[0].id; },
    tree => { tree.boards[0].cover = 'javascript:alert(1)'; },
    tree => { tree.boards[0].experience = 'https://untrusted.example'; }
  ]) {
    const tree = clone(original); mutate(tree);
    await f.admin('/catalog', { method: 'PUT', json: tree, status: 400 });
  }
  assert.equal((await f.tree()).version, original.version);
});
test('English integration readiness is public while admin responses keep their security policy', async t => {
  const f = await fixture(t);
  const result = await f.request('/api/integrations/english');
  assert.equal(typeof result.body.ready, 'boolean'); assert.equal(result.body.basePath, '/english/');
  const admin = await f.request('/admin/'); assert.equal(admin.headers.get('x-frame-options'), 'DENY');
  assert(!admin.headers.get('content-security-policy').includes("'unsafe-inline'"));
  if (result.body.ready) {
    const webCookie = await f.web('junior-english');
    const english = await f.request('/english/', { webCookie });
    assert.match(english.headers.get('content-type'), /text\/html/);
    assert.match(english.bytes.toString(), /初中英语/);
    assert.doesNotMatch(english.bytes.toString(), /英语星空/);
    assert(!english.headers.get('x-frame-options'));
    assert.match(english.headers.get('content-security-policy'), /media-src 'self'/);
    const index = (await f.request('/english/atlas/index.json', { webCookie })).body;
    assert(index.words.length > 200);
    const audio = await f.request('/english/atlas/audio/uk/' + index.words.find(w => w[6] & 2)[0] + '.mp3', { webCookie, headers: { Range: 'bytes=0-63' }, status: 206 });
    assert.equal(audio.bytes.length, 64);
    await f.request('/english/licenses/CONTENT_LICENSE.md', { webCookie });
  }
});
test('boards: uploaded covers are public only after the referencing board is published and enabled', async t => {
  const f = await fixture(t);
  const png = await sharp({ create: { width: 20, height: 20, channels: 3, background: '#416bf0' } }).png().toBuffer();
  const asset = (await f.upload('board-cover.png', png)).asset;
  const tree = await f.tree(); tree.boards[0].cover = asset.url;
  const saved = await f.save(tree);
  await f.request(asset.url, { status: 404 });
  await f.publish(saved); await f.request(asset.url);
  const hidden = await f.tree(); hidden.boards[0].enabled = false;
  await f.publish(await f.save(hidden));
  await f.request(asset.url, { status: 404 });
});
test('boards: upgrading old snapshots preserves unpublished text, progress, accounts, and runs only once', async t => {
  const f = await fixture(t), row = f.store.get('SELECT * FROM catalog WHERE id=1');
  const published = JSON.parse(row.published), draft = JSON.parse(row.draft);
  delete published.boards; delete draft.boards;
  draft.courses[0].title = '保留未发布的课程标题';
  f.store.run('UPDATE catalog SET draft=?,published=? WHERE id=1', JSON.stringify(draft), JSON.stringify(published));
  const admins = f.store.get('SELECT count(*) AS n FROM admins').n;
  catalogModule.initCatalog(f.store);
  assert.equal(catalogModule.draft(f.store).courses[0].title, '保留未发布的课程标题');
  assert.notEqual(catalogModule.published(f.store).courses[0].title, '保留未发布的课程标题');
  assert.equal(f.store.get('SELECT count(*) AS n FROM admins').n, admins);
  const version = catalogModule.draft(f.store).version;
  catalogModule.initCatalog(f.store);
  assert.equal(catalogModule.draft(f.store).version, version);
  assert.equal(catalogModule.published(f.store).courses.filter(c => c.id === 'english-foundations').length, 1);
});
test('math: static pages and data use original CSS, remove About and keep admin policy isolated', async t => {
  const f = await fixture(t), result = await f.request('/api/integrations/math');
  assert.equal(typeof result.body.ready, 'boolean'); assert.equal(result.body.basePath, '/math/');
  const board = (await f.request('/api/bootstrap')).body.boards.find(b => b.id === 'math-taxonomy');
  assert.equal(board.experience, 'cn-math-taxonomy'); assert.equal(board.home, true); assert.equal(board.learn, true);
  if (result.body.ready) {
    const webCookie = await f.web('math-taxonomy');
    for (const route of ['/math/', '/math/explore/', '/math/diagnose/', '/math/children/', '/math/children/history.html']) {
      const res = await f.request(route, { webCookie }); assert.match(res.headers.get('content-type'), /text\/html/);
      assert.doesNotMatch(res.bytes.toString(), />\s*关于\s*<\/a>/);
      assert(!res.headers.get('x-frame-options'));
    }
    const css = await f.request('/math/assets/site.css', { webCookie });
    assert.equal(css.bytes.toString(), fs.readFileSync(path.join(__dirname, '../integrations/cn-math-taxonomy/assets/site.css'), 'utf8'));
    for (const file of ['topics', 'questions', 'dependencies']) assert(Array.isArray((await f.request('/math/data/' + file + '.json', { webCookie })).body));
    await f.request('/math/assets/vendor/cytoscape.min.js', { webCookie }); await f.request('/math/LICENSE', { webCookie }); await f.request('/math/NOTICE.md', { webCookie });
    await f.request('/math/missing.html', { webCookie, status: 404 });
  }
  const admin = await f.request('/admin/'); assert.equal(admin.headers.get('x-frame-options'), 'DENY');
  assert(!admin.headers.get('content-security-policy').includes("'unsafe-inline'"));
});
test('math: one-time migration preserves draft changes and respects later deletion or disabling', async t => {
  const f = await fixture(t), row = f.store.get('SELECT * FROM catalog WHERE id=1');
  const draft = JSON.parse(row.draft), published = JSON.parse(row.published);
  draft.boards = draft.boards.filter(b => b.id !== 'math-taxonomy'); published.boards = published.boards.filter(b => b.id !== 'math-taxonomy');
  draft.boards[0].title = '保留未发布板块名称';
  f.store.run('DELETE FROM migrations WHERE version=2');
  f.store.run('UPDATE catalog SET draft=?,published=? WHERE id=1', JSON.stringify(draft), JSON.stringify(published));
  catalogModule.initCatalog(f.store);
  assert.equal(catalogModule.draft(f.store).boards[0].title, '保留未发布板块名称');
  assert.notEqual(catalogModule.published(f.store).boards[0].title, '保留未发布板块名称');
  assert.equal(catalogModule.published(f.store).boards.filter(b => b.id === 'math-taxonomy').length, 1);
  let tree = await f.tree(); tree.boards.find(b => b.id === 'math-taxonomy').enabled = false; await f.publish(await f.save(tree));
  await f.stop(); await f.start(); await f.login();
  assert(!(await f.request('/api/bootstrap')).body.boards.some(b => b.id === 'math-taxonomy'));
  tree = await f.tree(); tree.boards = tree.boards.filter(b => b.id !== 'math-taxonomy'); await f.publish(await f.save(tree));
  await f.stop(); await f.start();
  assert(!catalogModule.published(f.store).boards.some(b => b.id === 'math-taxonomy'));
});
test('junior math: local assets use the new name, white theme and isolated security policy', async t => {
  const f = await fixture(t), ready = (await f.request('/api/integrations/junior-math')).body;
  assert.equal(typeof ready.ready, 'boolean'); assert.equal(ready.basePath, '/junior-math/');
  const boards = (await f.request('/api/bootstrap')).body.boards;
  assert.equal(boards.find(b => b.id === 'junior-math').experience, 'tainai-junior-math');
  assert(boards.some(b => b.id === 'math-taxonomy'));
  if (ready.ready) {
    const webCookie = await f.web('junior-math');
    const response = await f.request('/junior-math/', { webCookie }), html = response.bytes.toString();
    assert.match(html, /<title>初中数学｜零基础初中数学课程<\/title>/);
    assert.doesNotMatch(html, /小包子学数学/); assert(!response.headers.get('x-frame-options'));
    const js = html.match(/src="([^"]+\.js)"/)[1], css = html.match(/href="([^"]+\.css)"/)[1];
    await f.request(js, { webCookie }); const style = (await f.request(css, { webCookie })).bytes.toString();
    assert.match(style, /--paper:\s*#fff(?:fff)?\b/); assert.match(style, /background:\s*#fff(?:fff)?\b/);
    await f.request('/junior-math/NOTICE.md', { webCookie }); await f.request('/junior-math/not-found', { webCookie, status: 404 });
  }
  const admin = await f.request('/admin/'); assert.equal(admin.headers.get('x-frame-options'), 'DENY');
});
test('junior math: migration preserves drafts and does not recreate a deleted board', async t => {
  const f = await fixture(t), row = f.store.get('SELECT * FROM catalog WHERE id=1');
  const draft = JSON.parse(row.draft), published = JSON.parse(row.published);
  draft.boards = draft.boards.filter(b => b.id !== 'junior-math'); published.boards = published.boards.filter(b => b.id !== 'junior-math');
  draft.boards[0].title = '保留原有草稿修改';
  f.store.run('DELETE FROM migrations WHERE version=3');
  f.store.run('UPDATE catalog SET draft=?,published=? WHERE id=1', JSON.stringify(draft), JSON.stringify(published));
  catalogModule.initCatalog(f.store);
  assert.equal(catalogModule.draft(f.store).boards[0].title, '保留原有草稿修改');
  assert.notEqual(catalogModule.published(f.store).boards[0].title, '保留原有草稿修改');
  assert.equal(catalogModule.published(f.store).boards.filter(b => b.id === 'junior-math').length, 1);
  const tree = await f.tree(); tree.boards = tree.boards.filter(b => b.id !== 'junior-math'); await f.publish(await f.save(tree));
  await f.stop(); await f.start(); assert(!catalogModule.published(f.store).boards.some(b => b.id === 'junior-math'));
});
test('taxonomy: title upgrade changes both snapshots once and preserves other draft fields', async t => {
  const f = await fixture(t), row = f.store.get('SELECT * FROM catalog WHERE id=1');
  const draft = JSON.parse(row.draft), published = JSON.parse(row.published);
  draft.boards.find(b => b.id === 'math-taxonomy').title = '数学学习';
  draft.boards.find(b => b.id === 'math-taxonomy').subtitle = '保留未发布副标题';
  published.boards.find(b => b.id === 'math-taxonomy').title = '数学学习';
  f.store.run('DELETE FROM migrations WHERE version=4');
  f.store.run('UPDATE catalog SET draft=?,published=? WHERE id=1', JSON.stringify(draft), JSON.stringify(published));
  catalogModule.initCatalog(f.store);
  assert.equal(catalogModule.draft(f.store).boards.find(b => b.id === 'math-taxonomy').title, '中小学高中知识图谱');
  assert.equal(catalogModule.published(f.store).boards.find(b => b.id === 'math-taxonomy').title, '中小学高中知识图谱');
  assert.equal(catalogModule.draft(f.store).boards.find(b => b.id === 'math-taxonomy').subtitle, '保留未发布副标题');
  const tree = await f.tree(); tree.boards.find(b => b.id === 'math-taxonomy').title = '后台后续修改';
  await f.publish(await f.save(tree)); await f.stop(); await f.start();
  assert.equal(catalogModule.published(f.store).boards.find(b => b.id === 'math-taxonomy').title, '后台后续修改');
});

function noContent(value) {
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    assert(!['chapters', 'sections', 'body', 'question', 'practice', 'legacyMap'].includes(key), `public metadata leaked ${key}`);
    noContent(item);
  }
}

test('modules: all eleven named boards publish, retain edits on migration and respect later removal', async t => {
  const f = await fixture(t), modules = require('../miniprogram/utils/integrations').modules;
  const boot = (await f.request('/api/bootstrap')).body;
  for (const item of modules) {
    const board = boot.boards.find(b => b.experience === item.slug);
    assert.equal(board.title, item.title); assert.equal(board.enabled, true);
  }
  const row = f.store.get('SELECT * FROM catalog WHERE id=1');
  const draft = JSON.parse(row.draft), published = JSON.parse(row.published);
  draft.boards[0].subtitle = '保留未发布的副标题';
  for (const tree of [draft, published]) tree.boards = tree.boards.filter(b => !modules.some(m => m.slug === b.experience));
  f.store.run('UPDATE catalog SET draft=?,published=? WHERE id=1', JSON.stringify(draft), JSON.stringify(published));
  f.store.run('DELETE FROM migrations WHERE version=5');
  catalogModule.initCatalog(f.store);
  assert.equal(catalogModule.draft(f.store).boards[0].subtitle, '保留未发布的副标题');
  assert.notEqual(catalogModule.published(f.store).boards[0].subtitle, '保留未发布的副标题');
  assert.equal(catalogModule.published(f.store).boards.length, 17);
  const tree = await f.tree();
  tree.boards = tree.boards.filter(b => b.experience !== modules[0].slug);
  tree.boards.find(b => b.experience === modules[1].slug).enabled = false;
  await f.publish(await f.save(tree));
  await f.stop(); await f.start();
  const after = (await f.request('/api/bootstrap')).body.boards;
  assert(!after.some(b => [modules[0].slug, modules[1].slug].includes(b.experience)));
  assert(!catalogModule.draft(f.store).boards.some(b => b.experience === modules[0].slug));
});

test('supplied courses: individual redemption protects each board and all-access includes the new set', async t => {
  const f=await fixture(t),slugs=['geometry-between','geo-bio-exam','math-between-grade7'];
  const all=await f.user('supplied-all');await f.grant(all);
  for(const slug of slugs){
    const boardId='module-'+slug,user=await f.user('only-'+slug),base='/modules/'+slug+'/';
    await f.request('/api/boards/'+boardId+'/open',{method:'POST',token:user.token,json:{},status:403});
    const batch=await f.batch({scope:'boards',boardIds:[boardId]});
    await f.request('/api/redeem',{method:'POST',token:user.token,json:{code:batch.codes[0]}});
    const own=(await f.request('/api/bootstrap',{token:user.token})).body.boards.filter(board=>board.accessible);
    assert.deepEqual(own.map(board=>board.id),[boardId]);
    const cookie=await f.web(boardId,user);
    const originalPage=await f.request(base,{webCookie:cookie});
    assert.equal(originalPage.bytes.toString(),fs.readFileSync(path.join(__dirname,'../integrations',slug,'web/index.html'),'utf8'),'supplied UI is delivered unchanged');
    await f.request(base+'app.js',{webCookie:cookie});
    await f.request(base+'styles.css',{webCookie:cookie});
    await f.request(base+'xinbotu-theme.css',{webCookie:cookie,status:404});
    await f.request(base+'integration.css',{webCookie:cookie,status:404});
    await f.request(base+'server.js',{webCookie:cookie,status:404});
    for(const other of slugs.filter(other=>other!==slug)){
      await f.request('/api/boards/module-'+other+'/open',{method:'POST',token:user.token,json:{},status:403});
      await f.request('/modules/'+other+'/app.js',{webCookie:cookie,status:401});
    }
    await f.request(base+'app.js',{status:401});
    await f.web(boardId,all);
  }
});

test('modules: readiness and static paths are allowlisted and keep the admin policy isolated', async t => {
  const f = await fixture(t), modules = require('../miniprogram/utils/integrations').modules;
  const list = (await f.request('/api/integrations/modules')).body.modules;
  assert.equal(list.length, 14);
  for (const item of modules) {
    const status = (await f.request('/api/integrations/modules/' + item.slug)).body;
    assert.equal(status.basePath, '/modules/' + item.slug + '/');
    assert.equal(typeof status.ready, 'boolean');
    if (status.ready) {
      const webCookie = await f.web('module-' + item.slug);
      const page = await f.request(status.basePath, { webCookie });
      assert.match(page.headers.get('content-type'), /text\/html/);
      assert(page.bytes.toString().replace(/\s/g,'').includes(item.title.replace(/\s/g,'')), item.slug + ' has the requested title');
      assert(!page.headers.get('x-frame-options'));
      await f.request(status.basePath + 'missing-resource.js', { webCookie, status: 404 });
    } else await f.request(status.basePath, { status: 401 });
  }
  await f.request('/api/integrations/modules/untrusted', { status: 404 });
  const admin = await f.request('/admin/');
  assert.equal(admin.headers.get('x-frame-options'), 'DENY');
  assert(!admin.headers.get('content-security-policy').includes("'unsafe-inline'"));
});

test('board access: anonymous and unredeemed users cannot open or directly read any learning website', async t => {
  const f = await fixture(t), user = await f.user('unredeemed');
  const boards = (await f.request('/api/bootstrap')).body.boards;
  assert(boards.every(b => b.accessible === false));
  for (const board of boards) {
    await f.request('/api/boards/' + board.id + '/open', { method: 'POST', json: {}, status: 401 });
    await f.request('/api/boards/' + board.id + '/open', { method: 'POST', token: user.token, json: {}, status: 403 });
    const base = require('../server/web-access').webPath(board.experience);
    if (base) {
      await f.request(base, { status: 401 });
      await f.request(base + 'catalog.json', { token: user.token, status: 401 });
      await f.request(base + '?token=' + user.token, { status: 401 });
    }
  }
  assert((await f.request('/api/bootstrap', { token: user.token })).body.boards.every(b => b.accessible === false));
});

test('board cards: one-board redemption unlocks only its board, while an all card unlocks every board and course', async t => {
  const f = await fixture(t), user = await f.user('single-board'), all = await f.user('all-boards');
  const tree = await f.tree(), board = tree.boards.find(b => b.id === 'module-adhd-training-platform');
  const batch = await f.batch({ scope: 'boards', boardIds: [board.id], accessDays: 2 });
  assert.deepEqual(batch.batch.boardIds, [board.id]); assert.deepEqual(batch.batch.courseIds, []);
  const redeemed = (await f.request('/api/redeem', { method: 'POST', token: user.token, json: { code: batch.codes[0] } })).body;
  assert.equal(redeemed.grants[0].scope, 'boards'); assert.deepEqual(redeemed.grants[0].boardIds, [board.id]);
  assert(Math.abs(Date.parse(redeemed.grants[0].expiresAt) - Date.now() - 2 * 86400000) < 5000);
  const boot = (await f.request('/api/bootstrap', { token: user.token })).body;
  assert.deepEqual(boot.boards.filter(b => b.accessible).map(b => b.id), [board.id]);
  await f.request('/api/boards/junior-math/open', { method: 'POST', token: user.token, json: {}, status: 403 });
  const allBatch = await f.batch();
  await f.request('/api/redeem', { method: 'POST', token: all.token, json: { code: allBatch.codes[0] } });
  assert((await f.request('/api/bootstrap', { token: all.token })).body.boards.every(b => b.accessible));
  assert((await f.request('/api/courses', { token: all.token })).body.courses.every(c => c.accessible));
  await f.request('/api/courses/' + firstCourse(tree).id, { token: all.token });
  for (const candidate of tree.boards.filter(b => b.enabled)) {
    const base = require('../server/web-access').webPath(candidate.experience);
    if (base) {
      const ready = candidate.experience === 'english-starry-sky' ? require('../server/english-web').status() : candidate.experience === 'cn-math-taxonomy' ? require('../server/math-web').status() : candidate.experience === 'tainai-junior-math' ? require('../server/junior-math-web').status() : require('../server/modules-web').status(candidate.experience);
      if (ready.ready) { const webCookie = await f.web(candidate.id, all); await f.request(base, { webCookie }); }
    } else assert.equal((await f.request('/api/boards/' + candidate.id + '/open', { method: 'POST', token: all.token, json: {} })).body.ok, true);
  }
});

test('native board grants: associated course bodies and attached materials recheck current board entitlement', async t => {
  const f = await fixture(t), user = await f.user('native-board'), tree = await f.tree();
  const linkedCourse = firstCourse(tree);
  const board = { ...clone(tree.boards[0]), id: 'fixture-native-board', experience: 'courses', title: '原生课程权限回归', categoryIds: [linkedCourse.categoryId], featured: false };
  tree.boards.push(board); await f.publish(await f.save(tree));
  const course = tree.courses.find(c => c.published && board.categoryIds.includes(c.categoryId));
  const unrelated = tree.courses.find(c => c.published && !board.categoryIds.includes(c.categoryId));
  const grant = await f.grant(user, { scope: 'boards', boardIds: [board.id] });
  assert.equal((await f.request('/api/boards/' + board.id + '/open', { method: 'POST', token: user.token, json: {} })).body.ok, true);
  await f.request('/api/courses/' + course.id, { token: user.token });
  await f.request('/api/courses/' + unrelated.id, { token: user.token, status: 403 });
  const bytes = binary.pdf(), asset = (await f.upload('board-study.pdf', bytes)).asset;
  const material = await f.material(asset, 'course', course.id), route = '/api/materials/' + material.id + '/file';
  assert.deepEqual((await f.request(route, { token: user.token })).bytes, bytes);
  await f.admin('/grants/' + grant.id + '/revoke', { method: 'POST', json: { reason: 'board access revoked' } });
  await f.request('/api/courses/' + course.id, { token: user.token, status: 403 });
  await f.request(route, { token: user.token, status: 403 });
});

test('legacy course grants: existing course cards retain their associated board access without unlocking unrelated modules', async t => {
  const f = await fixture(t), user = await f.user('legacy-course-board'), tree = await f.tree();
  const board = tree.boards.find(b => b.id === 'junior-english');
  const course = tree.courses.find(c => c.published && board.categoryIds.includes(c.categoryId));
  assert(board);
  const batch = await f.batch({ scope: 'courses', courseIds: [course.id] });
  await f.request('/api/redeem', { method: 'POST', token: user.token, json: { code: batch.codes[0] } });
  const boot = (await f.request('/api/bootstrap', { token: user.token })).body;
  assert.equal(boot.boards.find(b => b.id === board.id).accessible, true);
  assert.equal(boot.boards.find(b => b.id === 'module-adhd-training-platform').accessible, false);
  await f.request('/api/courses/' + course.id, { token: user.token });
  await f.request('/api/boards/module-adhd-training-platform/open', { method: 'POST', token: user.token, json: {}, status: 403 });
  const webPath = require('../server/web-access').webPath(board.experience);
  if (!webPath) assert.equal((await f.request('/api/boards/' + board.id + '/open', { method: 'POST', token: user.token, json: {} })).body.ok, true);
});

test('web launch: tickets are single-use and expiring, cookies are path-scoped and cannot unlock another module', async t => {
  const f = await fixture(t), user = await f.user('web-ticket'), slug = 'adhd-training-platform';
  if (!require('../server/modules-web').status(slug).ready) return t.skip('build modules before browser asset contract checks');
  const grant = await f.grant(user, { scope: 'boards', boardIds: ['module-' + slug] });
  const route = '/api/boards/module-' + slug + '/open';
  const opened = (await f.request(route, { method: 'POST', token: user.token, json: {} })).body;
  assert(!opened.launchPath.includes(user.token));
  for (const ua of ['desktop preflight', 'mobile webview']) {
    const landing = await f.request(opened.launchPath, { headers: { 'User-Agent': ua } });
    assert.match(landing.bytes.toString(), /web-access-client\.js/);
    assert.equal(landing.headers.getSetCookie().length, 0, 'preflight GET cannot consume the ticket or set a cookie');
  }
  const ticket = opened.launchPath.split('/').at(-1);
  await f.request('/web-session', { method: 'POST', json: { ticket }, status: 403 });
  await f.request('/web-session', { method: 'POST', json: { ticket }, headers: { Origin: 'https://hostile.example' }, status: 403 });
  await f.request('/web-session', { method: 'POST', json: { ticket }, headers: { Origin: f.origin, 'Sec-Fetch-Site': 'cross-site' }, status: 403 });
  const exchange = await f.request('/web-session', { method: 'POST', json: { ticket }, headers: { Origin: f.origin } }), cookies = exchange.headers.getSetCookie();
  assert.equal(exchange.body.destination, '/modules/adhd-training-platform/');
  assert.equal(exchange.headers.get('cache-control'), 'no-store');
  const cookie = cookies.find(c => c.startsWith('blueprint_web_'));
  assert.match(cookie, /HttpOnly/i); assert.match(cookie, /SameSite=Lax/i); assert.match(cookie, /Path=\/modules\/adhd-training-platform(?:;|$)/);
  const webCookie = cookie.split(';')[0];
  await f.request('/web-session', { method: 'POST', json: { ticket }, headers: { Origin: f.origin }, status: 401 });
  await f.request(opened.launchPath); // Restoration shell does not grant access on its own.
  const resumeRoute = opened.launchPath + '/resume';
  await f.request(resumeRoute, { method: 'POST', headers: { Origin: f.origin }, status: 401 });
  const resumeCookie = cookies.find(c => c.startsWith('blueprint_resume_'));
  assert.match(resumeCookie, /HttpOnly/i); assert.match(resumeCookie, /Path=\/web-access(?:;|$)/);
  await f.request(resumeRoute, { method: 'POST', webCookie: resumeCookie.split(';')[0], headers: { Origin: 'https://hostile.example' }, status: 403 });
  const resumed = await f.request(resumeRoute, { method: 'POST', webCookie: resumeCookie.split(';')[0], headers: { Origin: f.origin } });
  assert.equal(resumed.body.destination, exchange.body.destination);
  assert(resumed.headers.getSetCookie().some(c => c.startsWith('blueprint_web_')));
  const other = await f.user('other-web-ticket'); await f.grant(other, { scope: 'boards', boardIds: ['module-' + slug] });
  const otherLaunch = (await f.request(route, { method: 'POST', token: other.token, json: {} })).body;
  const otherExchange = await f.request('/web-session', { method: 'POST', json: { ticket: otherLaunch.launchPath.split('/').at(-1) }, headers: { Origin: f.origin } });
  const otherCookie = otherExchange.headers.getSetCookie().find(c => c.startsWith('blueprint_resume_')).split(';')[0];
  await f.request(resumeRoute, { method: 'POST', webCookie: otherCookie, headers: { Origin: f.origin }, status: 401 });
  const page = await f.request('/modules/' + slug + '/', { webCookie });
  assert.equal(page.headers.get('cache-control'), 'no-store');
  await f.request('/modules/nihaixia-app/', { webCookie, status: 401 });
  await f.admin('/grants/' + grant.id + '/revoke', { method: 'POST', json: { reason: 'restored pages must recheck redemption' } });
  await f.request(resumeRoute, { method: 'POST', webCookie: resumeCookie.split(';')[0], headers: { Origin: f.origin }, status: 403 });
  f.store.run('DELETE FROM user_sessions WHERE hash=?', hash(user.token));
  await f.request(resumeRoute, { method: 'POST', webCookie: resumeCookie.split(';')[0], headers: { Origin: f.origin }, status: 401 });
  const freshUser = await f.user('expiring-web-ticket'); await f.grant(freshUser, { scope: 'boards', boardIds: ['module-' + slug] });
  const expired = (await f.request(route, { method: 'POST', token: freshUser.token, json: {} })).body;
  f.store.run('UPDATE web_sessions SET expires_at=? WHERE hash=?', past(), hash(expired.launchPath.split('/').at(-1)));
  await f.request(expired.launchPath, { status: 401 });
  await f.request('/web-session', { method: 'POST', json: { ticket: expired.launchPath.split('/').at(-1) }, headers: { Origin: f.origin }, status: 401 });
});

test('LAN web launch: explicitly allowed development origin exchanges tickets while unknown origins stay blocked', async t => {
  const lanOrigin = 'http://10.12.195.41:3002';
  const f = await fixture(t, { webOrigins: [lanOrigin] }), user = await f.user('lan-web-ticket');
  await f.grant(user);
  const opened = (await f.request('/api/boards/module-adhd-training-platform/open', { method: 'POST', token: user.token, json: {} })).body;
  const ticket = opened.launchPath.split('/').at(-1);
  await f.request('/web-session', { method: 'POST', json: { ticket }, headers: { Origin: 'http://10.12.195.42:3002' }, status: 403 });
  const result = await f.request('/web-session', { method: 'POST', json: { ticket }, headers: { Origin: lanOrigin } });
  assert.equal(result.body.destination, '/modules/adhd-training-platform/');
  assert(result.headers.getSetCookie().some(cookie => /HttpOnly/i.test(cookie)));
  await f.request('/web-session', { method: 'POST', json: { ticket }, headers: { Origin: lanOrigin }, status: 401 });
});

test('web resources: revocation, grant expiration, logout, account disable and session expiration invalidate existing cookies', async t => {
  const f = await fixture(t), slug = 'adhd-training-platform', boardId = 'module-' + slug, base = '/modules/' + slug + '/';
  if (!require('../server/modules-web').status(slug).ready) return t.skip('build modules before browser asset contract checks');
  for (const condition of ['revoke', 'grant-expiry', 'logout', 'disable', 'session-expiry', 'cookie-expiry']) {
    const user = await f.user('web-' + condition), grant = await f.grant(user, { scope: 'boards', boardIds: [boardId] });
    const webCookie = await f.web(boardId, user); await f.request(base + 'app.js', { webCookie });
    if (condition === 'revoke') await f.admin('/grants/' + grant.id + '/revoke', { method: 'POST', json: { reason: 'recheck every resource' } });
    if (condition === 'grant-expiry') f.store.run('UPDATE grants SET expires_at=? WHERE id=?', past(), grant.id);
    if (condition === 'logout') await f.request('/api/auth/logout', { method: 'POST', token: user.token, json: {} });
    if (condition === 'disable') await f.admin('/users/' + user.user.id, { method: 'PATCH', json: { status: 'disabled' } });
    if (condition === 'session-expiry') f.store.run('UPDATE user_sessions SET expires_at=? WHERE hash=?', past(), hash(user.token));
    if (condition === 'cookie-expiry') f.store.run('UPDATE web_sessions SET expires_at=? WHERE hash=?', past(), hash(webCookie.split('=')[1]));
    const status = ['revoke', 'grant-expiry'].includes(condition) ? 403 : 401;
    await f.request(base, { webCookie, status });
    await f.request(base + 'app.js', { webCookie, status });
    await f.request(base + 'style.css', { webCookie, status });
  }
});

test('web resources: board disabling, removal and experience changes block already-issued cookies immediately', async t => {
  const f = await fixture(t), slug = 'adhd-training-platform', boardId = 'module-' + slug, base = '/modules/' + slug + '/';
  if (!require('../server/modules-web').status(slug).ready) return t.skip('build modules before browser asset contract checks');
  const user = await f.user('web-board-change'); await f.grant(user);
  for (const condition of ['disable', 'experience', 'remove']) {
    let tree = await f.tree();
    if (!tree.boards.some(b => b.id === boardId)) tree.boards.push(require('../miniprogram/utils/board-defaults').moduleBoards().find(b => b.id === boardId));
    Object.assign(tree.boards.find(b => b.id === boardId), { enabled: true, experience: slug }); await f.publish(await f.save(tree));
    const webCookie = await f.web(boardId, user); await f.request(base + 'style.css', { webCookie });
    tree = await f.tree();
    if (condition === 'disable') tree.boards.find(b => b.id === boardId).enabled = false;
    if (condition === 'experience') tree.boards.find(b => b.id === boardId).experience = 'nihaixia-app';
    if (condition === 'remove') tree.boards = tree.boards.filter(b => b.id !== boardId);
    await f.publish(await f.save(tree));
    await f.request(base + 'style.css', { webCookie, status: 403 });
  }
});
function assertNoSecrets(value, secrets) {
  const serialized = Buffer.isBuffer(value) ? value.toString('latin1') : JSON.stringify(value);
  for (const secret of secrets) if (secret) assert(!serialized.includes(secret), 'a plaintext credential/token/card code leaked');
}

// Core business/security tests come first so an abbreviated run remains useful.
test('admin: anonymous CSRF cookie -> login -> authenticated CSRF; hashes at rest', async t => {
  const f = await fixture(t);
  await f.request('/api/admin/catalog', { status: 401 });
  await f.request('/api/admin/session', { method: 'POST', json: { username: f.username, password: f.password }, status: 403 });
  const row = f.store.get('SELECT * FROM admin_sessions');
  assert.equal(row.hash, hash(f.cookie.split('=')[1]));
  assert.notEqual(row.hash, f.cookie.split('=')[1]);
  assert.match(f.store.get('SELECT password FROM admins').password, /^scrypt\$/);
});

test('admin: missing/wrong CSRF, hostile Origin and cross-site writes are rejected without mutation', async t => {
  const f = await fixture(t), tree = await f.tree();
  for (const headers of [
    { 'X-CSRF-Token': '' }, { 'X-CSRF-Token': 'wrong' }, { Origin: 'https://attacker.invalid' }, { 'Sec-Fetch-Site': 'cross-site' }
  ]) await f.request('/api/admin/catalog', { admin: true, method: 'PUT', json: tree, headers, status: 403 });
  assert.deepEqual(await f.tree(), tree);
  await f.admin('/session', { method: 'DELETE' });
  await f.request('/api/admin/catalog', { admin: true, status: 401 });
});

test('admin: login Origin/CSRF checks and password change revoke all older admin sessions', async t => {
  const f = await fixture(t), oldCookie = f.cookie;
  const anon = await f.request('/api/admin/session');
  const cookie = anon.headers.getSetCookie().find(c => c.startsWith('blueprint_login=')).split(';')[0];
  for (const headers of [
    { Cookie: cookie, Origin: 'https://attacker.invalid', 'X-CSRF-Token': anon.body.csrf },
    { Cookie: cookie, Origin: ORIGIN, 'X-CSRF-Token': 'wrong' }
  ]) await f.request('/api/admin/session', { method: 'POST', headers, json: { username: f.username, password: f.password }, status: 403 });
  await f.login();
  const password = crypto.randomBytes(24).toString('base64url');
  await f.admin('/password', { method: 'POST', json: { currentPassword: f.password, password } });
  assert.equal(f.store.get('SELECT count(*) AS n FROM admin_sessions').n, 0);
  await f.request('/api/admin/catalog', { headers: { Cookie: oldCookie }, status: 401 });
  await f.request('/api/admin/catalog', { admin: true, status: 401 });
  f.password = password;
  await f.login();
});

test('public metadata: anonymous and authenticated listings never include chapter bodies', async t => {
  const f = await fixture(t), user = await f.user();
  const bootstrap = (await f.request('/api/bootstrap')).body;
  assert.deepEqual(Object.keys(bootstrap).sort(), ['boards', 'categories', 'settings', 'testLoginEnabled', 'version']); noContent(bootstrap);
  for (const options of [{}, { token: user.token }]) {
    const result = (await f.request('/api/courses', options)).body;
    noContent(result); assert(result.courses.length > 0);
    assert(result.courses.every(c => c.accessible === false && Number.isInteger(c.lessons)));
  }
  const course = firstCourse(await f.tree());
  await f.request('/api/courses/' + course.id, { status: 401 });
  await f.request('/api/courses/' + course.id, { token: user.token, status: 403 });
});

test('catalog: draft isolated from published tree; stale save/publish 409 and atomic publish', async t => {
  const f = await fixture(t), before = await f.admin('/published'), original = await f.tree();
  const input = clone(original); input.courses[0].title = 'Draft-only fixture title';
  input.courses[0].chapters[0].sections[0].body = ['PRIVATE-DRAFT-' + crypto.randomUUID()];
  const draft = await f.save(input);
  assert.equal(draft.version, original.version + 1);
  assert.deepEqual(await f.admin('/published'), before);
  assert(!JSON.stringify((await f.request('/api/courses')).body).includes(input.courses[0].title));
  await f.admin('/catalog', { method: 'PUT', json: original, status: 409 });
  await f.admin('/publish', { method: 'POST', json: { version: original.version }, status: 409 });
  assert.deepEqual(await f.tree(), draft); assert.deepEqual(await f.admin('/published'), before);
  const published = await f.publish(draft);
  assert.equal(typeof published.publishedAt, 'string'); assert(Number.isFinite(Date.parse(published.publishedAt)));
  const after = await f.admin('/published');
  assert.equal(after.version, published.version); assert.deepEqual(after.courses, draft.courses);
  assert.deepEqual((await f.request('/api/bootstrap')).body.version, published.version);
  const user = await f.user(); await f.grant(user);
  const detail = (await f.request('/api/courses/' + input.courses[0].id, { token: user.token })).body;
  assert.equal(detail.course.chapters[0].sections[0].body[0], input.courses[0].chapters[0].sections[0].body[0]);
});

test('catalog: duplicate IDs across entity types and moving published sections/chapters fail atomically', async t => {
  const f = await fixture(t), original = await f.tree();
  const cases = [];
  let tree = clone(original); tree.courses[0].id = tree.categories[0].id; cases.push(tree);
  tree = clone(original); tree.courses[0].chapters[0].sections[1].id = tree.courses[0].chapters[0].sections[0].id; cases.push(tree);
  tree = clone(original); tree.courses[0].chapters[1].sections.push(tree.courses[0].chapters[0].sections.shift()); cases.push(tree);
  tree = clone(original); tree.courses[1].chapters.push(tree.courses[0].chapters.shift()); cases.push(tree);
  const entities = f.store.get('SELECT count(*) AS n FROM entities').n;
  for (const input of cases) {
    await f.admin('/catalog', { method: 'PUT', json: input, status: 400 });
    assert.deepEqual(await f.tree(), original);
    assert.equal(f.store.get('SELECT count(*) AS n FROM entities').n, entities);
  }
});

test('catalog: empty published course content rejected; failed publication leaves revision and body untouched', async t => {
  const f = await fixture(t), before = await f.admin('/published');
  const revisions = f.store.get('SELECT count(*) AS n FROM revisions').n;
  const tree = await f.tree();
  for (const ch of tree.courses[0].chapters) for (const s of ch.sections) { s.question = ''; s.body = []; s.practice = ''; }
  const saved = await f.save(tree);
  await f.admin('/publish', { method: 'POST', json: { version: saved.version }, status: 400 });
  assert.deepEqual(await f.admin('/published'), before);
  assert.equal(f.store.get('SELECT count(*) AS n FROM revisions').n, revisions);
});

test('auth: explicit local dev login, no-secret WeChat 503, disabled dev route and production safeguards', async t => {
  const f = await fixture(t), user = await f.user('same-device');
  const again = await f.user('same-device');
  assert.equal(user.user.id, again.user.id); assert.notEqual(user.token, again.token);
  assert.equal(user.developmentOnly, true);
  await f.request('/api/auth/wechat', { method: 'POST', json: { code: 'does-not-call-network' }, status: 503 });
  await f.request('/api/auth/dev', { method: 'POST', json: { deviceId: 'short' }, status: 400 });
  const off = await fixture(t, { devAuth: false });
  assert.equal((await off.request('/api/bootstrap')).body.testLoginEnabled, false);
  await off.request('/api/auth/dev', { method: 'POST', json: { deviceId: 'fixture-disabled' }, status: 404 });
  // Production with DEV_AUTH is invalid configuration, not a silently usable login bypass.
  assert.throws(() => createApp({ dataDir: f.dataDir, production: true, devAuth: true, publicOrigin: 'https://example.invalid', appSecret: 'test-only-secret' }), /DEV_AUTH/);
  const prod = await fixture(t, { production: true, devAuth: false, publicOrigin: 'https://example.invalid', appSecret: 'test-only-secret' });
  await prod.request('/api/auth/dev', { method: 'POST', json: { deviceId: 'fixture-production' }, status: 404 });
  assert.equal((await prod.request('/api/bootstrap')).body.testLoginEnabled, false);
  assert.throws(() => require('../server/config').loadConfig({ production: true, devAuth: false, lanTestAuth: true, publicOrigin: 'https://example.invalid', appSecret: 'test-only-secret' }), /LAN_TEST_AUTH/);
});

test('LAN test login requires both explicit test flags, a private socket address, and never trusts forwarded addresses', () => {
  const { testLoginAllowed } = require('../server/security');
  const config = { production: false, devAuth: true, lanTestAuth: true };
  const req = address => ({ socket: { remoteAddress: address }, headers: { 'x-forwarded-for': '10.12.195.41' } });
  for (const address of ['10.12.195.41', '::ffff:192.168.1.2', '172.16.0.2', '172.31.255.254']) {
    assert.equal(testLoginAllowed(req(address), config), true);
    assert.equal(Boolean(testLoginAllowed(req(address), { ...config, lanTestAuth: false })), false);
    assert.equal(Boolean(testLoginAllowed(req(address), { ...config, devAuth: false })), false);
    assert.equal(Boolean(testLoginAllowed(req(address), { ...config, production: true })), false);
  }
  for (const address of ['8.8.8.8', '172.32.0.1', '192.169.0.1', '10.999.0.1', '', '2001:db8::1']) assert.equal(Boolean(testLoginAllowed(req(address), config)), false);
  assert.equal(testLoginAllowed(req('127.0.0.1'), { ...config, lanTestAuth: false }), true);
});

test('cards: plaintext codes returned only at creation, never in database/list/detail/audit', async t => {
  const f = await fixture(t), created = await f.batch({ count: 3 });
  assert.equal(created.codes.length, 3); assert.equal(new Set(created.codes).size, 3);
  for (const code of created.codes) assert.match(code, /^[A-F0-9]{8}(?:-[A-F0-9]{8}){4}$/);
  const secrets = created.codes.flatMap(c => [c, c.replaceAll('-', '')]);
  const cards = await f.admin('/cards?batchId=' + created.batch.id);
  assert.equal(cards.total, 3); assert.equal(cards.items.length, 3);
  assert(cards.items.every(c => c.mask.includes('••••')));
  for (const route of ['/cards', '/card-batches', '/audit', '/redemptions']) assertNoSecrets(await f.admin(route), secrets);
  for (const { name } of f.store.all("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")) {
    assert.match(name, /^[a-z_]+$/);
    assertNoSecrets(f.store.all('SELECT * FROM ' + name), secrets);
  }
  for (const name of fs.readdirSync(f.dataDir).filter(n => /^blueprint\.sqlite(?:-wal|-shm)?$/.test(n))) assertNoSecrets(fs.readFileSync(path.join(f.dataDir, name)), secrets);
});

test('redeem: same-user retry idempotent; another user gets 409 and no grant', async t => {
  const f = await fixture(t), a = await f.user('redeemer-a'), b = await f.user('redeemer-b');
  const { codes } = await f.batch();
  for (const code of [codes[0], codes[0].toLowerCase().replaceAll('-', ' ')]) {
    const result = (await f.request('/api/redeem', { method: 'POST', token: a.token, json: { code } })).body;
    assert.equal(result.ok, true); assert.equal(result.grants.length, 1);
  }
  await f.request('/api/redeem', { method: 'POST', token: b.token, json: { code: codes[0] }, status: 409 });
  assert.equal(f.store.get('SELECT count(*) AS n FROM redemptions').n, 1);
  assert.equal(f.store.get('SELECT count(*) AS n FROM grants').n, 1);
  assert.equal((await f.me(b)).hasAccess, false);
});

test('redeem: deleting a course only from the draft does not invalidate issued course cards', async t => {
  const f = await fixture(t), user = await f.user(), tree = await f.tree();
  const [course, other] = tree.courses.filter(c => c.published);
  const { codes } = await f.batch({ scope: 'courses', courseIds: [course.id], accessDays: 2 });
  tree.courses = tree.courses.filter(c => c.id !== course.id);
  await f.save(tree);
  assert((await f.request('/api/courses')).body.courses.some(c => c.id === course.id));
  // Newly issued scopes still validate admin input against the current draft.
  await f.batch({ scope: 'courses', courseIds: [other.id] });
  await f.admin('/card-batches', { method: 'POST', status: 400, json: { title: 'invalid draft scope', count: 1, scope: 'courses', courseIds: [course.id] } });
  const result = (await f.request('/api/redeem', { method: 'POST', token: user.token, json: { code: codes[0] } })).body;
  assert.equal(result.ok, true); assert.equal(result.grants.length, 1);
  assert.deepEqual(result.grants[0].courseIds, [course.id]);
  assert.equal(result.grants[0].scope, 'courses');
  assert(Math.abs(Date.parse(result.grants[0].expiresAt) - Date.now() - 2 * 86400000) < 5000);
  await f.request('/api/courses/' + course.id, { token: user.token });
  await f.request('/api/courses/' + other.id, { token: user.token, status: 403 });
  await f.request('/api/redeem', { method: 'POST', token: user.token, json: { code: codes[0] } });
  assert.equal(f.store.get('SELECT count(*) AS n FROM redemptions').n, 1);
  assert.equal(f.store.get('SELECT count(*) AS n FROM grants').n, 1);
});

test('redeem: two concurrent users produce exactly one winner, one 409 and one grant', async t => {
  const f = await fixture(t), a = await f.user('race-a'), b = await f.user('race-b'), { codes } = await f.batch();
  // Read both actual statuses before asserting, rather than presuming which request wins.
  const responses = await Promise.all([a, b].map(user => fetch(f.base + '/api/redeem', {
    method: 'POST', headers: { Authorization: 'Bearer ' + user.token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: codes[0] }), signal: AbortSignal.timeout(15000)
  })));
  const results = await Promise.all(responses.map(async (r, i) => ({ status: r.status, body: await r.json(), user: [a, b][i] })));
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  const winner = results.find(r => r.status === 200), loser = results.find(r => r.status === 409);
  assert.equal(winner.body.ok, true); assert.equal(typeof loser.body.error, 'string');
  assert.equal(f.store.get('SELECT count(*) AS n FROM redemptions').n, 1);
  assert.equal(f.store.get('SELECT count(*) AS n FROM grants').n, 1);
  assert.equal(f.store.get('SELECT used_by FROM cards').used_by, winner.user.user.id);
  assert.equal((await f.me(loser.user)).hasAccess, false);
});

test('cards: disabled batches and expired redemption deadlines cannot mint grants', async t => {
  const f = await fixture(t), user = await f.user(), disabled = await f.batch(), expired = await f.batch({ redeemExpiresAt: future() });
  await f.admin('/card-batches/' + disabled.batch.id + '/disable', { method: 'POST', json: {} });
  f.store.run('UPDATE batches SET redeem_expires_at=? WHERE id=?', past(), expired.batch.id);
  for (const code of [disabled.codes[0], expired.codes[0]]) await f.request('/api/redeem', { method: 'POST', token: user.token, json: { code }, status: 400 });
  assert.equal(f.store.get('SELECT count(*) AS n FROM grants').n, 0);
  assert.equal(f.store.get('SELECT count(*) AS n FROM redemptions').n, 0);
  assert.equal((await f.admin('/cards?status=disabled')).total, 1);
  assert.equal((await f.admin('/cards?status=expired')).total, 1);
});

test('access: course-limited card grants only specified courses and accessDays expires', async t => {
  const f = await fixture(t), user = await f.user(), tree = await f.tree();
  const [course, other] = tree.courses.filter(c => c.published);
  const { codes } = await f.batch({ scope: 'courses', courseIds: [course.id], accessDays: 2 });
  const start = Date.now();
  const result = (await f.request('/api/redeem', { method: 'POST', token: user.token, json: { code: codes[0] } })).body;
  const grant = result.grants[0];
  assert.deepEqual(grant.courseIds, [course.id]);
  assert(Math.abs(Date.parse(grant.expiresAt) - start - 2 * 86400000) < 5000);
  await f.request('/api/courses/' + course.id, { token: user.token });
  await f.request('/api/courses/' + other.id, { token: user.token, status: 403 });
  const listings = (await f.request('/api/courses', { token: user.token })).body.courses;
  assert.equal(listings.find(c => c.id === course.id).accessible, true);
  assert.equal(listings.find(c => c.id === other.id).accessible, false);
  f.store.run('UPDATE grants SET expires_at=? WHERE id=?', past(), grant.id);
  assert.equal((await f.me(user)).hasAccess, false);
  await f.request('/api/courses/' + course.id, { token: user.token, status: 403 });
});

test('accounts: disabling revokes every session; reactivation never resurrects old tokens', async t => {
  const f = await fixture(t), user = await f.user('disable-me'), second = await f.user('disable-me');
  await f.grant(user);
  await f.admin('/users/' + user.user.id, { method: 'PATCH', json: { status: 'disabled' } });
  assert.equal(f.store.get('SELECT count(*) AS n FROM user_sessions WHERE user_id=?', user.user.id).n, 0);
  for (const token of [user.token, second.token]) await f.request('/api/me', { token, status: 401 });
  await f.request('/api/auth/dev', { method: 'POST', json: { deviceId: 'fixture-disable-me' }, status: 403 });
  await f.admin('/users/' + user.user.id, { method: 'PATCH', json: { status: 'active', note: 'reactivated fixture' } });
  await f.request('/api/me', { token: user.token, status: 401 });
  const fresh = await f.user('disable-me'); assert.equal(fresh.user.id, user.user.id);
  assert.equal((await f.me(fresh)).hasAccess, true);
});

test('grants: manual grant then revoke removes access immediately, repeated revoke is safe', async t => {
  const f = await fixture(t), user = await f.user(), course = firstCourse(await f.tree());
  const grant = await f.grant(user, { scope: 'courses', courseIds: [course.id] });
  await f.request('/api/courses/' + course.id, { token: user.token });
  for (let i = 0; i < 2; i++) await f.admin('/grants/' + grant.id + '/revoke', { method: 'POST', json: { reason: 'contract revocation' } });
  await f.request('/api/courses/' + course.id, { token: user.token, status: 403 });
  assert.equal((await f.me(user)).hasAccess, false);
  const view = await f.admin('/users/' + user.user.id);
  assert.equal(view.grants.length, 1); assert(view.grants[0].revokedAt);
});

test('persistence: closing and reopening same isolated realpath preserves content, cards, users and learning', async t => {
  const f = await fixture(t), user = await f.user('persistent'), tree = await f.tree();
  tree.courses[0].title = 'Persistent contract content';
  const saved = await f.save(tree); await f.publish(saved);
  const batch = await f.batch({ count: 2 });
  await f.request('/api/redeem', { method: 'POST', token: user.token, json: { code: batch.codes[0] } });
  const loc = locationOf(tree.courses[0]);
  await f.request('/api/me/learning', { method: 'PUT', token: user.token, json: { ...loc, completed: true } });
  const before = await f.admin('/published');
  await f.stop(); await f.start();
  assert.deepEqual(await f.admin('/published'), before);
  assert.equal((await f.me(user)).user.id, user.user.id);
  const repeated = await f.user('persistent'); assert.equal(repeated.user.id, user.user.id);
  assert.equal((await f.admin('/cards?batchId=' + batch.batch.id)).total, 2);
  await f.request('/api/redeem', { method: 'POST', token: user.token, json: { code: batch.codes[0] } });
  assert.equal(f.store.get('SELECT count(*) AS n FROM redemptions').n, 1);
  const learning = (await f.request('/api/me/learning', { token: user.token })).body;
  assert.deepEqual(learning.sections.map(s => [s.sectionId, s.completed]), [[loc.sectionId, true]]);
});

test('learning: stable IDs survive chapter/section reorder; completion monotone; invalid relationship 409', async t => {
  const f = await fixture(t), user = await f.user(), untouched = await f.user(), tree = await f.tree(), course = firstCourse(tree);
  await f.grant(user);
  const loc = locationOf(course), siblingId = course.chapters[0].sections[1].id;
  await f.request('/api/me/learning', { method: 'PUT', token: user.token, json: { ...loc, completed: true } });
  course.chapters[0].sections.reverse(); course.chapters.reverse();
  const saved = await f.save(tree); await f.publish(saved);
  await f.request('/api/me/learning', { method: 'PUT', token: user.token, json: { ...loc, completed: false } });
  const learning = (await f.request('/api/me/learning', { token: user.token })).body;
  assert.deepEqual(learning.sections.map(s => [s.sectionId, s.completed]), [[loc.sectionId, true]]);
  assert(!learning.sections.some(s => s.sectionId === siblingId));
  assert.deepEqual(learning.positions.map(p => [p.courseId, p.chapterId, p.sectionId]), [[loc.courseId, loc.chapterId, loc.sectionId]]);
  await f.request('/api/me/learning', { method: 'PUT', token: user.token, json: { ...loc, chapterId: 'missing-chapter', completed: true }, status: 409 });
  await f.request('/api/me/learning', { method: 'PUT', token: user.token, json: { ...loc, sectionId: 'missing-section', completed: true }, status: 409 });
  await f.request('/api/me/learning', { method: 'PUT', token: user.token, json: loc });
  assert.deepEqual((await f.request('/api/me/learning', { token: untouched.token })).body, { sections: [], positions: [], legacyChapters: [] });
});

test('legacy import: fixed seed mapping, current authorization, idempotency, and never creates paid access', async t => {
  const f = await fixture(t), user = await f.user(), tree = await f.tree(), course = firstCourse(tree);
  const ch = seed.courses.find(c => c.id === course.id).chapters[0], section = ch.sections[0];
  const input = { importId: 'fixture-import', sections: [section.id, section.id], chapters: [ch.id, ch.id] };
  await f.request('/api/me/learning/import', { method: 'POST', token: user.token, json: input, status: 403 });
  assert.equal((await f.me(user)).hasAccess, false);
  assert.equal(f.store.get('SELECT count(*) AS n FROM imports').n, 0);
  const grant = await f.grant(user, { scope: 'courses', courseIds: [course.id] });
  for (let i = 0; i < 2; i++) await f.request('/api/me/learning/import', { method: 'POST', token: user.token, json: input });
  assert.equal(f.store.get('SELECT count(*) AS n FROM imports').n, 1);
  assert.equal(f.store.get("SELECT count(*) AS n FROM audit WHERE action='learning.import'").n, 1);
  assert.equal(f.store.get('SELECT count(*) AS n FROM grants').n, 1);
  const learning = (await f.request('/api/me/learning', { token: user.token })).body;
  assert.deepEqual(learning.sections.map(s => [s.sectionId, s.completed]), [[section.id, true]]);
  assert.deepEqual(learning.legacyChapters, [{ chapterId: ch.id }]);
  const added = { id: 'fixture-new-section', title: 'Not legacy', question: '', body: ['new'], practice: '' };
  course.chapters[0].sections.push(added);
  course.chapters[0].legacyIndex = 999; course.chapters[0].sections[0].legacyIndex = 999;
  const saved = await f.save(tree); await f.publish(saved);
  const detail = (await f.request('/api/courses/' + course.id, { token: user.token })).body;
  const expected = seed.courses.find(c => c.id === course.id).chapters.map(c => ({ id: c.id, legacyIndex: c.legacyIndex, sections: c.sections.map(s => ({ id: s.id, legacyIndex: s.legacyIndex })) }));
  assert.deepEqual(detail.legacyMap.chapters, expected);
  await f.request('/api/me/learning/import', { method: 'POST', token: user.token, json: { importId: 'not-legacy', sections: [added.id], chapters: [] }, status: 400 });
  await f.admin('/grants/' + grant.id + '/revoke', { method: 'POST', json: { reason: 'no perpetual access from import' } });
  assert.equal((await f.me(user)).hasAccess, false);
  await f.request('/api/courses/' + course.id, { token: user.token, status: 403 });
});

test('user sessions: logout revokes one token, user token never substitutes for admin cookie', async t => {
  const f = await fixture(t), user = await f.user('logout'), second = await f.user('logout');
  await f.request('/api/admin/users', { token: user.token, status: 401 });
  await f.request('/api/me', { headers: { Cookie: f.cookie }, status: 401 });
  await f.request('/api/auth/logout', { method: 'POST', token: user.token, json: {} });
  await f.request('/api/me', { token: user.token, status: 401 });
  assert.equal((await f.me(second)).user.id, user.user.id);
  assertNoSecrets(await f.admin('/users/' + user.user.id), [user.token, second.token, f.password]);
});

// Upload/material integration tests exercise the same app, not the legacy router alone.
test('upload: PNG/JPEG/WebP are decoded and normalized; PDF/DOC/real OOXML DOCX accepted', async t => {
  const f = await fixture(t);
  for (const format of ['png', 'jpeg', 'webp']) {
    const bytes = await sharp({ create: { width: 4, height: 3, channels: 3, background: '#336699' } }).toFormat(format).toBuffer();
    const { asset } = await f.upload('fixture.' + format, bytes);
    assert.equal(asset.kind, 'image'); assert.equal(asset.fileType, 'webp'); assert(asset.sizeBytes > 0);
    assert.equal(asset.url, '/api/assets/' + asset.id);
    const preview = await f.request('/api/admin/assets/' + asset.id + '/file', { admin: true });
    assert.match(preview.headers.get('content-type'), /^image\/webp/);
    const meta = await sharp(preview.bytes).metadata(); assert.equal(meta.width, 4); assert.equal(meta.height, 3);
    await f.request(asset.url, { status: 404 }); // unpublished upload is not public
  }
  for (const [type, bytes] of [['pdf', binary.pdf()], ['doc', binary.doc()], ['docx', binary.docx()]]) {
    const { asset } = await f.upload('fixture.' + type, bytes);
    assert.equal(asset.kind, 'document'); assert.equal(asset.fileType, type); assert.equal(asset.sizeBytes, bytes.length);
    assert.equal(asset.url, '/api/admin/assets/' + asset.id + '/file');
    const downloaded = await f.request(asset.url, { admin: true });
    assert.deepEqual(downloaded.bytes, bytes);
    assert.match(downloaded.headers.get('content-disposition'), /attachment/);
    assert.equal(downloaded.headers.get('x-content-type-options'), 'nosniff');
    await f.request('/api/assets/' + asset.id, { status: 404 });
    await f.request(asset.url, { status: 401 });
  }
  const list = await f.admin('/assets'); assert.equal(list.total, 6); assert.equal(list.items.length, 6);
});

test('upload: reject unsupported extensions, mismatched signatures, fake ZIP DOCX, macros and traversal entries', async t => {
  const f = await fixture(t);
  const bad = [
    ['payload.svg', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')],
    ['payload.html', Buffer.from('<html>not an asset</html>')], ['fake.pdf', Buffer.from('not a PDF')],
    ['fake.doc', binary.pdf()], ['fake.png', binary.pdf()], ['empty.pdf', Buffer.alloc(0)],
    ['fake.docx', Buffer.from('PK\x03\x04not-a-zip')],
    ['not-word.docx', binary.zip({ 'unrelated.txt': 'This is a ZIP but not OOXML.' })],
    ['macro.docx', binary.zip({ ...binary.ooxml, 'word/vbaProject.bin': 'macro' })],
    ['traversal.docx', binary.zip({ ...binary.ooxml, '../outside.xml': 'escape' })],
    ['zip-bomb.docx', binary.zip({ ...binary.ooxml, 'word/large.xml': 'A'.repeat(2 * 1024 * 1024) }, { compress: true })]
  ];
  for (const [name, bytes] of bad) await f.upload(name, bytes, { status: 400 });
  assert.equal((await f.admin('/assets')).total, 0);
  assert.deepEqual(fs.readdirSync(path.join(f.dataDir, 'uploads')), []);
});

test('upload: enforce 5 MiB images, 20 MiB documents, one-file multipart and quota with no orphan files', async t => {
  const f = await fixture(t);
  await f.upload('too-large.png', Buffer.alloc(5 * 1024 * 1024 + 1), { status: 413 });
  await f.upload('too-large.pdf', Buffer.concat([binary.pdf(), Buffer.alloc(20 * 1024 * 1024)]), { status: 413 });
  const form = new FormData();
  for (const name of ['one.pdf', 'two.pdf']) form.append('file', new Blob([binary.pdf()]), name);
  await f.request('/api/admin/assets', { admin: true, method: 'POST', body: form, status: 400 });
  assert.equal((await f.admin('/assets')).total, 0);
  assert.deepEqual(fs.readdirSync(path.join(f.dataDir, 'uploads')), []);
  const small = await fixture(t, { uploadQuota: 100 });
  await small.upload('over-quota.pdf', binary.pdf(), { status: 413 });
  assert.equal((await small.admin('/assets')).total, 0);
  assert.deepEqual(fs.readdirSync(path.join(small.dataDir, 'uploads')), []);
});

test('materials: course/chapter/section scope lists and downloads each require current Bearer entitlement', async t => {
  const f = await fixture(t), user = await f.user(), locked = await f.user(), course = firstCourse(await f.tree());
  const ch = course.chapters[0], section = ch.sections[0], grant = await f.grant(user, { scope: 'courses', courseIds: [course.id] });
  const owners = [['course', course.id], ['chapter', ch.id], ['section', section.id]], materials = [];
  const inputs = [['pdf', binary.pdf()], ['doc', binary.doc()], ['docx', binary.docx()]];
  for (let i = 0; i < owners.length; i++) {
    const [scope, ownerId] = owners[i], [type, bytes] = inputs[i];
    const { asset } = await f.upload('scope.' + type, bytes);
    const material = await f.material(asset, scope, ownerId); materials.push(material);
    const route = '/api/materials?scope=' + scope + '&ownerId=' + ownerId;
    const list = (await f.request(route, { token: user.token })).body;
    assert.deepEqual(list.materials, [{ id: material.id, title: material.title, fileType: type, url: '/api/materials/' + material.id + '/file', sizeBytes: bytes.length }]);
    assert(!list.materials[0].url.includes('?'));
    const url = list.materials[0].url;
    const download = await f.request(url, { token: user.token }); assert.deepEqual(download.bytes, bytes);
    assert.equal(download.headers.get('cache-control'), 'no-store'); assert.equal(download.headers.get('x-content-type-options'), 'nosniff');
    for (const target of [route, url]) {
      await f.request(target, { status: 401 });
      await f.request(target, { token: locked.token, status: 403 });
      await f.request(target, { headers: { Cookie: f.cookie }, status: 401 });
    }
    await f.request(url + '?token=' + user.token, { status: 401 });
    await f.request('/api/assets/' + asset.id, { token: user.token, status: 404 });
  }
  await f.admin('/grants/' + grant.id + '/revoke', { method: 'POST', json: { reason: 'downloads must reauthorize' } });
  for (const material of materials) await f.request('/api/materials/' + material.id + '/file', { token: user.token, status: 403 });
  await f.grant(user);
  await f.request('/api/materials/' + materials[0].id + '/file', { token: user.token });
  await f.request('/api/auth/logout', { method: 'POST', token: user.token, json: {} });
  await f.request('/api/materials/' + materials[0].id + '/file', { token: user.token, status: 401 });
});

test('materials library: course, chapter and section metadata follow each users current course entitlement', async t => {
  const f = await fixture(t), first = await f.user('library-first'), second = await f.user('library-second'), locked = await f.user('library-locked');
  const courses = (await f.tree()).courses.filter(c => c.published && c.chapters[0]?.sections.length);
  assert(courses.length >= 2);
  const firstGrant = await f.grant(first, { scope: 'courses', courseIds: [courses[0].id] });
  await f.grant(second, { scope: 'courses', courseIds: [courses[1].id] });
  const expected = [[], []], inputs = [['pdf', binary.pdf()], ['doc', binary.doc()], ['docx', binary.docx()]];
  for (let courseIndex = 0; courseIndex < 2; courseIndex++) {
    const course = courses[courseIndex], chapter = course.chapters[0];
    const owners = [['course', course.id], ['chapter', chapter.id], ['section', chapter.sections[0].id]];
    for (let i = 0; i < owners.length; i++) {
      const [scope, ownerId] = owners[i], [type, bytes] = inputs[i];
      const { asset } = await f.upload('library-' + courseIndex + '-' + i + '.' + type, bytes);
      const material = await f.material(asset, scope, ownerId, { title: 'Private library ' + courseIndex + ' ' + scope, sortOrder: courseIndex * 3 + i });
      expected[courseIndex].push({ id: material.id, title: material.title, fileType: type, url: '/api/materials/' + material.id + '/file', sizeBytes: bytes.length, scope, ownerId });
    }
  }
  await f.request('/api/materials/library', { status: 401 });
  await f.request('/api/materials/library', { headers: { Cookie: f.cookie }, status: 401 });
  assert.deepEqual((await f.request('/api/materials/library', { token: locked.token })).body, { materials: [] });
  for (const [index, user] of [first, second].entries()) {
    const response = await f.request('/api/materials/library', { token: user.token });
    assert.deepEqual(response.body, { materials: expected[index] });
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert(!JSON.stringify(response.body).includes('Private library ' + (1 - index)), 'unauthorized titles must not appear in the aggregate response');
    for (const entry of expected[index]) await f.request(entry.url, { token: user.token });
    for (const entry of expected[1 - index]) await f.request(entry.url, { token: user.token, status: 403 });
  }
  await f.admin('/grants/' + firstGrant.id + '/revoke', { method: 'POST', json: { reason: 'library must immediately remove revoked material metadata' } });
  assert.deepEqual((await f.request('/api/materials/library', { token: first.token })).body, { materials: [] });
  for (const entry of expected[0]) await f.request(entry.url, { token: first.token, status: 403 });
  assert.deepEqual((await f.request('/api/materials/library', { token: second.token })).body, { materials: expected[1] });
});

test('materials library: unpublished material and owners, archived courses, missing files and invalid signatures are omitted', async t => {
  const f = await fixture(t), user = await f.user('library-visibility'), tree = await f.tree(), course = firstCourse(tree);
  await f.grant(user);
  const { asset } = await f.upload('library-visible.pdf', binary.pdf());
  const visible = await f.material(asset, 'course', course.id, { title: 'Available published reading' });
  await f.material(asset, 'course', course.id, { published: false, title: 'Unpublished private reading' });
  const draftChapter = { id: 'library-draft-chapter', title: 'Draft chapter', sections: [{ id: 'library-draft-section', title: 'Draft section', question: '', body: ['draft content'], practice: '' }] };
  course.chapters.push(draftChapter); await f.save(tree);
  await f.material(asset, 'chapter', draftChapter.id, { title: 'Private draft chapter reading' });
  await f.material(asset, 'section', draftChapter.sections[0].id, { title: 'Private draft section reading' });
  const missing = (await f.upload('library-missing.pdf', binary.pdf())).asset;
  await f.material(missing, 'course', course.id, { title: 'Missing file reading' });
  const missingName = f.store.get('SELECT storage_name FROM assets WHERE id=?', missing.id).storage_name;
  fs.unlinkSync(path.join(f.dataDir, 'uploads', missingName));
  const corrupt = (await f.upload('library-corrupt.pdf', binary.pdf())).asset;
  await f.material(corrupt, 'course', course.id, { title: 'Corrupt file reading' });
  const corruptName = f.store.get('SELECT storage_name FROM assets WHERE id=?', corrupt.id).storage_name;
  fs.writeFileSync(path.join(f.dataDir, 'uploads', corruptName), Buffer.from('not a valid PDF document'));
  const library = (await f.request('/api/materials/library', { token: user.token })).body;
  assert.deepEqual(library.materials.map(entry => entry.id), [visible.id]);
  assert.equal(library.materials[0].title, visible.title);
  assert(!JSON.stringify(library).includes('Private draft'));
  const archived = await f.tree(); archived.courses.find(item => item.id === course.id).published = false;
  await f.publish(await f.save(archived));
  assert.deepEqual((await f.request('/api/materials/library', { token: user.token })).body, { materials: [] });
  await f.request('/api/materials/' + visible.id + '/file', { token: user.token, status: 404 });
});

test('materials library: authorization failures other than 403 and 404 abort instead of leaking a partial list', async t => {
  const f = await fixture(t), { asset } = await f.upload('library-auth.pdf', binary.pdf());
  const file = f.store.get('SELECT storage_name FROM assets WHERE id=?', asset.id).storage_name;
  let status = 401, calls = [];
  const entries = ['allowed', 'failure', 'last'].map(id => ({ id, file, scope: 'course', ownerId: 'owner-' + id, title: 'Private reading ' + id }));
  const app = require('express')();
  app.use('/materials', require('../server/materials').createMaterialsRouter({ filesDir: path.join(f.dataDir, 'uploads'), getEntries: () => entries, authorize: (_req, entry) => {
    calls.push(entry.id);
    if (entry.id === 'failure') throw Object.assign(new Error('Authorization service rejected access'), { status, code: 'LIBRARY_AUTH_REJECTED' });
  } }));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const url = 'http://127.0.0.1:' + server.address().port + '/materials/library';
  for (status of [401, 429, 500]) {
    calls = [];
    const response = await fetch(url), body = await response.json();
    assert.equal(response.status, status); assert.equal(body.code, 'LIBRARY_AUTH_REJECTED');
    assert(!Object.hasOwn(body, 'materials')); assert(!JSON.stringify(body).includes('Private reading'));
    assert.deepEqual(calls, ['allowed', 'failure']);
  }
  for (status of [403, 404]) {
    calls = [];
    const response = await fetch(url), body = await response.json();
    assert.equal(response.status, 200); assert.deepEqual(body.materials.map(entry => entry.id), ['allowed', 'last']);
    assert.deepEqual(calls, ['allowed', 'failure', 'last']);
  }
});

test('materials: unpublished material/entity and archived course cannot leak files even through known IDs', async t => {
  const f = await fixture(t), user = await f.user(), tree = await f.tree(), course = firstCourse(tree);
  await f.grant(user);
  const { asset } = await f.upload('visibility.pdf', binary.pdf());
  const hidden = await f.material(asset, 'course', course.id, { published: false });
  assert.deepEqual((await f.request('/api/materials?scope=course&ownerId=' + course.id, { token: user.token })).body.materials, []);
  await f.request('/api/materials/' + hidden.id + '/file', { token: user.token, status: 404 });
  const chapter = { id: 'draft-only-chapter', title: 'Draft entity', sections: [{ id: 'draft-only-section', title: 'Draft section', question: '', body: ['draft body'], practice: '' }] };
  course.chapters.push(chapter);
  const saved = await f.save(tree);
  const material = await f.material(asset, 'section', chapter.sections[0].id);
  const listing = '/api/materials?scope=section&ownerId=' + chapter.sections[0].id;
  await f.request(listing, { token: user.token, status: 404 });
  await f.request('/api/materials/' + material.id + '/file', { token: user.token, status: 404 });
  await f.publish(saved);
  assert.equal((await f.request(listing, { token: user.token })).body.materials.length, 1);
  await f.request('/api/materials/' + material.id + '/file', { token: user.token });
  const archived = await f.tree(); archived.courses.find(c => c.id === course.id).published = false;
  const archiveDraft = await f.save(archived); await f.publish(archiveDraft);
  await f.request(listing, { token: user.token, status: 404 });
  await f.request('/api/materials/' + material.id + '/file', { token: user.token, status: 404 });
  await f.request('/api/courses/' + course.id, { token: user.token, status: 404 });
  assert(!(await f.request('/api/courses')).body.courses.some(c => c.id === course.id));
});

test('materials: scope validation, update, reference-protected asset deletion and association removal', async t => {
  const f = await fixture(t), user = await f.user(), course = firstCourse(await f.tree()); await f.grant(user);
  const { asset } = await f.upload('association.pdf', binary.pdf());
  for (const json of [
    { assetId: asset.id, title: 'bad', scope: 'all', ownerId: course.id },
    { assetId: asset.id, title: 'bad', scope: 'section', ownerId: course.id },
    { assetId: 'missing', title: 'bad', scope: 'course', ownerId: course.id },
    { assetId: asset.id, title: 'bad', scope: 'course', ownerId: course.id, sortOrder: -1 }
  ]) await f.admin('/materials', { method: 'POST', status: 400, json });
  const material = await f.material(asset, 'course', course.id);
  await f.admin('/assets/' + asset.id, { method: 'DELETE', status: 409 });
  const edited = await f.admin('/materials/' + material.id, { method: 'PUT', json: {
    assetId: asset.id, title: 'Moved association', scope: 'chapter', ownerId: course.chapters[0].id, sortOrder: 4, published: true
  } });
  assert.equal(edited.material.sortOrder, 4); assert.equal(edited.material.scope, 'chapter');
  assert.deepEqual((await f.request('/api/materials?scope=course&ownerId=' + course.id, { token: user.token })).body.materials, []);
  await f.admin('/materials/' + material.id, { method: 'DELETE' });
  await f.request('/api/materials/' + material.id + '/file', { token: user.token, status: 404 });
  await f.admin('/assets/' + asset.id, { method: 'DELETE' });
  assert.deepEqual(fs.readdirSync(path.join(f.dataDir, 'uploads')), []);
});

test('images: only published references expose images; referenced current/historical assets cannot be deleted', async t => {
  const f = await fixture(t), bytes = await sharp({ create: { width: 2, height: 2, channels: 3, background: 'red' } }).png().toBuffer();
  const { asset } = await f.upload('cover.png', bytes), tree = await f.tree();
  await f.request(asset.url, { status: 404 });
  tree.courses[0].cover = asset.url;
  const saved = await f.save(tree);
  await f.request(asset.url, { status: 404 });
  await f.admin('/assets/' + asset.id, { method: 'DELETE', status: 409 });
  await f.publish(saved);
  const publicImage = await f.request(asset.url); assert.match(publicImage.headers.get('content-type'), /^image\/webp/);
  const replacement = await f.tree(); replacement.courses[0].cover = seed.courses[0].cover;
  const replaced = await f.save(replacement); await f.publish(replaced);
  await f.request(asset.url, { status: 404 });
  await f.admin('/assets/' + asset.id, { method: 'DELETE', status: 409 });
});

test('path/security: encoded traversal, token guessing, direct upload/static paths and malformed JSON cannot bypass permissions', async t => {
  const f = await fixture(t), user = await f.user(); await f.grant(user);
  for (const route of [
    '/api/materials/..%2f..%2fserver%2fapp.js/file', '/api/materials/..%5c..%5cserver%5capp.js/file',
    '/api/assets/..%2fblueprint.sqlite', '/uploads/blueprint.sqlite', '/server/app.js', '/server/data/blueprint.sqlite',
    '/api/assets/nonexistent', '/api/materials/missing/file'
  ]) {
    const response = await f.request(route, { token: user.token, status: 404 });
    assertNoSecrets(response.body, [f.password, user.token]);
  }
  await f.request('/api/admin/assets/..%2f..%2fapp.js/file', { admin: true, status: 404 });
  await f.request('/api/me', { token: crypto.randomBytes(32).toString('base64url'), status: 401 });
  await f.request('/api/admin/catalog', { headers: { Cookie: 'blueprint_admin=' + crypto.randomBytes(32).toString('base64url') }, status: 401 });
  await f.request('/api/redeem', { method: 'POST', token: user.token, body: '{broken', headers: { 'Content-Type': 'application/json' }, status: 400 });
  await f.request('/api/me/learning', { method: 'PUT', token: user.token, json: { payload: 'x'.repeat(2 * 1024 * 1024) }, status: 413 });
});

test('input bounds: invalid batch sizes/scopes/dates, bad grants and oversized catalog text never mutate business state', async t => {
  const f = await fixture(t), user = await f.user();
  const defaults = { title: 'invalid', count: 1, scope: 'all', courseIds: [], redeemExpiresAt: null, accessDays: null };
  for (const change of [{ count: 0 }, { count: 501 }, { count: 1.5 }, { accessDays: 0 }, { accessDays: 36501 }, { redeemExpiresAt: past() }, { scope: 'courses', courseIds: ['missing-course'] }]) {
    await f.admin('/card-batches', { method: 'POST', status: 400, json: { ...defaults, ...change } });
  }
  assert.equal((await f.admin('/card-batches')).total, 0); assert.equal((await f.admin('/cards')).total, 0);
  for (const change of [{ scope: 'invalid' }, { scope: 'courses', courseIds: [] }, { expiresAt: past() }, { expiresAt: 'not-a-date' }]) {
    await f.admin('/users/' + user.user.id + '/grants', { method: 'POST', status: 400, json: { scope: 'all', courseIds: [], expiresAt: null, reason: 'invalid fixture', ...change } });
  }
  assert.equal((await f.me(user)).grants.length, 0);
  const original = await f.tree(), invalid = clone(original); invalid.courses[0].title = 'x'.repeat(201);
  await f.admin('/catalog', { method: 'PUT', status: 400, json: invalid });
  invalid.courses[0].title = original.courses[0].title; invalid.courses[0].cover = 'https://attacker.invalid/image.png';
  await f.admin('/catalog', { method: 'PUT', status: 400, json: invalid });
  assert.deepEqual(await f.tree(), original);
});

test('pagination and audit: stable non-overlapping pages, search, masked cards, and no password/token/plaintext codes', async t => {
  const f = await fixture(t), users = [];
  for (let i = 0; i < 25; i++) {
    const user = await f.user('page-' + String(i).padStart(2, '0')); users.push(user);
    await f.admin('/users/' + user.user.id, { method: 'PATCH', json: { nickname: 'Paged fixture ' + i, note: 'search-fixture-' + i } });
  }
  const batch = await f.batch({ count: 25, title: 'search-batch-fixture' });
  const secretValues = [f.password, f.cookie.split('=')[1], f.csrf, ...users.map(u => u.token), ...batch.codes.flatMap(c => [c, c.replaceAll('-', '')])];
  for (const route of ['/users', '/cards?batchId=' + batch.batch.id, '/audit']) {
    const joiner = route.includes('?') ? '&' : '?';
    const one = await f.admin(route + joiner + 'page=1'), two = await f.admin(route + joiner + 'page=2');
    assert.equal(one.page, 1); assert.equal(two.page, 2); assert.equal(one.pageSize, 20); assert.equal(two.pageSize, 20);
    assert.equal(one.total, two.total); assert(one.total >= 25);
    assert.equal(one.items.length, 20); assert(two.items.length > 0);
    assert(!one.items.some(a => two.items.some(b => a.id === b.id)), 'pages must not overlap');
    assertNoSecrets(one, secretValues); assertNoSecrets(two, secretValues);
  }
  const search = await f.admin('/users?q=search-fixture-24'); assert.equal(search.total, 1); assert.equal(search.items[0].id, users[24].user.id);
  assert.equal((await f.admin('/card-batches?q=search-batch-fixture')).total, 1);
  assert.equal((await f.admin('/users?page=999')).items.length, 0);
  for (const route of ['/redemptions', '/card-batches', '/users/' + users[0].user.id, '/assets']) assertNoSecrets(await f.admin(route), secretValues);
  const audit = await f.admin('/audit');
  assert(audit.items.some(item => item.action === 'cards.generate'));
  assert(audit.items.every(item => Number.isFinite(Date.parse(item.createdAt)) && typeof item.detail === 'object'));
});

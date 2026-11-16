'use strict';
// Main-app contract tests: credentials and codes live only in isolated memory and OS temp data.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { once } = require('node:events');
const { createApp } = require('../server/app');
const { hash } = require('../server/security');
const { zip, pdf } = require('./backend-fixtures.cjs');
const ORIGIN = 'http://127.0.0.1:3002';
async function fixture(t) {
  const dataDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'blueprint-website-entitlements-')));
  const app = createApp({ dataDir, production: false, devAuth: true, appSecret: '', publicOrigin: ORIGIN, port: 3002 });
  const store = app.locals.store, adminToken = crypto.randomBytes(32).toString('base64url'), csrf = crypto.randomBytes(32).toString('base64url');
  store.run('INSERT INTO admins VALUES(?,?,?,?)', 'website-test-admin', 'website-test-admin', 'unused-password-no-login', new Date().toISOString());
  store.run('INSERT INTO admin_sessions VALUES(?,?,?,?)', hash(adminToken), 'website-test-admin', csrf, new Date(Date.now() + 3600000).toISOString());
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening'); const base = 'http://127.0.0.1:' + server.address().port;
  t.after(async () => {
    await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }); app.locals.close();
    assert(dataDir.startsWith(fs.realpathSync(os.tmpdir()) + path.sep));
    fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  });
  async function request(route, { method = 'GET', admin = false, user, cookie, json, body, headers: extra = {}, expected = 200 } = {}) {
    const headers = { ...extra };
    if (admin) { headers.Cookie = 'blueprint_admin=' + adminToken; if (method !== 'GET') { headers.Origin = ORIGIN; headers['X-CSRF-Token'] = csrf; } }
    if (user) headers.Authorization = 'Bearer ' + user.token;
    if (cookie) headers.Cookie = cookie;
    if (json !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(base + route, { method, headers, body: json === undefined ? body : JSON.stringify(json), redirect: 'manual', signal: AbortSignal.timeout(10000) });
    const bytes = Buffer.from(await response.arrayBuffer());
    const result = response.headers.get('content-type')?.includes('application/json') ? JSON.parse(bytes.toString()) : null;
    assert.equal(response.status, expected, `${method} ${route.split('/web-access/')[0]} expected ${expected}; ${result?.error || ''}`);
    return { body: result, text: bytes.toString(), bytes, headers: response.headers };
  }
  const admin = async (route, options = {}) => (await request('/api/admin' + route, { ...options, admin: true })).body;
  async function upload(route, filename, bytes) {
    const form = new FormData(); form.append('file', new Blob([bytes]), filename); form.append('title', '真实上传测试');
    return admin(route, { method: 'POST', body: form, expected: 201 });
  }
  const user = async () => (await request('/api/auth/dev', { method: 'POST', json: { deviceId: 'website-test-' + crypto.randomUUID() } })).body;
  const save = tree => admin('/catalog', { method: 'PUT', json: tree });
  const publish = tree => admin('/publish', { method: 'POST', json: { version: tree.version } });
  async function batch(scope, boardIds = []) {
    const result = await admin('/card-batches', { method: 'POST', expected: 201, json: { title: '网页权限测试', count: 1, scope, boardIds, courseIds: [], redeemExpiresAt: null, accessDays: 1 } });
    return result.codes[0];
  }
  async function redeem(account, code) { return (await request('/api/redeem', { method: 'POST', user: account, json: { code } })).body; }
  async function web(account, boardId) {
    const open = (await request('/api/boards/' + boardId + '/open', { method: 'POST', user: account, json: {} })).body;
    assert.match(open.launchPath, /^\/web-access\/[A-Za-z0-9_-]{20,100}$/); assert(!open.launchPath.includes(account.token));
    const landing = await request(open.launchPath); assert.match(landing.text, /web-access-client\.js/); assert.equal(landing.headers.getSetCookie().length, 0);
    // DevTools preflight/inspection must not consume the ticket before the actual web-view script runs.
    await request(open.launchPath);
    const ticket = open.launchPath.split('/').pop();
    await request('/web-session', { method: 'POST', json: { ticket }, headers: { Origin: 'https://untrusted.invalid' }, expected: 403 });
    const exchange = await request('/web-session', { method: 'POST', json: { ticket }, headers: { Origin: ORIGIN } });
    const cookie = exchange.headers.getSetCookie().find(value => value.startsWith('blueprint_web_'));
    assert(cookie); assert.match(cookie, /HttpOnly/i); assert.match(cookie, /SameSite=Lax/i);
    await request('/web-session', { method: 'POST', json: { ticket }, headers: { Origin: ORIGIN }, expected: 401 });
    return { cookie: cookie.split(';')[0], rawCookie: cookie, destination: exchange.body.destination };
  }
  assert.equal((await admin('/session')).authenticated, true);
  return { request, admin, upload, user, save, publish, batch, redeem, web };
}

test('uploaded webpages: board redemption, ticket exchange, path cookies, revocation and all-access remain enforced end to end', async t => {
  const f = await fixture(t), account = await f.user();
  const first = (await f.upload('/websites', 'lesson.html', '<!doctype html><html><body><h1>上传的单页课程</h1></body></html>')).website;
  const second = (await f.upload('/websites', 'lesson.zip', zip({ 'bundle/index.html': '<!doctype html><html><head><link rel="stylesheet" href="style.css"></head><body><h1>压缩网页课程</h1></body></html>', 'bundle/style.css': 'body{color:#143f32}' }))).website;
  const tree = await f.admin('/catalog'), prototype = tree.boards[0];
  const boards = [first, second].map((site, index) => ({ ...structuredClone(prototype), id: 'uploaded-lesson-' + index, title: '上传课程 ' + index, experience: site.slug, categoryIds: [], featured: false }));
  tree.boards.push(...boards);
  await f.save(tree);
  await f.request('/api/boards/' + boards[0].id + '/open', { method: 'POST', user: account, json: {}, expected: 404 });
  await f.publish(await f.admin('/catalog'));
  for (const site of [first, second]) await f.request(site.basePath, { expected: 401 });
  await f.request('/api/boards/' + boards[1].id + '/open', { method: 'POST', user: account, json: {}, expected: 403 });
  const redemption = await f.redeem(account, await f.batch('boards', [boards[1].id]));
  const grant = redemption.grants.find(item => item.scope === 'boards'); assert.deepEqual(grant.boardIds, [boards[1].id]);
  const published = (await f.request('/api/bootstrap', { user: account })).body.boards;
  assert.equal(published.find(board => board.id === boards[0].id).accessible, false);
  assert.equal(published.find(board => board.id === boards[1].id).accessible, true);
  await f.request('/api/boards/' + boards[0].id + '/open', { method: 'POST', user: account, json: {}, expected: 403 });
  const launched = await f.web(account, boards[1].id);
  assert.equal(launched.destination, second.basePath); assert(launched.rawCookie.includes('Path=' + second.basePath.slice(0, -1)));
  const html = await f.request(second.basePath, { cookie: launched.cookie }); assert.match(html.text, /压缩网页课程/);
  assert.match(html.headers.get('content-security-policy'), /sandbox allow-scripts/); assert.doesNotMatch(html.headers.get('content-security-policy'), /allow-same-origin/);
  const css = await f.request(second.basePath + 'style.css', { cookie: launched.cookie }); assert.match(css.text, /#143f32/);
  await f.request(first.basePath, { cookie: launched.cookie, expected: 401 });
  await f.request('/modules/english-chinese-words/', { cookie: launched.cookie, expected: 401 });
  await f.admin('/grants/' + grant.id + '/revoke', { method: 'POST', json: { reason: '测试撤销' } });
  await f.request(second.basePath + 'style.css', { cookie: launched.cookie, expected: 403 });
  await f.request('/api/boards/' + boards[1].id + '/open', { method: 'POST', user: account, json: {}, expected: 403 });
  const allAccount = await f.user(); await f.redeem(allAccount, await f.batch('all'));
  const allLaunch = await f.web(allAccount, boards[1].id); await f.request(second.basePath, { cookie: allLaunch.cookie });
  const firstLaunch = await f.web(allAccount, boards[0].id); await f.request(first.basePath, { cookie: firstLaunch.cookie });
  const edited = await f.admin('/catalog'); edited.boards.find(board => board.id === boards[1].id).enabled = false; await f.publish(await f.save(edited));
  await f.request(second.basePath, { cookie: allLaunch.cookie, expected: 403 });
  await f.request('/api/boards/' + boards[1].id + '/open', { method: 'POST', user: allAccount, json: {}, expected: 404 });
});

test('uploaded webpages: nonexistent package targets reject catalog changes while PDF documents still upload normally', async t => {
  const f = await fixture(t), tree = await f.admin('/catalog');
  tree.boards[0].experience = 'website:missing-package';
  await f.admin('/catalog', { method: 'PUT', json: tree, expected: 400 });
  const document = (await f.upload('/assets', 'lesson.pdf', pdf())).asset;
  assert.equal(document.kind, 'document'); assert.equal(document.fileType, 'pdf');
  const site = (await f.upload('/websites', 'index.html', '<html><body><h1>独立网页</h1></body></html>')).website;
  assert.equal(site.ready, true);
  assert.equal((await f.admin('/websites')).items.length, 1);
  assert((await f.admin('/assets')).items.some(item => item.id === document.id));
});

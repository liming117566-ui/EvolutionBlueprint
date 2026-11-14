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

function noContent(value) {
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    assert(!['chapters', 'sections', 'body', 'question', 'practice', 'legacyMap'].includes(key), `public metadata leaked ${key}`);
    noContent(item);
  }
}
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
  assert.deepEqual(Object.keys(bootstrap).sort(), ['categories', 'settings', 'version']); noContent(bootstrap);
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
  await off.request('/api/auth/dev', { method: 'POST', json: { deviceId: 'fixture-disabled' }, status: 404 });
  // Production with DEV_AUTH is invalid configuration, not a silently usable login bypass.
  assert.throws(() => createApp({ dataDir: f.dataDir, production: true, devAuth: true, publicOrigin: 'https://example.invalid', appSecret: 'test-only-secret' }), /DEV_AUTH/);
  const prod = await fixture(t, { production: true, devAuth: false, publicOrigin: 'https://example.invalid', appSecret: 'test-only-secret' });
  await prod.request('/api/auth/dev', { method: 'POST', json: { deviceId: 'fixture-production' }, status: 404 });
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

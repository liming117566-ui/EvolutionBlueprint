'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const { once } = require('node:events');
const { openDatabase } = require('../server/db');
const { createWebPackages } = require('../server/web-packages');
const { zip } = require('./backend-fixtures.cjs');
async function fixture(t) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'blueprint-website-test-'));
  const store = openDatabase(dataDir); const app = express(), router = express.Router();
  const audit = (actor, action, target, detail) => store.run('INSERT INTO audit(actor,action,target,detail,created_at) VALUES(?,?,?,?,?)', actor, action, target, JSON.stringify(detail || {}), new Date().toISOString());
  const websites = createWebPackages(store, { dataDir, uploadQuota: 200 * 1048576 }, audit);
  router.use((req, _res, next) => { req.admin = { id: 'test-admin' }; next(); }); websites.adminRoutes(router); app.use('/api/admin', router);
  let guardCalls = 0;
  websites.mount(app, (req, _res, next) => { guardCalls++; if (req.get('Authorization') !== 'Bearer test-access') return next(Object.assign(new Error('兑换后访问'), { status: 403 })); next(); });
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening'); const origin = 'http://127.0.0.1:' + server.address().port;
  t.after(async () => { await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }); store.close(); const resolved = fs.realpathSync(dataDir); assert(resolved.startsWith(fs.realpathSync(os.tmpdir()) + path.sep)); fs.rmSync(resolved, { recursive: true, force: true }); });
  async function request(route, options = {}) { const response = await fetch(origin + route, options); const content = await response.text(); let json; try { json = JSON.parse(content); } catch {} return { response, status: response.status, json, content }; }
  async function upload(filename, data, expected = 201) {
    const form = new FormData(); form.append('file', new Blob([data]), filename); form.append('title', '网页测试');
    const result = await request('/api/admin/websites', { method: 'POST', body: form }); assert.equal(result.status, expected, result.content); return result.json?.website;
  }
  return { store, websites, upload, request, dataDir, guardCalls: () => guardCalls };
}
test('websites: single HTML uploads, only entitled access serves sandbox HTML, and unused upload can be removed', async t => {
  const f = await fixture(t), website = await f.upload('lesson.html', '<!doctype html><html><body><h1>静态课程</h1></body></html>');
  assert.equal(website.title, '网页测试'); assert.equal(website.ready, true); assert.match(website.slug, /^website:/);
  assert.equal((await f.request(website.basePath)).status, 403);
  const page = await f.request(website.basePath, { headers: { Authorization: 'Bearer test-access' } });
  assert.equal(page.status, 200); assert.match(page.content, /静态课程/);
  const csp = page.response.headers.get('content-security-policy');
  assert.match(csp, /sandbox allow-scripts allow-forms allow-downloads/); assert.doesNotMatch(csp, /allow-same-origin|top-navigation/); assert.match(csp, /connect-src 'none'/);
  assert.equal(page.response.headers.get('cache-control'), 'no-store'); assert.equal(f.guardCalls(), 2);
  assert.equal((await f.request('/api/admin/websites')).json.items.length, 1);
  assert.equal((await f.request('/api/admin/websites/' + website.id, { method: 'DELETE' })).status, 200);
  assert.equal(f.websites.status(website.id), null);
});
test('websites: nested ZIP entry keeps relative JS/CSS/media accessible behind every guard request', async t => {
  const f = await fixture(t), website = await f.upload('web.zip', zip({ 'lesson/index.html': '<html><body><h1>课程</h1><script src="app.js"></script></body></html>', 'lesson/app.js': 'document.body.dataset.loaded="yes";', 'lesson/style.css': 'body{color:#143f32}', 'lesson/image.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>' }));
  for (const resource of ['', 'app.js', 'style.css', 'image.svg']) assert.equal((await f.request(website.basePath + resource, { headers: { Authorization: 'Bearer test-access' } })).status, 200);
  assert.equal((await f.request(website.basePath + 'app.js')).status, 403);
  assert.equal((await f.request(website.basePath + 'missing.js', { headers: { Authorization: 'Bearer test-access' } })).status, 404);
});
test('websites: invalid file formats and malformed ZIPs never create database rows or folders', async t => {
  const f = await fixture(t);
  await f.upload('shell.php', '<?php ?>', 400); await f.upload('invalid.html', 'not html', 400); await f.upload('invalid.zip', 'PK-invalid', 400);
  assert.equal((await f.request('/api/admin/websites')).json.items.length, 0);
  assert.equal(fs.readdirSync(path.join(f.dataDir, 'web-packages')).length, 0);
});
test('websites: traversal, duplicate-case names, hidden paths, server scripts and ambiguous entry are rejected', async t => {
  const f = await fixture(t), valid = '<html><body>Lesson</body></html>';
  for (const entries of [
    { '../index.html': valid }, { '/index.html': valid }, { 'C:/index.html': valid },
    { 'index.html': valid, 'INDEX.HTML': valid }, { 'index.html': valid, '.env': 'secret' },
    { 'index.html': valid, 'server.php': '<?php ?>' }, { 'first/index.html': valid, 'second/index.html': valid },
    { 'readme.txt': 'No HTML entry' }, { 'index.html': valid, 'CON.js': 'alert(1)' },
    { 'index.html': valid, 'image%2fsecret.png': 'bad path' }
  ]) await f.upload('unsafe.zip', zip(entries), 400);
  assert.equal((await f.request('/api/admin/websites')).json.items.length, 0);
});
test('websites: symbolic link and compression-bomb entries are rejected', async t => {
  const f = await fixture(t), linked = zip({ 'index.html': '<html><body>test</body></html>', 'alias.js': 'index.html' });
  const indexes = []; for (let i = 0; i < linked.length - 46; i++) if (linked.readUInt32LE(i) === 0x02014b50) indexes.push(i);
  linked.writeUInt32LE((0xa1ff << 16) >>> 0, indexes[1] + 38);
  await f.upload('link.zip', linked, 400);
  await f.upload('bomb.zip', zip({ 'index.html': '<html><body>Lesson</body></html>', 'oversize.txt': 'x'.repeat(1024 * 1024) }, { compress: true }), 400);
});
test('websites: draft, published and historical references protect uploaded content from deletion', async t => {
  const f = await fixture(t), website = await f.upload('index.html', '<html><body>Lesson</body></html>');
  const empty = JSON.stringify({ boards: [] }), reference = JSON.stringify({ boards: [{ experience: website.slug }] });
  f.store.run('INSERT INTO catalog VALUES(1,1,?,?,1)', reference, empty);
  const remove = () => f.request('/api/admin/websites/' + website.id, { method: 'DELETE' });
  assert.equal((await remove()).status, 409);
  f.store.run('UPDATE catalog SET draft=?,published=? WHERE id=1', empty, reference); assert.equal((await remove()).status, 409);
  f.store.run('UPDATE catalog SET draft=?,published=? WHERE id=1', empty, empty); f.store.run('INSERT INTO revisions VALUES(1,?,?)', reference, new Date().toISOString());
  assert.equal((await remove()).status, 409); assert.equal(f.websites.status(website.id).ready, true);
});

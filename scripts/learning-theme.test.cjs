'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const express = require('express');
const { themedStatic } = require('../server/themed-static');

async function fixture(t) {
  const temporary = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'xinbotu-theme-test-')));
  const root = path.join(temporary, 'site'); fs.mkdirSync(path.join(root, 'nested'), { recursive: true });
  fs.writeFileSync(path.join(root, 'index.html'), '<!doctype html><html lang="zh-CN"><head><title>课程</title></head><body><button onclick="practice()">练习</button><script src="app.js"></script></body></html>');
  fs.copyFileSync(path.join(root, 'index.html'), path.join(root, 'nested', 'index.html'));
  fs.writeFileSync(path.join(root, 'app.js'), 'function practice(){return 42;}');
  fs.writeFileSync(path.join(temporary, 'private.html'), 'PRIVATE');
  const app = express();
  app.use('/module', (req, res, next) => {
    if (req.get('X-Test-Entitled') !== 'yes') return res.status(403).send('locked');
    res.set('Content-Security-Policy', "sandbox allow-scripts; default-src 'self'"); next();
  }, themedStatic(root, { index: 'index.html', dotfiles: 'deny' }));
  app.use((_req, res) => res.status(404).end());
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = 'http://127.0.0.1:' + server.address().port;
  t.after(async () => {
    await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
    assert.equal(path.dirname(temporary), fs.realpathSync(os.tmpdir()));
    assert(path.basename(temporary).startsWith('xinbotu-theme-test-'));
    fs.rmSync(temporary, { recursive: true, force: true });
  });
  return { request: (route, entitled = true) => fetch(base + route, { headers: entitled ? { 'X-Test-Entitled': 'yes' } : {}, redirect: 'manual' }) };
}

test('learning theme: nested pages keep lesson markup, scripts and sandbox while using the board-scoped stylesheet', async t => {
  const f = await fixture(t);
  for (const route of ['/module/', '/module/index.html', '/module/nested/']) {
    const response = await f.request(route), html = await response.text();
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-security-policy'), /^sandbox allow-scripts;/);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.match(html, /data-xinbotu-learning="sunrise"/);
    assert.match(html, /href="\/module\/xinbotu-theme\.css"/);
    assert.match(html, /<button onclick="practice\(\)">练习<\/button>/);
    assert.match(html, /<script src="app\.js"><\/script>/);
  }
  assert.equal(await (await f.request('/module/app.js')).text(), 'function practice(){return 42;}');
  const css = await f.request('/module/xinbotu-theme.css'); assert.equal(css.status, 200); assert.match(await css.text(), /--xbt-yellow: #f8d849/);
});

test('learning theme: original guard protects HTML and CSS, and encoded traversal cannot expose outside files', async t => {
  const f = await fixture(t);
  for (const route of ['/module/', '/module/xinbotu-theme.css', '/module/app.js']) assert.equal((await f.request(route, false)).status, 403);
  for (const route of ['/module/%2e%2e%2fprivate.html', '/module/nested%2f..%2f..%2fprivate.html']) {
    const response = await f.request(route); assert.notEqual(response.status, 200); assert(!((await response.text()).includes('PRIVATE')));
  }
});

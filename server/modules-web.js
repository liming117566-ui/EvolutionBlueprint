const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const { modules, find, basePath } = require('../miniprogram/utils/integrations');
const root = path.join(__dirname, 'modules-web');
// These supplied courses retain their original pages and visual design.
const originalUi = new Set(['geometry-between', 'geo-bio-exam', 'math-between-grade7']);
function status(slug) {
  const module = find(slug);
  if (!module) return null;
  return { slug, title: module.title, ready: fs.existsSync(path.join(root, slug, 'index.html')), basePath: basePath(slug) };
}
function mount(app, guard) {
  for (const module of modules) {
    const serve = originalUi.has(module.slug) ? express.static : require('./themed-static').themedStatic;
    app.use(basePath(module.slug).slice(0, -1), guard(module.slug), (_req, res, next) => {
      res.set('X-Content-Type-Options', 'nosniff');
      res.set('Referrer-Policy', 'same-origin');
      res.set('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self' data:; media-src 'self' blob:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'self'; form-action 'self'");
      next();
    }, serve(path.join(root, module.slug), { index: 'index.html', dotfiles: 'deny', etag: false, setHeaders(res) { res.set('Cache-Control', 'no-store'); } }),
    (_req, res) => res.status(status(module.slug).ready ? 404 : 503).json({ error: status(module.slug).ready ? '学习资源不存在' : module.title + '暂时不可用，请先构建学习模块' }));
  }
}
module.exports = { mount, status, list: () => modules.map(module => status(module.slug)) };

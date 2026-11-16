const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const root = path.resolve(__dirname, 'junior-math-web');
function status() {
  return { ready: fs.existsSync(path.join(root, 'index.html')), basePath: '/junior-math/' };
}
function mount(app, guard) {
  app.use('/junior-math', guard, (_req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'same-origin');
    res.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self' data:; object-src 'none'; base-uri 'self'");
    next();
  }, require('./themed-static').themedStatic(root, { index: 'index.html', dotfiles: 'deny', etag: true, setHeaders(res) { res.set('Cache-Control', 'no-store'); } }),
  (_req, res) => res.status(status().ready ? 404 : 503).json({ error: status().ready ? '课程资源不存在' : '初中数学暂时不可用' }));
}
module.exports = { mount, status };

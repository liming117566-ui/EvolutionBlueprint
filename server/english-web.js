const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const root = path.resolve(__dirname, 'english-web');
function status() {
  return { ready: fs.existsSync(path.join(root, 'index.html')), basePath: '/english/' };
}
function mount(app, guard) {
  // Public learning documents have their own policy. Admin pages keep their stricter policy.
  app.use('/english', guard, (_req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'same-origin');
    res.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; font-src 'self' data:; object-src 'none'; base-uri 'self'");
    next();
  }, require('./themed-static').themedStatic(root, {
    index: 'index.html', dotfiles: 'deny', etag: true,
    setHeaders(res, file) {
      res.set('Cache-Control', 'no-store');
    }
  }), (_req, res) => res.status(status().ready ? 404 : 503).json({ error: status().ready ? '学习资源不存在' : '英语学习空间暂时不可用' }));
}
module.exports = { mount, status };

const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const root = path.resolve(__dirname, 'math-web');
function status() {
  return { ready: ['index.html', 'diagnose/app.js', 'data/topics.json', 'data/questions.json'].every(file => fs.existsSync(path.join(root, file))), basePath: '/math/' };
}
function mount(app, guard) {
  app.use('/math', guard, (_req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'same-origin');
    res.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self' data:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'");
    next();
  }, require('./themed-static').themedStatic(root, {
    index: 'index.html', dotfiles: 'deny', etag: true,
    setHeaders(res) { res.set('Cache-Control', 'no-store'); }
  }), (_req, res) => res.status(status().ready ? 404 : 503).json({ error: status().ready ? '数学资源不存在' : '数学学习空间暂时不可用' }));
}
module.exports = { mount, status };

'use strict';
// Apply the app's current visual system at delivery time, including nested static pages.
// This wraps static delivery only: callers must mount their entitlement guard first.
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const THEME = path.join(__dirname, 'learning-theme.css');
function themedStatic(root, options = {}) {
  const absolute = path.resolve(root);
  const fallback = express.static(absolute, options);
  return (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return fallback(req, res, next);
    if (req.path === '/xinbotu-theme.css') {
      res.set('Cache-Control', 'no-store');
      return res.type('css').sendFile(THEME);
    }
    let pathname;
    try { pathname = decodeURIComponent(req.path); } catch (_) { return fallback(req, res, next); }
    if (pathname.includes('\0') || pathname.includes('\\') || pathname.split('/').some(part => part.startsWith('.'))) return fallback(req, res, next);
    if (pathname.endsWith('/')) pathname += typeof options.index === 'string' ? options.index : 'index.html';
    if (!/\.html?$/i.test(pathname)) return fallback(req, res, next);
    const file = path.resolve(absolute, '.' + pathname);
    if (!file.startsWith(absolute + path.sep)) return fallback(req, res, next);
    fs.readFile(file, 'utf8', (error, source) => {
      if (error) return fallback(req, res, next);
      const href = req.baseUrl + '/xinbotu-theme.css';
      const link = '<link rel="stylesheet" data-xinbotu-theme href="' + href.replace(/["<>&]/g, '') + '">';
      const autoDark = /^\/(?:english|math)$/.test(req.baseUrl) ? ' data-xinbotu-auto-dark="true"' : '';
      let html = source.replace(/<html\b/i, '<html data-xinbotu-learning="sunrise"' + autoDark);
      if (!html.includes('data-xinbotu-theme')) html = /<\/head\s*>/i.test(html) ? html.replace(/<\/head\s*>/i, link + '</head>') : link + html;
      res.set('Cache-Control', 'no-store');
      res.type('html').send(html);
    });
  };
}
module.exports = { themedStatic };

'use strict';
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const multer = require('multer');
const yauzl = require('yauzl');
const { id, now, fail, text, limiter } = require('./security');
const MAX_HTML = 5 * 1048576, MAX_ZIP = 50 * 1048576, MAX_EXPANDED = 100 * 1048576;
const EXTENSIONS = new Set('html htm css js mjs json txt csv xml svg png jpg jpeg gif webp avif ico woff woff2 ttf otf mp3 wav ogg m4a mp4 webm pdf wasm map vtt'.split(' '));
const CSP = "sandbox allow-scripts allow-forms allow-downloads; default-src 'self' data: blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' data: blob:; font-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'";
function assertDirectory(dir) {
  let current = path.resolve(dir);
  while (true) {
    if (fs.lstatSync(current).isSymbolicLink()) fail(500, '网页存储目录不得包含符号链接');
    const parent = path.dirname(current); if (parent === current) return; current = parent;
  }
}
function safeName(value) {
  if (typeof value !== 'string' || value.length > 240 || value.includes('\\') || /^[\/]/.test(value) || /[\x00-\x1f\x7f:#?%]/.test(value)) fail(400, '网页包包含非法路径');
  const pieces = value.replace(/\/$/, '').split('/');
  if (pieces.some(piece => !piece || piece === '.' || piece === '..' || piece.startsWith('.') || /[. ]$/.test(piece) || /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(piece))) fail(400, '网页包包含非法路径');
  return pieces.join('/');
}
function checkFile(name) {
  const extension = path.posix.extname(name).slice(1).toLowerCase();
  if (!EXTENSIONS.has(extension)) fail(400, '网页包仅支持静态网页、脚本、样式、图片、字体及音视频文件，不接受服务器程序');
}
function htmlBytes(buffer) {
  const source = buffer.toString('utf8').replace(/^\uFEFF/, '');
  if (!/<(?:!doctype\s+html|html|head|body|main|div|script|h[1-6])\b/i.test(source) || source.includes('\0')) fail(400, '文件不是有效的 HTML 网页');
}
async function unpack(buffer) {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true, autoClose: true, validateEntrySizes: true }, (error, zip) => {
      if (error) return reject(Object.assign(new Error('ZIP 网页包损坏或不受支持'), { status: 400 }));
      const files = [], names = new Set(); let expanded = 0, count = 0, stopped = false;
      const stop = error => { if (stopped) return; stopped = true; zip.close(); reject(error.status ? error : Object.assign(new Error('ZIP 网页包读取失败'), { status: 400 })); };
      zip.on('error', stop);
      zip.on('entry', entry => {
        try {
          if (++count > 3000 || entry.generalPurposeBitFlag & 1) fail(400, '网页包文件过多或使用了加密');
          const name = safeName(entry.fileName), lower = name.toLowerCase();
          const mode = (entry.externalFileAttributes >>> 16) & 0xf000;
          if (mode && mode !== 0x8000 && mode !== 0x4000) fail(400, '网页包不支持符号链接或特殊文件');
          if (names.has(lower)) fail(400, '网页包包含重名路径'); names.add(lower);
          if (entry.fileName.endsWith('/')) { zip.readEntry(); return; }
          checkFile(name);
          if (entry.uncompressedSize > MAX_EXPANDED || (expanded += entry.uncompressedSize) > MAX_EXPANDED || entry.uncompressedSize / Math.max(1, entry.compressedSize) > 500) fail(400, '网页包解压大小或压缩比例超过限制');
          zip.openReadStream(entry, (streamError, stream) => {
            if (streamError) return stop(streamError);
            const chunks = []; let size = 0;
            stream.on('error', stop);
            stream.on('data', chunk => { size += chunk.length; if (size > entry.uncompressedSize || size > MAX_EXPANDED) { stream.destroy(); stop(Object.assign(new Error('网页包大小异常'), { status: 400 })); } else chunks.push(chunk); });
            stream.on('end', () => { if (!stopped) { files.push({ name, data: Buffer.concat(chunks) }); zip.readEntry(); } });
          });
        } catch (error) { stop(error); }
      });
      zip.on('end', () => {
        if (stopped) return;
        const indexes = files.filter(file => /(?:^|\/)index\.html?$/i.test(file.name));
        if (indexes.length !== 1) return stop(Object.assign(new Error('网页包须包含且只包含一个 index.html 或 index.htm 入口'), { status: 400 }));
        try { htmlBytes(indexes[0].data); } catch (error) { return stop(error); }
        stopped = true; resolve({ files, entry: indexes[0].name, size: expanded });
      });
      zip.readEntry();
    });
  });
}
function createWebPackages(store, config, audit) {
  store.db.exec('CREATE TABLE IF NOT EXISTS web_packages(id TEXT PRIMARY KEY,title TEXT NOT NULL,storage_name TEXT NOT NULL UNIQUE,entry TEXT NOT NULL,size_bytes INTEGER NOT NULL,created_at TEXT NOT NULL)');
  const directory = path.join(config.dataDir, 'web-packages'); fs.mkdirSync(directory, { recursive: true }); assertDirectory(directory);
  const root = fs.realpathSync(directory);
  const removeFolder = target => {
    const absolute = path.resolve(target);
    if (path.dirname(absolute) !== root || !/^(?:pending-)?[A-Za-z0-9_-]+$/.test(path.basename(absolute))) fail(500, '网页存储目录无效');
    if (fs.existsSync(absolute)) assertDirectory(absolute);
    fs.rmSync(absolute, { recursive: true, force: true });
  };
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_ZIP, files: 1, fields: 1, parts: 2, fieldSize: 1000 } }).single('file');
  let active = 0;
  const folder = row => {
    if (!/^[A-Za-z0-9_-]+$/.test(row.storage_name)) fail(404, '网页包不存在');
    const target = path.join(root, row.storage_name); assertDirectory(target); return target;
  };
  function status(packageId) {
    const row = store.get('SELECT * FROM web_packages WHERE id=?', packageId);
    if (!row) return null;
    let ready = false; try { ready = fs.statSync(path.join(folder(row), row.entry)).isFile(); } catch (_) {}
    return { id: row.id, slug: 'website:' + row.id, title: row.title, ready, basePath: '/websites/' + row.id + '/', sizeBytes: row.size_bytes, createdAt: row.created_at };
  }
  function referenced(packageId) {
    const matches = raw => (JSON.parse(raw).boards || []).some(board => board.experience === 'website:' + packageId);
    const tree = store.get('SELECT draft,published FROM catalog WHERE id=1');
    return !!tree && (matches(tree.draft) || matches(tree.published)) || store.all('SELECT body FROM revisions').some(row => matches(row.body));
  }
  function adminRoutes(router) {
    router.get('/websites', (_req, res) => res.json({ items: store.all('SELECT id FROM web_packages ORDER BY created_at DESC').map(row => status(row.id)) }));
    router.post('/websites', limiter(10, 60000), (req, res, next) => {
      if (active >= 2) return next(Object.assign(new Error('网页上传任务繁忙，请稍后再试'), { status: 429 })); active++;
      upload(req, res, async error => {
        let temporary;
        try {
          if (error) fail(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400, '上传失败：每次一个 HTML 或 ZIP，ZIP 不超过 50 MiB');
          if (!req.file?.buffer.length || req.aborted) fail(400, '请选择非空网页文件');
          const original = text(Buffer.from(req.file.originalname, 'latin1').toString('utf8'), 180);
          if (/[\\/]/.test(original)) fail(400, '文件名称无效');
          const extension = path.extname(original).toLowerCase(), title = text(req.body.title || original, 200);
          let content;
          if (extension === '.html' || extension === '.htm') {
            if (req.file.size > MAX_HTML) fail(413, '单个 HTML 不超过 5 MiB');
            htmlBytes(req.file.buffer); content = { files: [{ name: 'index.html', data: req.file.buffer }], entry: 'index.html', size: req.file.size };
          } else if (extension === '.zip') content = await unpack(req.file.buffer);
          else fail(400, '网页上传仅支持 HTML、HTM 或 ZIP');
          const used = store.get('SELECT COALESCE(SUM(size_bytes),0) AS n FROM web_packages').n;
          if (used + content.size > (config.uploadQuota || 1073741824)) fail(413, '网页存储已达到配额');
          assertDirectory(root);
          const packageId = id(); temporary = path.join(root, 'pending-' + packageId); fs.mkdirSync(temporary, { mode: 0o700 });
          for (const file of content.files) {
            const target = path.resolve(temporary, ...file.name.split('/'));
            if (!target.startsWith(temporary + path.sep)) fail(400, '网页包包含非法路径');
            fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, file.data, { flag: 'wx', mode: 0o600 });
          }
          const destination = path.join(root, packageId); fs.renameSync(temporary, destination); temporary = destination;
          store.transaction(() => { store.run('INSERT INTO web_packages VALUES(?,?,?,?,?,?)', packageId, title, packageId, content.entry, content.size, now()); audit(req.admin.id, 'website.upload', packageId, { size: content.size, files: content.files.length }); });
          temporary = null; res.status(201).json({ website: status(packageId) });
        } catch (error) { if (temporary) removeFolder(temporary); next(error); }
        finally { active--; if (req.file) req.file.buffer = null; }
      });
    });
    router.delete('/websites/:id', (req, res) => {
      const row = store.get('SELECT * FROM web_packages WHERE id=?', req.params.id); if (!row) fail(404, '网页包不存在');
      if (referenced(row.id)) fail(409, '网页已被草稿、已发布板块或历史版本引用，不能删除');
      const target = folder(row);
      store.transaction(() => { store.run('DELETE FROM web_packages WHERE id=?', row.id); audit(req.admin.id, 'website.delete', row.id); });
      removeFolder(target); res.json({ ok: true });
    });
  }
  function mount(app, guard) {
    if (typeof guard !== 'function') throw new Error('网页服务必须配置访问权限校验');
    app.use('/websites/:id', guard, (req, res, next) => {
      try {
        const row = store.get('SELECT * FROM web_packages WHERE id=?', req.params.id); if (!row) fail(404, '网页包不存在');
        const packageRoot = folder(row), entryRoot = path.dirname(path.join(packageRoot, row.entry));
        res.set('Content-Security-Policy', CSP); res.set('X-Content-Type-Options', 'nosniff'); res.set('Referrer-Policy', 'no-referrer'); res.set('Cache-Control', 'no-store');
        // Avoid inheriting an admin/global DENY header if the caller mounts after global middleware.
        res.removeHeader('X-Frame-Options');
        require('./themed-static').themedStatic(entryRoot, { index: path.basename(row.entry), dotfiles: 'deny', etag: false, redirect: false, setHeaders(response) { response.set('Cache-Control', 'no-store'); } })(req, res, error => error ? next(error) : next(Object.assign(new Error('网页资源不存在'), { status: 404 })));
      } catch (error) { next(error); }
    });
  }
  return { adminRoutes, status, mount };
}
module.exports = { createWebPackages };

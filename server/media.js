const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const yauzl = require('yauzl');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { id, now, text, fail, paging, limiter } = require('./security');
const { asyncRoute } = require('./auth');
const catalog = require('./catalog');
const { createMaterialsRouter } = require('./materials');
const MAX = 20 * 1024 * 1024;
function checkDocx(buffer) {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true, validateEntrySizes: true }, (error, zip) => {
      if (error) return reject(Object.assign(new Error('Word 文档结构无效'), { status: 400 }));
      let count = 0, total = 0; const names = new Set(); let done = false;
      const stop = message => { if (done) return; done = true; zip.close(); reject(Object.assign(new Error(message), { status: 400 })); };
      zip.on('error', () => stop('Word 文档结构损坏'));
      zip.on('entry', entry => {
        const name = entry.fileName;
        if (++count > 2000 || (entry.generalPurposeBitFlag & 1) || /(^\/|\\|(^|\/)\.\.\/|vbaProject|macros)/i.test(name) || entry.uncompressedSize > MAX || (total += entry.uncompressedSize) > MAX * 4 || entry.uncompressedSize / Math.max(1, entry.compressedSize) > 500) return stop('Word 文件含不支持的加密、宏或异常压缩结构');
        names.add(name); zip.readEntry();
      });
      zip.on('end', () => { if (done) return; done = true; if (!names.has('[Content_Types].xml') || !names.has('word/document.xml')) return reject(Object.assign(new Error('此 ZIP 文件不是有效的 DOCX 文档'), { status: 400 })); resolve(); });
      zip.readEntry();
    });
  });
}
function samePath(a, b) {
  const normalized = value => { const result = path.resolve(value); return process.platform === 'win32' ? result.toLowerCase() : result; };
  try { return normalized(fs.realpathSync(a)) === normalized(fs.realpathSync(b)); }
  catch (_) { return normalized(a) === normalized(b); }
}
function assertNoLinks(value) {
  let current = path.resolve(value);
  while (true) {
    if (fs.lstatSync(current).isSymbolicLink()) fail(500, '上传目录不得包含符号链接');
    const parent = path.dirname(current);
    if (parent === current) return;
    current = parent;
  }
}
function createMedia(store, config, auth, business, audit) {
  const filesDir = path.join(config.dataDir, 'uploads');
  fs.mkdirSync(filesDir, { recursive: true });
  assertNoLinks(filesDir);
  const root = fs.realpathSync(filesDir);
  let active = 0;
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX, files: 1, fields: 1, fieldSize: 1000, parts: 2, fieldNameSize: 50 } }).single('file');
  const assetView = row => ({ id: row.id, title: row.title, originalName: row.original_name, kind: row.kind, fileType: row.file_type, sizeBytes: row.size_bytes, url: row.kind === 'image' ? '/api/assets/' + row.id : '/api/admin/assets/' + row.id + '/file', createdAt: row.created_at });
  function checkedPath(row) {
    assertNoLinks(root);
    const target = path.join(root, row.storage_name);
    if (path.dirname(target) !== root) fail(404, '文件不存在');
    let stat; try { stat = fs.lstatSync(target); } catch (_) { fail(404, '文件不存在'); }
    if (!stat.isFile() || stat.isSymbolicLink() || path.dirname(target) !== root || !samePath(fs.realpathSync(target), target) || stat.size !== row.size_bytes) fail(404, '文件不存在或已变更');
    return target;
  }
  function sendAsset(row, res) {
    const target = checkedPath(row);
    const mime = { pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', webp: 'image/webp' };
    res.set('Cache-Control', 'no-store'); res.set('X-Content-Type-Options', 'nosniff');
    res.type(mime[row.file_type] || 'application/octet-stream');
    if (row.kind === 'document') res.attachment(row.original_name);
    res.sendFile(target);
  }
  function materialView(row) { return { id: row.id, assetId: row.asset_id, title: row.title, scope: row.scope, ownerId: row.owner_id, sortOrder: row.sort_order, published: !!row.published }; }
  function materialInput(input) {
    const asset = store.get("SELECT * FROM assets WHERE id=? AND kind='document'", input.assetId);
    if (!asset) fail(400, '请选择已上传的 PDF 或 Word');
    if (!['course', 'chapter', 'section'].includes(input.scope)) fail(400, '请选择课程、章节或小章节归属');
    const tree = catalog.draft(store);
    const exists = input.scope === 'course' ? tree.courses.some(c => c.id === input.ownerId) : catalog.entries(tree).some(e => e.type === input.scope && e.id === input.ownerId);
    if (!exists) fail(400, '资料归属不存在，请先保存课程草稿');
    const sort = input.sortOrder === undefined ? 0 : input.sortOrder;
    if (!Number.isInteger(sort) || sort < 0 || sort > 100000) fail(400, '排序值须为 0–100000 的整数');
    return { assetId: asset.id, title: text(input.title, 200), scope: input.scope, ownerId: input.ownerId, sortOrder: sort, published: input.published === true };
  }
  function adminRoutes(router) {
    router.get('/assets', (req, res) => {
      const p = paging(req.query), q = '%' + text(req.query.q || '', 100, false) + '%';
      res.json({ ...p, items: store.all('SELECT * FROM assets WHERE title LIKE ? ORDER BY created_at DESC LIMIT ? OFFSET ?', q, p.pageSize, p.offset).map(assetView), total: store.get('SELECT count(*) AS n FROM assets WHERE title LIKE ?', q).n });
    });
    router.post('/assets', limiter(30, 60000), (req, res, next) => {
      if (active >= 3) return next(Object.assign(new Error('上传任务繁忙，请稍后再试'), { status: 429 }));
      active++;
      upload(req, res, async error => {
        try {
          if (error) fail(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400, '上传失败：每次一个文件，文档不超过 20 MiB');
          const file = req.file;
          if (!file || !file.buffer.length || req.aborted) fail(400, '请选择非空文件');
          const original = text(Buffer.from(file.originalname, 'latin1').toString('utf8'), 180);
          if (/[\\/\x00-\x1f]/.test(original)) fail(400, '文件名称无效');
          let type = path.extname(original).slice(1).toLowerCase(), kind, data = file.buffer;
          if (['png', 'jpg', 'jpeg', 'webp'].includes(type)) {
            if (data.length > 5 * 1024 * 1024) fail(413, '图片不超过 5 MiB');
            try {
              const image = sharp(data, { limitInputPixels: 16000000, failOn: 'warning' });
              const meta = await image.metadata();
              if (!['png', 'jpeg', 'webp'].includes(meta.format) || (meta.pages || 1) > 1) fail(400, '只接受静态 PNG、JPEG、WebP 图片');
              data = await image.rotate().webp({ quality: 88 }).timeout({ seconds: 5 }).toBuffer();
            } catch (_) { fail(400, '图片无法解码、尺寸过大或格式不支持'); }
            kind = 'image'; type = 'webp';
          } else if (type === 'pdf') {
            if (!data.subarray(0, 5).equals(Buffer.from('%PDF-'))) fail(400, 'PDF 文件格式不匹配'); kind = 'document';
          } else if (type === 'doc') {
            if (!data.subarray(0, 8).equals(Buffer.from([0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1]))) fail(400, 'Word 文件格式不匹配'); kind = 'document';
          } else if (type === 'docx') { await checkDocx(data); kind = 'document'; }
          else fail(400, '只支持 PNG、JPEG、WebP、PDF、DOC、DOCX');
          const size = store.get('SELECT COALESCE(SUM(size_bytes),0) AS n FROM assets').n;
          if (size + data.length > config.uploadQuota) fail(413, '资料存储已达到配额，请清理未引用文件');
          const assetId = id(), storageName = assetId + '.' + type;
          const target = path.join(root, storageName);
          const title = text(req.body.title || original, 200);
          await fs.promises.writeFile(target, data, { flag: 'wx', mode: 0o600 });
          try {
            store.transaction(() => {
              store.run('INSERT INTO assets VALUES(?,?,?,?,?,?,?,?,?)', assetId, title, original, storageName, type, kind, data.length, crypto.createHash('sha256').update(data).digest('hex'), now());
              audit(req.admin.id, 'asset.upload', assetId, { kind, size: data.length });
            });
          } catch (e) { await fs.promises.unlink(target).catch(() => {}); throw e; }
          res.status(201).json({ asset: assetView(store.get('SELECT * FROM assets WHERE id=?', assetId)) });
        } catch (e) { next(e); } finally { active--; if (req.file) req.file.buffer = null; }
      });
    });
    router.get('/assets/:id/file', (req, res) => { const row = store.get('SELECT * FROM assets WHERE id=?', req.params.id); if (!row) fail(404, '文件不存在'); sendAsset(row, res); });
    router.delete('/assets/:id', (req, res) => {
      const row = store.get('SELECT * FROM assets WHERE id=?', req.params.id); if (!row) fail(404, '文件不存在');
      const target = '/api/assets/' + row.id;
      const ref = store.get('SELECT id FROM materials WHERE asset_id=?', row.id) || store.all('SELECT body FROM revisions').some(r => JSON.stringify(JSON.parse(r.body)).includes(target)) || JSON.stringify(catalog.draft(store)).includes(target);
      if (ref) fail(409, '资源仍被课程、资料或已发布版本引用，不能删除');
      const filePath = checkedPath(row);
      store.transaction(() => { store.run('DELETE FROM assets WHERE id=?', row.id); audit(req.admin.id, 'asset.delete', row.id); });
      fs.unlinkSync(filePath); res.json({ ok: true });
    });
    router.get('/materials', (_req, res) => res.json({ items: store.all('SELECT * FROM materials ORDER BY sort_order,id').map(materialView) }));
    router.post('/materials', (req, res) => {
      const value = materialInput(req.body), materialId = id();
      store.run('INSERT INTO materials VALUES(?,?,?,?,?,?,?)', materialId, value.assetId, value.title, value.scope, value.ownerId, value.sortOrder, value.published ? 1 : 0);
      audit(req.admin.id, 'material.create', materialId); res.status(201).json({ material: materialView(store.get('SELECT * FROM materials WHERE id=?', materialId)) });
    });
    router.put('/materials/:id', (req, res) => {
      if (!store.get('SELECT id FROM materials WHERE id=?', req.params.id)) fail(404, '资料不存在');
      const value = materialInput(req.body);
      store.run('UPDATE materials SET asset_id=?,title=?,scope=?,owner_id=?,sort_order=?,published=? WHERE id=?', value.assetId, value.title, value.scope, value.ownerId, value.sortOrder, value.published ? 1 : 0, req.params.id);
      audit(req.admin.id, 'material.update', req.params.id); res.json({ material: materialView(store.get('SELECT * FROM materials WHERE id=?', req.params.id)) });
    });
    router.delete('/materials/:id', (req, res) => { store.run('DELETE FROM materials WHERE id=?', req.params.id); audit(req.admin.id, 'material.delete', req.params.id); res.json({ ok: true }); });
  }
  function assetRoute(req, res, next) {
    const row = store.get("SELECT * FROM assets WHERE id=? AND kind='image'", req.params.id);
    if (!row) fail(404, '图片不存在');
    const ref = '/api/assets/' + row.id;
    const tree = catalog.published(store);
    const publicTree = { settings: tree.settings, boards: (tree.boards || []).filter(b => b.enabled).map(b => ({ icon: b.icon, cover: b.cover, features: b.features.map(f => ({ icon: f.icon })) })), courses: tree.courses.filter(c => c.published).map(c => ({ cover: c.cover })) };
    if (JSON.stringify(publicTree).includes(ref)) return sendAsset(row, res);
    auth.admin(req, res, error => { if (error) return next(Object.assign(new Error('图片不存在'), { status: 404 })); sendAsset(row, res); });
  }
  const materialRouter = createMaterialsRouter({ filesDir: root,
    getEntries: () => store.all('SELECT m.*,a.storage_name FROM materials m JOIN assets a ON a.id=m.asset_id WHERE m.published=1 ORDER BY m.sort_order,m.id').map(r => ({ id: r.id, title: r.title, file: r.storage_name, scope: r.scope, ownerId: r.owner_id })),
    authorize: (req, entry) => {
      const course = catalog.findOwner(catalog.published(store), entry.scope, entry.ownerId);
      if (!course) fail(404, '资料所属内容不存在或未发布');
      business.access(req.user.id, course.id);
    }
  });
  return { adminRoutes, assetRoute, materialRouter, filesDir: root };
}
module.exports = { createMedia, checkDocx };

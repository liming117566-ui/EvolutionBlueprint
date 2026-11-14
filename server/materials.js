const express = require('express');
const fs = require('node:fs');
const path = require('node:path');

const MAX_SIZE_BYTES = 20 * 1024 * 1024;
const ID = /^[A-Za-z0-9_-]{1,100}$/;
const MIME_TYPES = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
};

function validOwner(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 100 && value.trim() === value && !/[\x00-\x1f\x7f]/.test(value);
}
function fileType(file) {
  if (typeof file !== 'string' || file.length > 180 || !file || file.trim() !== file ||
      /[\\/<>:"|?*%\x00-\x1f\x7f]/.test(file) || file.includes('..') || file.startsWith('.') ||
      /^(con|prn|aux|nul|com[1-9]|lpt[1-9])\./i.test(file)) return null;
  const match = /\.(pdf|docx?)$/i.exec(file);
  return match ? match[1].toLowerCase() : null;
}
function validEntry(entry) {
  return entry && typeof entry === 'object' && typeof entry.id === 'string' && ID.test(entry.id) &&
    (['course', 'topic', 'chapter', 'section'].includes(entry.scope)) && validOwner(entry.ownerId) &&
    typeof entry.title === 'string' && entry.title.trim() && entry.title.length <= 200 &&
    !/[\x00-\x1f\x7f]/.test(entry.title) && fileType(entry.file);
}
async function samePath(a, b) {
  try {
    const canonical = async value => { const result = path.resolve(await fs.promises.realpath(value)); return process.platform === 'win32' ? result.toLowerCase() : result; };
    return (await canonical(a)) === (await canonical(b));
  } catch (_) { return path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase(); }
}
function validSignature(header, type) {
  if (type === 'pdf') return header.subarray(0, 5).equals(Buffer.from('%PDF-'));
  if (type === 'doc') return header.equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
  return header.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
}

async function noSymlinkAncestors(value) {
  let current = path.resolve(value);
  while (true) {
    if ((await fs.promises.lstat(current)).isSymbolicLink()) return false;
    const parent = path.dirname(current);
    if (parent === current) return true;
    current = parent;
  }
}
// Optional paths let isolated tests use temporary fixtures; production needs no options.
function createMaterialsRouter(options = {}) {
  const catalogPath = path.resolve(options.catalogPath || path.join(__dirname, 'materials', 'catalog.json'));
  const filesDir = path.resolve(options.filesDir || path.join(__dirname, 'materials', 'files'));
  const router = express.Router();

  async function catalog() {
    const entries = options.getEntries ? await options.getEntries() : JSON.parse(await fs.promises.readFile(catalogPath, 'utf8'));
    if (!Array.isArray(entries)) throw new Error('Invalid material catalog');
    const counts = new Map();
    for (const entry of entries) if (entry && typeof entry.id === 'string') counts.set(entry.id, (counts.get(entry.id) || 0) + 1);
    // Invalid entries and ambiguous IDs are never published.
    return entries.filter(entry => validEntry(entry) && counts.get(entry.id) === 1);
  }

  async function availableFile(entry) {
    let handle;
    try {
      // Reject both file symlinks and a symlinked files directory (including ancestors).
      const rootStat = await fs.promises.lstat(filesDir);
      if (!rootStat.isDirectory() || rootStat.isSymbolicLink() || !(await noSymlinkAncestors(filesDir)) || !(await samePath(await fs.promises.realpath(filesDir), filesDir))) return null;
      const target = path.resolve(filesDir, entry.file);
      if (path.dirname(target) !== filesDir) return null;
      const before = await fs.promises.lstat(target);
      if (!before.isFile() || before.isSymbolicLink() || before.size <= 0 || before.size > MAX_SIZE_BYTES) return null;
      if (!(await samePath(await fs.promises.realpath(target), target))) return null;
      handle = await fs.promises.open(target, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
      const stat = await handle.stat();
      // Recheck after opening; serve the checked descriptor, not a path reopened later.
      if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_SIZE_BYTES || stat.dev !== before.dev || stat.ino !== before.ino || stat.size !== before.size ||
          !(await samePath(await fs.promises.realpath(target), target))) {
        await handle.close(); return null;
      }
      const header = Buffer.alloc(8);
      const { bytesRead } = await handle.read(header, 0, header.length, 0);
      if (bytesRead < 8 || !validSignature(header, fileType(entry.file))) { await handle.close(); return null; }
      return { handle, sizeBytes: stat.size };
    } catch (error) {
      if (handle) await handle.close().catch(() => {});
      if (['ENOENT', 'ENOTDIR', 'ELOOP', 'EACCES', 'EPERM'].includes(error.code)) return null;
      throw error;
    }
  }

  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    next();
  });
  router.get('/', async (req, res) => {
    if (!['course', 'topic', 'chapter', 'section'].includes(req.query.scope) || !validOwner(req.query.ownerId)) {
      return res.status(400).json({ error: '需要有效的 scope 与 ownerId' });
    }
    try {
      if (options.authorize) await options.authorize(req, { scope: req.query.scope, ownerId: req.query.ownerId });
      const entries = (await catalog()).filter(entry => entry.scope === req.query.scope && entry.ownerId === req.query.ownerId);
      const materials = [];
      for (const entry of entries) {
        const file = await availableFile(entry);
        if (!file) continue;
        await file.handle.close();
        materials.push({ id: entry.id, title: entry.title, fileType: fileType(entry.file), url: '/api/materials/' + entry.id + '/file', sizeBytes: file.sizeBytes });
      }
      res.json({ materials });
    } catch (error) { res.status(error.status || 500).json({ error: error.status ? error.message : '资料目录暂时不可用，请稍后重试', code: error.code }); }
  });
  router.get('/:id/file', async (req, res) => {
    if (!ID.test(req.params.id)) return res.status(404).json({ error: '未找到可用的资料' });
    let file;
    try {
      const entry = (await catalog()).find(item => item.id === req.params.id);
      if (!entry) return res.status(404).json({ error: '未找到可用的资料' });
      if (options.authorize) await options.authorize(req, entry);
      if (!(file = await availableFile(entry))) return res.status(404).json({ error: '未找到可用的资料' });
      res.attachment(entry.file);
      res.type(MIME_TYPES[fileType(entry.file)]);
      res.set('Content-Length', String(file.sizeBytes));
      const stream = file.handle.createReadStream({ start: 0, end: file.sizeBytes - 1, autoClose: true });
      stream.on('error', () => {
        if (!res.headersSent) { res.removeHeader('Content-Length'); res.status(500).json({ error: '资料读取失败' }); }
        else res.destroy();
      });
      res.on('close', () => stream.destroy());
      stream.pipe(res);
    } catch (error) {
      if (file) await file.handle.close().catch(() => {});
      if (!res.headersSent) res.status(error.status || 500).json({ error: error.status ? error.message : '资料暂时不可用，请稍后重试', code: error.code });
      else res.destroy();
    }
  });
  return router;
}

module.exports = { createMaterialsRouter };

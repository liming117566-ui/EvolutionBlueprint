const crypto = require('node:crypto');
const { promisify } = require('node:util');
const scrypt = promisify(crypto.scrypt);
const id = () => crypto.randomUUID();
const token = () => crypto.randomBytes(32).toString('base64url');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const now = () => new Date().toISOString();
function fail(status, message, code) { const error = new Error(message); error.status = status; error.code = code; throw error; }
function text(value, max = 200, required = true) {
  if (typeof value !== 'string' || value.length > max || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value) || (required && !value.trim())) fail(400, '请检查文字内容及长度');
  return value.trim();
}
function identifier(value) { if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(value)) fail(400, '内容 ID 无效'); return value; }
function date(value) { if (value === null || value === undefined || value === '') return null; if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) fail(400, '日期无效'); return new Date(value).toISOString(); }
async function passwordHash(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 128) fail(400, '密码须为 12–128 个字符');
  const salt = crypto.randomBytes(16).toString('hex');
  const result = await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt}$${result.toString('hex')}`;
}
async function verifyPassword(password, encoded) {
  if (typeof password !== 'string' || password.length > 128) return false;
  const [, salt, expected] = encoded.split('$');
  const result = await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 });
  const compare = Buffer.from(expected, 'hex');
  return result.length === compare.length && crypto.timingSafeEqual(result, compare);
}
function limiter(limit, windowMs) {
  const records = new Map();
  return (req, _res, next) => {
    const key = req.ip;
    const time = Date.now();
    let entry = records.get(key);
    if (!entry || time >= entry.until) { entry = { count: 0, until: time + windowMs }; records.set(key, entry); }
    if (records.size > 10000) for (const [k, v] of records) if (time > v.until) records.delete(k);
    if (++entry.count > limit) return next(Object.assign(new Error('操作过于频繁，请稍后重试'), { status: 429 }));
    next();
  };
}
function paging(query) { const page = Math.max(1, Math.min(100000, parseInt(query.page, 10) || 1)); return { page, pageSize: 20, offset: (page - 1) * 20 }; }
function loopback(req) { return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress); }
function privateNetwork(req) {
  const address = (req.socket.remoteAddress || '').replace(/^::ffff:/, '');
  const parts = address.split('.');
  if (parts.length !== 4 || !parts.every(part => /^\d{1,3}$/.test(part) && +part <= 255)) return false;
  const [a, b] = parts.map(Number);
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}
function testLoginAllowed(req, config) { return !config.production && config.devAuth && (loopback(req) || (config.lanTestAuth && privateNetwork(req))); }
module.exports = { id, token, hash, now, fail, text, identifier, date, passwordHash, verifyPassword, limiter, paging, loopback, privateNetwork, testLoginAllowed };

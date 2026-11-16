const { hash, token, now, fail } = require('./security');
const catalog = require('./catalog');
const integrations = require('../miniprogram/utils/integrations');
function webPath(experience) {
  if (experience === 'english-starry-sky') return '/english/';
  if (experience === 'cn-math-taxonomy') return '/math/';
  if (experience === 'tainai-junior-math') return '/junior-math/';
  if (integrations.find(experience)) return integrations.basePath(experience);
  if (/^website:[A-Za-z0-9_-]{1,100}$/.test(experience)) return '/websites/' + experience.slice(8) + '/';
  return null;
}
function createWebAccess(store, config, business) {
  store.db.exec(`CREATE TABLE IF NOT EXISTS web_sessions(hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,session_hash TEXT NOT NULL,board_id TEXT NOT NULL,experience TEXT NOT NULL,path TEXT NOT NULL,expires_at TEXT NOT NULL,exchanged INTEGER NOT NULL DEFAULT 0);`);
  const cookieName = experience => 'blueprint_web_' + hash(experience).slice(0, 16);
  const resumeCookieName = experience => 'blueprint_resume_' + hash(experience).slice(0, 16);
  const destination = row => row.path + (row.experience === 'english-starry-sky' ? '?embedded=1#/' : '');
  function cookie(req, name) {
    const part = (req.headers.cookie || '').split(';').map(piece => piece.trim()).find(piece => piece.startsWith(name + '='));
    return part && part.slice(name.length + 1);
  }
  function valid(row) {
    if (!row || row.expires_at <= now()) fail(401, '网页访问已失效，请从小程序重新进入', 'LOGIN_REQUIRED');
    const session = store.get('SELECT u.status FROM user_sessions s JOIN users u ON u.id=s.user_id WHERE s.hash=? AND s.user_id=? AND s.expires_at>?', row.session_hash, row.user_id, now());
    if (!session || session.status !== 'active') fail(401, '登录已失效，请重新登录', 'LOGIN_REQUIRED');
    const board = (catalog.published(store).boards || []).find(b => b.id === row.board_id && b.enabled && (b.experience || 'courses') === row.experience);
    if (!board) fail(403, '此学习板块已下架或调整', 'BOARD_LOCKED');
    business.boardAccess(row.user_id, board.id);
    return row;
  }
  function issue(req, board) {
    const basePath = webPath(board.experience);
    if (!basePath) fail(400, '此板块不使用网页入口');
    business.boardAccess(req.user.id, board.id);
    store.run('DELETE FROM web_sessions WHERE expires_at<=?', now());
    const value = token(), expiry = new Date(Date.now() + 60000).toISOString();
    store.run('INSERT INTO web_sessions VALUES(?,?,?,?,?,?,?,0)', hash(value), req.user.id, req.user.session_hash, board.id, board.experience, basePath, expiry);
    return { launchPath: '/web-access/' + value, expiresAt: expiry };
  }
  function landing(req, res) {
    const row = store.get('SELECT * FROM web_sessions WHERE hash=?', hash(req.params.ticket));
    // DevTools inspects this URL without the web-view's cookies before restoring it.
    // A consumed ticket only renders the shell; resuming still requires its HttpOnly credential.
    if (!row || row.exchanged !== 2) valid(row);
    res.set('Cache-Control', 'no-store'); res.set('Referrer-Policy', 'no-referrer');
    res.set('Content-Security-Policy', "default-src 'none'; script-src 'self'; connect-src 'self'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'self'");
    res.type('html').send('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><title>正在进入学习</title><body style="background:#f8f8f9;color:#191a1d;font:16px system-ui;padding:32px">正在验证并打开学习内容…<script src="/web-access-client.js"></script></body></html>');
  }
  function exchange(req, res) {
    const allowedOrigins = [config.publicOrigin, ...(!config.production && Array.isArray(config.webOrigins) ? config.webOrigins : [])];
    if (!allowedOrigins.includes(req.get('Origin')) || req.get('Sec-Fetch-Site') === 'cross-site') fail(403, '网页入口来源不匹配');
    const ticket = req.body && req.body.ticket;
    if (typeof ticket !== 'string' || !/^[A-Za-z0-9_-]{20,100}$/.test(ticket)) fail(401, '网页入口无效');
    const row = valid(store.get('SELECT * FROM web_sessions WHERE hash=? AND exchanged=0', hash(ticket)));
    const value = token(), expiry = new Date(Date.now() + 8 * 3600000).toISOString();
    // Rotate the single-use URL ticket into an HttpOnly cookie; URLs never contain the API Bearer token.
    store.transaction(() => {
      const result = store.run('UPDATE web_sessions SET exchanged=2,expires_at=? WHERE hash=? AND exchanged=0', expiry, row.hash);
      if (Number(result.changes) !== 1) fail(401, '网页入口已使用，请从小程序重新进入');
      store.run('INSERT INTO web_sessions VALUES(?,?,?,?,?,?,?,1)', hash(value), row.user_id, row.session_hash, row.board_id, row.experience, row.path, expiry);
    });
    res.set('Cache-Control', 'no-store'); res.set('Referrer-Policy', 'no-referrer');
    res.cookie(cookieName(row.experience), value, { path: row.path.slice(0, -1), httpOnly: true, secure: config.production, sameSite: 'lax', maxAge: 8 * 3600000 });
    res.cookie(resumeCookieName(row.experience), value, { path: '/web-access', httpOnly: true, secure: config.production, sameSite: 'lax', maxAge: 8 * 3600000 });
    res.json({ destination: destination(row) });
  }
  function resume(req, res) {
    const allowedOrigins = [config.publicOrigin, ...(!config.production && Array.isArray(config.webOrigins) ? config.webOrigins : [])];
    if (!allowedOrigins.includes(req.get('Origin')) || req.get('Sec-Fetch-Site') === 'cross-site') fail(403, '网页入口来源不匹配');
    const previous = valid(store.get('SELECT * FROM web_sessions WHERE hash=? AND exchanged=2', hash(req.params.ticket)));
    const value = cookie(req, resumeCookieName(previous.experience));
    const current = valid(value && store.get('SELECT * FROM web_sessions WHERE hash=? AND experience=? AND exchanged=1', hash(value), previous.experience));
    if (current.user_id !== previous.user_id || current.session_hash !== previous.session_hash || current.board_id !== previous.board_id) fail(401, '请从小程序重新进入学习板块', 'LOGIN_REQUIRED');
    res.set('Cache-Control', 'no-store'); res.set('Referrer-Policy', 'no-referrer');
    res.cookie(cookieName(current.experience), value, { path: current.path.slice(0, -1), httpOnly: true, secure: config.production, sameSite: 'lax', maxAge: Math.max(0, Date.parse(current.expires_at) - Date.now()) });
    res.json({ destination: destination(current) });
  }
  function guard(experience) {
    return (req, res, next) => {
      try {
        const resolved = typeof experience === 'function' ? experience(req) : experience;
        const name = cookieName(resolved);
        const part = (req.headers.cookie || '').split(';').map(piece => piece.trim()).find(piece => piece.startsWith(name + '='));
        const value = part && part.slice(name.length + 1);
        const row = valid(value && store.get('SELECT * FROM web_sessions WHERE hash=? AND experience=? AND exchanged=1', hash(value), resolved));
        req.webUser = { id: row.user_id, boardId: row.board_id };
        res.set('Cache-Control', 'no-store'); res.set('Referrer-Policy', 'no-referrer');
        next();
      } catch (error) {
        res.set('Cache-Control', 'no-store');
        res.status(error.status || 500).json({ error: error.message, code: error.code });
      }
    };
  }
  return { issue, landing, exchange, resume, guard };
}
module.exports = { createWebAccess, webPath };

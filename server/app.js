const express = require('express');
const path = require('node:path');
const { loadConfig } = require('./config');
const { openDatabase } = require('./db');
const { createAuth, asyncRoute } = require('./auth');
const { createBusiness } = require('./business');
const { createMedia } = require('./media');
const catalog = require('./catalog');
const { id, now, text, fail, paging, limiter } = require('./security');
function createApp(overrides = {}) {
  const config = loadConfig(overrides);
  const store = openDatabase(config.dataDir);
  catalog.initCatalog(store);
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', false);
  app.locals.store = store; app.locals.config = config; app.locals.close = () => store.close();
  require('./english-web').mount(app);
  require('./math-web').mount(app);
  require('./junior-math-web').mount(app);
  function audit(actor, action, target, detail = {}) { store.run('INSERT INTO audit(actor,action,target,detail,created_at) VALUES(?,?,?,?,?)', actor, action, String(target), JSON.stringify(detail), now()); }
  const auth = createAuth(store, config, audit), business = createBusiness(store, audit);
  const media = createMedia(store, config, auth, business, audit);
  app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff'); res.set('Referrer-Policy', 'same-origin'); res.set('X-Frame-Options', 'DENY');
    res.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    if (config.production) res.set('Strict-Transport-Security', 'max-age=31536000');
    if (req.path.startsWith('/api/')) res.set('Cache-Control', 'no-store');
    next();
  });
  app.use(express.json({ limit: '2mb', strict: true }));
  app.use((req, _res, next) => { if (req.body === undefined) req.body = {}; next(); });
  app.get('/', (_req, res) => res.redirect('/admin/'));
  app.get('/api/health', (_req, res) => res.json({ ok: true, name: catalog.published(store).settings.brandName, wechatConfigured: !!config.appSecret }));
  app.get('/api/integrations/english', (_req, res) => res.json(require('./english-web').status()));
  app.get('/api/integrations/math', (_req, res) => res.json(require('./math-web').status()));
  app.get('/api/integrations/junior-math', (_req, res) => res.json(require('./junior-math-web').status()));
  app.use('/admin', express.static(path.join(__dirname, 'admin'), { index: 'index.html', dotfiles: 'deny', etag: true }));
  app.use('/assets', express.static(path.join(__dirname, '..', 'miniprogram', 'assets'), { dotfiles: 'deny', fallthrough: false }));
  const admin = express.Router();
  auth.registerAdminRoutes(admin);
  admin.use(auth.admin);
  admin.use((req, res, next) => ['GET', 'HEAD', 'OPTIONS'].includes(req.method) ? next() : auth.csrf(req, res, next));
  admin.get('/catalog', (_req, res) => res.json(catalog.draft(store)));
  admin.put('/catalog', (req, res) => {
    const result = catalog.saveDraft(store, req.body);
    audit(req.admin.id, 'catalog.save', result.version); res.json(result);
  });
  admin.get('/published', (_req, res) => res.json(catalog.published(store)));
  admin.post('/publish', (req, res) => { const result = catalog.publish(store, req.body.version); audit(req.admin.id, 'catalog.publish', result.version); res.json(result); });
  media.adminRoutes(admin);
  function usersQuery(req, res) {
    const p = paging(req.query), q = '%' + text(req.query.q || '', 100, false) + '%';
    const where = ' WHERE id LIKE ? OR nickname LIKE ? OR note LIKE ?';
    res.json({ ...p, total: store.get('SELECT count(*) AS n FROM users' + where, q, q, q).n, items: store.all('SELECT * FROM users' + where + ' ORDER BY created_at DESC LIMIT ? OFFSET ?', q, q, q, p.pageSize, p.offset).map(row => ({ ...auth.publicUser(row), note: row.note })) });
  }
  admin.get('/users', usersQuery);
  admin.get('/users/:id', (req, res) => {
    const user = store.get('SELECT * FROM users WHERE id=?', req.params.id); if (!user) fail(404, '用户不存在');
    res.json({ user: { ...auth.publicUser(user), note: user.note }, grants: business.grants(user.id), learning: business.learning(user.id) });
  });
  admin.patch('/users/:id', (req, res) => {
    const user = store.get('SELECT * FROM users WHERE id=?', req.params.id); if (!user) fail(404, '用户不存在');
    const nickname = req.body.nickname === undefined ? user.nickname : text(req.body.nickname, 100);
    const note = req.body.note === undefined ? user.note : text(req.body.note, 1000, false);
    const status = req.body.status === undefined ? user.status : req.body.status;
    if (!['active', 'disabled'].includes(status)) fail(400, '用户状态无效');
    store.transaction(() => {
      store.run('UPDATE users SET nickname=?,note=?,status=? WHERE id=?', nickname, note, status, user.id);
      if (status === 'disabled') store.run('DELETE FROM user_sessions WHERE user_id=?', user.id);
      audit(req.admin.id, 'user.update', user.id, { status });
    });
    const updated = store.get('SELECT * FROM users WHERE id=?', user.id);
    res.json({ user: { ...auth.publicUser(updated), note: updated.note } });
  });
  admin.post('/users/:id/grants', (req, res) => res.status(201).json({ grant: store.transaction(() => business.addGrant(req.params.id, req.body, 'admin', req.admin.id)) }));
  admin.post('/grants/:id/revoke', (req, res) => {
    const reason = text(req.body.reason, 1000);
    if (!store.get('SELECT id FROM grants WHERE id=?', req.params.id)) fail(404, '权益不存在');
    store.transaction(() => { store.run('UPDATE grants SET revoked_at=COALESCE(revoked_at,?) WHERE id=?', now(), req.params.id); audit(req.admin.id, 'grant.revoke', req.params.id, { reason }); });
    res.json({ ok: true });
  });
  admin.post('/card-batches', limiter(10, 60000), (req, res) => res.status(201).json(business.createBatch(req.body, req.admin.id)));
  admin.get('/card-batches', (req, res) => {
    const p = paging(req.query), q = '%' + text(req.query.q || '', 100, false) + '%';
    res.json({ ...p, total: store.get('SELECT count(*) AS n FROM batches WHERE title LIKE ?', q).n,
      items: store.all('SELECT b.*,(SELECT count(*) FROM cards c WHERE c.batch_id=b.id AND c.used_by IS NOT NULL) AS used_count FROM batches b WHERE b.title LIKE ? ORDER BY b.created_at DESC LIMIT ? OFFSET ?', q, p.pageSize, p.offset).map(business.batchView) });
  });
  admin.post('/card-batches/:id/disable', (req, res) => {
    if (!store.get('SELECT id FROM batches WHERE id=?', req.params.id)) fail(404, '卡密批次不存在');
    store.transaction(() => { store.run('UPDATE batches SET disabled=1 WHERE id=?', req.params.id); audit(req.admin.id, 'batch.disable', req.params.id); }); res.json({ ok: true });
  });
  admin.get('/cards', (req, res) => {
    const p = paging(req.query), params = [], where = [];
    if (req.query.batchId) { where.push('c.batch_id=?'); params.push(text(req.query.batchId, 100)); }
    if (req.query.q) { where.push('c.mask LIKE ?'); params.push('%' + text(req.query.q, 100) + '%'); }
    if (req.query.status === 'used') where.push('c.used_by IS NOT NULL');
    if (req.query.status === 'unused') where.push('c.used_by IS NULL AND b.disabled=0 AND (b.redeem_expires_at IS NULL OR b.redeem_expires_at>?)'), params.push(now());
    if (req.query.status === 'disabled') where.push('b.disabled=1 AND c.used_by IS NULL');
    if (req.query.status === 'expired') where.push('b.redeem_expires_at<=? AND c.used_by IS NULL'), params.push(now());
    const clause = where.length ? ' WHERE ' + where.join(' AND ') : '';
    const from = ' FROM cards c JOIN batches b ON b.id=c.batch_id';
    const rows = store.all('SELECT c.id,c.mask,c.batch_id AS batchId,c.used_by AS usedBy,c.used_at AS usedAt,b.disabled,b.redeem_expires_at AS redeemExpiresAt' + from + clause + ' ORDER BY c.id LIMIT ? OFFSET ?', ...params, p.pageSize, p.offset);
    res.json({ ...p, total: store.get('SELECT count(*) AS n' + from + clause, ...params).n, items: rows.map(r => ({ ...r, status: r.usedBy ? 'used' : r.disabled ? 'disabled' : r.redeemExpiresAt && r.redeemExpiresAt <= now() ? 'expired' : 'unused' })) });
  });
  admin.get('/redemptions', (req, res) => {
    const p = paging(req.query);
    res.json({ ...p, total: store.get('SELECT count(*) AS n FROM redemptions').n, items: store.all('SELECT r.id,r.card_id AS cardId,r.grant_id AS grantId,r.user_id AS userId,r.created_at AS createdAt,c.mask,c.batch_id AS batchId,u.nickname FROM redemptions r JOIN cards c ON c.id=r.card_id JOIN users u ON u.id=r.user_id ORDER BY r.created_at DESC LIMIT ? OFFSET ?', p.pageSize, p.offset) });
  });
  admin.get('/audit', (req, res) => {
    const p = paging(req.query);
    res.json({ ...p, total: store.get('SELECT count(*) AS n FROM audit').n, items: store.all('SELECT id,actor,action,target,detail,created_at AS createdAt FROM audit ORDER BY id DESC LIMIT ? OFFSET ?', p.pageSize, p.offset).map(r => ({ ...r, detail: JSON.parse(r.detail) })) });
  });
  app.use('/api/admin', admin);
  auth.registerUserRoutes(app);
  app.get('/api/bootstrap', (_req, res) => { const tree = catalog.published(store); res.json({ version: tree.version, settings: tree.settings, categories: tree.categories, boards: (tree.boards || []).filter(b => b.enabled) }); });
  app.get('/api/assets/:id', media.assetRoute);
  app.get('/api/courses', (req, res, next) => {
    const render = () => {
      const tree = catalog.published(store);
      res.json({ version: tree.version, courses: tree.courses.filter(c => c.published).map(c => ({ id: c.id, title: c.title, subtitle: c.subtitle, description: c.description, duration: c.duration, cover: c.cover, categoryId: c.categoryId, category: tree.categories.find(cat => cat.id === c.categoryId)?.title || '', lessons: c.chapters.length, accessible: !!req.user && business.canAccess(req.user.id, c.id) })) });
    };
    if (req.get('Authorization')) auth.user(req, res, error => error ? next(error) : render()); else render();
  });
  app.get('/api/courses/:id', auth.user, (req, res) => {
    const tree = catalog.published(store), course = tree.courses.find(c => c.id === req.params.id && c.published);
    if (!course) fail(404, '课程不存在或已下架');
    business.access(req.user.id, course.id);
    res.json({ version: tree.version, course: { ...course, category: tree.categories.find(c => c.id === course.categoryId)?.title || '' }, legacyMap: catalog.legacyMap(course.id) });
  });
  app.get('/api/me', auth.user, (req, res) => {
    const grants = business.grants(req.user.id);
    res.json({ user: auth.publicUser(req.user), grants, hasAccess: grants.some(g => !g.revokedAt && (!g.expiresAt || g.expiresAt > now())) });
  });
  app.post('/api/redeem', auth.user, limiter(15, 15 * 60000), (req, res) => res.json({ ...business.redeem(req.user.id, req.body.code), user: auth.publicUser(req.user) }));
  app.get('/api/me/learning', auth.user, (req, res) => res.json(business.learning(req.user.id)));
  app.put('/api/me/learning', auth.user, limiter(200, 60000), (req, res) => { business.writeLearning(req.user.id, req.body); res.json({ ok: true }); });
  app.post('/api/me/learning/import', auth.user, limiter(10, 60000), (req, res) => { business.importLearning(req.user.id, req.body); res.json({ ok: true }); });
  app.use('/api/materials', auth.user, media.materialRouter);
  app.use((_req, res) => res.status(404).json({ error: '接口或页面不存在' }));
  app.use((error, req, res, _next) => {
    if (res.headersSent) return res.destroy();
    const status = error.status || (error.type === 'entity.too.large' ? 413 : 500);
    if (status >= 500) console.error('request failed', req.method, req.path, error.code || error.name);
    res.status(status).json({ error: status >= 500 && !error.status ? '服务暂时不可用，请稍后重试' : error.message, code: error.code });
  });
  return app;
}
module.exports = { createApp };

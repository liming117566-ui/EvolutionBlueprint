const crypto = require('node:crypto');
const { id, hash, now, text, identifier, date, fail, paging } = require('./security');
const catalog = require('./catalog');
function createBusiness(store, audit) {
  const targetIds = row => ({ courseIds: row.scope === 'courses' ? JSON.parse(row.course_ids) : [], boardIds: row.scope === 'boards' ? JSON.parse(row.course_ids) : [] });
  const grantView = row => ({ id: row.id, userId: row.user_id, scope: row.scope, ...targetIds(row), expiresAt: row.expires_at, revokedAt: row.revoked_at, reason: row.reason, source: row.source, createdAt: row.created_at });
  function grants(userId) { return store.all('SELECT * FROM grants WHERE user_id=? ORDER BY created_at DESC', userId).map(grantView); }
  const active = g => !g.revokedAt && (!g.expiresAt || g.expiresAt > now());
  function canAccess(userId, courseId) {
    const tree = catalog.published(store), course = tree.courses.find(c => c.id === courseId && c.published);
    return !!course && grants(userId).some(g => active(g) && (g.scope === 'all' || (g.scope === 'courses' && g.courseIds.includes(courseId)) ||
      (g.scope === 'boards' && (tree.boards || []).some(b => b.enabled && g.boardIds.includes(b.id) && b.categoryIds.includes(course.categoryId)))));
  }
  function canBoardAccess(userId, boardId) {
    const tree = catalog.published(store), board = (tree.boards || []).find(b => b.id === boardId && b.enabled);
    if (!board || !userId) return false;
    return grants(userId).some(g => active(g) && (g.scope === 'all' || (g.scope === 'boards' && g.boardIds.includes(boardId)) ||
      (g.scope === 'courses' && tree.courses.some(c => c.published && board.categoryIds.includes(c.categoryId) && g.courseIds.includes(c.id)))));
  }
  function boardAccess(userId, boardId) { if (!canBoardAccess(userId, boardId)) fail(403, '请先兑换此板块的兑换码，或兑换全部板块兑换码', 'BOARD_LOCKED'); }
  function access(userId, courseId) { if (!canAccess(userId, courseId)) fail(403, '尚未获得本课程权限，或课程权限已到期', 'COURSE_LOCKED'); }
  function scopeInput(input) {
    if (!['all', 'courses', 'boards'].includes(input.scope)) fail(400, '请选择全部板块与课程、指定板块或指定课程');
    if (input.scope === 'all') return { scope: 'all', courseIds: [] };
    if (input.scope === 'boards') {
      if (!Array.isArray(input.boardIds) || !input.boardIds.length || input.boardIds.length > 100) fail(400, '请选择指定板块');
      const ids = [...new Set(input.boardIds.map(identifier))];
      if (ids.some(boardId => !(catalog.draft(store).boards || []).some(b => b.id === boardId))) fail(400, '所选板块不存在');
      return { scope: 'boards', courseIds: ids };
    }
    if (!Array.isArray(input.courseIds) || !input.courseIds.length || input.courseIds.length > 200) fail(400, '请选择指定课程');
    const ids = [...new Set(input.courseIds.map(identifier))];
    const tree = catalog.draft(store);
    if (ids.some(courseId => !tree.courses.some(c => c.id === courseId))) fail(400, '所选课程不存在');
    return { scope: 'courses', courseIds: ids };
  }
  function addGrant(userId, input, source, actor) {
    return issueGrant(userId, input, scopeInput(input), source, actor);
  }
  function issueGrant(userId, input, scope, source, actor) {
    if (!store.get('SELECT id FROM users WHERE id=?', userId)) fail(404, '用户不存在');
    const expiresAt = date(input.expiresAt), reason = text(input.reason, 1000);
    if (expiresAt && expiresAt <= now()) fail(400, '权益到期时间须晚于当前时间');
    const grantId = id();
    store.run('INSERT INTO grants VALUES(?,?,?,?,?,NULL,?,?,?)', grantId, userId, scope.scope, JSON.stringify(scope.courseIds), expiresAt, reason, source, now());
    audit(actor, 'grant.create', grantId, { userId, scope: scope.scope });
    return grantView(store.get('SELECT * FROM grants WHERE id=?', grantId));
  }
  const batchView = row => ({ id: row.id, title: row.title, count: row.count, scope: row.scope, ...targetIds(row), redeemExpiresAt: row.redeem_expires_at, accessDays: row.access_days, disabled: !!row.disabled, usedCount: row.used_count || 0, createdAt: row.created_at });
  function createBatch(input, actor) {
    const title = text(input.title, 200), count = input.count;
    if (!Number.isInteger(count) || count < 1 || count > 500) fail(400, '每批可生成 1–500 张卡密');
    const scope = scopeInput(input), expires = date(input.redeemExpiresAt);
    if (expires && expires <= now()) fail(400, '兑换截止时间须晚于当前时间');
    const days = input.accessDays === undefined || input.accessDays === null || input.accessDays === '' ? null : input.accessDays;
    if (days !== null && (!Number.isInteger(days) || days < 1 || days > 36500)) fail(400, '访问期限须为 1–36500 天，留空表示长期');
    return store.transaction(() => {
      const batchId = id(), codes = [];
      store.run('INSERT INTO batches(id,title,count,scope,course_ids,redeem_expires_at,access_days,created_at) VALUES(?,?,?,?,?,?,?,?)', batchId, title, count, scope.scope, JSON.stringify(scope.courseIds), expires, days, now());
      for (let i = 0; i < count; i++) {
        const raw = crypto.randomBytes(20).toString('hex').toUpperCase();
        const display = raw.match(/.{1,8}/g).join('-');
        store.run('INSERT INTO cards(id,hash,mask,batch_id) VALUES(?,?,?,?)', id(), hash(raw), raw.slice(0, 4) + '••••' + raw.slice(-4), batchId);
        codes.push(display);
      }
      audit(actor, 'cards.generate', batchId, { count, scope: scope.scope });
      return { batch: batchView(store.get('SELECT * FROM batches WHERE id=?', batchId)), codes };
    });
  }
  function redeem(userId, inputCode) {
    const raw = text(inputCode, 100).replace(/[-\s]/g, '').toUpperCase();
    if (!/^[A-F0-9]{40}$/.test(raw)) fail(400, '卡密无效，请检查后重试');
    return store.transaction(() => {
      const card = store.get('SELECT c.*,b.scope,b.course_ids,b.redeem_expires_at,b.access_days,b.disabled FROM cards c JOIN batches b ON b.id=c.batch_id WHERE c.hash=?', hash(raw));
      if (!card) fail(400, '卡密无效，请检查后重试');
      if (card.used_by) { if (card.used_by === userId) return { ok: true, message: '本卡密已由当前账号兑换', grants: grants(userId) }; fail(409, '该卡密已被使用'); }
      if (card.disabled || (card.redeem_expires_at && card.redeem_expires_at <= now())) fail(400, '卡密已停用或已过兑换截止时间');
      const expiresAt = card.access_days ? new Date(Date.now() + card.access_days * 86400000).toISOString() : null;
      // Issued cards keep their stored scope; unpublished catalog edits cannot invalidate them.
      const scope = { scope: card.scope, courseIds: JSON.parse(card.course_ids) };
      const grant = issueGrant(userId, { expiresAt, reason: '卡密兑换' }, scope, 'card:' + card.id, userId);
      const update = store.run('UPDATE cards SET used_by=?,used_at=? WHERE id=? AND used_by IS NULL', userId, now(), card.id);
      if (Number(update.changes) !== 1) fail(409, '该卡密已被使用');
      store.run('INSERT INTO redemptions VALUES(?,?,?,?,?)', id(), card.id, userId, grant.id, now());
      audit(userId, 'card.redeem', card.id);
      return { ok: true, message: '兑换成功', grants: grants(userId) };
    });
  }
  function learning(userId) {
    return {
      sections: store.all('SELECT section_id AS sectionId,completed,updated_at AS updatedAt FROM learning_sections WHERE user_id=?', userId).map(s => ({ ...s, completed: !!s.completed })),
      positions: store.all('SELECT course_id AS courseId,chapter_id AS chapterId,section_id AS sectionId,updated_at AS updatedAt FROM learning_positions WHERE user_id=?', userId),
      legacyChapters: store.all('SELECT chapter_id AS chapterId FROM legacy_chapters WHERE user_id=?', userId)
    };
  }
  function writeLearning(userId, input) {
    const course = catalog.published(store).courses.find(c => c.id === input.courseId && c.published);
    if (!course) fail(404, '课程不存在或已下架');
    access(userId, course.id);
    const chapter = course.chapters.find(c => c.id === input.chapterId);
    if (!chapter) fail(409, '章节内容已更新，请刷新', 'CONTENT_CHANGED');
    if (input.sectionId && !chapter.sections.some(s => s.id === input.sectionId)) fail(409, '小章节内容已更新，请刷新', 'CONTENT_CHANGED');
    store.transaction(() => {
      if (input.sectionId) store.run('INSERT INTO learning_sections VALUES(?,?,?,?) ON CONFLICT(user_id,section_id) DO UPDATE SET completed=MAX(completed,excluded.completed),updated_at=excluded.updated_at', userId, input.sectionId, input.completed === true ? 1 : 0, now());
      store.run('INSERT INTO learning_positions VALUES(?,?,?,?,?) ON CONFLICT(user_id,course_id) DO UPDATE SET chapter_id=excluded.chapter_id,section_id=excluded.section_id,updated_at=excluded.updated_at', userId, course.id, chapter.id, input.sectionId || null, now());
    });
  }
  function importLearning(userId, input) {
    const importId = identifier(input.importId);
    if (!Array.isArray(input.sections) || !Array.isArray(input.chapters) || input.sections.length > 10000 || input.chapters.length > 1000) fail(400, '导入记录格式有误');
    const seedEntries = catalog.entries(catalog.seed);
    const sections = [...new Set(input.sections.map(identifier))];
    const chapters = [...new Set(input.chapters.map(identifier))];
    for (const [type, ids] of [['section', sections], ['chapter', chapters]]) for (const value of ids) {
      const entry = seedEntries.find(e => e.id === value && e.type === type);
      if (!entry) fail(400, '历史记录不属于初始课程映射');
      access(userId, entry.courseId);
    }
    store.transaction(() => {
      if (store.get('SELECT import_id FROM imports WHERE user_id=? AND import_id=?', userId, importId)) return;
      for (const value of sections) store.run('INSERT INTO learning_sections VALUES(?,?,1,?) ON CONFLICT(user_id,section_id) DO UPDATE SET completed=1', userId, value, now());
      for (const value of chapters) store.run('INSERT OR IGNORE INTO legacy_chapters VALUES(?,?)', userId, value);
      store.run('INSERT INTO imports VALUES(?,?)', userId, importId);
      audit(userId, 'learning.import', importId, { sections: sections.length, chapters: chapters.length });
    });
  }
  function paginated(sql, params, countSql, query, map = row => row) {
    const p = paging(query);
    return { items: store.all(sql + ' LIMIT ? OFFSET ?', ...params, p.pageSize, p.offset).map(map), total: store.get(countSql, ...params).total, page: p.page, pageSize: p.pageSize };
  }
  return { grants, canAccess, access, canBoardAccess, boardAccess, addGrant, createBatch, redeem, learning, writeLearning, importLearning, paginated, batchView };
}
module.exports = { createBusiness };

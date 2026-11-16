'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { openDatabase } = require('../server/db');
const { initCatalog } = require('../server/catalog');
const { createAuth } = require('../server/auth');

function fixture(t) {
  const root = fs.realpathSync(os.tmpdir());
  const dir = fs.mkdtempSync(path.join(root, 'xinbotu-brand-'));
  let store;
  t.after(() => {
    if (store) store.close();
    assert(path.resolve(dir).startsWith(root + path.sep));
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  });
  return { dir, open() { store = openDatabase(dir); return store; }, close() { store.close(); store = null; } };
}

test('supplied course migration adds only the three new boards once and preserves separate drafts and courses', t => {
  const store=fixture(t).open(),catalog=require('../server/catalog');initCatalog(store);
  const added=['geometry-between','geo-bio-exam','math-between-grade7'].map(slug=>'module-'+slug);
  const row=store.get('SELECT * FROM catalog WHERE id=1'),published=JSON.parse(row.published),draft=JSON.parse(row.draft);
  for(const tree of [published,draft])tree.boards=tree.boards.filter(board=>!added.includes(board.id)&&board.id!=='module-english-chinese-words');
  draft.settings.welcomeTitle='保留未发布内容';
  store.run('UPDATE catalog SET draft=?,published=? WHERE id=1',JSON.stringify(draft),JSON.stringify(published));
  store.run('DELETE FROM migrations WHERE version=10');
  initCatalog(store);
  for(const tree of [catalog.draft(store),catalog.published(store)]){
    assert(added.every(id=>tree.boards.some(board=>board.id===id)));
    assert(!tree.boards.some(board=>board.id==='module-english-chinese-words'),'older deleted boards stay deleted');
    assert.deepEqual(tree.courses,published.courses);
  }
  assert.equal(catalog.draft(store).settings.welcomeTitle,'保留未发布内容');
  assert.notEqual(catalog.published(store).settings.welcomeTitle,'保留未发布内容');
  const after=store.get('SELECT * FROM catalog WHERE id=1');initCatalog(store);assert.deepEqual(store.get('SELECT * FROM catalog WHERE id=1'),after);
  const changed=catalog.draft(store);changed.boards=changed.boards.filter(board=>board.id!==added[0]);
  store.run('UPDATE catalog SET draft=? WHERE id=1',JSON.stringify(changed));initCatalog(store);
  assert(!catalog.draft(store).boards.some(board=>board.id===added[0]));
});

test('brand migration upgrades draft and published separately without erasing historical data or running twice', t => {
  const f = fixture(t), store = f.open();
  initCatalog(store);
  const current = store.get('SELECT * FROM catalog WHERE id=1');
  const pub = JSON.parse(current.published), draft = structuredClone(pub);
  const retired = ['focus-space', 'thinking-space', 'energy-space'];
  for (const boardId of retired) {
    pub.boards.push({ ...structuredClone(pub.boards[0]), id: boardId, title: boardId });
    store.run('INSERT OR IGNORE INTO entities VALUES(?,?,?)', boardId, 'board', '');
  }
  draft.boards = structuredClone(pub.boards);
  pub.settings.brandName = '进化蓝图';
  pub.settings.gateTitle = '开启你的进化蓝图';
  pub.settings.about = ['进化蓝图学习空间', '保留这条自定义说明'];
  draft.settings = { ...structuredClone(pub.settings), welcomeTitle: '未发布的欢迎语', help: ['草稿中的进化蓝图帮助'] };
  draft.courses[0].title = '尚未发布的课程标题';
  const beforePubCourses = structuredClone(pub.courses), beforeDraftCourses = structuredClone(draft.courses);
  const historicalRevision = store.get('SELECT COALESCE(MAX(id),0)+1 AS next FROM revisions').next;
  store.run('INSERT INTO revisions VALUES(?,?,?)', historicalRevision, JSON.stringify(pub), '2026-01-01T00:00:00.000Z');
  store.run('UPDATE catalog SET draft=?,published=?,published_version=? WHERE id=1', JSON.stringify(draft), JSON.stringify(pub), historicalRevision);
  store.run('DELETE FROM migrations WHERE version=6');
  store.run('INSERT INTO users(id,openid,nickname,created_at,last_login_at) VALUES(?,?,?,?,?)', 'history-user', 'history-openid', '历史用户', 'before', 'before');
  store.run('INSERT INTO grants VALUES(?,?,?,?,?,?,?,?,?)', 'history-grant', 'history-user', 'boards', JSON.stringify(retired), null, null, '保留旧权益', 'manual', 'before');
  store.run('INSERT INTO batches VALUES(?,?,?,?,?,?,?,?,?)', 'history-batch', '历史兑换批次', 1, 'boards', JSON.stringify(retired), null, 30, 0, 'before');
  store.run('INSERT INTO cards VALUES(?,?,?,?,?,?)', 'history-card', 'history-hash', '****1234', 'history-batch', 'history-user', 'before');
  store.run('INSERT INTO redemptions VALUES(?,?,?,?,?)', 'history-redemption', 'history-card', 'history-user', 'history-grant', 'before');
  store.run('INSERT INTO learning_sections VALUES(?,?,?,?)', 'history-user', 'historical-section', 1, 'before');
  const preserved = Object.fromEntries(['entities', 'grants', 'batches', 'cards', 'redemptions', 'learning_sections'].map(table => [table, store.all('SELECT * FROM ' + table)]));
  const oldRevision = store.get('SELECT * FROM revisions WHERE id=?', historicalRevision);

  initCatalog(store);
  const after = store.get('SELECT * FROM catalog WHERE id=1');
  const upgradedPub = JSON.parse(after.published), upgradedDraft = JSON.parse(after.draft);
  for (const tree of [upgradedPub, upgradedDraft]) {
    assert(!tree.boards.some(board => retired.includes(board.id)));
    assert.equal(tree.settings.brandName, '新博途');
    assert.equal(tree.settings.gateTitle, '开启你的新博途');
    assert.deepEqual(tree.settings.about, ['新博途学习空间', '保留这条自定义说明']);
  }
  assert.deepEqual(upgradedPub.courses, beforePubCourses);
  assert.deepEqual(upgradedDraft.courses, beforeDraftCourses);
  assert.equal(upgradedDraft.settings.welcomeTitle, '未发布的欢迎语');
  assert.deepEqual(upgradedDraft.settings.help, ['草稿中的新博途帮助']);
  assert.deepEqual(upgradedDraft.categories, draft.categories);
  assert.deepEqual(store.get('SELECT * FROM revisions WHERE id=?', historicalRevision), oldRevision);
  for (const [table, rows] of Object.entries(preserved)) assert.deepEqual(store.all('SELECT * FROM ' + table), rows, table + ' retained');
  assert(store.get('SELECT version FROM migrations WHERE version=6'));
  assert.equal(after.version, current.version + 1);
  assert.equal(after.published_version, historicalRevision + 1);
  initCatalog(store);
  assert.deepEqual(store.get('SELECT * FROM catalog WHERE id=1'), after);
  assert.equal(store.get('SELECT COUNT(*) AS count FROM revisions').count, historicalRevision + 1);

  // An administrator can still edit the brand and delete another board after migration.
  const removedBoardId = upgradedPub.boards[0].id;
  for (const tree of [upgradedDraft, upgradedPub]) {
    tree.settings.brandName = '后续自定义名称';
    tree.boards = tree.boards.filter(board => board.id !== removedBoardId);
  }
  store.run('UPDATE catalog SET draft=?,published=? WHERE id=1', JSON.stringify(upgradedDraft), JSON.stringify(upgradedPub));
  const customized = store.get('SELECT * FROM catalog WHERE id=1');
  initCatalog(store);
  assert.deepEqual(store.get('SELECT * FROM catalog WHERE id=1'), customized);
});

test('generated artwork migrates both snapshots once, keeps drafts separate and validates local image paths', t => {
  const f = fixture(t), store = f.open(), catalog = require('../server/catalog');
  initCatalog(store);
  const row = store.get('SELECT * FROM catalog WHERE id=1');
  const pub = JSON.parse(row.published), draft = JSON.parse(row.draft);
  draft.boards[0].title = '未发布的板块标题';
  for (const tree of [pub, draft]) {
    tree.settings.gateCover = '/assets/covers/focus.svg';
    for (const board of tree.boards) { board.cover = '/assets/covers/english.svg'; board.icon = '/assets/icons/book.svg'; }
  }
  store.run('UPDATE catalog SET draft=?,published=? WHERE id=1', JSON.stringify(draft), JSON.stringify(pub));
  store.run('DELETE FROM migrations WHERE version=7');
  initCatalog(store);
  for (const tree of [catalog.draft(store), catalog.published(store)]) {
    assert.equal(tree.settings.gateCover, '/assets/generated/home-hero.webp');
    assert.equal(tree.boards.length, 17);
    for (const board of tree.boards) {
      assert.equal(board.icon, '/assets/generated/' + board.id.toLowerCase() + '-icon.webp');
      assert.equal(board.cover, '/assets/generated/' + board.id.toLowerCase() + '-landscape.webp');
      assert(fs.statSync(path.resolve(__dirname, '../miniprogram' + board.icon)).size > 0);
      assert(fs.statSync(path.resolve(__dirname, '../miniprogram' + board.cover)).size > 0);
    }
  }
  assert.equal(catalog.draft(store).boards[0].title, '未发布的板块标题');
  assert.notEqual(catalog.published(store).boards[0].title, '未发布的板块标题');
  const valid = catalog.draft(store); valid.boards[0].cover = '/assets/covers/math.svg';
  catalog.saveDraft(store, valid);
  initCatalog(store);
  assert.equal(catalog.draft(store).boards[0].cover, '/assets/covers/math.svg', 'later admin image changes survive startup');
  for (const bad of ['/assets/generated/missing.webp', '/assets/generated/../home-hero.webp', '/assets/generated/home-hero.svg', '/assets/generated/home-hero.webp/extra']) {
    const invalid = catalog.draft(store); invalid.boards[0].cover = bad;
    assert.throws(() => catalog.saveDraft(store, invalid), error => error.status === 400);
  }
});

test('landscape covers replace only old defaults in independent snapshots and preserve later admin edits after restart', t => {
  const f = fixture(t); let store = f.open();
  const catalog = require('../server/catalog');
  initCatalog(store);
  const before = store.get('SELECT * FROM catalog WHERE id=1');
  const pub = JSON.parse(before.published), draft = JSON.parse(before.draft);
  for (const tree of [pub, draft]) {
    for (const board of tree.boards) board.cover = '/assets/generated/' + board.id.toLowerCase() + '-cover.webp';
  }
  // Existing customizations may differ in draft and published snapshots.
  pub.boards[0].cover = '/assets/covers/math.svg';
  draft.boards[1].cover = '/assets/covers/english.svg';
  draft.courses[0].title = '保留未发布课程修改';
  draft.boards[2].title = '保留未发布板块修改';
  const pubCourses = structuredClone(pub.courses), draftCourses = structuredClone(draft.courses);
  const pubIcons = pub.boards.map(board => board.icon), draftIcons = draft.boards.map(board => board.icon);
  const originalRevision = store.get('SELECT * FROM revisions WHERE id=?', before.published_version);
  store.run('UPDATE catalog SET draft=?,published=? WHERE id=1', JSON.stringify(draft), JSON.stringify(pub));
  store.run('DELETE FROM migrations WHERE version=9');

  initCatalog(store);
  const updatedPub = catalog.published(store), updatedDraft = catalog.draft(store);
  assert.equal(updatedPub.boards[0].cover, '/assets/covers/math.svg');
  assert.equal(updatedDraft.boards[1].cover, '/assets/covers/english.svg');
  for (const [tree, customizedIndex] of [[updatedPub, 0], [updatedDraft, 1]]) {
    assert.equal(tree.boards.length, 17);
    tree.boards.forEach((board, index) => {
      if (index !== customizedIndex) assert.equal(board.cover, '/assets/generated/' + board.id.toLowerCase() + '-landscape.webp');
    });
  }
  assert.deepEqual(updatedPub.courses, pubCourses);
  assert.deepEqual(updatedDraft.courses, draftCourses);
  assert.deepEqual(updatedPub.boards.map(board => board.icon), pubIcons);
  assert.deepEqual(updatedDraft.boards.map(board => board.icon), draftIcons);
  assert.equal(updatedDraft.boards[2].title, '保留未发布板块修改');
  assert.equal(updatedPub.settings.logo, '/assets/generated/app-icon.webp');
  assert.equal(updatedDraft.settings.logo, '/assets/generated/app-icon.webp');
  assert.deepEqual(store.get('SELECT * FROM revisions WHERE id=?', before.published_version), originalRevision);
  assert(store.get('SELECT version FROM migrations WHERE version=9'));
  const migrated = store.get('SELECT * FROM catalog WHERE id=1');
  initCatalog(store);
  assert.deepEqual(store.get('SELECT * FROM catalog WHERE id=1'), migrated);

  // Even choosing an old default again is a deliberate later admin edit, not another migration.
  updatedDraft.boards[3].cover = '/assets/generated/' + updatedDraft.boards[3].id.toLowerCase() + '-cover.webp';
  updatedPub.boards[4].cover = '/assets/covers/thinking.svg';
  store.run('UPDATE catalog SET draft=?,published=? WHERE id=1', JSON.stringify(updatedDraft), JSON.stringify(updatedPub));
  const customized = store.get('SELECT * FROM catalog WHERE id=1');
  f.close(); store = f.open(); initCatalog(store);
  assert.deepEqual(store.get('SELECT * FROM catalog WHERE id=1'), customized);
});

test('application icon migrates existing snapshots once without resetting later branding choices', t => {
  const f = fixture(t), store = f.open(), catalog = require('../server/catalog');
  initCatalog(store);
  const row = store.get('SELECT * FROM catalog WHERE id=1');
  const pub = JSON.parse(row.published), draft = JSON.parse(row.draft);
  pub.settings.logo = '/assets/icons/mark.svg'; draft.settings.logo = '/assets/icons/book.svg';
  draft.settings.welcomeTitle = '保留草稿欢迎语';
  store.run('UPDATE catalog SET draft=?,published=? WHERE id=1', JSON.stringify(draft), JSON.stringify(pub));
  store.run('DELETE FROM migrations WHERE version=8');
  initCatalog(store);
  assert.equal(catalog.published(store).settings.logo, '/assets/generated/app-icon.webp');
  assert.equal(catalog.draft(store).settings.logo, '/assets/generated/app-icon.webp');
  assert.equal(catalog.draft(store).settings.welcomeTitle, '保留草稿欢迎语');
  const changed = catalog.draft(store); changed.settings.logo = '/assets/icons/leaf.svg'; catalog.saveDraft(store, changed);
  initCatalog(store);
  assert.equal(catalog.draft(store).settings.logo, '/assets/icons/leaf.svg');
  assert.equal(catalog.published(store).settings.logo, '/assets/generated/app-icon.webp');
});

test('new account names are random Chinese names persisted through repeated login and database restart', t => {
  const f = fixture(t); let store = f.open();
  assert.equal(store.all('PRAGMA table_info(users)').find(column => column.name === 'nickname').dflt_value, "''");
  let auth = createAuth(store, { sessionDays: 30 }, () => {});
  const first = auth.loginUser('new-first').user, second = auth.loginUser('new-second').user;
  assert.match(first.nickname, /^[\u4e00-\u9fff]{4}\d{4,8}$/u);
  assert.match(second.nickname, /^[\u4e00-\u9fff]{4}\d{4,8}$/u);
  assert.notEqual(first.nickname, second.nickname);
  assert.equal(auth.loginUser('new-first').user.nickname, first.nickname);
  f.close(); store = f.open(); auth = createAuth(store, { sessionDays: 30 }, () => {});
  assert.equal(auth.loginUser('new-first').user.nickname, first.nickname);
  assert.equal(auth.loginUser('new-second').user.nickname, second.nickname);
});

test('legacy default names migrate once, custom names survive and legacy-schema inserts are repaired on login', t => {
  const f = fixture(t);
  const legacy = new DatabaseSync(path.join(f.dir, 'blueprint.sqlite'));
  legacy.exec("CREATE TABLE users(id TEXT PRIMARY KEY,openid TEXT NOT NULL UNIQUE,nickname TEXT NOT NULL DEFAULT '蓝图学员',note TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'active',created_at TEXT NOT NULL,last_login_at TEXT NOT NULL)");
  const insert = legacy.prepare('INSERT INTO users(id,openid,nickname,status,created_at,last_login_at) VALUES(?,?,?,?,?,?)');
  for (const [id, nickname, status] of [['default', '蓝图学员', 'active'], ['empty', '', 'active'], ['spaced', ' 蓝图学员 ', 'active'], ['oldbrand', '进化蓝图学员', 'active'], ['custom', '小李同学', 'active'], ['disabled', '我的自定义昵称', 'disabled']]) insert.run(id, id + '-openid', nickname, status, 'before', 'before');
  legacy.close();
  let store = f.open();
  const rows = store.all('SELECT * FROM users ORDER BY id');
  for (const id of ['default', 'empty', 'spaced', 'oldbrand']) assert.match(rows.find(row => row.id === id).nickname, /^[\u4e00-\u9fff]{4}\d{4,8}$/u);
  assert.equal(rows.find(row => row.id === 'custom').nickname, '小李同学');
  assert.equal(rows.find(row => row.id === 'disabled').nickname, '我的自定义昵称');
  assert.equal(rows.find(row => row.id === 'disabled').status, 'disabled');
  assert.equal(new Set(rows.map(row => row.nickname)).size, rows.length);
  f.close(); store = f.open();
  assert.deepEqual(store.all('SELECT * FROM users ORDER BY id'), rows);
  store.run('INSERT INTO users(id,openid,created_at,last_login_at) VALUES(?,?,?,?)', 'legacy-new', 'legacy-new-openid', 'before', 'before');
  assert.equal(store.get('SELECT nickname FROM users WHERE id=?', 'legacy-new').nickname, '蓝图学员');
  const auth = createAuth(store, { sessionDays: 30 }, () => {});
  const repaired = auth.loginUser('legacy-new-openid').user;
  assert.match(repaired.nickname, /^[\u4e00-\u9fff]{4}\d{4,8}$/u);
  assert.equal(auth.loginUser('legacy-new-openid').user.nickname, repaired.nickname);
  assert.equal(auth.loginUser('custom-openid').user.nickname, '小李同学');
  assert.throws(() => auth.loginUser('disabled-openid'), /账号已被停用/);
});

const fs = require('node:fs');
const path = require('node:path');
const { text, identifier, fail, now } = require('./security');
const seed = require('./seed.json');
function initCatalog(store) {
  if (!store.get('SELECT id FROM catalog WHERE id=1')) store.transaction(() => {
    const body = JSON.stringify(seed);
    store.run('INSERT INTO catalog VALUES(1,1,?,?,1)', body, body);
    store.run('INSERT INTO revisions VALUES(1,?,?)', body, now());
    registerEntities(store, seed);
  });
  // Upgrade each snapshot independently; preserve any unpublished course edits.
  const row = store.get('SELECT * FROM catalog WHERE id=1');
  if (!Object.hasOwn(JSON.parse(row.published), 'boards') || !Object.hasOwn(JSON.parse(row.draft), 'boards')) store.transaction(() => {
    const upgrade = raw => {
      const tree = JSON.parse(raw);
      if (Object.hasOwn(tree, 'boards')) return tree;
      const english = require('./english-seed');
      if (!tree.categories.some(c => c.id === english.category.id)) tree.categories.push(english.category);
      if (!tree.courses.some(c => c.id === english.course.id)) tree.courses.push(english.course);
      tree.boards = require('./boards').initial(tree.categories);
      registerEntities(store, tree);
      return tree;
    };
    const pub = upgrade(row.published), next = store.get('SELECT COALESCE(MAX(id),0)+1 AS next FROM revisions').next;
    store.run('INSERT INTO revisions VALUES(?,?,?)', next, JSON.stringify(pub), now());
    store.run('UPDATE catalog SET version=version+1,draft=?,published=?,published_version=? WHERE id=1', JSON.stringify(upgrade(row.draft)), JSON.stringify(pub), next);
  });
  const experienceRow = store.get('SELECT * FROM catalog WHERE id=1');
  const needsExperience = raw => (JSON.parse(raw).boards || []).some(b => b.id === 'junior-english' && b.experience === undefined);
  if (needsExperience(experienceRow.draft) || needsExperience(experienceRow.published)) store.transaction(() => {
    const upgrade = raw => { const tree = JSON.parse(raw); tree.boards = (tree.boards || []).map(b => b.id === 'junior-english' && b.experience === undefined ? { ...b, experience: 'english-starry-sky' } : b); return JSON.stringify(tree); };
    const pub = upgrade(experienceRow.published), next = store.get('SELECT COALESCE(MAX(id),0)+1 AS next FROM revisions').next;
    store.run('INSERT INTO revisions VALUES(?,?,?)', next, pub, now());
    store.run('UPDATE catalog SET version=version+1,draft=?,published=?,published_version=? WHERE id=1', upgrade(experienceRow.draft), pub, next);
  });
  // A recorded migration adds the new board once; deleting it later must be respected.
  if (!store.get('SELECT version FROM migrations WHERE version=2')) store.transaction(() => {
    const current = store.get('SELECT * FROM catalog WHERE id=1');
    const upgrade = raw => {
      const tree = JSON.parse(raw);
      if (!(tree.boards || []).some(b => b.id === 'math-taxonomy')) {
        const board = require('../miniprogram/utils/board-defaults').mathBoard();
        const position = tree.boards.findIndex(b => b.id === 'junior-english');
        tree.boards.splice(position < 0 ? tree.boards.length : position + 1, 0, board);
      }
      registerEntities(store, tree);
      return JSON.stringify(tree);
    };
    const pub = upgrade(current.published), next = store.get('SELECT COALESCE(MAX(id),0)+1 AS next FROM revisions').next;
    store.run('INSERT INTO revisions VALUES(?,?,?)', next, pub, now());
    store.run('UPDATE catalog SET version=version+1,draft=?,published=?,published_version=? WHERE id=1', upgrade(current.draft), pub, next);
    store.run('INSERT INTO migrations VALUES(2,?)', now());
  });
  if (!store.get('SELECT version FROM migrations WHERE version=3')) store.transaction(() => {
    const current = store.get('SELECT * FROM catalog WHERE id=1');
    const upgrade = raw => {
      const tree = JSON.parse(raw);
      if (!(tree.boards || []).some(b => b.id === 'junior-math')) {
        const board = require('../miniprogram/utils/board-defaults').juniorMathBoard();
        const position = tree.boards.findIndex(b => b.id === 'junior-english');
        tree.boards.splice(position < 0 ? tree.boards.length : position + 1, 0, board);
      }
      registerEntities(store, tree);
      return JSON.stringify(tree);
    };
    const pub = upgrade(current.published), next = store.get('SELECT COALESCE(MAX(id),0)+1 AS next FROM revisions').next;
    store.run('INSERT INTO revisions VALUES(?,?,?)', next, pub, now());
    store.run('UPDATE catalog SET version=version+1,draft=?,published=?,published_version=? WHERE id=1', upgrade(current.draft), pub, next);
    store.run('INSERT INTO migrations VALUES(3,?)', now());
  });
  // Apply the requested title to existing snapshots once; future admin edits remain editable.
  if (!store.get('SELECT version FROM migrations WHERE version=4')) store.transaction(() => {
    const current = store.get('SELECT * FROM catalog WHERE id=1');
    const rename = raw => {
      const tree = JSON.parse(raw);
      tree.boards = (tree.boards || []).map(board => board.id === 'math-taxonomy' ? { ...board, title: '中小学高中知识图谱' } : board);
      return JSON.stringify(tree);
    };
    const pub = rename(current.published), next = store.get('SELECT COALESCE(MAX(id),0)+1 AS next FROM revisions').next;
    store.run('INSERT INTO revisions VALUES(?,?,?)', next, pub, now());
    store.run('UPDATE catalog SET version=version+1,draft=?,published=?,published_version=? WHERE id=1', rename(current.draft), pub, next);
    store.run('INSERT INTO migrations VALUES(4,?)', now());
  });
}
function entries(tree) {
  const result = [];
  for (const b of tree.boards || []) result.push({ id: b.id, type: 'board', parent: '' });
  for (const c of tree.categories) result.push({ id: c.id, type: 'category', parent: '' });
  for (const c of tree.courses) {
    result.push({ id: c.id, type: 'course', parent: '' });
    for (const ch of c.chapters) {
      result.push({ id: ch.id, type: 'chapter', parent: c.id, courseId: c.id, chapterId: ch.id });
      for (const s of ch.sections) result.push({ id: s.id, type: 'section', parent: ch.id, courseId: c.id, chapterId: ch.id, sectionId: s.id });
    }
  }
  return result;
}
function registerEntities(store, tree) {
  for (const item of entries(tree)) {
    const old = store.get('SELECT * FROM entities WHERE id=?', item.id);
    if (old && (old.type !== item.type || old.parent !== item.parent)) fail(400, '已有内容不能更改所属层级，请复制为新内容后归档原内容');
    store.run('INSERT OR IGNORE INTO entities VALUES(?,?,?)', item.id, item.type, item.parent);
  }
}
function published(store) { const row = store.get('SELECT * FROM catalog WHERE id=1'); return { ...JSON.parse(row.published), version: row.published_version }; }
function draft(store) { const row = store.get('SELECT * FROM catalog WHERE id=1'); return { ...JSON.parse(row.draft), version: row.version }; }
function assetReference(store, value) {
  if (typeof value !== 'string') fail(400, '请选择有效图片');
  if (/^\/assets\/(icons|covers)\/[a-z0-9_-]+\.svg$/.test(value)) {
    if (!fs.existsSync(path.join(__dirname, '..', 'miniprogram', value))) fail(400, '默认图片不存在');
    return value;
  }
  const match = /^\/api\/assets\/([a-zA-Z0-9_-]{1,100})$/.exec(value);
  if (!match || !store.get("SELECT id FROM assets WHERE id=? AND kind='image'", match[1])) fail(400, '请选择已上传的图片');
  return value;
}
function validateTree(store, input, forPublish = false) {
  if (!input || !Array.isArray(input.courses) || !Array.isArray(input.categories) || !input.settings) fail(400, '课程结构有误');
  if (input.categories.length > 100 || input.courses.length > 200) fail(400, '分类或课程数量超过限制');
  const seen = new Set(); let sectionCount = 0;
  const ident = value => { identifier(value); if (seen.has(value)) fail(400, '内容 ID 重复'); seen.add(value); return value; };
  const source = input.settings;
  const settings = {};
  for (const key of ['brandName', 'welcomeTitle', 'gateTitle', 'gateDescription']) settings[key] = text(source[key], key === 'gateDescription' ? 1000 : 100);
  for (const key of ['logo', 'avatar', 'gateCover']) settings[key] = assetReference(store, source[key]);
  for (const key of ['help', 'about', 'redeemHelp']) {
    if (!Array.isArray(source[key]) || source[key].length > 30) fail(400, '帮助文案格式有误');
    settings[key] = source[key].map(v => text(v, 3000));
  }
  if (!Array.isArray(source.nav) || source.nav.length !== 3 || source.nav.map(n => n.id).join(',') !== 'home,learn,profile') fail(400, '导航必须保留首页、学习、我的三个固定入口');
  settings.nav = source.nav.map(n => ({ id: n.id, label: text(n.label, 12), icon: assetReference(store, n.icon) }));
  const categories = input.categories.map(c => ({ id: ident(c.id), title: text(c.title, 80) }));
  const courses = input.courses.map(c => {
    if (!categories.some(cat => cat.id === c.categoryId)) fail(400, '课程必须属于有效主题');
    if (!Array.isArray(c.chapters) || c.chapters.length > 300) fail(400, '章节数量有误');
    const course = { id: ident(c.id), categoryId: c.categoryId, title: text(c.title, 200), subtitle: text(c.subtitle || '', 300, false), description: text(c.description || '', 5000, false), duration: text(c.duration || '', 100, false), cover: assetReference(store, c.cover), published: c.published === true };
    course.chapters = c.chapters.map(ch => {
      if (!Array.isArray(ch.sections) || ch.sections.length > 300) fail(400, '小章节数量有误');
      return { id: ident(ch.id), title: text(ch.title, 200), sections: ch.sections.map(s => {
        if (++sectionCount > 10000 || !Array.isArray(s.body) || s.body.length > 100) fail(400, '小章节正文结构有误');
        return { id: ident(s.id), title: text(s.title, 200), question: text(s.question || '', 1000, false), body: s.body.map(p => text(p, 10000)), practice: text(s.practice || '', 10000, false) };
      }) };
    });
    if (forPublish && course.published && (!course.chapters.length || course.chapters.some(ch => !ch.sections.length || ch.sections.some(s => !s.question && !s.body.length && !s.practice)))) fail(400, '发布课程须有章节、小章节和阅读内容');
    return course;
  });
  const boards = require('./boards').validate(input.boards === undefined ? draft(store).boards || [] : input.boards, categories, value => assetReference(store, value), ident);
  const tree = { settings, categories, courses, boards };
  for (const item of entries(tree)) {
    const old = store.get('SELECT * FROM entities WHERE id=?', item.id);
    if (old && (old.type !== item.type || old.parent !== item.parent)) fail(400, '已有内容不可跨层级移动或复用 ID');
  }
  return tree;
}
function saveDraft(store, input) {
  const tree = validateTree(store, input);
  return store.transaction(() => {
    const current = draft(store);
    if (input.version !== current.version) fail(409, '草稿已被更新，请重新加载后编辑');
    registerEntities(store, tree);
    store.run('UPDATE catalog SET version=version+1,draft=? WHERE id=1', JSON.stringify(tree));
    return draft(store);
  });
}
function publish(store, version) {
  return store.transaction(() => {
    const current = draft(store);
    if (version !== current.version) fail(409, '草稿版本已变化，请重新加载');
    const tree = validateTree(store, current, true);
    const body = JSON.stringify(tree);
    const next = store.get('SELECT COALESCE(MAX(id),0)+1 AS next FROM revisions').next;
    store.run('INSERT INTO revisions VALUES(?,?,?)', next, body, now());
    store.run('UPDATE catalog SET published=?,published_version=? WHERE id=1', body, next);
    return { version: next, publishedAt: now() };
  });
}
function findOwner(tree, scope, ownerId) {
  if (scope === 'course') return tree.courses.find(c => c.id === ownerId && c.published);
  const item = entries(tree).find(e => e.id === ownerId && e.type === scope);
  return item && tree.courses.find(c => c.id === item.courseId && c.published);
}
function legacyMap(courseId) {
  const c = seed.courses.find(c => c.id === courseId);
  return { chapters: c ? c.chapters.map(ch => ({ id: ch.id, legacyIndex: ch.legacyIndex, sections: ch.sections.map(s => ({ id: s.id, legacyIndex: s.legacyIndex })) })) : [] };
}
module.exports = { initCatalog, entries, published, draft, saveDraft, publish, findOwner, legacyMap, seed };

const catalog = require('./catalog');
const { id, text, fail } = require('./security');
function register(router, store, audit) {
  router.post('/course-imports', (req, res) => {
    const input = req.body, tree = catalog.draft(store);
    if (input.version !== tree.version) fail(409, '草稿版本已变化，请重新加载课程列表再创建；已上传的文件可从资源库重新选用');
    if (!['text', 'document', 'video', 'website'].includes(input.kind)) fail(400, '请选择课程类型');
    const title = text(input.title, 200), description = text(input.description || '', 5000, false);
    let asset, website;
    if (['document', 'video'].includes(input.kind)) {
      asset = store.get('SELECT * FROM assets WHERE id=? AND kind=?', input.assetId, input.kind);
      if (!asset) fail(400, '请先上传或选择对应的课程文件');
    }
    if (input.kind === 'website') {
      website = store.get('SELECT * FROM web_packages WHERE id=?', input.websiteId);
      if (!website) fail(400, '请先上传或选择网页资源');
      if (input.boardId && input.boardId !== 'new') fail(400, '网页课程需要独立的板块入口');
    }
    let category = tree.categories.find(c => c.id === input.categoryId);
    if (!category) {
      if (input.categoryId && input.categoryId !== 'new') fail(400, '课程主题不存在');
      category = { id: id(), title: text(input.categoryTitle || title, 80) }; tree.categories.push(category);
    }
    const body = input.kind === 'text' ? text(input.body, 50000).split(/\r?\n/).map(p => p.trim()).filter(Boolean) : [input.kind === 'website' ? '请从学习板块入口打开互动网页课程。' : '本课学习内容见下方课程资料，请打开文档或播放视频。'];
    const course = { id: id(), categoryId: category.id, title, contentType: input.kind, subtitle: '', description, duration: '', cover: tree.settings.gateCover, published: true,
      chapters: [{ id: id(), title: '课程学习', sections: [{ id: id(), title, question: '', body, practice: '' }] }] };
    if (input.position === 'first') tree.courses.unshift(course); else tree.courses.push(course);
    let board;
    if (input.boardId && input.boardId !== 'new') {
      board = tree.boards.find(b => b.id === input.boardId);
      if (!board || board.experience !== 'courses') fail(400, '请选择课程与练习类型的板块');
      if (!board.categoryIds.includes(category.id)) board.categoryIds.push(category.id);
    } else {
      board = { id: id(), title: text(input.boardTitle || title, 40), subtitle: description.slice(0, 100), description: description.slice(0, 1000),
        experience: website ? 'website:' + website.id : 'courses', categoryIds: [category.id], group: 'subject', tone: 'blue', badge: '', icon: '/assets/icons/book.svg', cover: course.cover,
        enabled: true, home: input.home !== false, learn: true, featured: false,
        features: [{ id: 'courses', type: 'courses', title: '系统课程', description: '', icon: '/assets/icons/book.svg' }] };
      if (input.position === 'first') tree.boards.unshift(board); else tree.boards.push(board);
    }
    const materialId = asset ? id() : null;
    const saved = catalog.saveDraft(store, { ...tree, version: input.version }, () => {
      if (asset) store.run('INSERT INTO materials VALUES(?,?,?,?,?,?,?)', materialId, asset.id, title, 'course', course.id, 0, 1);
      audit(req.admin.id, 'course.create', course.id, { kind: input.kind, boardId: board.id });
    });
    res.status(201).json({ catalog: saved, courseId: course.id, boardId: board.id, materialId });
  });
}
module.exports = { register };

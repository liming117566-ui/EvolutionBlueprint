import { api } from './api.js';
import { el, button, field, head, modal, busy, errorBox, showError, notify, confirmDanger, badge, image, lines } from './ui.js';
import { imageField } from './assets.js';
const uid = () => crypto.randomUUID();
export async function renderCatalog(host, context) {
  let catalog = await context.getCatalog();
  catalog.boards ||= [];
  if (context.view === 'boards' && !['board', 'new-board'].includes(context.selection?.type)) context.selection = catalog.boards[0] ? { type: 'board', id: catalog.boards[0].id } : { type: 'settings', id: '' };
  let selection = context.selection || { type: 'settings', id: '' }, mode = 'edit', revision = 0;
  const labels = new Map(), editor = el('section', { class: 'panel' }), tree = el('div'), errors = errorBox(), state = el('span', { class: 'muted', role: 'status' });
  let saving = false;
  const save = button('保存草稿', () => busy(save, saveDraft, errors), 'primary');
  const publish = button('发布内容', () => busy(publish, async () => {
    if (!confirmDanger('确定发布当前内容？发布后小程序将读取新版本。资料关联独立生效，请同时核对上架状态。')) return;
    if (context.catalogDirty) await saveDraft();
    if (context.catalogDirty) throw new Error('保存期间又产生了新更改，请先保存草稿，再发布');
    const result = await api('/api/admin/publish', { method: 'POST', body: { version: catalog.version } });
    notify(`内容已发布${result.publishedAt ? `（${new Date(result.publishedAt).toLocaleString('zh-CN')}）` : ''}`); updateState();
  }, errors));
  const refresh = button('重新载入草稿', () => busy(refresh, async () => {
    if (context.catalogDirty && !confirmDanger('重新载入会丢弃当前未保存的全部草稿更改。确定继续？')) return;
    catalog = await api('/api/admin/catalog'); context.catalog = catalog; context.catalogDirty = false; revision = 0;
    drawTree(); drawEditor(); updateState(); errors.textContent = '';
  }, errors));
  host.replaceChildren(head(context.view === 'boards' ? '学习板块与入口' : '内容与发布', '板块 → 课程主题 → 课程 → 章节 → 小节。保存草稿后发布，即可同步到首页与学习空间。'), el('div', { class: 'toolbar' }, save, publish, button('查看已发布内容', () => busy(publish, publishedPreview, errors)), refresh, state), errors, el('div', { class: 'catalog-layout' }, el('aside', { class: 'panel tree-panel', 'aria-label': '内容目录' }, tree), editor));
  function updateState() { state.textContent = `草稿版本 ${catalog.version} · ${context.catalogDirty ? '有未保存更改' : '已保存'}`; state.className = context.catalogDirty ? 'pending-label' : 'muted'; save.disabled = saving || save.getAttribute('aria-busy') === 'true'; publish.disabled = saving || publish.getAttribute('aria-busy') === 'true'; refresh.disabled = saving || refresh.getAttribute('aria-busy') === 'true'; }
  function dirty() { context.catalogDirty = true; revision++; updateState(); }
  function resolve() {
    if (selection.type === 'settings') return { item: catalog.settings };
    const board = catalog.boards.find(x => x.id === selection.id);
    if (board && selection.type === 'board') return { item: board, array: catalog.boards };
    const category = catalog.categories.find(x => x.id === selection.id);
    if (category && selection.type === 'category') return { item: category, array: catalog.categories };
    for (const course of catalog.courses) {
      if (course.id === selection.id && selection.type === 'course') return { item: course, array: catalog.courses };
      for (const chapter of course.chapters) {
        if (chapter.id === selection.id && selection.type === 'chapter') return { item: chapter, array: course.chapters, course };
        const section = chapter.sections.find(s => s.id === selection.id);
        if (section && selection.type === 'section') return { item: section, array: chapter.sections, course, chapter };
      }
    }
    selection = { type: 'settings', id: '' }; return { item: catalog.settings };
  }
  function select(type, id) { selection = { type, id }; context.selection = selection; drawTree(); drawEditor(); }
  function treeButton(type, item, prefix = '') {
    const b = button(`${prefix}${item.title}`, () => select(type, item.id));
    if (selection.id === item.id && selection.type === type) { b.classList.add('selected'); b.setAttribute('aria-current', 'true'); }
    labels.set(item.id, { button: b, prefix }); return b;
  }
  function courseNode(course) {
    return el('li', {}, treeButton('course', course, course.published ? '' : '〔归档〕'), el('ul', { class: 'tree' }, course.chapters.map(ch => el('li', {}, treeButton('chapter', ch), el('ul', { class: 'tree' }, ch.sections.map(s => el('li', {}, treeButton('section', s))))))));
  }
  function drawTree() {
    labels.clear();
    const settings = button('品牌、首页与导航', () => select('settings', '')); if (selection.type === 'settings') settings.classList.add('selected');
    tree.replaceChildren(el('h2', {}, '学习空间'), el('ul', { class: 'tree' }, catalog.boards.map(b => el('li', {}, treeButton('board', b, b.enabled ? '' : '〔隐藏〕')))), button('新增学习板块', addBoard, 'small primary'), el('h3', { class: 'section-label' }, '品牌与课程目录'), el('ul', { class: 'tree' }, el('li', {}, settings), catalog.categories.map(category => el('li', {}, el('details', { open: true }, el('summary', {}, category.title || '未命名主题'), el('ul', { class: 'tree' }, el('li', {}, treeButton('category', category, '编辑主题：')), catalog.courses.filter(c => c.categoryId === category.id).map(courseNode))))), catalog.courses.filter(c => !catalog.categories.some(k => k.id === c.categoryId)).map(courseNode)), el('div', { class: 'actions' }, button('新增主题', () => {
      const item = { id: uid(), title: '新主题' }; catalog.categories.push(item); dirty(); select('category', item.id);
    }, 'small')));
  }
  function addBoard() {
    const b = { id: uid(), experience: 'courses', title: '新的学习板块', subtitle: '', description: '', group: 'growth', tone: 'blue', badge: '', icon: '/assets/icons/book.svg', cover: catalog.settings.gateCover, categoryIds: [], enabled: true, home: true, learn: true, featured: false, features: [
      { id: 'courses', type: 'courses', title: '系统课程', description: '循序渐进地学', icon: '/assets/icons/book.svg' },
      { id: 'practice', type: 'practice', title: '随堂练习', description: '把理解变成掌握', icon: '/assets/icons/pencil.svg' },
      { id: 'progress', type: 'progress', title: '学习进度', description: '看见每一步积累', icon: '/assets/icons/chart.svg' }
    ] };
    catalog.boards.push(b); dirty(); select('board', b.id);
  }
  function bind(label, item, key, options = {}) {
    const f = field(label, { value: item[key] ?? '', ...options });
    f.input.addEventListener(options.type === 'checkbox' || options.type === 'select' ? 'change' : 'input', () => {
      item[key] = options.type === 'checkbox' ? f.input.checked : f.input.value; dirty();
      if (key === 'title') { const ref = labels.get(item.id); if (ref) { ref.button.textContent = ref.prefix + item.title; if (selection.type === 'category') ref.button.closest('details').querySelector('summary').textContent = item.title || '未命名主题'; } }
    }); return f.node;
  }
  function addCourse(categoryId) {
    const c = { id: uid(), categoryId, title: '新课程', subtitle: '', description: '', duration: '', cover: catalog.settings.gateCover, published: false, chapters: [] };
    catalog.courses.push(c); dirty(); select('course', c.id);
  }
  function addChapter(course) { const ch = { id: uid(), title: '新章节', sections: [] }; course.chapters.push(ch); dirty(); select('chapter', ch.id); }
  function addSection(chapter) { const s = { id: uid(), title: '新小节', question: '', body: [], practice: '' }; chapter.sections.push(s); dirty(); select('section', s.id); }
  function move(item, array, offset) {
    const index = array.indexOf(item); let target = index + offset;
    if (selection.type === 'course') { while (array[target] && array[target].categoryId !== item.categoryId) target += offset; }
    if (target < 0 || target >= array.length) return;
    [array[index], array[target]] = [array[target], array[index]]; dirty(); drawTree(); drawEditor();
  }
  function remove(item, array) {
    if (selection.type === 'category' && catalog.boards.some(b => b.categoryIds.includes(item.id))) { notify('此主题已关联学习板块，请先在板块中取消关联，再删除主题。', true); return; }
    if (selection.type === 'category' && catalog.courses.some(c => c.categoryId === item.id)) { notify('此主题下还有课程。请先归档并删除课程，或保留该主题。正式课程不允许跨层级搬移。', true); return; }
    if (!confirmDanger(`确定从草稿删除“${item.title}”${selection.type === 'course' || selection.type === 'chapter' ? '及其全部子内容' : ''}？不会删除历史学习记录；正式课程建议使用归档。保存发布前可重新载入撤销。`)) return;
    array.splice(array.indexOf(item), 1); dirty(); select('settings', '');
  }
  function drawEditor() {
    const found = resolve(), { item, array } = found;
    const names = { settings: '品牌与首页', board: '学习板块', category: '主题', course: '课程', chapter: '章节', section: '小节' };
    const editTab = button('编辑', () => { mode = 'edit'; drawEditor(); }); editTab.setAttribute('aria-selected', mode === 'edit');
    const previewTab = button('纯文本预览', () => { mode = 'preview'; drawEditor(); }); previewTab.setAttribute('aria-selected', mode === 'preview');
    editor.replaceChildren(el('div', { class: 'editor-top' }, el('div', {}, el('h2', {}, names[selection.type]), item.id ? el('div', { class: 'id-text' }, item.id) : null), array ? el('div', { class: 'row' }, button('上移', () => move(item, array, -1), 'small'), button('下移', () => move(item, array, 1), 'small'), button('删除', () => remove(item, array), 'small danger')) : null), el('div', { class: 'tabs', role: 'tablist', 'aria-label': '编辑或预览' }, editTab, previewTab));
    if (mode === 'preview') { editor.append(previewItem(selection.type, item, catalog)); return; }
    if (selection.type === 'settings') { renderSettings(item); return; }
    if (selection.type === 'board') { renderBoard(item); return; }
    editor.append(bind('标题', item, 'title', { maxlength: selection.type === 'category' ? 80 : 200, required: true }));
    if (selection.type === 'category') {
      editor.append(el('p', { class: 'muted' }, '主题名称及数组顺序会同步到小程序。已有课程不支持跨主题搬移，以保持历史引用稳定。'), button('在此主题新增课程', () => addCourse(item.id), 'primary')); return;
    }
    if (selection.type === 'course') {
      editor.append(el('p', { class: 'muted' }, `归属主题：${catalog.categories.find(c => c.id === item.categoryId)?.title || '主题不存在'}`), bind('副标题', item, 'subtitle', { maxlength: 300 }), bind('课程介绍', item, 'description', { type: 'textarea', maxlength: 5000 }), bind('课程时长文案', item, 'duration', { maxlength: 100 }), imageField('课程封面', item.cover, value => { item.cover = value; dirty(); }), bind('发布中显示此课程', item, 'published', { type: 'checkbox', hint: '关闭后归档课程，不删除学习历史。仍需保存并发布。' }), el('div', { class: 'actions' }, button('新增章节', () => addChapter(item), 'primary'))); return;
    }
    if (selection.type === 'chapter') {
      editor.append(el('p', { class: 'muted' }, `归属课程：${found.course.title}。小节数量不限；选中小节可编辑正文与练习。`), button('新增小节', () => addSection(item), 'primary')); return;
    }
    editor.append(bind('问题导入', item, 'question', { type: 'textarea', maxlength: 1000 }));
    const paragraphs = el('div');
    function drawParagraphs() {
      paragraphs.replaceChildren(el('h3', {}, '正文段落'), el('p', { class: 'muted' }, '每个输入框是一段正文，支持任意数量。内容按纯文本显示，不执行 HTML。'), item.body.map((text, index) => {
        const f = field(`第 ${index + 1} 段`, { type: 'textarea', value: text, maxlength: 10000 });
        f.input.addEventListener('input', () => { item.body[index] = f.input.value; dirty(); });
        const up = button('上移', () => { if (!index) return; [item.body[index - 1], item.body[index]] = [item.body[index], item.body[index - 1]]; dirty(); drawParagraphs(); }, 'small'); up.disabled = index === 0;
        const down = button('下移', () => { if (index === item.body.length - 1) return; [item.body[index + 1], item.body[index]] = [item.body[index], item.body[index + 1]]; dirty(); drawParagraphs(); }, 'small'); down.disabled = index === item.body.length - 1;
        return el('div', {}, f.node, el('div', { class: 'toolbar' }, up, down, button('删除段落', () => { if (item.body[index] && !confirmDanger('确定删除此段正文？')) return; item.body.splice(index, 1); dirty(); drawParagraphs(); }, 'small danger')));
      }), button('新增正文段落', () => { item.body.push(''); dirty(); drawParagraphs(); }, 'small'));
    }
    drawParagraphs(); editor.append(paragraphs, el('hr', { class: 'divider' }), bind('随堂练习', item, 'practice', { type: 'textarea', maxlength: 10000 }));
  }
  function renderBoard(item) {
    editor.append(bind('打开页面', item, 'experience', { type: 'select', options: [{ value: 'courses', label: '课程与练习空间' }, { value: 'english-starry-sky', label: '英语星空 · 初中英语' }, { value: 'cn-math-taxonomy', label: '数学知识图谱 · 自适应诊断' }, { value: 'tainai-junior-math', label: '初中数学 · 分步课程与动画' }], hint: '独立学习模块使用各自的界面和本机记录，无需额外登录。下方主题与功能配置仅影响课程空间。' }));
    editor.append(el('p', { class: 'muted' }, '首页与学习页只展示板块入口。进入二级页面后，展示关联主题下的课程、练习和进度；课程权限保持独立校验。'), bind('板块名称', item, 'title', { maxlength: 40, required: true }), bind('一句话介绍', item, 'subtitle', { maxlength: 100 }), bind('二级页面介绍', item, 'description', { type: 'textarea', maxlength: 1000 }), el('div', { class: 'form-grid' }, bind('所属分组', item, 'group', { type: 'select', options: [{ value: 'subject', label: '学科提升' }, { value: 'growth', label: '自我成长' }, { value: 'life', label: '生活方式' }] }), bind('材质配色', item, 'tone', { type: 'select', options: [{ value: 'blue', label: '晨光蓝' }, { value: 'lilac', label: '柔雾紫' }, { value: 'ink', label: '安静深蓝' }] })), bind('推荐标签', item, 'badge', { maxlength: 16 }), imageField('入口图标', item.icon, value => { item.icon = value; dirty(); }), imageField('推荐位封面', item.cover, value => { item.cover = value; dirty(); }), el('h3', { class: 'section-label' }, '展示位置'), bind('启用此板块', item, 'enabled', { type: 'checkbox' }), bind('显示在首页', item, 'home', { type: 'checkbox' }), bind('显示在学习页', item, 'learn', { type: 'checkbox' }), bind('作为首页主推荐', item, 'featured', { type: 'checkbox', hint: '多个主推荐启用时，按板块排序取第一个。可用上移、下移调整顺序。' }), el('h3', { class: 'section-label' }, '关联课程主题'), el('p', { class: 'muted' }, '可关联多个主题。主题下新发布的课程会自动加入此板块。未关联主题时，前端显示内容筹备状态。'));
    const checks = el('div', { class: 'check-list' });
    for (const c of catalog.categories) {
      const check = el('input', { type: 'checkbox', checked: item.categoryIds.includes(c.id) });
      check.addEventListener('change', () => { item.categoryIds = check.checked ? [...item.categoryIds, c.id] : item.categoryIds.filter(id => id !== c.id); dirty(); });
      checks.append(el('label', {}, check, c.title));
    }
    editor.append(checks, el('h3', { class: 'section-label' }, '二级功能入口'), el('p', { class: 'muted' }, '至少保留一个入口；可修改标题、说明和图标，或隐藏不需要的功能。'));
    const definitions = [{ type: 'courses', title: '系统课程', icon: '/assets/icons/book.svg' }, { type: 'practice', title: '随堂练习', icon: '/assets/icons/pencil.svg' }, { type: 'progress', title: '学习进度', icon: '/assets/icons/chart.svg' }];
    for (const def of definitions) {
      const enabled = el('input', { type: 'checkbox', checked: item.features.some(f => f.type === def.type) });
      enabled.addEventListener('change', () => {
        if (!enabled.checked && item.features.length === 1) { enabled.checked = true; notify('请至少保留一个功能入口。', true); return; }
        item.features = enabled.checked ? [...item.features, { ...def, id: def.type, description: '' }] : item.features.filter(f => f.type !== def.type); dirty(); drawEditor();
      });
      editor.append(el('h3', {}, el('label', { class: 'row' }, enabled, def.title)));
      const feature = item.features.find(f => f.type === def.type);
      if (feature) editor.append(bind('入口名称', feature, 'title', { maxlength: 20 }), bind('入口说明', feature, 'description', { maxlength: 60 }), imageField('功能图标', feature.icon, value => { feature.icon = value; dirty(); }));
    }
  }
  function renderSettings(settings) {
    editor.append(bind('品牌名称', settings, 'brandName', { maxlength: 100 }), imageField('品牌标志', settings.logo, value => { settings.logo = value; dirty(); }), imageField('默认头像', settings.avatar, value => { settings.avatar = value; dirty(); }), imageField('兑换入口封面', settings.gateCover, value => { settings.gateCover = value; dirty(); }), bind('首页欢迎标题', settings, 'welcomeTitle', { maxlength: 100 }), bind('兑换入口标题', settings, 'gateTitle', { maxlength: 100 }), bind('兑换入口说明', settings, 'gateDescription', { type: 'textarea', maxlength: 1000 }), el('h3', { class: 'section-label' }, '底部导航'), el('p', { class: 'muted' }, '首页 home、学习 learn、我的 profile 的 ID 固定，仅编辑名称与图标。'));
    for (const id of ['home', 'learn', 'profile']) {
      let nav = settings.nav.find(x => x.id === id);
      if (!nav) { nav = { id, label: { home: '首页', learn: '学习', profile: '我的' }[id], icon: '' }; settings.nav.push(nav); dirty(); }
      editor.append(el('h3', {}, id), bind('导航名称', nav, 'label', { maxlength: 12 }), imageField('导航图标', nav.icon, value => { nav.icon = value; dirty(); }));
    }
    for (const [key, label] of [['help', '使用帮助'], ['about', '关于我们'], ['redeemHelp', '兑换帮助']]) {
      const f = field(label, { type: 'textarea', value: (settings[key] || []).join('\n'), hint: '每行一条；空行忽略。' });
      f.input.addEventListener('input', () => { settings[key] = lines(f.input.value); dirty(); }); editor.append(f.node);
    }
  }
  async function saveDraft() {
    if (saving) throw new Error('草稿正在保存，请稍候');
    const savedRevision = revision, snapshot = structuredClone(catalog);
    saving = true; updateState();
    try {
      const result = await api('/api/admin/catalog', { method: 'PUT', body: { version: snapshot.version, settings: snapshot.settings, categories: snapshot.categories, courses: snapshot.courses, boards: snapshot.boards } });
      catalog.version = result.version; context.catalogDirty = revision !== savedRevision; notify(context.catalogDirty ? '之前的草稿已保存，当前还有新更改未保存' : '完整草稿已保存');
    } catch (error) {
      if (error.status === 409) throw new Error('草稿版本冲突：其他管理员已保存新版本。当前更改仍保留。请先复制需要保留的文本，再选择“重新载入草稿”，不要覆盖他人的更改。');
      throw error;
    } finally { saving = false; updateState(); }
  }
  async function publishedPreview() {
    const published = await api('/api/admin/published');
    const m = modal('已发布内容 · 纯文本预览');
    m.content.append(el('p', { class: 'muted' }, `已发布版本 ${published.version ?? '—'}，不是当前未发布草稿。`), (published.boards || []).map(b => previewItem('board', b, published)), previewItem('settings', published.settings, published), published.categories.map(c => el('section', {}, el('h2', { class: 'section-label' }, c.title), published.courses.filter(course => course.categoryId === c.id && course.published).map(course => previewItem('course', course, published)))));
  }
  drawTree(); drawEditor(); updateState();
}
function previewItem(type, item, catalog) {
  const wrapper = el('article', { class: 'preview' });
  if (type === 'settings') {
    wrapper.append(image(item.logo, '品牌标志'), el('h2', {}, item.brandName), el('h3', {}, item.welcomeTitle), image(item.avatar, '默认头像'), image(item.gateCover, '兑换入口封面'), el('h3', {}, item.gateTitle), el('p', {}, item.gateDescription), el('h3', {}, '底部导航'), el('div', { class: 'row' }, item.nav.map(n => el('div', {}, image(n.icon, n.label), el('p', {}, n.label)))), [['help', '使用帮助'], ['about', '关于我们'], ['redeemHelp', '兑换帮助']].map(([key, label]) => el('section', {}, el('h3', {}, label), (item[key] || []).map(text => el('p', {}, text)))));
  } else if (type === 'board') {
    wrapper.append(image(item.cover, item.title), el('h2', {}, item.title), el('p', {}, item.subtitle), el('p', {}, item.description), badge(item.enabled ? '已启用' : '已隐藏', item.enabled), el('p', {}, `展示：${[item.home && '首页', item.learn && '学习页'].filter(Boolean).join('、') || '未选择'}`), el('h3', {}, '功能入口'), item.features.map(f => el('p', {}, f.title, ' · ', f.description)), el('h3', {}, '关联主题'), item.categoryIds.map(id => el('p', {}, catalog.categories.find(c => c.id === id)?.title || '主题已移除')));
  } else if (type === 'category') {
    wrapper.append(el('h2', {}, item.title), catalog.courses.filter(c => c.categoryId === item.id).map(c => el('p', {}, c.title, ' ', badge(c.published ? '显示' : '归档', c.published))));
  } else if (type === 'course') {
    wrapper.append(image(item.cover, item.title), el('h2', {}, item.title), el('p', {}, item.subtitle), el('p', { class: 'muted' }, item.duration), el('p', {}, item.description), badge(item.published ? '显示中' : '已归档', item.published), item.chapters.map(ch => previewItem('chapter', ch, catalog)));
  } else if (type === 'chapter') {
    wrapper.append(el('h3', { class: 'section-label' }, item.title), item.sections.map(s => previewItem('section', s, catalog)));
  } else {
    wrapper.append(el('h3', {}, item.title), item.question ? el('p', {}, item.question) : null, item.body.map(text => el('p', {}, text)), item.practice ? el('section', {}, el('h3', {}, '随堂练习'), el('p', {}, item.practice)) : null);
  }
  return wrapper;
}

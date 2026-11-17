import { api, uploadFile } from './api.js';
import { el, button, field, head, table, modal, busy, errorBox, notify, confirmDanger, badge, adminImageUrl } from './ui.js';
import { chooseAsset } from './assets.js';
import { icon } from './icons.js';
export async function saveCatalog(context) {
  const tree = await context.getCatalog();
  const submitted = structuredClone(tree), before = JSON.stringify(submitted);
  const saved = await api('/api/admin/catalog', { method: 'PUT', body: submitted });
  const editedWhileSaving = JSON.stringify(tree) !== before;
  if (editedWhileSaving) tree.version = saved.version;
  else Object.assign(tree, saved);
  context.catalog = tree; context.catalogDirty = editedWhileSaving; return tree;
}
export function saveStrip(context, changed) {
  const state = el('span', { role: 'status' });
  const update = () => { state.textContent = context.catalogDirty ? '有未保存的调整 · 发布后同步前端' : `草稿版本 ${context.catalog?.version || '—'} · 发布后同步前端`; };
  update();
  const errors = errorBox();
  const save = button('保存草稿', event => busy(event.currentTarget, async () => { await saveCatalog(context); notify('草稿已保存'); update(); await changed?.(); }, errors));
  const publish = button('发布到前端', event => busy(event.currentTarget, async () => {
    if (!confirmDanger('确定发布当前全部草稿？课程内容、板块展示和排序将一起同步到前端。')) return;
    if (context.catalogDirty) await saveCatalog(context);
    if (context.catalogDirty) throw new Error('保存期间又产生了新调整，请先保存草稿，再发布');
    await api('/api/admin/publish', { method: 'POST', body: { version: context.catalog.version } }); notify('已发布，前端将在重新加载后显示最新内容与排序'); update(); await changed?.();
  }, errors), 'primary');
  return { node: el('div', {}, el('div', { class: 'save-strip' }, state, el('div', { class: 'row' }, save, publish)), errors), update };
}
const kinds = [
  { id: 'text', title: '在线图文', note: '直接编辑文字与练习', icon: 'text', accept: '' },
  { id: 'document', title: 'PDF / Word', note: 'PDF、DOC、DOCX', icon: 'file', accept: '.pdf,.doc,.docx' },
  { id: 'video', title: '视频课程', note: 'MP4、WebM · ≤ 500 MB', icon: 'video', accept: '.mp4,.webm' },
  { id: 'website', title: '网页课程', note: 'HTML 或静态网页 ZIP', icon: 'globe', accept: '.html,.htm,.zip' }
];
export async function importCourse(context, preset = 'document') {
  try {
    let tree = await context.getCatalog();
    if (context.catalogDirty) { tree = await saveCatalog(context); if (context.catalogDirty) throw new Error('保存期间又产生了新调整，请先保存草稿，再新增课程'); notify('已先保存当前目录草稿'); }
    let kind = preset, uploaded = null, changed = false, creating = false;
    const m = modal('新增课程', { beforeClose: () => !changed || confirmDanger('课程尚未创建，确定关闭？已经上传的文件会保留在资源库，可继续选用。') });
    m.dialog.classList.add('import-dialog');
    const typeButtons = el('div', { class: 'type-grid' }), source = el('div'), selectedInfo = el('div');
    const title = field('课程名称', { required: true, maxlength: 200, placeholder: '例如：七年级数学 · 有理数' });
    const description = field('课程介绍', { type: 'textarea', maxlength: 5000, placeholder: '向学员介绍这门课程的学习内容' });
    const body = field('在线课程正文', { type: 'textarea', maxlength: 50000, placeholder: '直接输入课程文字，每一行保存为一个段落。创建后可继续编辑章节、小节与随堂练习。' });
    const file = field('选择课程文件', { type: 'file' });
    const category = field('所属课程主题', { type: 'select', value: 'new', options: [{ value: 'new', label: '新建课程主题' }, ...tree.categories.map(c => ({ value: c.id, label: c.title }))] });
    const categoryTitle = field('新主题名称', { maxlength: 80, placeholder: '留空时使用课程名称' });
    const board = field('前端学习板块', { type: 'select', value: 'new', options: [{ value: 'new', label: '新建独立板块入口' }, ...tree.boards.filter(b => b.experience === 'courses').map(b => ({ value: b.id, label: b.title }))], hint: '选择现有板块时，课程主题会加入该板块；同一主题下的课程将一起展示。' });
    const boardTitle = field('新板块名称', { maxlength: 40, placeholder: '最多 40 字，留空时使用课程名称' });
    const position = field('初始展示位置', { type: 'select', value: 'last', options: [{ value: 'last', label: '放在末尾' }, { value: 'first', label: '放在最前' }], hint: '后续可在“前端排序”拖动或上下移动。' });
    const home = field('新板块显示在首页', { type: 'checkbox', value: true });
    const errors = errorBox(), progress = el('p', { class: 'muted', role: 'status' });
    const submit = el('button', { type: 'submit', class: 'btn primary' }, '创建课程草稿');
    const updateFields = () => {
      categoryTitle.node.hidden = category.input.value !== 'new'; boardTitle.node.hidden = board.input.value !== 'new'; home.node.hidden = board.input.value !== 'new';
    };
    category.input.addEventListener('change', updateFields); board.input.addEventListener('change', updateFields);
    file.input.addEventListener('change', () => {
      uploaded = null; selectedInfo.replaceChildren(); const selected = file.input.files[0];
      if (selected && !title.input.value) title.input.value = selected.name.replace(/\.[^.]+$/, '');
    });
    const selectUploaded = item => { uploaded = item; changed = true; file.input.value = ''; if (!title.input.value) title.input.value = item.title; selectedInfo.replaceChildren(el('div', { class: 'import-summary' }, icon('file'), `已选用：${item.title}`)); };
    const drawType = () => {
      typeButtons.replaceChildren(...kinds.map(k => button(el('span', {}, icon(k.icon), el('strong', {}, k.title), el('small', {}, k.note)), () => {
        kind = k.id; uploaded = null; file.input.value = ''; selectedInfo.replaceChildren(); drawType();
      }, 'type-option')));
      [...typeButtons.children].forEach((b, index) => b.setAttribute('aria-pressed', String(kinds[index].id === kind)));
      const definition = kinds.find(k => k.id === kind); file.input.accept = definition.accept;
      body.input.required = kind === 'text';
      board.input.disabled = kind === 'website'; if (kind === 'website') board.input.value = 'new';
      file.node.querySelector('span').textContent = kind === 'website' ? '选择 HTML 或 ZIP 网页包' : kind === 'video' ? '选择 MP4 或 WebM 视频' : '选择 PDF 或 Word 文档';
      const help = kind === 'website' ? '上传 HTML（≤ 5 MB）或已经构建好的静态网页 ZIP（≤ 50 MB）。ZIP 包含唯一 index.html，引用本地相对资源；需要服务器的源代码须先构建。' : kind === 'video' ? '推荐 MP4（H.264 视频 / AAC 音频），单文件 ≤ 500 MB。视频通过课程权益校验后播放。' : '支持 PDF、DOC、DOCX，单文件 ≤ 20 MB。上传后自动关联到这门课程。';
      source.replaceChildren(...(kind === 'text' ? [body.node] : [el('div', { class: 'upload-zone' }, file.node, el('p', { class: 'editor-hint' }, help)), button('从已上传资源中选择', async () => {
        if (kind !== 'website') return chooseAsset(kind, selectUploaded);
        try {
          const websites = (await api('/api/admin/websites')).items;
          const picker = modal('选择网页课程');
          picker.content.append(table([{ label: '名称', key: 'title' }, { label: '操作', render: w => button('选用', () => { selectUploaded(w); picker.close(); }, 'small primary') }], websites, '尚无网页资源，请先上传。'));
        } catch (error) { notify(error.message, true); }
      }, 'small'), selectedInfo])); updateFields();
    };
    const form = el('form', { oninput: () => { changed = true; }, onchange: () => { changed = true; }, onsubmit: event => {
      event.preventDefault(); if (creating) return;
      busy(submit, async () => {
        creating = true;
        try {
          if (kind !== 'text' && !uploaded) {
            const selected = file.input.files[0]; if (!selected) throw new Error('请选择课程文件，或从已上传资源中选用');
            const valid = kind === 'document' ? /\.(pdf|docx?)$/i : kind === 'video' ? /\.(mp4|webm)$/i : /\.(html?|zip)$/i;
            const limit = kind === 'video' ? 500 : kind === 'document' ? 20 : /\.zip$/i.test(selected.name) ? 50 : 5;
            if (!valid.test(selected.name) || selected.size > limit * 1048576) throw new Error(`请选择支持的文件，大小须不超过 ${limit} MB`);
            const data = new FormData(); data.append('file', selected); data.append('title', title.input.value.trim());
            const route = kind === 'video' ? 'videos' : kind === 'website' ? 'websites' : 'assets';
            progress.textContent = '正在上传…';
            const result = await uploadFile('/api/admin/' + route, data, value => { progress.textContent = value < 100 ? `正在上传 ${value}%` : '上传完成，正在校验文件…'; });
            uploaded = result.asset || result.website; selectUploaded(uploaded);
          }
          progress.textContent = '正在创建课程和前端入口…';
          const result = await api('/api/admin/course-imports', { method: 'POST', body: { version: tree.version, kind, title: title.input.value.trim(), description: description.input.value, body: body.input.value,
            assetId: kind === 'website' ? undefined : uploaded?.id, websiteId: kind === 'website' ? uploaded?.id : undefined,
            categoryId: category.input.value, categoryTitle: categoryTitle.input.value, boardId: board.input.value, boardTitle: boardTitle.input.value, position: position.input.value, home: home.input.checked } });
          context.catalog = result.catalog; context.catalogDirty = false; context.selection = { type: 'course', id: result.courseId };
          changed = false; m.close(); notify('课程草稿已创建，点击“发布到前端”后生效；可继续编辑课程和排序');
          await context.navigate('catalog');
        } finally { creating = false; progress.textContent = ''; }
      }, errors);
    } }, el('div', { class: 'steps' }, ...['选择类型', '填写课程与上传内容', '设置入口并保存'].map((text, index) => el('span', {}, el('b', {}, index + 1), text))), typeButtons,
      title.node, source, description.node, el('div', { class: 'form-grid' }, category.node, categoryTitle.node, board.node, boardTitle.node, position.node, home.node),
      el('p', { class: 'status' }, '创建后保存为草稿。发布后学员可在对应学习板块找到课程，原有兑换与课程权限继续生效。'), errors, progress,
      el('div', { class: 'dialog-actions' }, button('取消', () => m.close()), submit));
    m.content.append(form); drawType(); title.input.focus();
  } catch (error) { notify(error.message, true); }
}
export async function renderCourses(host, context) {
  const tree = await context.getCatalog();
  const [materials, publishedData] = await Promise.all([api('/api/admin/materials'), api('/api/admin/published')]);
  let published = publishedData;
  const list = el('div'), strip = saveStrip(context, async () => { published = await api('/api/admin/published'); draw(); });
  const search = field('课程名称', { type: 'search', placeholder: '搜索课程名称或介绍' });
  const category = field('课程主题', { type: 'select', options: [{ value: '', label: '全部主题' }, ...tree.categories.map(c => ({ value: c.id, label: c.title }))] });
  const status = field('发布状态', { type: 'select', options: [{ value: '', label: '全部状态' }, { value: 'active', label: '已发布' }, { value: 'draft', label: '待发布' }, { value: 'archived', label: '已归档' }] });
  const contentSnapshot = c => JSON.stringify({ id: c.id, categoryId: c.categoryId, title: c.title, subtitle: c.subtitle || '', description: c.description || '', duration: c.duration || '', cover: c.cover, published: c.published, contentType: c.contentType,
    chapters: c.chapters.map(ch => ({ id: ch.id, title: ch.title, sections: ch.sections.map(s => ({ id: s.id, title: s.title, question: s.question || '', body: s.body, practice: s.practice || '' })) })) });
  const publication = course => {
    const previous = published.courses.find(c => c.id === course.id);
    if (!course.published) return previous?.published ? 'draft' : 'archived';
    return previous?.published && contentSnapshot(previous) === contentSnapshot(course) ? 'active' : 'draft';
  };
  const typeOf = course => {
    if (course.contentType) return kinds.find(k => k.id === course.contentType)?.title || '在线图文';
    const webBoard = tree.boards.find(b => b.categoryIds.includes(course.categoryId) && b.experience.startsWith('website:'));
    if (webBoard) return '网页课程';
    const refs = materials.items.filter(m => m.ownerId === course.id || course.chapters.some(ch => ch.id === m.ownerId || ch.sections.some(s => s.id === m.ownerId)));
    if (refs.some(m => m.fileType === 'mp4' || m.fileType === 'webm')) return '视频课程';
    return refs.length ? 'PDF / Word' : '在线图文';
  };
  function edit(course) { context.selection = { type: 'course', id: course.id }; context.navigate('editor'); }
  function draw() {
    const q = search.input.value.trim().toLowerCase();
    const rows = tree.courses.filter(c => (!q || (c.title + c.description).toLowerCase().includes(q)) && (!category.input.value || c.categoryId === category.input.value) && (!status.input.value || publication(c) === status.input.value));
    list.replaceChildren(table([
      { label: '课程内容', render: c => el('div', { class: 'course-cell' }, el('img', { class: 'order-cover', src: adminImageUrl(c.cover), alt: '' }), el('div', { class: 'table-title' }, el('strong', {}, c.title), el('small', {}, `${c.chapters.length} 章 · ${typeOf(c)}`))) },
      { label: '课程主题', render: c => tree.categories.find(k => k.id === c.categoryId)?.title },
      { label: '发布状态', render: c => badge({ active: '已发布', draft: c.published ? '待发布' : '待归档', archived: '已归档' }[publication(c)], publication(c) === 'active') },
      { label: '前端顺序', render: c => tree.courses.filter(x => x.categoryId === c.categoryId).indexOf(c) + 1 },
      { label: '操作', render: c => el('div', { class: 'row' }, button('编辑课程', () => edit(c), 'link'), button(c.published ? '归档' : '恢复显示', () => { if (!confirmDanger(`确定${c.published ? '归档' : '恢复'}“${c.title}”？发布后生效。`)) return; c.published = !c.published; context.catalogDirty = true; strip.update(); draw(); }, 'link')) }
    ], rows, '没有匹配的课程，可调整筛选条件或新增课程。'), el('p', { class: 'editor-hint' }, `共 ${rows.length} 门课程 · 当前展示目录草稿，保存并发布后前端生效`));
  }
  [search, category, status].forEach(f => f.input.addEventListener('input', draw));
  host.replaceChildren(head('内容与发布', '统一管理在线图文、文档、视频和网页课程，保留完整章节编辑与草稿发布流程。', button('编辑完整目录', () => context.navigate('editor')), button(el('span', { class: 'row' }, icon('plus'), '新增课程'), () => importCourse(context), 'primary')),
    strip.node, el('section', { class: 'panel' }, el('div', { class: 'list-filters' }, search.node, category.node, status.node), list)); draw();
}
export async function renderOrder(host, context) {
  const tree = await context.getCatalog(); let selected = '', dragId;
  const errors = errorBox(), list = el('div', { class: 'order-list' }), tabs = el('div', { class: 'tabs' });
  const strip = saveStrip(context, () => draw());
  const scope = field('调整范围', { type: 'select', value: 'boards', options: [{ value: 'boards', label: '学习板块（首页 / 学习页）' }, { value: 'categories', label: '课程主题' }, { value: 'courses', label: '主题内课程' }] });
  const category = field('课程主题', { type: 'select', options: tree.categories.map(c => ({ value: c.id, label: c.title })) });
  const values = () => scope.input.value === 'courses' ? tree.courses.filter(c => c.categoryId === category.input.value) : tree[scope.input.value];
  const array = () => scope.input.value === 'courses' ? tree.courses : tree[scope.input.value];
  function change() { context.catalogDirty = true; strip.update(); draw(); }
  function move(item, offset) { const items = values(), index = items.indexOf(item), other = items[index + offset]; if (!other) return; const all = array(), a = all.indexOf(item), b = all.indexOf(other); [all[a], all[b]] = [all[b], all[a]]; change(); }
  function draw() {
    category.node.hidden = scope.input.value !== 'courses'; const items = values();
    list.replaceChildren(...items.map((item, index) => {
      const up = button('上移', () => move(item, -1), 'small'); up.disabled = index === 0;
      const down = button('下移', () => move(item, 1), 'small'); down.disabled = index === items.length - 1;
      const row = el('div', { class: 'order-item', draggable: true, 'data-id': item.id }, el('span', { class: 'order-index' }, String(index + 1).padStart(2, '0')),
        item.cover ? el('img', { src: adminImageUrl(item.cover), class: 'order-cover', alt: '' }) : icon('book'),
        el('div', { class: 'order-copy' }, el('strong', {}, item.title), el('small', {}, scope.input.value === 'boards' ? `${item.enabled ? '已启用' : '已隐藏'} · ${item.home ? '首页' : ''} ${item.learn ? '学习页' : ''}` : '拖动调整，或使用上移 / 下移')),
        el('div', { class: 'row' }, up, down, button('编辑', () => { context.selection = { type: scope.input.value === 'boards' ? 'board' : scope.input.value === 'categories' ? 'category' : 'course', id: item.id }; context.navigate(scope.input.value === 'boards' ? 'boards' : 'editor'); }, 'small')));
      if (scope.input.value === 'boards') {
        const controls = el('div', { class: 'board-toggle' });
        for (const [key, label] of [['enabled', '启用'], ['home', '首页'], ['learn', '学习页'], ['featured', '主推荐']]) {
          const input = el('input', { type: 'checkbox', checked: item[key], 'aria-label': item.title + ' · ' + label, onchange: () => { item[key] = input.checked; change(); } }); controls.append(el('label', {}, input, label));
        }
        row.querySelector('.order-copy').append(controls);
      }
      row.addEventListener('dragstart', event => { dragId = item.id; row.classList.add('dragging'); event.dataTransfer.setData('text/plain', item.id); event.dataTransfer.effectAllowed = 'move'; });
      row.addEventListener('dragend', () => { dragId = null; list.querySelectorAll('.dragging,.drag-over').forEach(r => r.classList.remove('dragging', 'drag-over')); });
      row.addEventListener('dragover', event => { if (dragId && dragId !== item.id) { event.preventDefault(); row.classList.add('drag-over'); } });
      row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
      row.addEventListener('drop', event => {
        event.preventDefault(); const source = items.find(x => x.id === dragId); if (!source || source === item) return;
        const reordered = [...items], from = reordered.indexOf(source), to = reordered.indexOf(item); reordered.splice(from, 1); reordered.splice(to, 0, source);
        const all = array(), ids = new Set(items.map(x => x.id)); let i = 0; all.forEach((x, at) => { if (ids.has(x.id)) all[at] = reordered[i++]; }); change();
      }); return row;
    }));
    if (!items.length) list.append(el('p', { class: 'empty' }, '暂无可排序的内容。请先新增课程或板块。'));
  }
  scope.input.addEventListener('change', draw); category.input.addEventListener('change', draw);
  host.replaceChildren(head('前端排序', '调整首页与学习页板块顺序、主题顺序和课程顺序。支持拖动排序与上下移动。'), strip.node,
    el('section', { class: 'panel' }, el('div', { class: 'list-filters' }, scope.node, category.node), el('p', { class: 'status' }, '首页与学习页按启用板块的顺序展示，主推荐取第一个启用的主推荐板块。课程按所属主题和课程顺序展示；章节、小节可在“编辑课程”中调整。'), errors, list)); draw();
}

import { api, endpoint, query, uploadFile } from './api.js';
import { el, button, field, head, table, pager, searchForm, modal, busy, errorBox, showError, notify, confirmDanger, badge, image, safeImage, adminImageUrl } from './ui.js';
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const DOC_EXT = /\.(pdf|doc|docx)$/i;
function bytes(n) { return n >= 1048576 ? `${(n / 1048576).toFixed(2)} MiB` : `${Math.ceil((n || 0) / 1024)} KiB`; }
function assetPreview(asset) {
  if (asset.kind === 'image' && safeImage(asset.url)) return el('img', { src: adminImageUrl(asset.url), alt: '', class: 'asset-image', loading: 'lazy' });
  return el('span', { class: 'badge' }, asset.fileType || '文档');
}
export function uploadAsset(onUploaded, kind) {
  let changed = false;
  const m = modal('上传资源', { beforeClose: () => !changed || confirmDanger('尚未上传，确定放弃所选文件？') });
  const title = field('资源名称', { required: true, maxlength: 200, hint: '用于资源库检索；资料的展示标题可以单独修改。' });
  const file = field('选择文件', { type: 'file', required: true, accept: kind === 'image' ? '.png,.jpg,.jpeg,.webp' : kind === 'document' ? '.pdf,.doc,.docx' : kind === 'video' ? '.mp4,.webm' : '.png,.jpg,.jpeg,.webp,.pdf,.doc,.docx,.mp4,.webm', hint: '图片 ≤ 5 MB；PDF / Word ≤ 20 MB；MP4 / WebM 视频 ≤ 500 MB。网页课程请在“新增课程”选择网页类型。' });
  const errors = errorBox(), submit = el('button', { type: 'submit', class: 'primary' }, '上传');
  file.input.addEventListener('change', () => { const f = file.input.files[0]; if (f && !title.input.value) title.input.value = f.name.replace(/\.[^.]+$/, ''); });
  const form = el('form', { oninput: () => { changed = true; }, onsubmit: e => { e.preventDefault(); busy(submit, async () => {
    const selected = file.input.files[0];
    if (!selected) throw new Error('请选择文件');
    const isImage = IMAGE_TYPES.includes(selected.type) || /\.(png|jpe?g|webp)$/i.test(selected.name);
    const isDoc = DOC_EXT.test(selected.name);
    const isVideo = /\.(mp4|webm)$/i.test(selected.name);
    if ((!isImage && !isDoc && !isVideo) || (kind === 'image' && !isImage) || (kind === 'document' && !isDoc) || (kind === 'video' && !isVideo)) throw new Error('请选择支持的文件类型');
    if (selected.size > (isImage ? 5 : isVideo ? 500 : 20) * 1048576) throw new Error('文件超过大小限制');
    const body = new FormData(); body.append('file', selected); body.append('title', title.input.value.trim());
    const { asset } = await uploadFile(isVideo ? '/api/admin/videos' : '/api/admin/assets', body, value => { submit.textContent = value < 100 ? `上传中 ${value}%` : '正在校验…'; });
    changed = false; m.close(); notify('资源已上传'); if (onUploaded) await onUploaded(asset);
  }, errors); } }, title.node, file.node, errors, submit);
  m.content.append(form);
}
export function chooseAsset(kind, onChoose) {
  const m = modal(kind === 'image' ? '选择已上传图片' : kind === 'video' ? '选择视频资源' : '选择文档资源');
  const results = el('div'), errors = errorBox(); let q = '', request = 0;
  const search = searchForm('搜索资源名称', value => { q = value; load(1); });
  m.content.append(el('div', { class: 'toolbar' }, button('上传新资源', () => uploadAsset(async asset => { m.close(); await onChoose(asset); }, kind), 'primary')), search.node, errors, results);
  async function load(page) {
    const serial = ++request; results.replaceChildren(el('p', { role: 'status' }, '正在读取资源…'));
    try {
      const data = await api(`/api/admin/assets?${query({ page, q, kind })}`); if (serial !== request || !m.dialog.isConnected) return;
      const items = data.items.filter(a => a.kind === kind);
      results.replaceChildren(table([{ label: '预览', render: assetPreview }, { label: '名称', key: 'title' }, { label: '大小', render: a => bytes(a.sizeBytes) }, { label: '操作', render: a => button('选用', async () => { m.close(); await onChoose(a); }, 'small primary') }], items, `此页没有${kind === 'image' ? '图片' : '文档'}，可翻页、搜索或上传。`), pager(data, load));
    } catch (error) { results.replaceChildren(); showError(errors, error); }
  }
  load(1);
}
export function imageField(label, value, onChange) {
  const f = field(label, { value: value || '', hint: '仅使用已上传 /api/assets/{id} 或已有本地 /assets/... 图片。' });
  const preview = el('div'); const updatePreview = () => preview.replaceChildren(image(f.input.value) || el('span', { class: 'muted' }, '暂无可用图片预览'));
  f.input.addEventListener('input', () => { onChange(f.input.value); updatePreview(); });
  const choose = button('资源库选图', () => chooseAsset('image', asset => { f.input.value = asset.url; onChange(asset.url); updatePreview(); }));
  const upload = button('上传图片', () => uploadAsset(asset => { f.input.value = asset.url; onChange(asset.url); updatePreview(); }, 'image'));
  f.node.classList.add('image-field'); f.node.append(el('div', { class: 'row' }, choose, upload), preview); updatePreview(); return f.node;
}
export async function renderAssets(host) {
  let q = '', serial = 0;
  const results = el('div'), errors = errorBox();
  const search = searchForm('搜索资源名称', value => { q = value; load(1); });
  host.replaceChildren(head('资源库', '统一管理图片、PDF / Word 和视频。删除前检查课程资料与历史发布版本的引用。', button('上传资源', () => uploadAsset(() => load(1)), 'primary')), el('section', { class: 'panel' }, search.node, errors, results));
  async function load(page) {
    const stamp = ++serial; results.replaceChildren(el('p', { role: 'status' }, '正在读取资源…')); errors.textContent = '';
    try {
      const data = await api(`/api/admin/assets?${query({ page, q })}`); if (stamp !== serial) return;
      results.replaceChildren(table([
        { label: '预览', render: assetPreview }, { label: '资源名称', render: a => el('div', {}, a.title, el('div', { class: 'id-text' }, a.id)) },
        { label: '类型 / 大小', render: a => `${a.fileType} / ${bytes(a.sizeBytes)}` },
        { label: '操作', render: a => el('div', { class: 'row' }, el('a', { href: endpoint('assets', a.id, '/file'), target: '_blank', rel: 'noopener noreferrer' }, '打开'), button('删除', e => busy(e.currentTarget, async () => {
          if (!confirmDanger(`确定删除资源“${a.title}”？删除后无法恢复。已引用资源无法删除，请先解除关联。`)) return;
          await api(endpoint('assets', a.id), { method: 'DELETE' }); notify('资源已删除'); await load(page);
        }, errors), 'small danger')) }
      ], data.items, '资源库为空。上传图片用于品牌与课程封面，上传文档后可关联到课程资料。'), pager(data, load));
    } catch (error) { if (stamp === serial) { results.replaceChildren(); showError(errors, error); } }
  }
  await load(1);
}
export function ownerOptions(catalog, scope) {
  if (scope === 'course') return catalog.courses.map(c => ({ value: c.id, label: c.title }));
  if (scope === 'chapter') return catalog.courses.flatMap(c => c.chapters.map(ch => ({ value: ch.id, label: `${c.title} / ${ch.title}` })));
  return catalog.courses.flatMap(c => c.chapters.flatMap(ch => ch.sections.map(s => ({ value: s.id, label: `${c.title} / ${ch.title} / ${s.title}` }))));
}
export async function renderMaterials(host, context) {
  const catalog = await context.getCatalog(); let items = [];
  const results = el('div'), errors = errorBox();
  const filter = field('筛选资料标题', { type: 'search' });
  const names = new Map(['course', 'chapter', 'section'].flatMap(scope => ownerOptions(catalog, scope).map(o => [o.value, o.label])));
  host.replaceChildren(head('课程资料', '将 PDF、Word 或视频关联到课程、章节或小节，设置上下架与展示顺序。', button('新增资料关联', () => editMaterial(), 'primary')), el('section', { class: 'panel' }, filter.node, errors, results));
  filter.input.addEventListener('input', draw);
  async function load() { try { items = (await api('/api/admin/materials')).items; draw(); } catch (error) { showError(errors, error); } }
  function draw() {
    const visible = items.filter(x => x.title.toLowerCase().includes(filter.input.value.trim().toLowerCase()));
    results.replaceChildren(table([
      { label: '资料标题', render: x => el('div', {}, x.title, el('div', { class: 'id-text' }, x.id)) },
      { label: '关联位置', render: x => names.get(x.ownerId) || `未在草稿中找到：${x.ownerId}` },
      { label: '顺序', key: 'sortOrder' }, { label: '状态', render: x => badge(x.published ? '已上架' : '已下架', x.published) },
      { label: '操作', render: x => el('div', { class: 'row' }, button('编辑', () => editMaterial(x), 'small'), el('a', { href: endpoint('assets', x.assetId, '/file'), target: '_blank', rel: 'noopener noreferrer' }, '文档'), button(x.published ? '下架' : '上架', e => busy(e.currentTarget, async () => {
        if (!confirmDanger(`确定${x.published ? '下架' : '上架'}资料“${x.title}”？`)) return;
        await api(endpoint('materials', x.id), { method: 'PUT', body: { assetId: x.assetId, title: x.title, scope: x.scope, ownerId: x.ownerId, sortOrder: x.sortOrder, published: !x.published } }); notify('资料状态已更新'); await load();
      }, errors), 'small'), button('解除关联', e => busy(e.currentTarget, async () => {
        if (!confirmDanger(`确定解除资料“${x.title}”的关联？原始资源保留在资源库中。`)) return;
        await api(endpoint('materials', x.id), { method: 'DELETE' }); notify('资料关联已解除'); await load();
      }, errors), 'small danger')) }
    ], visible, '没有匹配的资料。可新增关联并上传文档。'));
  }
  function editMaterial(item) {
    let changed = false; const m = modal(item ? '编辑资料关联' : '新增资料关联', { beforeClose: () => !changed || confirmDanger('资料表单尚未保存，确定放弃更改？') });
    const title = field('资料展示标题', { value: item?.title || '', required: true, maxlength: 200 });
    const asset = field('文件资源 ID', { value: item?.assetId || '', required: true, readOnly: true, hint: '支持 PDF、Word 与视频。选择已上传资源，或直接上传。' });
    const selected = a => { asset.input.value = a.id; if (!title.input.value) title.input.value = a.title; changed = true; };
    asset.node.append(el('div', { class: 'row' }, button('选择文档', () => chooseAsset('document', selected)), button('选择视频', () => chooseAsset('video', selected)), button('上传文档', () => uploadAsset(selected, 'document')), button('上传视频', () => uploadAsset(selected, 'video'))));
    const scope = field('关联层级', { type: 'select', value: item?.scope || 'course', options: [{ value: 'course', label: '课程' }, { value: 'chapter', label: '章节' }, { value: 'section', label: '小节' }] });
    const owner = field('归属内容', { type: 'select', required: true, options: ownerOptions(catalog, scope.input.value), value: item?.ownerId });
    const updateOwner = () => { owner.input.replaceChildren(...ownerOptions(catalog, scope.input.value).map(o => el('option', { value: o.value }, o.label))); };
    scope.input.addEventListener('change', updateOwner);
    if (item && !names.has(item.ownerId)) owner.input.prepend(el('option', { value: item.ownerId, selected: true }, `已删除内容：${item.ownerId}（请选择新归属）`));
    const order = field('排序值', { type: 'number', value: item?.sortOrder ?? 0, min: 0, max: 100000, step: 1, required: true, hint: '数值越小越靠前。' });
    const published = field('上架资料', { type: 'checkbox', value: item?.published ?? false, hint: '未发布的归属内容不会因资料上架而公开。' });
    const errors = errorBox(), submit = el('button', { type: 'submit', class: 'primary' }, '保存资料关联');
    const form = el('form', { oninput: () => { changed = true; }, onchange: () => { changed = true; }, onsubmit: e => { e.preventDefault(); busy(submit, async () => {
      if (!owner.input.value) throw new Error('请先创建内容并选择资料归属');
      if (!asset.input.value) throw new Error('请选择或上传文档');
      await api(item ? endpoint('materials', item.id) : '/api/admin/materials', { method: item ? 'PUT' : 'POST', body: { assetId: asset.input.value, title: title.input.value.trim(), scope: scope.input.value, ownerId: owner.input.value, sortOrder: Number(order.input.value), published: published.input.checked } });
      changed = false; m.close(); notify('资料关联已保存'); await load();
    }, errors); } }, title.node, asset.node, scope.node, owner.node, order.node, published.node, errors, submit);
    m.content.append(form);
  }
  await load();
}

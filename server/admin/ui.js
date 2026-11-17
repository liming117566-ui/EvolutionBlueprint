export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (['value', 'checked', 'disabled', 'readOnly', 'multiple', 'required', 'selected'].includes(key)) node[key] = value;
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}
export function button(text, action, className = '') { return el('button', { type: 'button', class: `btn ${className}`, onclick: action }, text); }
export function field(label, { type = 'text', value = '', hint, options, ...attrs } = {}) {
  const id = `f-${crypto.randomUUID()}`;
  let input;
  if (type === 'textarea') input = el('textarea', { id, ...attrs, value });
  else if (type === 'select') input = el('select', { id, ...attrs }, (options || []).map(o => el('option', { value: o.value, selected: o.value === value }, o.label)));
  else input = el('input', { id, type, ...attrs, ...(type === 'checkbox' ? { checked: Boolean(value) } : { value }) });
  const wrapper = el('label', { class: 'field', for: id }, el('span', {}, label), input);
  if (hint) { const help = el('span', { class: 'hint', id: `${id}-hint` }, hint); input.setAttribute('aria-describedby', help.id); wrapper.append(help); }
  return { node: wrapper, input };
}
export function notify(message, error = false) {
  const item = el('div', { class: `notice${error ? ' error' : ''}`, role: error ? 'alert' : 'status' }, message);
  document.querySelector('#notices').append(item);
  setTimeout(() => item.remove(), error ? 14000 : 6000);
}
export function errorBox() { return el('div', { class: 'error', role: 'alert', tabindex: '-1' }); }
export function showError(box, error) { box.textContent = error.message || String(error); box.focus(); }
export async function busy(control, work, box) {
  if (control.disabled) return;
  const controls = [...(control.closest('form')?.querySelectorAll('input,select,textarea,button') || [])].filter(node => node !== control);
  const previous = controls.map(node => node.disabled);
  controls.forEach(node => { node.disabled = true; });
  control.disabled = true; control.setAttribute('aria-busy', 'true');
  if (box) box.textContent = '';
  try { return await work(); } catch (error) { if (box) showError(box, error); else notify(error.message, true); }
  finally { control.disabled = false; control.removeAttribute('aria-busy'); controls.forEach((node, index) => { node.disabled = previous[index]; }); }
}
export function head(title, description, ...actions) {
  return el('header', { class: 'page-head' }, el('div', {}, el('h1', {}, title), el('p', { class: 'muted' }, description)), el('div', { class: 'row' }, actions));
}
export function table(columns, rows, empty = '暂无记录') {
  if (!rows.length) return el('p', { class: 'empty' }, empty);
  return el('div', { class: 'table-wrap' }, el('table', {}, el('thead', {}, el('tr', {}, columns.map(c => el('th', { scope: 'col' }, c.label)))), el('tbody', {}, rows.map(row => el('tr', {}, columns.map(c => el('td', { 'data-label': c.label }, c.render ? c.render(row) : display(row[c.key]))))))));
}
export function display(value) { if (value === null || value === undefined || value === '') return '—'; if (typeof value === 'object') return JSON.stringify(value); return String(value); }
export function date(value) { if (!value) return '—'; const d = new Date(value); return Number.isNaN(d.valueOf()) ? String(value) : d.toLocaleString('zh-CN', { hour12: false }); }
export function badge(text, active = false) { return el('span', { class: `badge${active ? ' active' : ''}` }, text); }
export function pager(data, load) {
  const page = Number(data.page) || 1, size = Number(data.pageSize) || 20, total = Number(data.total) || 0;
  const previous = button('上一页', () => load(page - 1)); previous.disabled = page <= 1;
  const next = button('下一页', () => load(page + 1)); next.disabled = page * size >= total;
  return el('nav', { class: 'pager', 'aria-label': '分页' }, previous, el('span', { class: 'muted' }, `第 ${page} 页，共 ${total} 条`), next);
}
export function searchForm(placeholder, onSearch) {
  const input = el('input', { type: 'search', class: 'search-input', placeholder, 'aria-label': placeholder, maxlength: 100 });
  const submit = el('button', { type: 'submit' }, '搜索');
  const form = el('form', { class: 'search-form', onsubmit: e => { e.preventDefault(); onSearch(input.value.trim()); } }, input, submit);
  return { node: form, input };
}
export function modal(title, { beforeClose = () => true } = {}) {
  const returnFocus = document.activeElement;
  const dialog = el('dialog', { 'aria-label': title });
  const close = () => { if (!beforeClose()) return; dialog.close(); dialog.remove(); if (returnFocus?.isConnected) returnFocus.focus(); };
  const requestClose = () => { if (dialog.querySelector('[aria-busy="true"]')) { notify('操作正在提交，请等待结果后再关闭'); return; } close(); };
  dialog.addEventListener('cancel', e => { e.preventDefault(); requestClose(); });
  dialog.addEventListener('input', () => { dialog.dataset.unsaved = 'true'; });
  dialog.addEventListener('change', () => { dialog.dataset.unsaved = 'true'; });
  dialog.append(el('div', { class: 'dialog-head' }, el('h2', {}, title), button('关闭', requestClose, 'ghost')));
  const content = el('div'); dialog.append(content); document.body.append(dialog); dialog.showModal();
  return { dialog, content, close };
}
export function confirmDanger(message) { return window.confirm(message); }
export function lines(value) { return String(value).split('\n').map(s => s.trim()).filter(Boolean); }
export function safeImage(url) { return typeof url === 'string' && (/^\/api\/assets\/[A-Za-z0-9_-]+$/.test(url) || /^\/assets\/(?!.*(?:\.\.|[?#\\]))[A-Za-z0-9_./-]+$/.test(url)); }
export function adminImageUrl(url) { return /^\/api\/assets\/[A-Za-z0-9_-]+$/.test(url) ? `/api/admin/assets/${url.split('/').pop()}/file` : url; }
export function image(url, alt = '') { return safeImage(url) ? el('img', { src: adminImageUrl(url), alt, class: 'preview-image', loading: 'lazy' }) : null; }
export function jsonDetails(value, label = '查看完整记录') { return el('details', {}, el('summary', {}, label), el('pre', {}, JSON.stringify(value, null, 2))); }
export function courseChecks(courses, selected = []) {
  const inputs = courses.map(course => ({ id: course.id, input: el('input', { type: 'checkbox', checked: selected.includes(course.id) }), title: course.title }));
  return { node: el('div', { class: 'check-list' }, inputs.length ? inputs.map(x => el('label', {}, x.input, x.title)) : el('p', { class: 'muted' }, '暂无课程，请先在内容中创建课程。')), values: () => inputs.filter(x => x.input.checked).map(x => x.id) };
}
export function isoFromInput(input) { return input.value ? new Date(input.value).toISOString() : null; }
export function dirtyForm(form, context) {
  const key = Symbol('form'); form.addEventListener('input', () => context.pending.set(key, true)); form.addEventListener('change', () => context.pending.set(key, true));
  return () => context.pending.delete(key);
}

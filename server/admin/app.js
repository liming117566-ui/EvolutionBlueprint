import { api, clearSession } from './api.js';
import { el, button, field, errorBox, showError, busy, notify, modal, confirmDanger } from './ui.js';
import { renderCatalog } from './catalog.js';
import { renderAssets, renderMaterials } from './assets.js';
import { renderUsers } from './users.js';
import { renderCards } from './cards.js';
import { renderLogs } from './logs.js';
const root = document.querySelector('#app');
const context = {
  catalog: null, catalogDirty: false, pending: new Map(), view: 'catalog',
  async getCatalog() { if (!this.catalog) this.catalog = await api('/api/admin/catalog'); return this.catalog; },
  hasPending() { return this.catalogDirty || this.pending.size > 0 || Boolean(document.querySelector('dialog[data-unsaved="true"]')); }
};
let currentAdmin = null, transition = 0, sessionExpired = false;
window.addEventListener('beforeunload', e => { if (context.hasPending()) { e.preventDefault(); e.returnValue = ''; } });
window.addEventListener('admin-session-expired', () => {
  if (sessionExpired || !currentAdmin) return;
  sessionExpired = true;
  notify('管理员会话已失效。请先保留或关闭当前弹窗，再重新登录。内容树草稿会保留在此标签页内存中。', true);
  const reauthenticate = () => login(true).catch(error => { root.replaceChildren(el('p', { class: 'error' }, error.message)); });
  if (document.querySelector('dialog[open]')) {
    const observer = new MutationObserver(() => { if (!document.querySelector('dialog[open]')) { observer.disconnect(); reauthenticate(); } });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['open'] });
  } else reauthenticate();
});
function reset() { context.catalog = null; context.catalogDirty = false; context.pending.clear(); currentAdmin = null; clearSession(); }
async function login(preserve = false) {
  if (!preserve) reset();
  root.replaceChildren(el('p', { class: 'boot-state', role: 'status' }, '正在获取安全会话…'));
  let session;
  try { session = await api('/api/admin/session'); }
  catch (error) { root.replaceChildren(el('main', { class: 'login-wrap' }, el('section', { class: 'panel login' }, el('h1', {}, '管理服务暂不可用'), el('p', { class: 'error', role: 'alert' }, error.message), button('重新连接', () => login(preserve), 'primary')))); return; }
  if (session.authenticated) { currentAdmin = session.admin; sessionExpired = false; shell(); return; }
  const username = field('管理员账号', { required: true, autocomplete: 'username', maxlength: 100 });
  const password = field('密码', { type: 'password', required: true, autocomplete: 'current-password', maxlength: 128 });
  const errors = errorBox();
  const submit = el('button', { type: 'submit', class: 'primary' }, '登录管理端');
  const form = el('form', { onsubmit: e => { e.preventDefault(); busy(submit, async () => {
    const result = await api('/api/admin/session', { method: 'POST', body: { username: username.input.value.trim(), password: password.input.value } });
    password.input.value = ''; currentAdmin = result.admin; sessionExpired = false; shell();
  }, errors); } }, username.node, password.node, errors, submit);
  root.replaceChildren(el('main', { class: 'login-wrap' }, el('section', { class: 'panel login' }, el('h1', {}, '进化蓝图'), el('p', { class: 'muted' }, preserve ? '会话已失效，请重新登录。当前内容草稿保留在此标签页。' : '管理课程内容、学员与学习权益'), form)));
  username.input.focus();
}
function shell() {
  const workspace = el('main', { id: 'workspace', class: 'workspace', tabindex: '-1' });
  const nav = el('nav', { class: 'nav', 'aria-label': '管理导航' });
  const routes = [
    ['catalog', '内容与发布', renderCatalog], ['materials', '课程资料', renderMaterials], ['assets', '资源库', renderAssets],
    ['users', '用户与权益', renderUsers], ['cards', '卡密与核销', renderCards], ['audit', '操作审计', (host, ctx) => renderLogs(host, ctx, 'audit')]
  ];
  async function navigate(id, renderer) {
    if (workspace.querySelector('[aria-busy="true"]')) { notify('操作正在提交，请等待结果后再切换页面'); return; }
    if (context.pending.size && !confirmDanger('此页面有未保存的表单。离开将丢弃表单内容，确定继续？')) return;
    if (document.querySelector('dialog[open]')) return;
    if (context.view === 'catalog' && id !== 'catalog' && context.catalogDirty) notify('内容草稿尚未保存，已暂存于此标签页；请返回“内容与发布”保存，刷新页面会丢失更改。');
    context.pending.clear(); context.view = id;
    const stamp = ++transition;
    nav.querySelectorAll('button').forEach(n => n.setAttribute('aria-current', n.dataset.view === id ? 'page' : 'false'));
    workspace.replaceChildren(el('p', { role: 'status' }, '正在读取…'));
    // A detached host prevents a slow response from replacing a newer page.
    const host = el('div'); workspace.replaceChildren(host);
    try { await renderer(host, context); if (stamp === transition && workspace.contains(host)) workspace.focus({ preventScroll: true }); }
    catch (error) { if (stamp === transition) host.replaceChildren(el('h1', {}, '读取失败'), el('p', { class: 'error', role: 'alert' }, error.message), button('重试', () => navigate(id, renderer))); }
  }
  routes.forEach(([id, label, renderer]) => { const b = button(label, () => navigate(id, renderer)); b.dataset.view = id; nav.append(b); });
  const logout = button('退出登录', () => busy(logout, async () => {
    if (context.hasPending() && !confirmDanger('有未保存的内容，退出将丢弃这些更改。确定退出？')) return;
    await api('/api/admin/session', { method: 'DELETE' }); reset(); await login();
  }), 'ghost');
  root.replaceChildren(el('div', { class: 'shell' }, el('aside', { class: 'sidebar' }, el('div', { class: 'brand' }, '进化蓝图', el('small', {}, '内容管理工作台')), nav, el('div', { class: 'account' }, el('span', { class: 'account-name muted' }, currentAdmin?.username || '管理员'), button('修改密码', changePassword, 'ghost'), logout)), workspace));
  const route = routes.find(([id]) => id === context.view) || routes[0]; navigate(route[0], route[2]);
}
function changePassword() {
  let changed = false;
  const m = modal('修改管理员密码', { beforeClose: () => !changed || confirmDanger('密码尚未提交，确定关闭？') });
  const old = field('当前密码', { type: 'password', required: true, autocomplete: 'current-password', maxlength: 128 });
  const next = field('新密码', { type: 'password', required: true, minlength: 12, maxlength: 128, autocomplete: 'new-password', hint: '12–128 个字符。修改后旧会话会被撤销。' });
  const repeat = field('确认新密码', { type: 'password', required: true, autocomplete: 'new-password', minlength: 12, maxlength: 128 });
  const errors = errorBox(); const submit = el('button', { type: 'submit', class: 'primary' }, '修改密码');
  const form = el('form', { oninput: () => { changed = true; }, onsubmit: e => { e.preventDefault(); busy(submit, async () => {
    if (next.input.value !== repeat.input.value) throw new Error('两次输入的新密码不一致');
    if (context.hasPending() && !confirmDanger('修改密码会撤销会话，未保存内容可能丢失。确定继续？')) return;
    await api('/api/admin/password', { method: 'POST', body: { currentPassword: old.input.value, password: next.input.value } });
    changed = false; m.close(); notify('密码已修改，请重新登录'); await login();
  }, errors); } }, old.node, next.node, repeat.node, errors, submit);
  m.content.append(form);
}
login().catch(error => { root.replaceChildren(el('p', { class: 'error' }, error.message)); });

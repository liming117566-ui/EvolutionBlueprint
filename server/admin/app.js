import { api, clearSession } from './api.js';
import { el, button, field, errorBox, showError, busy, notify, modal, confirmDanger } from './ui.js';
import { renderCatalog } from './catalog.js';
import { renderAssets, renderMaterials } from './assets.js';
import { renderUsers } from './users.js';
import { renderCards } from './cards.js';
import { renderLogs } from './logs.js';
import { renderWebsites } from './websites.js';
import { renderDashboard } from './dashboard.js';
import { renderCourses, renderOrder, importCourse } from './courses.js';
import { icon } from './icons.js';
const root = document.querySelector('#app');
const context = {
  catalog: null, catalogDirty: false, pending: new Map(), view: 'dashboard',
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
  root.replaceChildren(el('main', { class: 'login-wrap' }, el('section', { class: 'panel login' }, el('h1', {}, el('img', { class: 'brand-icon', src: '/assets/generated/app-icon.webp', alt: '' }), '新博途'), el('p', { class: 'muted' }, preserve ? '会话已失效，请重新登录。当前内容草稿保留在此标签页。' : '管理课程内容、学员与学习权益'), form)));
  username.input.focus();
}
function shell() {
  const workspace = el('main', { id: 'workspace', class: 'main', tabindex: '-1' });
  const nav = el('nav', { class: 'nav-area', 'aria-label': '管理导航' });
  const breadcrumb = el('strong', {}, '工作台');
  const routes = [
    ['dashboard', '工作台', renderDashboard, 'home'], ['boards', '学习板块管理', renderCatalog, 'grid'],
    ['catalog', '内容与发布', renderCourses, 'book'], ['order', '前端排序', renderOrder, 'sort'],
    ['materials', '课程资料', renderMaterials, 'folder'], ['websites', '学习网页资源', renderWebsites, 'globe'], ['assets', '资源库', renderAssets, 'folder'],
    ['users', '用户与权益', renderUsers, 'users'], ['cards', '卡密与核销', renderCards, 'ticket'], ['audit', '操作审计', (host, ctx) => renderLogs(host, ctx, 'audit'), 'audit'],
    ['editor', '完整内容编辑', renderCatalog, 'settings']
  ];
  async function navigate(id, renderer) {
    renderer ||= routes.find(r => r[0] === id)?.[2];
    if (!renderer) return;
    if (workspace.querySelector('[aria-busy="true"]')) { notify('操作正在提交，请等待结果后再切换页面'); return; }
    if (context.pending.size && !confirmDanger('此页面有未保存的表单。离开将丢弃表单内容，确定继续？')) return;
    if (document.querySelector('dialog[open]')) return;
    if (['catalog', 'boards'].includes(context.view) && !['catalog', 'boards'].includes(id) && context.catalogDirty) notify('内容草稿尚未保存，已暂存于此标签页；请返回“内容与发布”保存，刷新页面会丢失更改。');
    context.pending.clear(); context.view = id;
    document.body.classList.remove('nav-open'); breadcrumb.textContent = routes.find(r => r[0] === id)?.[1] || '工作台';
    const stamp = ++transition;
    nav.querySelectorAll('button').forEach(n => { n.setAttribute('aria-current', n.dataset.view === id ? 'page' : 'false'); n.classList.toggle('active', n.dataset.view === id); });
    workspace.replaceChildren(el('p', { role: 'status' }, '正在读取…'));
    // A detached host prevents a slow response from replacing a newer page.
    const host = el('div'); workspace.replaceChildren(host);
    try { await renderer(host, context); if (stamp === transition && workspace.contains(host)) workspace.focus({ preventScroll: true }); }
    catch (error) { if (stamp === transition) host.replaceChildren(el('h1', {}, '读取失败'), el('p', { class: 'error', role: 'alert' }, error.message), button('重试', () => navigate(id, renderer))); }
  }
  context.navigate = navigate;
  context.help = () => {
    const guide = modal('后台管理指南');
    guide.content.append(el('div', { class: 'help-copy' }, el('h3', {}, '1. 新增课程'), el('p', {}, '支持在线图文、PDF / Word、MP4 / WebM 视频，以及 HTML / ZIP 静态网页。选择课程主题和学习板块，系统会自动创建课程目录和文件关联。'), el('h3', {}, '2. 编辑与排序'), el('p', {}, '在“内容与发布”编辑章节、小节、正文和练习；在“前端排序”拖动或上下移动板块、主题和课程，并设置首页展示与推荐位。'), el('h3', {}, '3. 保存与发布'), el('p', {}, '目录调整先保存为草稿，再发布到前端。课程资料的上下架独立生效，但所属课程仍须已发布，且学员须具备对应权益。'), el('h3', {}, '4. 学员与卡密'), el('p', {}, '原有用户搜索、禁用、学习记录、权益授予与撤销、卡密生成、批次停用、核销记录和操作审计均保留。'), el('h3', {}, '网页课程要求'), el('p', {}, '上传已构建好的静态网页，ZIP 内包含唯一 index.html，资源使用相对路径。服务器程序和依赖远程接口的应用需单独部署。')));
  };
  routes.forEach(([id, label, renderer, symbol], index) => {
    if (index === 0 || index === 1 || index === 7 || index === 10) nav.append(el('div', { class: 'nav-label' }, index === 0 ? '总览' : index === 1 ? '学习内容' : index === 7 ? '运营管理' : '高级管理'));
    const b = button(el('span', { class: 'row' }, icon(symbol), label), () => navigate(id, renderer), 'nav-item'); b.dataset.view = id; nav.append(b);
  });
  const logout = button('退出登录', () => busy(logout, async () => {
    if (context.hasPending() && !confirmDanger('有未保存的内容，退出将丢弃这些更改。确定退出？')) return;
    await api('/api/admin/session', { method: 'DELETE' }); reset(); await login();
  }), 'ghost');
  const menu = button(icon('menu'), () => document.body.classList.toggle('nav-open'), 'icon-btn mobile-menu'); menu.setAttribute('aria-label', '展开导航');
  const help = button(icon('help'), () => context.help(), 'icon-btn help-btn'); help.setAttribute('aria-label', '使用帮助');
  const user = button(el('span', { class: 'row' }, el('span', { class: 'avatar' }, '管'), el('span', {}, currentAdmin?.username || '管理员')), changePassword, 'user'); user.setAttribute('aria-label', '管理员信息与修改密码');
  root.replaceChildren(el('div', { class: 'shell' }, el('aside', { class: 'sidebar' }, el('a', { class: 'brand', href: '#', onclick: event => { event.preventDefault(); navigate('dashboard'); } }, el('span', { class: 'brand-mark' }, icon('book')), el('span', { class: 'od-field' }, el('span', { class: 'brand-title' }, '新博途在线'), el('span', { class: 'brand-sub' }, 'XINBOTU ONLINE'))), nav,
    el('div', { class: 'side-bottom' }, el('div', {}, el('span', { class: 'dot' }), '本地服务运行中'), button('修改密码', changePassword, 'ghost'), logout)),
    button('', () => document.body.classList.remove('nav-open'), 'sidebar-scrim'),
    el('div', { class: 'workspace' }, el('header', { class: 'topbar' }, el('div', { class: 'row' }, menu, el('div', { class: 'breadcrumbs' }, el('span', {}, '管理控制台'), el('span', {}, '/'), breadcrumb)), el('div', { class: 'top-actions' }, el('span', { class: 'environment' }, el('span', { class: 'dot' }), '本地环境'), help, user)), workspace,
    el('footer', { class: 'footer' }, el('p', {}, '新博途在线 · 让学习更有方向'), button('管理指南', () => context.help(), 'link')))));
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

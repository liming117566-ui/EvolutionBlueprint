import { api, endpoint, query } from './api.js';
import { el, button, field, head, table, pager, searchForm, modal, busy, errorBox, showError, notify, confirmDanger, badge, date, display, jsonDetails, courseChecks, isoFromInput } from './ui.js';
export async function renderUsers(host, context) {
  let q = '', request = 0; const results = el('div'), errors = errorBox();
  const search = searchForm('搜索用户昵称、ID 或备注', value => { q = value; load(1); });
  host.replaceChildren(head('用户与权益', '查看真实用户、管理备注与访问权益，核对小节完成情况和最近学习位置。'), el('section', { class: 'panel' }, search.node, errors, results));
  async function load(page) {
    const stamp = ++request; results.replaceChildren(el('p', { role: 'status' }, '正在读取用户…')); errors.textContent = '';
    try {
      const data = await api(`/api/admin/users?${query({ page, q })}`); if (stamp !== request) return;
      results.replaceChildren(table([
        { label: '用户', render: u => el('div', {}, u.nickname, el('div', { class: 'id-text' }, u.id)) },
        { label: '备注', key: 'note' }, { label: '状态', render: u => badge(u.status === 'active' ? '正常' : '已禁用', u.status === 'active') },
        { label: '注册时间', render: u => date(u.createdAt) }, { label: '最近登录', render: u => date(u.lastLoginAt) },
        { label: '操作', render: u => button('查看详情', () => details(u.id, () => load(page)), 'small') }
      ], data.items, q ? '没有匹配的用户，请调整搜索条件。' : '尚无注册用户。管理端不会创建模拟学员。'), pager(data, load));
    } catch (error) { if (stamp === request) { results.replaceChildren(); showError(errors, error); } }
  }
  async function details(id, afterChange) {
    let dirty = false, current = null;
    const m = modal('用户详情', { beforeClose: () => !dirty || confirmDanger('用户备注有未保存更改，确定关闭？') });
    const errors = errorBox();
    m.content.append(el('p', { role: 'status' }, '正在读取用户详情…'));
    let catalog;
    try { catalog = await context.getCatalog(); await refresh(); }
    catch (error) { m.content.replaceChildren(errors); showError(errors, error); }
    async function refresh() {
      current = await api(endpoint('users', id)); if (!m.dialog.isConnected) return;
      const { user, grants = [], learning = {} } = current;
      const courses = new Map(catalog.courses.map(c => [c.id, c.title]));
      const boards = new Map((catalog.boards || []).map(b => [b.id, b.title]));
      const chapters = new Map(catalog.courses.flatMap(c => c.chapters.map(ch => [ch.id, `${c.title} / ${ch.title}`])));
      const sections = new Map(catalog.courses.flatMap(c => c.chapters.flatMap(ch => ch.sections.map(s => [s.id, `${ch.title} / ${s.title}`]))));
      const nickname = field('用户昵称', { value: user.nickname, required: true, maxlength: 100 });
      const note = field('管理员备注', { type: 'textarea', value: user.note || '', maxlength: 1000, hint: '仅管理员可见。' });
      const submit = el('button', { type: 'submit', class: 'primary' }, '保存用户信息');
      const form = el('form', { oninput: () => { dirty = true; }, onsubmit: e => { e.preventDefault(); busy(submit, async () => {
        await api(endpoint('users', id), { method: 'PATCH', body: { nickname: nickname.input.value.trim(), note: note.input.value } }); dirty = false; notify('用户信息已保存'); await refresh(); await afterChange();
      }, errors); } }, nickname.node, note.node, submit);
      const status = button(user.status === 'disabled' ? '启用用户' : '禁用用户', e => busy(e.currentTarget, async () => {
        if (dirty) throw new Error('请先保存昵称与备注，或关闭详情放弃更改');
        const enable = user.status === 'disabled';
        if (!confirmDanger(enable ? `确定启用用户“${user.nickname}”？` : `确定禁用用户“${user.nickname}”？该用户将不能继续访问学习服务。`)) return;
        await api(endpoint('users', id), { method: 'PATCH', body: { status: enable ? 'active' : 'disabled' } }); notify(enable ? '用户已启用' : '用户已禁用'); await refresh(); await afterChange();
      }, errors), user.status === 'disabled' ? '' : 'danger');
      m.content.replaceChildren(el('dl', { class: 'detail-list' }, el('dt', {}, '用户 ID'), el('dd', {}, user.id), el('dt', {}, '账号状态'), el('dd', {}, badge(user.status === 'active' ? '正常' : '已禁用', user.status === 'active')), el('dt', {}, '注册时间'), el('dd', {}, date(user.createdAt)), el('dt', {}, '最近登录'), el('dd', {}, date(user.lastLoginAt))), errors, form, el('div', { class: 'actions' }, status), el('h3', { class: 'section-label' }, '访问权益'), el('p', { class: 'muted' }, '到期、撤销状态由服务端最终判定。授予或撤销权益会记录审计。'), button('授予访问权益', () => grantUser(user, catalog, async () => { await refresh(); await afterChange(); }), 'primary'), el('div', { class: 'toolbar' }), table([
        { label: '范围', render: g => g.scope === 'all' ? '全部板块与课程' : g.scope === 'boards' ? (g.boardIds || []).map(boardId => boards.get(boardId) || boardId).join('、') : (g.courseIds || []).map(courseId => courses.get(courseId) || courseId).join('、') },
        { label: '到期', render: g => g.expiresAt ? date(g.expiresAt) : '永久' },
        { label: '状态', render: g => badge(g.revokedAt ? '已撤销' : g.expiresAt && Date.parse(g.expiresAt) <= Date.now() ? '已到期' : '有效', !g.revokedAt && (!g.expiresAt || Date.parse(g.expiresAt) > Date.now())) },
        { label: '原因 / 来源', render: g => el('div', {}, g.reason || '—', el('div', { class: 'muted' }, g.source || '—')) },
        { label: '操作', render: g => g.revokedAt ? '—' : button('撤销权益', () => revokeGrant(g, async () => { await refresh(); await afterChange(); }), 'small danger') }
      ], grants, '此用户暂无访问权益。'), el('h3', { class: 'section-label' }, '小节学习记录'), table([
        { label: '小节', render: r => el('div', {}, sections.get(r.sectionId) || '已移除的小节', el('div', { class: 'id-text' }, r.sectionId)) },
        { label: '状态', render: r => r.completed ? '已完成' : '未完成' }, { label: '更新时间', render: r => date(r.updatedAt) }
      ], learning.sections || [], '暂无小节学习记录。'), el('h3', { class: 'section-label' }, '最近学习位置'), table([
        { label: '课程', render: r => courses.get(r.courseId) || r.courseId }, { label: '章节', render: r => chapters.get(r.chapterId) || r.chapterId },
        { label: '小节', render: r => sections.get(r.sectionId) || r.sectionId || '—' }, { label: '更新时间', render: r => date(r.updatedAt) }
      ], learning.positions || [], '暂无学习位置。'), el('h3', { class: 'section-label' }, '迁移的章节完成记录'), table([{ label: '章节', render: r => chapters.get(r.chapterId) || r.chapterId }], learning.legacyChapters || [], '暂无迁移记录。'));
    }
  }
  await load(1);
}
function grantUser(user, catalog, onSaved) {
  let dirty = false;
  const m = modal(`授予权益：${user.nickname}`, { beforeClose: () => !dirty || confirmDanger('权益表单尚未提交，确定关闭？') });
  const scope = field('授权范围', { type: 'select', value: 'boards', options: [{ value: 'boards', label: '指定板块' }, { value: 'all', label: '全部板块与课程' }, { value: 'courses', label: '指定课程' }] });
  const boards = boardChecks(catalog.boards || []);
  const checks = courseChecks(catalog.courses); checks.node.hidden = true;
  scope.input.addEventListener('change', () => { checks.node.hidden = scope.input.value !== 'courses'; boards.node.hidden = scope.input.value !== 'boards'; });
  const expires = field('权益到期时间', { type: 'datetime-local', hint: '留空为永久。按当前电脑本地时间输入，提交时转换为 ISO 时间。' });
  const reason = field('授予原因', { type: 'textarea', required: true, maxlength: 1000 });
  const errors = errorBox(), submit = el('button', { type: 'submit', class: 'primary' }, '确认授予权益');
  m.content.append(el('form', { oninput: () => { dirty = true; }, onchange: () => { dirty = true; }, onsubmit: e => { e.preventDefault(); busy(submit, async () => {
    const courseIds = scope.input.value === 'courses' ? checks.values() : [];
    const boardIds = scope.input.value === 'boards' ? boards.values() : [];
    if (scope.input.value === 'courses' && !courseIds.length) throw new Error('指定课程授权至少选择一门课程');
    if (scope.input.value === 'boards' && !boardIds.length) throw new Error('指定板块授权至少选择一个学习板块');
    const expiresAt = isoFromInput(expires.input); if (expiresAt && Date.parse(expiresAt) <= Date.now()) throw new Error('到期时间须晚于当前时间');
    const scopeLabel = scope.input.value === 'all' ? '全部板块与课程' : scope.input.value === 'boards' ? '指定板块' : '指定课程';
    if (!confirmDanger(`确定为“${user.nickname}”授予${scopeLabel}访问权益？`)) return;
    await api(endpoint('users', user.id, '/grants'), { method: 'POST', body: { scope: scope.input.value, boardIds, courseIds, expiresAt, reason: reason.input.value.trim() } });
    dirty = false; m.close(); notify('访问权益已授予'); await onSaved();
  }, errors); } }, scope.node, boards.node, checks.node, expires.node, reason.node, errors, submit));
}
function boardChecks(boards) {
  const inputs = boards.map(board => ({ id: board.id, input: el('input', { type: 'checkbox' }), title: board.title + (board.enabled ? '' : '（已隐藏）') }));
  return { node: el('div', { class: 'check-list', 'aria-label': '选择学习板块' }, inputs.length ? inputs.map(x => el('label', {}, x.input, x.title)) : el('p', { class: 'muted' }, '暂无板块，请先在内容中创建并保存板块。')), values: () => inputs.filter(x => x.input.checked).map(x => x.id) };
}
function revokeGrant(grant, onSaved) {
  const m = modal('撤销访问权益');
  const reason = field('撤销原因', { type: 'textarea', required: true, maxlength: 1000, hint: '撤销后此条权益立即失效，用户的其他有效权益不受影响。' });
  const errors = errorBox(), submit = el('button', { type: 'submit', class: 'danger' }, '确认撤销');
  m.content.append(el('form', { onsubmit: e => { e.preventDefault(); busy(submit, async () => {
    if (!confirmDanger('确定撤销此条权益？此操作不能恢复，只能重新授予。')) return;
    await api(endpoint('grants', grant.id, '/revoke'), { method: 'POST', body: { reason: reason.input.value.trim() } });
    m.close(); notify('权益已撤销'); await onSaved();
  }, errors); } }, reason.node, errors, submit));
}

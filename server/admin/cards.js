import { api, endpoint, query } from './api.js';
import { el, button, field, head, table, pager, searchForm, modal, busy, errorBox, showError, notify, confirmDanger, badge, date, jsonDetails, courseChecks, isoFromInput } from './ui.js';
import { recordsView } from './logs.js';
export async function renderCards(host, context) {
  const catalog = await context.getCatalog(), courseNames = new Map(catalog.courses.map(c => [c.id, c.title]));
  let q = '', request = 0;
  const results = el('div'), errors = errorBox(), body = el('section', { class: 'panel' });
  const batchesTab = button('卡密批次', () => showBatches()); const recordsTab = button('核销记录', () => showRecords());
  host.replaceChildren(head('卡密与核销', '按批次生成课程访问卡密。明文只在生成成功后显示一次，后续仅可查看掩码。', button('生成新批次', () => generate(), 'primary')), el('div', { class: 'tabs', role: 'tablist', 'aria-label': '卡密与核销记录' }, batchesTab, recordsTab), body);
  function showBatches() {
    batchesTab.setAttribute('aria-selected', 'true'); recordsTab.setAttribute('aria-selected', 'false');
    const search = searchForm('搜索批次名称', value => { q = value; load(1); }); search.input.value = q;
    body.replaceChildren(search.node, errors, results); load(1);
  }
  function showRecords() {
    ++request; batchesTab.setAttribute('aria-selected', 'false'); recordsTab.setAttribute('aria-selected', 'true');
    body.replaceChildren(); recordsView(body, 'redemptions');
  }
  async function load(page) {
    const stamp = ++request; results.replaceChildren(el('p', { role: 'status' }, '正在读取卡密批次…')); errors.textContent = '';
    try {
      const data = await api(`/api/admin/card-batches?${query({ page, q })}`); if (stamp !== request) return;
      results.replaceChildren(table([
        { label: '批次', render: b => el('div', {}, b.title, el('div', { class: 'id-text' }, b.id)) },
        { label: '授权范围', render: b => b.scope === 'all' ? '全部课程' : (b.courseIds || []).map(id => courseNames.get(id) || id).join('、') },
        { label: '数量 / 已核销', render: b => `${b.count} / ${b.usedCount}` },
        { label: '卡密兑换截止', render: b => b.redeemExpiresAt ? date(b.redeemExpiresAt) : '不限' },
        { label: '权益时长', render: b => b.accessDays ? `${b.accessDays} 天` : '永久' },
        { label: '状态', render: b => badge(b.disabled ? '已停用' : '可用', !b.disabled) },
        { label: '操作', render: b => el('div', { class: 'row' }, button('查看掩码卡', () => showCards(b), 'small'), b.disabled ? null : button('停用批次', e => busy(e.currentTarget, async () => {
          if (!confirmDanger(`确定停用“${b.title}”的所有未核销卡密？已核销权益不受影响；停用无法撤回。`)) return;
          await api(endpoint('card-batches', b.id, '/disable'), { method: 'POST' }); notify('批次已停用'); await load(page);
        }, errors), 'small danger')) }
      ], data.items, '还没有卡密批次。可生成新批次，明文仅返回一次。'), pager(data, load));
    } catch (error) { if (stamp === request) { results.replaceChildren(); showError(errors, error); } }
  }
  function generate() {
    let dirty = false;
    const m = modal('生成卡密批次', { beforeClose: () => !dirty || confirmDanger('批次表单尚未提交，确定关闭？') });
    const title = field('批次名称', { required: true, maxlength: 200 });
    const count = field('生成数量', { type: 'number', value: 1, min: 1, max: 500, step: 1, required: true, hint: '每次 1–500 张。不要在网络不确定时重复提交。' });
    const scope = field('授权范围', { type: 'select', value: 'all', options: [{ value: 'all', label: '全部课程' }, { value: 'courses', label: '指定课程' }] });
    const checks = courseChecks(catalog.courses); checks.node.hidden = true;
    scope.input.addEventListener('change', () => { checks.node.hidden = scope.input.value !== 'courses'; });
    const redeemExpires = field('卡密兑换截止时间', { type: 'datetime-local', hint: '留空为不限。此日期限制卡密兑换，不是已兑换权益的到期时间。按本地时间输入。' });
    const accessDays = field('兑换后的权益天数', { type: 'number', min: 1, step: 1, hint: '留空为永久；填写正整数，按每个用户实际兑换时间起算。' });
    const errors = errorBox(), submit = el('button', { type: 'submit', class: 'primary' }, '确认生成卡密');
    m.content.append(el('p', { class: 'status' }, '生成成功后，请立即复制或下载卡密。关闭明文窗口后无法找回。'), el('form', { oninput: () => { dirty = true; }, onchange: () => { dirty = true; }, onsubmit: e => { e.preventDefault(); busy(submit, async () => {
      const courseIds = scope.input.value === 'courses' ? checks.values() : [];
      if (scope.input.value === 'courses' && !courseIds.length) throw new Error('至少选择一门课程');
      const redeemExpiresAt = isoFromInput(redeemExpires.input);
      if (redeemExpiresAt && Date.parse(redeemExpiresAt) <= Date.now()) throw new Error('兑换截止时间须晚于当前时间');
      if (!confirmDanger(`确定生成 ${count.input.value} 张卡密？请准备好立即保存明文。`)) return;
      const result = await api('/api/admin/card-batches', { method: 'POST', body: { title: title.input.value.trim(), count: Number(count.input.value), scope: scope.input.value, courseIds, redeemExpiresAt, accessDays: accessDays.input.value === '' ? null : Number(accessDays.input.value) } });
      dirty = false; m.close(); showCodes(result, context); showBatches();
    }, errors); } }, title.node, count.node, scope.node, checks.node, redeemExpires.node, accessDays.node, errors, submit));
  }
  showBatches();
}
function showCodes(result, context) {
  let codes = result.codes, saved = false;
  const pendingKey = Symbol('plaintext-codes'); context.pending.set(pendingKey, true);
  const m = modal('本次生成的卡密明文', { beforeClose: () => {
    if (!confirmDanger(saved ? '确定关闭明文窗口？此后无法再次查看。' : '尚未复制或下载卡密。关闭后明文无法找回，确定关闭？')) return false;
    output.value = ''; codes.fill(''); codes = []; result.codes = []; context.pending.delete(pendingKey); return true;
  } });
  const output = el('textarea', { class: 'code-output', readOnly: true, value: codes.join('\n'), 'aria-label': '本次卡密明文，每行一个', spellcheck: 'false', autocomplete: 'off' });
  const status = el('p', { class: 'status', role: 'status' }, '请立即复制或下载；明文不会保存到浏览器存储。');
  const copy = button('复制全部卡密', e => busy(e.currentTarget, async () => {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(output.value);
      else { output.focus(); output.select(); if (!document.execCommand('copy')) throw new Error('复制不可用'); }
      saved = true; status.textContent = '已复制到剪贴板。请妥善保管，避免将卡密粘贴到公共位置。';
    } catch { output.focus(); output.select(); throw new Error('自动复制不可用，请手动复制已选中的卡密文本'); }
  }));
  const download = button('下载 TXT', () => {
    const blob = new Blob([`${codes.join('\r\n')}\r\n`], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = el('a', { href: url, download: `blueprint-codes-${String(result.batch.id).replace(/[^A-Za-z0-9_-]/g, '')}.txt` });
    document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
    saved = true; status.textContent = '已发起 TXT 下载。请确认文件已保存，再关闭此窗口。';
  }, 'primary');
  m.content.append(el('p', {}, `批次：${result.batch.title}，共 ${codes.length} 张`), status, output, el('div', { class: 'actions' }, copy, download));
}
function showCards(batch) {
  const m = modal(`卡密掩码：${batch.title}`), results = el('div'), errors = errorBox();
  let q = '', request = 0;
  const search = searchForm('搜索卡密掩码', value => { q = value; load(1); });
  const status = field('核销状态', { type: 'select', value: '', options: [{ value: '', label: '全部' }, { value: 'unused', label: '未核销' }, { value: 'used', label: '已核销' }, { value: 'disabled', label: '已停用' }, { value: 'expired', label: '已过期' }] });
  status.input.addEventListener('change', () => load(1));
  m.content.append(el('p', { class: 'muted' }, '这里只展示掩码；服务端不会再次返回卡密明文。'), search.node, status.node, errors, results);
  async function load(page) {
    const stamp = ++request; results.replaceChildren(el('p', { role: 'status' }, '正在读取卡密…')); errors.textContent = '';
    try {
      const data = await api(`/api/admin/cards?${query({ batchId: batch.id, page, q, status: status.input.value })}`); if (stamp !== request || !m.dialog.isConnected) return;
      results.replaceChildren(table([
        { label: '卡密掩码', key: 'mask' }, { label: '状态', render: c => badge(c.status === 'used' ? '已核销' : c.status === 'disabled' ? '已停用' : c.status === 'expired' ? '已过期' : '未核销', c.status === 'used') },
        { label: '核销用户', key: 'usedBy' }, { label: '核销时间', render: c => date(c.usedAt) }, { label: '明细', render: c => jsonDetails(c) }
      ], data.items, '没有匹配的卡密。'), pager(data, load));
    } catch (error) { if (stamp === request) { results.replaceChildren(); showError(errors, error); } }
  }
  load(1);
}

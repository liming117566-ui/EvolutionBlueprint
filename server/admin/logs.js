import { api, query } from './api.js';
import { el, head, table, pager, errorBox, showError, date, jsonDetails } from './ui.js';
export async function renderLogs(host, context, kind = 'audit') {
  host.replaceChildren(head('操作审计', '查询管理员操作记录。审计记录只读，不提供编辑或删除入口。'));
  const panel = el('section', { class: 'panel' }); host.append(panel); await recordsView(panel, kind);
}
export async function recordsView(host, kind) {
  const results = el('div'), errors = errorBox(); let request = 0;
  host.replaceChildren(errors, results);
  async function load(page) {
    const stamp = ++request; results.replaceChildren(el('p', { role: 'status' }, '正在读取记录…')); errors.textContent = '';
    try {
      const data = await api(`/api/admin/${kind}?${query({ page })}`); if (stamp !== request) return;
      const columns = kind === 'audit' ? [
        { label: '时间', render: r => date(r.createdAt) }, { label: '操作人', key: 'actor' }, { label: '操作', key: 'action' }, { label: '目标', key: 'target' }, { label: '明细', render: r => jsonDetails(r, '展开审计详情') }
      ] : [
        { label: '核销时间', render: r => date(r.createdAt) }, { label: '用户', key: 'userId' }, { label: '卡密 ID', key: 'cardId' }, { label: '权益 ID', key: 'grantId' }, { label: '明细', render: r => jsonDetails(r, '展开核销详情') }
      ];
      results.replaceChildren(table(columns, data.items, kind === 'audit' ? '暂无审计记录。' : '暂无核销记录。'), pager(data, load));
    } catch (error) { if (stamp === request) { results.replaceChildren(); showError(errors, error); } }
  }
  await load(1);
}

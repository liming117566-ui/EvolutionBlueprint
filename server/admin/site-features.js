import { api } from './api.js';
import { el, field, button, head, busy, errorBox, notify, date, dirtyForm, confirmDanger } from './ui.js';

const endpoint = '/api/admin/site-features';

export async function renderSiteFeatures(host, context) {
  const { printing, announcement } = await api(endpoint);
  const enabled = field('显示在线打印入口', { type: 'checkbox', value: printing.enabled });
  const dealerId = field('刺猬经销商编号', { value: printing.dealerId, maxlength: 80, hint: '填写经销商编号 sid，保存后应用到首页和学习页。' });
  const printError = errorBox();
  const printForm = el('form', { class: 'panel' }, el('h2', {}, '在线打印'), enabled.node, dealerId.node, printError);
  const clearPrintDirty = dirtyForm(printForm, context);
  const savePrinting = el('button', { type: 'submit', class: 'btn primary' }, '保存打印设置');
  printForm.addEventListener('submit', event => {
    event.preventDefault();
    busy(savePrinting, async () => {
      const saved = await api(`${endpoint}/printing`, { method: 'PUT', body: { enabled: enabled.input.checked, dealerId: dealerId.input.value } });
      dealerId.input.value = saved.dealerId;
      clearPrintDirty();
      notify('打印设置已保存');
    }, printError);
  });
  printForm.append(el('div', { class: 'actions' }, savePrinting));

  const title = field('公告标题', { value: announcement?.title, maxlength: 80, required: true });
  const html = field('HTML 正文', { type: 'textarea', value: announcement?.html, rows: 12, maxlength: 30000, required: true, hint: '粘贴 HTML 正文。支持标题、段落、加粗、列表和表格等格式。' });
  const announcementError = errorBox();
  const noticeStatus = el('p', { class: 'muted' });
  const noticeForm = el('form', { class: 'panel' }, el('h2', {}, '首页公告'), noticeStatus, title.node, html.node, announcementError);
  const clearNoticeDirty = dirtyForm(noticeForm, context);
  const publish = el('button', { type: 'submit', class: 'btn primary' }, '发布公告');
  let publishedAt = announcement?.publishedAt;
  const unpublish = button('撤下公告', () => {
    if (!confirmDanger('确定从小程序首页撤下这条公告？')) return;
    busy(unpublish, async () => {
      const saved = await api(`${endpoint}/announcement`, { method: 'DELETE' });
      publishedAt = saved.publishedAt;
      notify('公告已撤下');
    }, announcementError).then(renderStatus);
  });
  function renderStatus() {
    noticeStatus.textContent = publishedAt ? `已发布于 ${date(publishedAt)}` : '暂无已发布公告';
    unpublish.disabled = !publishedAt;
  }
  noticeForm.addEventListener('submit', event => {
    event.preventDefault();
    busy(publish, async () => {
      const saved = await api(`${endpoint}/announcement`, { method: 'PUT', body: { title: title.input.value, html: html.input.value } });
      title.input.value = saved.title;
      html.input.value = saved.html;
      publishedAt = saved.publishedAt;
      renderStatus();
      clearNoticeDirty();
      notify('首页公告已发布');
    }, announcementError);
  });
  renderStatus();
  noticeForm.append(el('div', { class: 'actions' }, publish, unpublish));
  host.replaceChildren(head('打印与公告', '管理小程序的在线打印入口和首页公告。'), printForm, noticeForm);
}

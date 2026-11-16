import { api, endpoint } from './api.js';
import { el, button, field, head, table, modal, busy, errorBox, showError, notify, confirmDanger, badge, date } from './ui.js';
export async function renderWebsites(host, context) {
  const results = el('div'), errors = errorBox();
  host.replaceChildren(head('网页学习资源', '上传 HTML 或包含唯一 index.html 的 ZIP，再到学习板块中选用网页。原 PDF / Word 资料仍在资源库上传、课程资料中关联。', button('上传网页', upload, 'primary')), el('section', { class: 'panel' }, el('p', { class: 'status' }, '支持静态 HTML / CSS / JavaScript、图片、字体和音视频。网页在隔离沙箱中运行，不可访问后台登录信息；联网 API、浏览器存储、需要服务器的应用不支持。板块须发布，学员兑换对应板块或全部权限后才能打开。'), errors, results));
  async function load() {
    results.replaceChildren(el('p', { role: 'status' }, '正在读取网页资源…'));
    try {
      const data = await api('/api/admin/websites');
      results.replaceChildren(table([
        { label: '网页名称', render: item => el('div', {}, item.title, el('div', { class: 'id-text' }, item.id)) },
        { label: '状态', render: item => badge(item.ready ? '可关联板块' : '文件缺失', item.ready) },
        { label: '大小', render: item => `${(item.sizeBytes / 1048576).toFixed(2)} MiB` },
        { label: '上传时间', render: item => date(item.createdAt) },
        { label: '操作', render: item => button('删除', event => busy(event.currentTarget, async () => {
          if (!confirmDanger('确定删除此网页？已被板块或历史发布版本引用的网页不能删除。')) return;
          await api(endpoint('websites', item.id), { method: 'DELETE' }); notify('网页已删除'); await load();
        }, errors), 'small danger') }
      ], data.items, '还没有网页资源。上传后在学习板块的“打开页面”中选用，再保存草稿并发布。'));
    } catch (error) { results.replaceChildren(); showError(errors, error); }
  }
  function upload() {
    const m = modal('上传网页学习资源'), title = field('网页名称', { required: true, maxlength: 200 });
    const file = field('选择 HTML 或 ZIP', { type: 'file', accept: '.html,.htm,.zip', required: true, hint: '单 HTML ≤ 5 MiB；ZIP ≤ 50 MiB，解压后 ≤ 100 MiB、最多 3000 项。ZIP 须含唯一 index.html / index.htm，使用相对资源路径，不含服务器程序。' });
    const errors = errorBox(), submit = el('button', { type: 'submit', class: 'primary' }, '上传网页');
    file.input.addEventListener('change', () => { if (!title.input.value && file.input.files[0]) title.input.value = file.input.files[0].name.replace(/\.[^.]+$/, ''); });
    m.content.append(el('form', { onsubmit: event => { event.preventDefault(); busy(submit, async () => {
      const selected = file.input.files[0]; if (!selected) throw new Error('请选择网页文件');
      if (!/\.(html?|zip)$/i.test(selected.name)) throw new Error('只支持 HTML 或 ZIP');
      const limit = /\.zip$/i.test(selected.name) ? 50 : 5; if (selected.size > limit * 1048576) throw new Error(`文件不能超过 ${limit} MiB`);
      const body = new FormData(); body.append('file', selected); body.append('title', title.input.value.trim());
      const result = await api('/api/admin/websites', { method: 'POST', body }); m.close();
      notify(`“${result.website.title}”已上传，请在学习板块中选用、保存并发布`); await load();
    }, errors); } }, title.node, file.node, errors, submit));
  }
  await load();
}

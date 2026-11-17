import { api } from './api.js';
import { el, button, table, date, badge } from './ui.js';
import { icon } from './icons.js';
import { importCourse } from './courses.js';
const actions = { 'admin.login': '管理员登录', 'catalog.save': '保存目录草稿', 'catalog.publish': '发布课程内容', 'asset.upload': '上传课程资源', 'website.upload': '上传网页课程', 'course.create': '新增课程', 'material.create': '关联课程资料', 'user.update': '更新学员信息', 'batch.create': '生成卡密', 'grant.create': '授予学习权益' };
export async function renderDashboard(host, context) {
  const [stats, tree] = await Promise.all([api('/api/admin/overview'), context.getCatalog()]);
  host.className = 'dashboard';
  const go = id => context.navigate(id), chart = el('div'), periods = el('div', { class: 'segment' }); let period = 7;
  const chartTitle = el('h2', {}, '学习与学员趋势');
  const panel = (title, action, body) => el('section', { class: 'panel' }, el('div', { class: 'panel-head' }, el('h2', {}, title), action), body);
  const quick = (name, subtitle, key, work) => button(el('span', { class: 'row' }, el('span', { class: 'quick-icon' }, icon(key)), el('span', { class: 'od-field' }, el('strong', {}, name), el('small', {}, subtitle))), work, 'quick-item');
  const metric = (name, number, note, key, color, target) => el('article', { class: 'stat-card' }, el('div', { class: 'stat-head' }, name, el('span', { class: `stat-icon ${color}` }, icon(key))), el('div', { class: 'stat-number' }, number), el('div', { class: 'stat-foot' }, el('span', {}, note), button('查看详情 →', () => go(target), 'link')));
  const task = (name, note, number, key, color, target) => button(el('span', { class: 'row flex-fill' }, el('span', { class: `task-symbol ${color}` }, icon(key)), el('span', { class: 'od-field flex-fill' }, el('strong', {}, name), el('small', {}, note)), el('b', {}, number), icon('arrow')), () => go(target), 'task');
  const chartPanel = el('section', { class: 'panel' }, el('div', { class: 'panel-head' }, chartTitle, periods), el('div', { class: 'chart-info' }, el('div', { class: 'legend' }, el('span', {}, el('i'), '学习记录更新'), el('span', {}, el('i', { class: 'pale' }), '新增学员'))), chart);
  function drawChart() {
    periods.replaceChildren(...[7, 30].map(days => button(`近 ${days} 天`, () => { period = days; drawChart(); }, days === period ? 'selected' : '')));
    const values = stats.trend.slice(-period), maximum = Math.max(1, ...values.flatMap(v => [v.learning, v.users]));
    chart.className = 'chart';
    chart.replaceChildren(el('div', { class: 'trend-bars', role: 'img', 'aria-label': `近 ${period} 天学习记录更新 ${values.reduce((n, d) => n + d.learning, 0)} 条，新增学员 ${values.reduce((n, d) => n + d.users, 0)} 人` }, ...values.map((v, i) => {
      const learning = el('span', { class: 'trend-bar', title: `${v.day} 学习更新 ${v.learning}` }), users = el('span', { class: 'trend-bar pale', title: `${v.day} 新增学员 ${v.users}` });
      learning.style.height = `${v.learning / maximum * 100}%`; users.style.height = `${v.users / maximum * 100}%`;
      return el('div', { class: 'trend-day' }, el('div', { class: 'trend-pair' }, learning, users), el('small', {}, period === 7 || i % 6 === 0 || i === values.length - 1 ? v.day.slice(5).replace('-', '/') : ''));
    })), el('p', { class: 'trend-note' }, '依据最近保存的学习记录更新时间与学员创建时间统计（UTC 日期）。无记录的日期显示为 0。'));
  }
  const today = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
  host.replaceChildren(el('div', { class: 'page-heading' }, el('div', {}, el('h1', {}, '工作台'), el('p', {}, '欢迎回来，今天也为学习创造更多可能。')), el('span', { class: 'muted date-button' }, today)),
    el('section', { class: 'welcome' }, el('div', {}, el('div', { class: 'eyebrow' }, 'XINBOTU ONLINE · ADMIN CONSOLE'), el('h2', {}, '让每一份好内容，都能被看见'), el('p', {}, '从课程搭建、内容发布，到学员权益管理，在这里有序完成。')), el('div', { class: 'welcome-actions' }, button('管理学习板块', () => go('boards')), button(el('span', { class: 'row' }, icon('plus'), '新增课程'), () => importCourse(context), 'primary'))),
    el('div', { class: 'stats' }, metric('累计学员', stats.users, `启用中 ${stats.activeUsers} 人`, 'users', '', 'users'), metric('已发布课程', stats.courses, `草稿目录 ${stats.draftCourses} 门`, 'book', 'green', 'catalog'), metric('学习资源', stats.assets + stats.websites, `网页 ${stats.websites} 份`, 'folder', 'gold', 'assets'), metric('卡密核销', stats.redeemed, `已生成 ${stats.cards} 张`, 'ticket', 'slate', 'cards')),
    el('div', { class: 'dashboard-grid' }, el('div', { class: 'column' }, chartPanel,
      panel('快捷操作', null, el('div', { class: 'quick-grid' }, quick('新增课程', '图文 / 文档 / 视频', 'plus', () => importCourse(context)), quick('上传网页', 'HTML / ZIP 网页课程', 'globe', () => importCourse(context, 'website')), quick('前端排序', '调整板块与课程顺序', 'sort', () => go('order')), quick('生成卡密', '开通学员学习权益', 'ticket', () => go('cards')))),
      panel('最近课程', button('管理全部 →', () => go('catalog'), 'link'), table([{ label: '课程名称', render: c => el('div', { class: 'table-title' }, el('strong', {}, c.title), el('small', {}, `${c.chapters.length} 章 · ${tree.categories.find(x => x.id === c.categoryId)?.title || ''}`)) }, { label: '状态', render: c => badge(c.published ? '显示中' : '已归档', c.published) }, { label: '操作', render: c => button('编辑', () => { context.selection = { type: 'course', id: c.id }; go('editor'); }, 'link') }], tree.courses.slice(-4).reverse(), '还没有课程，点击上方新增课程开始。'))),
    el('div', { class: 'column' }, panel('待办事项', null, el('div', { class: 'tasks' }, task('目录发布', stats.hasDraft || context.catalogDirty ? '有调整等待发布' : '当前目录已同步', stats.hasDraft || context.catalogDirty ? '1' : '0', 'book', '', 'catalog'), task('板块与排序', '管理前端学习入口', stats.boards, 'grid', 'blue', 'order'), task('资源管理', '上传与关联课程文件', stats.assets, 'folder', 'green', 'materials'))),
      panel('最近操作', button('全部 →', () => go('audit'), 'link'), el('div', { class: 'activity' }, ...(stats.recent.length ? stats.recent.map(r => el('div', { class: 'activity-item' }, el('span', { class: 'timeline' }, el('i')), el('div', {}, el('p', {}, el('strong', {}, actions[r.action] || r.action)), el('small', {}, date(r.createdAt))))) : [el('p', { class: 'muted' }, '暂无操作记录')]))),
      el('section', { class: 'tip' }, el('h3', {}, icon('help'), '从一门课程开始'), el('p', {}, '选择课程类型，上传文件或录入文字，设置学习板块。保存草稿后发布，学员便能按你设置的顺序找到课程。'), button('查看管理指南 →', () => context.help(), 'link')))));
  drawChart();
}

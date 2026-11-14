const catalog = require('./catalog');
const GROUPS = [{ id: 'all', title: '全部' }, { id: 'subject', title: '学科提升' }, { id: 'growth', title: '自我成长' }, { id: 'life', title: '生活方式' }];
function decorate(boards, courses, placement) {
  return (boards || []).filter(b => b.enabled && (!placement || b[placement])).map(b => {
    const matches = courses.filter(c => b.categoryIds.includes(c.categoryId));
    const metaLabel = b.experience === 'english-starry-sky' ? '五册教材' : b.experience === 'cn-math-taxonomy' ? '小学至高中' : b.experience === 'tainai-junior-math' ? '基础衔接 · 七至九年级' : '';
    const featureLabel = b.experience === 'english-starry-sky' ? '今日 · 图鉴 · 课本' : b.experience === 'cn-math-taxonomy' ? '图谱 · 诊断 · 档案' : b.experience === 'tainai-junior-math' ? '课程 · 例题 · 动画' : b.features.length + ' 个学习入口';
    return { ...b, metaLabel, featureLabel, icon: catalog.asset(b.icon), cover: catalog.asset(b.cover), courseCount: matches.length, availableCount: matches.filter(c => c.accessible).length, features: b.features.map(f => ({ ...f, icon: catalog.asset(f.icon) })) };
  });
}
function open(id, experience) {
  const page = experience === 'english-starry-sky' ? 'english' : experience === 'cn-math-taxonomy' ? 'math' : experience === 'tainai-junior-math' ? 'junior-math' : 'board';
  if (typeof id === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(id)) wx.navigateTo({ url: '/pages/' + page + '/' + page + '?id=' + encodeURIComponent(id) });
}
function course(id) { if (typeof id === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(id)) wx.navigateTo({ url: '/pages/course/course?id=' + encodeURIComponent(id) }); }
module.exports = { GROUPS, decorate, open, course };

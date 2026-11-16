const { text, identifier, fail } = require('./security');
const { defaults } = require('../miniprogram/utils/board-defaults');
const GROUPS = ['subject', 'growth', 'life'];
const TYPES = ['courses', 'practice', 'progress'];
function initial(categories) {
  return defaults().map(b => ({ ...b, categoryIds: b.categoryIds.filter(id => categories.some(c => c.id === id)) }));
}
function validate(input, categories, assetReference, ident, websiteExists = () => false) {
  if (!Array.isArray(input) || input.length > 100) fail(400, '学习板块格式有误，最多 100 个');
  return input.map(b => {
    const experience = b && b.experience || 'courses';
    if (!['courses', 'english-starry-sky', 'cn-math-taxonomy', 'tainai-junior-math'].includes(experience) && !require('../miniprogram/utils/integrations').find(experience) && !(/^website:[A-Za-z0-9_-]{1,100}$/.test(experience) && websiteExists(experience.slice(8)))) fail(400, '学习板块页面类型无效');
    if (!b || !GROUPS.includes(b.group) || !['blue', 'lilac', 'ink'].includes(b.tone)) fail(400, '板块分组或配色有误');
    if (!Array.isArray(b.categoryIds) || b.categoryIds.length > 100 || new Set(b.categoryIds).size !== b.categoryIds.length || b.categoryIds.some(id => !categories.some(c => c.id === id))) fail(400, '板块必须关联有效且不重复的课程主题');
    if (!Array.isArray(b.features) || !b.features.length || b.features.length > 3) fail(400, '板块须配置 1 至 3 个功能入口');
    const used = new Set(), featureIds = new Set();
    const features = b.features.map(f => {
      if (!f || !TYPES.includes(f.type) || used.has(f.type) || featureIds.has(f.id)) fail(400, '板块功能类型或 ID 无效或重复');
      used.add(f.type); featureIds.add(f.id);
      return { id: identifier(f.id), title: text(f.title, 20), description: text(f.description || '', 60, false), icon: assetReference(f.icon), type: f.type };
    });
    return { id: ident(b.id), experience, title: text(b.title, 40), subtitle: text(b.subtitle || '', 100, false), description: text(b.description || '', 1000, false), group: b.group, tone: b.tone, badge: text(b.badge || '', 16, false), icon: assetReference(b.icon), cover: assetReference(b.cover), categoryIds: b.categoryIds.slice(), home: b.home === true, learn: b.learn === true, enabled: b.enabled === true, featured: b.featured === true, features };
  });
}
module.exports = { initial, validate };

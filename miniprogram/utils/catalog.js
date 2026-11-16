const api = require('./api');
const config = require('./config');
const session = require('./session');
const defaults = {
  brandName: '新博途', logo: '/assets/generated/app-icon.webp', avatar: '/assets/icons/user.svg', gateCover: '/assets/generated/home-hero.webp',
  welcomeTitle: '让学习成为日常', gateTitle: '开启你的学习空间', gateDescription: '登录并兑换课程，开始学习。',
  nav: [{ id: 'home', label: '首页', icon: '/assets/icons/home.svg' }, { id: 'learn', label: '学习', icon: '/assets/icons/book.svg' }, { id: 'profile', label: '我的', icon: '/assets/icons/user.svg' }],
  help: [], about: [], redeemHelp: []
};
let settings = defaults;
function asset(url) {
  if (typeof url !== 'string') return '';
  if (/^\/assets\/[A-Za-z0-9_./-]+$/.test(url) && !url.includes('..')) return url;
  if (/^\/api\/assets\/[A-Za-z0-9_-]+$/.test(url) && config.validOrigin(config.getApiBaseUrl())) return config.getApiBaseUrl() + url;
  return '';
}
function normalizeSettings(source) {
  source = source || {};
  const result = { ...defaults, ...source };
  for (const key of ['logo', 'avatar', 'gateCover']) result[key] = asset(result[key]) || defaults[key];
  result.nav = defaults.nav.map(tab => {
    const remote = Array.isArray(source.nav) && source.nav.find(item => item.id === tab.id);
    return { id: tab.id, label: remote && remote.label || tab.label, icon: remote && asset(remote.icon) || tab.icon };
  });
  for (const key of ['help', 'about', 'redeemHelp']) result[key] = Array.isArray(result[key]) ? result[key].filter(item => typeof item === 'string') : [];
  return result;
}
async function bootstrap() {
  const result = await api.request('/api/bootstrap', { auth: Boolean(session.current()) });
  settings = normalizeSettings(result.settings);
  try { getApp().globalData.settings = settings; } catch (_) {}
  return { ...result, settings };
}
async function list() {
  const result = await api.request('/api/courses', { auth: Boolean(session.current()) });
  if (!Array.isArray(result.courses)) throw new Error('课程目录返回的数据有误');
  return result.courses.map(course => ({ ...course, cover: asset(course.cover), accessible: course.accessible === true, completed: [], progress: 0 }));
}
async function full(id) {
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(id)) throw new Error('课程不存在，请返回课程目录');
  // Never reuse a full-course response as proof of current entitlement, or fall back to local text.
  const result = await api.request('/api/courses/' + encodeURIComponent(id));
  const course = result.course;
  if (!course || course.id !== id || !Array.isArray(course.chapters) || !course.chapters.every(c => typeof c.id === 'string' && Array.isArray(c.sections))) throw new Error('课程正文返回的数据有误');
  return { ...course, cover: asset(course.cover), accessible: true, lessons: course.chapters.length };
}
module.exports = { bootstrap, list, full, asset, defaults, settings: () => settings };

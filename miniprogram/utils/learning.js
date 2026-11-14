const api = require('./api');
const session = require('./session');
const catalog = require('./catalog');
function authorized() {
  if (session.current()) return true;
  wx.redirectTo({ url: '/pages/gate/gate' });
  return false;
}
function state() {
  if (!session.current()) return { sections: [], positions: [], legacyChapters: [] };
  const saved = wx.getStorageSync(session.userKey('learning')) || {};
  return { sections: saved.sections || [], positions: saved.positions || [], legacyChapters: saved.legacyChapters || [] };
}
function same(token) { if (!session.current() || session.current().token !== token) throw new Error('账号已切换，请重新加载'); }
async function flush() {
  const user = session.current();
  if (!user) throw new Error('请先登录');
  const key = session.userKey('queue');
  const queue = wx.getStorageSync(key) || [];
  for (const entry of queue.slice()) {
    same(user.token);
    try { await api.request('/api/me/learning', { method: 'PUT', data: entry.data }); }
    catch (error) {
      if (error.network || error.status >= 500) throw error;
      if (error.status === 401) throw error;
      // Revoked/deleted content must not permanently block other valid records.
    }
    same(user.token);
    const current = wx.getStorageSync(key) || [];
    wx.setStorageSync(key, current.filter(item => item.id !== entry.id));
  }
}
async function refresh() {
  const user = session.current();
  if (!user) throw new Error('请先登录');
  await flush();
  const result = await api.request('/api/me/learning');
  same(user.token);
  if (!Array.isArray(result.sections) || !Array.isArray(result.positions) || !Array.isArray(result.legacyChapters)) throw new Error('学习记录返回的数据有误');
  wx.setStorageSync(session.userKey('learning'), result);
  return result;
}
async function load() {
  if (!authorized()) return null;
  const [boot, me, courses] = await Promise.all([catalog.bootstrap(), session.me(), catalog.list()]);
  await refresh();
  const completeCourses = await Promise.all(courses.map(async course => course.accessible ? { ...course, ...await catalog.full(course.id) } : course));
  return { settings: boot.settings, boards: boot.boards || [], me, courses: completeCourses.map(decorate) };
}
// Catalog browsing is public. Only authenticated, entitled requests load course bodies.
async function browse() {
  if (session.current()) return load();
  const [boot, courses] = await Promise.all([catalog.bootstrap(), catalog.list()]);
  return { settings: boot.settings, boards: boot.boards || [], me: { hasAccess: false }, courses };
}
function decorate(course) {
  const saved = state();
  const done = new Set(saved.sections.filter(s => s.completed).map(s => s.sectionId));
  const old = new Set(saved.legacyChapters.map(c => c.chapterId));
  const position = saved.positions.find(p => p.courseId === course.id);
  const chapters = Array.isArray(course.chapters) ? course.chapters : [];
  const completed = chapters.filter(ch => old.has(ch.id) || (ch.sections.length > 0 && ch.sections.every(s => done.has(s.id)))).map(ch => ch.id);
  return { ...course, completed, progress: chapters.length ? Math.round(completed.length / chapters.length * 100) : 0,
    active: position && chapters.some(c => c.id === position.chapterId) ? position.chapterId : chapters[0] && chapters[0].id };
}
function chapters(course) {
  return (course && course.chapters || []).map((chapter, index) => ({ id: chapter.id, title: chapter.title, index, done: course.completed.includes(chapter.id), current: course.active === chapter.id }));
}
async function record(courseId, chapterId, sectionId, complete) {
  const saved = session.current();
  if (!saved) throw new Error('请先登录');
  const key = session.userKey('queue');
  const data = { courseId, chapterId };
  if (sectionId) data.sectionId = sectionId;
  if (complete === true && sectionId) data.completed = true;
  const entry = { id: Date.now().toString(36) + Math.random().toString(36).slice(2), data };
  const queue = wx.getStorageSync(key) || [];
  wx.setStorageSync(key, [...queue, entry]);
  try {
    await api.request('/api/me/learning', { method: 'PUT', data });
  } catch (error) {
    if (error.network) error.message = '网络中断，学习记录已暂存到当前账号，联网后重试同步。';
    if (!error.network && !(error.status >= 500)) wx.setStorageSync(key, (wx.getStorageSync(key) || []).filter(item => item.id !== entry.id));
    throw error;
  }
  same(saved.token);
  wx.setStorageSync(key, (wx.getStorageSync(key) || []).filter(item => item.id !== entry.id));
  const current = state();
  current.positions = [...current.positions.filter(p => p.courseId !== courseId), { courseId, chapterId, sectionId: sectionId || null }];
  if (data.completed) current.sections = [...current.sections.filter(s => s.sectionId !== sectionId), { sectionId, completed: true }];
  wx.setStorageSync(session.userKey('learning'), current);
  wx.setStorageSync(session.userKey('currentCourse'), courseId);
}
module.exports = { authorized, load, browse, refresh, state, decorate, chapters, flush, record,
  remember: (courseId, chapterId, sectionId) => record(courseId, chapterId, sectionId, false),
  currentCourse: () => session.current() && wx.getStorageSync(session.userKey('currentCourse')) };

const session = require('./session');
const learning = require('./learning');
const key = () => session.current() && session.userKey('studySpaceV1');
function read() {
  const saved = key() && wx.getStorageSync(key()) || {};
  return {
    visits: Array.isArray(saved.visits) ? saved.visits.filter(v => v && typeof v.id === 'string' && typeof v.date === 'string').slice(-1000) : [],
    checkins: Array.isArray(saved.checkins) ? saved.checkins.filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).slice(-366) : [],
    notes: Array.isArray(saved.notes) ? saved.notes.filter(n => n && typeof n.text === 'string' && typeof n.date === 'string').slice(-200) : [],
    goal: [10, 15, 30].includes(saved.goal) ? saved.goal : 15
  };
}
function write(update) { if (!key()) return false; wx.setStorageSync(key(), { ...read(), ...update }); return true; }
function dateKey(date = new Date()) { return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0'); }
function visit(board) {
  const saved = read(), date = dateKey();
  write({ visits: [...saved.visits.filter(v => v.id !== board.id || v.date !== date), { id: board.id, title: board.title, date }] });
}
function checkin() { const saved = read(); return write({ checkins: [...new Set([...saved.checkins, dateKey()])] }); }
function addNote(text) {
  text = String(text || '').trim().slice(0, 3000);
  if (!text) return false;
  return write({ notes: [...read().notes, { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8), text, date: dateKey() }] });
}
function summary(courses = [], boards = []) {
  const saved = read(), state = learning.state(), today = dateKey();
  const dates = new Set([...saved.visits.map(v => v.date), ...saved.checkins]);
  for (const item of [...state.sections, ...state.positions]) {
    if (typeof item.updatedAt === 'string' && !Number.isNaN(Date.parse(item.updatedAt))) dates.add(dateKey(new Date(item.updatedAt)));
  }
  const monday = new Date(); monday.setHours(12, 0, 0, 0); monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);
  const week = ['一', '二', '三', '四', '五', '六', '日'].map((label, index) => {
    const day = new Date(monday); day.setDate(monday.getDate() + index); const date = dateKey(day);
    return { label, date, number: day.getDate(), active: dates.has(date), today: date === today };
  });
  const courseById = new Map(courses.map(course => [course.id, course]));
  const courseBySection = new Map();
  for (const course of courses) for (const chapter of course.chapters || []) for (const section of chapter.sections || []) courseBySection.set(section.id, course);
  const recent = saved.visits.map((visit, order) => ({ id: visit.id, date: visit.date, order, time: null }));
  for (const item of [...state.positions, ...state.sections]) {
    const course = courseById.get(item.courseId) || courseBySection.get(item.sectionId);
    const time = typeof item.updatedAt === 'string' ? Date.parse(item.updatedAt) : NaN;
    if (!course || Number.isNaN(time)) continue;
    for (const board of boards) if ((board.categoryIds || []).includes(course.categoryId)) recent.push({ id: board.id, date: dateKey(new Date(time)), time });
  }
  // Web visits retain their saved order; their date does not establish an exact time.
  recent.sort((a, b) => b.date.localeCompare(a.date) || (a.time === null && b.time === null ? b.order - a.order : a.time === null ? -1 : b.time === null ? 1 : b.time - a.time));
  const recentBoards = [...new Set(recent.map(item => item.id))].map(id => boards.find(board => board.id === id)).filter(Boolean);
  return {
    week, weekActive: week.filter(d => d.active).length, activeDays: dates.size,
    completed: courses.reduce((sum, c) => sum + (c.completed || []).length, 0),
    unlocked: boards.filter(b => b.accessible).length, checked: saved.checkins.includes(today), goal: saved.goal,
    notesCount: saved.notes.length, notes: saved.notes.slice().reverse(),
    recentBoards
  };
}
function chrome() {
  let status = 24, rect;
  try { status = (wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()).statusBarHeight || 24; } catch (_) {}
  try { rect = wx.getMenuButtonBoundingClientRect(); } catch (_) {}
  return { top: rect && rect.top || status + 8, height: (rect && rect.bottom || status + 40) + 22 };
}
module.exports = { read, write, visit, checkin, addNote, summary, chrome, dateKey };

const api = require('./api');
const session = require('./session');
// Frozen initial server/seed.json mapping. NEVER derive legacy indexes from the live catalog order.
const seed = { focus: ['focus-chapter-0', 'focus-chapter-1', 'focus-chapter-2', 'focus-chapter-3', 'focus-chapter-4'], thinking: ['thinking-chapter-0', 'thinking-chapter-1', 'thinking-chapter-2', 'thinking-chapter-3'], energy: ['energy-chapter-0', 'energy-chapter-1', 'energy-chapter-2', 'energy-chapter-3'] };
const suffixes = ['question', 'reading', 'exercise'];
const orders = { understand: [0, 1, 2], practice: [2, 1, 0], reflect: [1, 0, 2] };
function valid(index, count) { return Number.isInteger(index) && index >= 0 && index < count; }
function payload(courseIds) {
  const old = wx.getStorageSync('blueprintLearning') || {};
  const reading = wx.getStorageSync('blueprintReading') || {};
  const sections = new Set(), chapters = new Set();
  for (const courseId of Object.keys(seed)) {
    if (courseIds && !courseIds.includes(courseId)) continue;
    const map = seed[courseId];
    const saved = old[courseId] || {};
    if (Array.isArray(saved.completed)) for (const index of saved.completed) if (valid(index, map.length)) chapters.add(map[index]);
    map.forEach((chapterId, index) => {
      const key = courseId + ':' + index;
      const direct = reading[key];
      if (direct) {
        if (Array.isArray(direct.completed)) for (const section of direct.completed) if (valid(section, 3)) sections.add(chapterId + '-' + suffixes[section]);
      } else {
        for (const mode of Object.keys(orders)) {
          const record = reading[key + ':' + mode];
          if (record && Array.isArray(record.completed)) for (const section of record.completed) if (valid(section, 3)) sections.add(chapterId + '-' + suffixes[orders[mode][section]]);
        }
      }
    });
  }
  return { sections: [...sections], chapters: [...chapters] };
}
async function offer(courses, explicit) {
  const saved = session.current();
  if (!saved) return false;
  const ids = courses.filter(c => c.accessible).map(c => c.id).sort();
  const data = payload(ids);
  if (!data.sections.length && !data.chapters.length) return false;
  // Separate decision per account and per authorized legacy course set.
  const key = session.userKey('legacyDecision:' + ids.join(','));
  const decision = wx.getStorageSync(key);
  if (decision === 'imported' || (decision && !explicit)) return false;
  const result = await new Promise(resolve => wx.showModal({
    title: '导入这台设备的旧学习记录？',
    content: '确认这些旧记录属于当前账号后再导入。只导入已授权课程；历史章节完成不会伪造小节完成，不会获得付费权限。原记录仍会保留。',
    confirmText: '确认属于我', cancelText: '暂不导入', success: resolve, fail: () => resolve({ confirm: false })
  }));
  if (!session.current() || session.current().token !== saved.token) throw new Error('账号已切换');
  if (!result.confirm) { wx.setStorageSync(key, 'declined'); return false; }
  await api.request('/api/me/learning/import', { method: 'POST', data: { importId: 'legacy-seed-v1-' + ids.join('-'), ...data } });
  wx.setStorageSync(key, 'imported');
  return true;
}
module.exports = { seed, payload, offer };

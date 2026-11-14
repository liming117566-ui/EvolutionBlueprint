const learning = require('./learning');
// Remote courses only. The old lesson-content.js remains a legacy source, never a reader fallback.
function sections(course, chapterId) {
  const chapter = course && course.chapters.find(item => item.id === chapterId);
  return chapter ? chapter.sections : [];
}
function progress(course, chapterId) {
  const source = sections(course, chapterId);
  const saved = learning.state();
  const done = new Set(saved.sections.filter(s => s.completed).map(s => s.sectionId));
  const position = saved.positions.find(p => p.courseId === course.id && p.chapterId === chapterId);
  return { active: position && source.some(s => s.id === position.sectionId) ? position.sectionId : null, completed: source.filter(s => done.has(s.id)).map(s => s.id) };
}
module.exports = { sections, progress,
  remember: (courseId, chapterId, sectionId) => learning.record(courseId, chapterId, sectionId, false),
  complete: (courseId, chapterId, sectionId) => learning.record(courseId, chapterId, sectionId, true) };

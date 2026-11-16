const learning = require('../../utils/learning');
const boards = require('../../utils/boards');
const session = require('../../utils/session');
Page({
  data: { board: null, courses: [], exercises: [], progressCourses: [], completedCount: 0, active: 'courses', signedIn: false, loading: true, error: '' },
  onLoad(options) { this._boardId = options.id; },
  onShow() { return this.retry(); },
  onHide() { this._version = (this._version || 0) + 1; this.setData({ courses: [], exercises: [], progressCourses: [] }); },
  onUnload() { this._version = (this._version || 0) + 1; },
  async retry() {
    const version = this._version = (this._version || 0) + 1;
    this.setData({ loading: true, error: '', board: null, courses: [], exercises: [], progressCourses: [] });
    try {
      const result = await learning.browse();
      if (version !== this._version || !result) return;
      const board = boards.decorate(result.boards, result.courses).find(b => b.id === this._boardId);
      if (!board) throw new Error('这个学习板块已调整或下架，请返回查看其他板块。');
      if (!board.accessible) { require('../../utils/board-access').gate(board.id); return; }
      if (board.experience === 'english-starry-sky') { wx.redirectTo({ url: '/pages/english/english?id=' + encodeURIComponent(board.id) }); return; }
      if (board.experience === 'cn-math-taxonomy') { wx.redirectTo({ url: '/pages/math/math?id=' + encodeURIComponent(board.id) }); return; }
      if (board.experience === 'tainai-junior-math') { wx.redirectTo({ url: '/pages/junior-math/junior-math?id=' + encodeURIComponent(board.id) }); return; }
      if (require('../../utils/integrations').find(board.experience) || /^website:/.test(board.experience || '')) { wx.redirectTo({ url: '/pages/module/module?id=' + encodeURIComponent(board.id) }); return; }
      const courses = result.courses.filter(c => board.categoryIds.includes(c.categoryId));
      const exercises = [];
      for (const c of courses.filter(c => c.accessible)) for (const ch of c.chapters || []) for (const s of ch.sections) if (s.practice) exercises.push({ id: s.id, title: s.title, courseId: c.id, courseTitle: c.title, chapterId: ch.id, chapterTitle: ch.title });
      this.setData({ board, courses, exercises, active: board.features.some(f => f.type === this.data.active) ? this.data.active : board.features[0].type, signedIn: !!session.current(), progressCourses: courses.filter(c => c.accessible), completedCount: courses.reduce((n, c) => n + c.completed.length, 0) });
      wx.setNavigationBarTitle({ title: board.title });
    } catch (error) { if (version === this._version) this.setData({ error: error.message }); }
    finally { if (version === this._version) this.setData({ loading: false }); }
  },
  selectFeature(event) { const type = event.currentTarget.dataset.type; if (this.data.board.features.some(f => f.type === type)) this.setData({ active: type }); },
  openCourse(event) { boards.course(event.currentTarget.dataset.id); },
  openExercise(event) {
    const exercise = this.data.exercises.find(e => e.id === event.currentTarget.dataset.id);
    if (exercise) wx.navigateTo({ url: '/pages/lesson/lesson?course=' + encodeURIComponent(exercise.courseId) + '&chapter=' + encodeURIComponent(exercise.chapterId) + '&section=' + encodeURIComponent(exercise.id) });
  },
  showCourses() { this.setData({ active: 'courses' }); },
  login() { wx.navigateTo({ url: '/pages/gate/gate?redeem=1' }); },
  goLearn() { wx.redirectTo({ url: '/pages/learn/learn' }); }
});

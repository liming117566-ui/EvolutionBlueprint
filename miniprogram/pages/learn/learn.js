const learning = require('../../utils/learning');
const catalog = require('../../utils/catalog');
Page({
  data: { courses: [], active: 0, current: null, chapters: [], loading: false, error: '', settings: catalog.settings() },
  onLoad() { learning.authorized(); },
  onShow() { return this.retry(); },
  onHide() { this._version = (this._version || 0) + 1; this.setData({ courses: [], current: null, chapters: [] }); },
  onUnload() { this._version = (this._version || 0) + 1; },
  async retry() {
    if (!learning.authorized()) return;
    const version = this._version = (this._version || 0) + 1;
    this.setData({ loading: true, error: '', courses: [], current: null, chapters: [] });
    try {
      const result = await learning.load();
      if (version !== this._version || !result) return;
      const courses = result.courses;
      const current = courses.find(c => c.id === this._selectedId) || courses[0] || null;
      this.setData({ courses, current, active: Math.max(0, courses.indexOf(current)), chapters: learning.chapters(current), settings: result.settings });
    } catch (error) { if (version === this._version) this.setData({ error: error.message }); }
    finally { if (version === this._version) this.setData({ loading: false }); }
  },
  selectCourse(event) {
    const current = this.data.courses.find(c => c.id === event.currentTarget.dataset.id);
    if (!current) return;
    this._selectedId = current.id;
    this.setData({ active: this.data.courses.indexOf(current), current, chapters: learning.chapters(current) });
  },
  start() {
    const current = this.data.current;
    if (!current) return;
    if (!current.accessible) return this.redeem();
    wx.navigateTo({ url: '/pages/lesson/lesson?course=' + encodeURIComponent(current.id) });
  },
  openChapter(event) {
    const current = this.data.current;
    const chapterId = event.currentTarget.dataset.id;
    if (!current || !current.accessible || !current.chapters.some(c => c.id === chapterId)) return;
    wx.navigateTo({ url: '/pages/lesson/lesson?course=' + encodeURIComponent(current.id) + '&chapter=' + encodeURIComponent(chapterId) });
  },
  redeem() { wx.redirectTo({ url: '/pages/gate/gate?redeem=1' }); }
});

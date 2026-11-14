const learning = require('../../utils/learning');
const catalog = require('../../utils/catalog');
const legacy = require('../../utils/legacy');
Page({
  data: { courses: [], featured: null, recommendations: [], selected: null, selectedChapters: [], weekday: '', settings: catalog.settings(), loading: false, error: '', hasAccess: false },
  onLoad() { learning.authorized(); },
  onShow() { return this.retry(); },
  onHide() { this._version = (this._version || 0) + 1; this.setData({ courses: [], featured: null, recommendations: [], selected: null, selectedChapters: [] }); },
  onUnload() { this._version = (this._version || 0) + 1; },
  async retry() {
    if (!learning.authorized()) return;
    const version = this._version = (this._version || 0) + 1;
    this.setData({ loading: true, error: '', courses: [], featured: null, recommendations: [], selected: null });
    try {
      const result = await learning.load();
      if (version !== this._version || !result) return;
      if (await legacy.offer(result.courses)) {
        await learning.refresh();
        result.courses = result.courses.map(learning.decorate);
      }
      if (version !== this._version) return;
      const courses = result.courses;
      const currentId = learning.currentCourse();
      const featured = courses.find(c => c.id === currentId && c.accessible) || courses.find(c => c.accessible) || courses[0] || null;
      this.setData({ courses, settings: result.settings, hasAccess: result.me.hasAccess, featured, recommendations: courses.filter(c => !featured || c.id !== featured.id), weekday: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][new Date().getDay()] });
    } catch (error) { if (version === this._version) this.setData({ error: error.message }); }
    finally { if (version === this._version) this.setData({ loading: false }); }
  },
  openCourse(event) {
    const selected = this.data.courses.find(course => course.id === event.currentTarget.dataset.id);
    if (selected) this.setData({ selected, selectedChapters: learning.chapters(selected) });
  },
  closeCourse() { this.setData({ selected: null }); },
  startCourse() {
    const course = this.data.selected || this.data.featured;
    if (!course) return;
    if (!course.accessible) return this.redeem();
    this.closeCourse();
    wx.navigateTo({ url: '/pages/lesson/lesson?course=' + encodeURIComponent(course.id) });
  },
  redeem() { wx.redirectTo({ url: '/pages/gate/gate?redeem=1' }); },
  goLearn() { wx.redirectTo({ url: '/pages/learn/learn' }); },
  goProfile() { wx.redirectTo({ url: '/pages/profile/profile' }); }
});

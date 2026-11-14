const learning = require('../../utils/learning');
Page({
  data: { courses: [], current: null, chapters: [], loading: true, error: '' },
  onLoad(options) { this._courseId = options.id; },
  onShow() { return this.retry(); },
  onHide() { this._version = (this._version || 0) + 1; this.setData({ courses: [], current: null, chapters: [] }); },
  onUnload() { this._version = (this._version || 0) + 1; },
  async retry() {
    const version = this._version = (this._version || 0) + 1;
    this.setData({ loading: true, error: '', current: null, chapters: [] });
    try {
      const result = await learning.browse();
      if (version !== this._version || !result) return;
      const current = result.courses.find(c => c.id === this._courseId);
      if (!current) throw new Error('课程已调整或下架，请返回学习板块。');
      this.setData({ courses: result.courses, current, chapters: learning.chapters(current) });
      wx.setNavigationBarTitle({ title: current.title });
    } catch (error) { if (version === this._version) this.setData({ error: error.message }); }
    finally { if (version === this._version) this.setData({ loading: false }); }
  },
  start() { const current = this.data.current; if (!current) return; if (!current.accessible) return this.redeem(); wx.navigateTo({ url: '/pages/lesson/lesson?course=' + encodeURIComponent(current.id) }); },
  openChapter(event) { const c = this.data.current, id = event.currentTarget.dataset.id; if (c && c.accessible && c.chapters.some(ch => ch.id === id)) wx.navigateTo({ url: '/pages/lesson/lesson?course=' + encodeURIComponent(c.id) + '&chapter=' + encodeURIComponent(id) }); },
  redeem() { wx.navigateTo({ url: '/pages/gate/gate?redeem=1' }); }
});

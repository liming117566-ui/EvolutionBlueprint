const learning = require('../../utils/learning');
const catalog = require('../../utils/catalog');
const boards = require('../../utils/boards');
Page({
  data: { courses: [], boards: [], featured: null, continuing: null, settings: catalog.settings(), loading: true, error: '', dateLabel: '' },
  onShow() { return this.retry(); },
  onHide() { this._version = (this._version || 0) + 1; this.setData({ courses: [], continuing: null }); },
  onUnload() { this._version = (this._version || 0) + 1; },
  async retry() {
    const version = this._version = (this._version || 0) + 1;
    this.setData({ loading: true, error: '', boards: [], featured: null });
    try {
      const result = await learning.browse();
      if (version !== this._version || !result) return;
      const items = boards.decorate(result.boards, result.courses, 'home');
      const now = new Date(), day = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][now.getDay()];
      this.setData({ settings: result.settings, courses: result.courses, boards: items, featured: items.find(b => b.featured) || items[0] || null, continuing: result.courses.find(c => c.id === learning.currentCourse() && c.accessible) || null, dateLabel: (now.getMonth() + 1) + ' 月 ' + now.getDate() + ' 日 · ' + day });
    } catch (error) { if (version === this._version) this.setData({ error: error.message }); }
    finally { if (version === this._version) this.setData({ loading: false }); }
  },
  openBoard(event) { const id = event.detail.id || event.currentTarget.dataset.id; const board = this.data.boards.find(b => b.id === id); if (board) boards.open(id, board.experience); },
  openFeatured() { if (this.data.featured) boards.open(this.data.featured.id, this.data.featured.experience); },
  continueCourse() { if (this.data.continuing) boards.course(this.data.continuing.id); },
  goLearn() { wx.redirectTo({ url: '/pages/learn/learn' }); },
  goProfile() { wx.redirectTo({ url: '/pages/profile/profile' }); }
});

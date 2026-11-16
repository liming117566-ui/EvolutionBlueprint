const learning = require('../../utils/learning');
const catalog = require('../../utils/catalog');
const boards = require('../../utils/boards');
const study = require('../../utils/study-space');
Page({
  data: { courses: [], boards: [], recommendations: [], featured: null, continuing: null, settings: catalog.settings(), loading: true, error: '', dateLabel: '', query: '', group: 'all', chrome: study.chrome(), stats: study.summary(), groups: [{ id: 'all', title: '全部' }, { id: 'subject', title: '学科提升' }, { id: 'other', title: '兴趣拓展' }] },
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
      this.setData({ settings: result.settings, courses: result.courses, boards: items, featured: items.find(b => b.featured) || items[0] || null, continuing: result.courses.find(c => c.id === learning.currentCourse() && c.accessible) || null, stats: study.summary(result.courses, items), dateLabel: (now.getMonth() + 1) + ' 月 ' + now.getDate() + ' 日 · ' + day }); this.filter();
    } catch (error) { if (version === this._version) this.setData({ error: error.message }); }
    finally { if (version === this._version) this.setData({ loading: false }); }
  },
  openBoard(event) { const id = event.detail.id || event.currentTarget.dataset.id; const board = this.data.boards.find(b => b.id === id); if (board) boards.open(id, board.experience); },
  openFeatured() { if (this.data.featured) boards.open(this.data.featured.id, this.data.featured.experience); },
  filter() { this.setData({ recommendations: this.data.boards.filter(b => this.data.group === 'all' || (this.data.group === 'other' ? b.group !== 'subject' : b.group === this.data.group)).slice(0, 4) }); },
  selectGroup(event) { this.setData({ group: event.currentTarget.dataset.id }); this.filter(); },
  search(event) { this.setData({ query: event.detail.value }); },
  searchCourses() { wx.navigateTo({ url: '/pages/interactive/interactive?q=' + encodeURIComponent(this.data.query.trim()) }); },
  goInteractive() { wx.navigateTo({ url: '/pages/interactive/interactive' }); },
  goResources() { wx.navigateTo({ url: '/pages/resources/resources' }); },
  goPractice() { wx.navigateTo({ url: '/pages/interactive/interactive?mode=practice' }); },
  goPlan() { wx.navigateTo({ url: '/pages/notebook/notebook?mode=plan' }); },
  checkin() {
    if (!learning.authorized()) return;
    study.checkin(); this.setData({ stats: study.summary(this.data.courses, this.data.boards) }); wx.showToast({ title: '今日打卡成功', icon: 'success' });
  },
  continueCourse() { if (this.data.continuing) boards.course(this.data.continuing.id); },
  goLearn() { wx.redirectTo({ url: '/pages/learn/learn' }); },
  goProfile() { wx.redirectTo({ url: '/pages/profile/profile' }); }
});

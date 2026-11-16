const learning = require('../../utils/learning');
const catalog = require('../../utils/catalog');
const boards = require('../../utils/boards');
const study = require('../../utils/study-space');
Page({
  data: { courses: [], boards: [], filtered: [], groups: boards.GROUPS, group: 'all', query: '', loading: true, error: '', settings: catalog.settings(), chrome: study.chrome(), stats: study.summary() },
  onShow() { return this.retry(); },
  onHide() { this._version = (this._version || 0) + 1; this.setData({ courses: [] }); },
  onUnload() { this._version = (this._version || 0) + 1; },
  async retry() {
    const version = this._version = (this._version || 0) + 1;
    this.setData({ loading: true, error: '', boards: [], filtered: [] });
    try {
      const result = await learning.browse();
      if (version !== this._version || !result) return;
      this.setData({ courses: result.courses, boards: boards.decorate(result.boards, result.courses, 'learn'), settings: result.settings, stats: study.summary(result.courses, result.boards) }); this.filter();
    } catch (error) { if (version === this._version) this.setData({ error: error.message }); }
    finally { if (version === this._version) this.setData({ loading: false }); }
  },
  filter() { const q = this.data.query.trim().toLowerCase(); this.setData({ filtered: this.data.boards.filter(b => (this.data.group === 'all' || b.group === this.data.group) && (!q || (b.title + ' ' + b.subtitle + ' ' + b.description).toLowerCase().includes(q))) }); },
  selectGroup(event) { this.setData({ group: event.currentTarget.dataset.id }); this.filter(); },
  search(event) { this.setData({ query: event.detail.value }); this.filter(); },
  clearQuery() { this.setData({ query: '' }); this.filter(); },
  clearSearch() { this.setData({ query: '', group: 'all' }); this.filter(); },
  openBoard(event) { const board = this.data.filtered.find(b => b.id === event.detail.id); if (board) boards.open(board.id, board.experience); },
  goInteractive() { wx.navigateTo({ url: '/pages/interactive/interactive' }); },
  goResources() { wx.navigateTo({ url: '/pages/resources/resources' }); },
  goRecords() { wx.navigateTo({ url: '/pages/interactive/interactive?mode=records' }); },
  goPractice() { wx.navigateTo({ url: '/pages/interactive/interactive?mode=practice' }); },
  goNotes() { wx.navigateTo({ url: '/pages/notebook/notebook' }); },
  goPlan() { wx.navigateTo({ url: '/pages/notebook/notebook?mode=plan' }); }
});

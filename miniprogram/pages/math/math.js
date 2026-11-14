const api = require('../../utils/api');
const catalog = require('../../utils/catalog');
const config = require('../../utils/config');
Page({
  data: { src: '', loading: true, error: '', loaded: false },
  onLoad(options) { this._boardId = options.id || 'math-taxonomy'; return this.retry(); },
  onUnload() { this._version = (this._version || 0) + 1; },
  async retry() {
    const version = this._version = (this._version || 0) + 1;
    this.setData({ src: '', loading: true, error: '', loaded: false });
    try {
      const [boot, status] = await Promise.all([catalog.bootstrap(), api.request('/api/integrations/math', { auth: false })]);
      if (version !== this._version) return;
      const board = (boot.boards || []).find(b => b.id === this._boardId && b.enabled && b.experience === 'cn-math-taxonomy');
      if (!board) throw new Error('这个学习空间已调整，请返回选择其他板块。');
      if (!status.ready) throw new Error('数学学习空间暂时不可用，请稍后重试。');
      wx.setNavigationBarTitle({ title: board.title });
      this.setData({ src: config.getApiBaseUrl() + '/math/?embedded=1' });
    } catch (error) { if (version === this._version) this.setData({ error: error.message }); }
    finally { if (version === this._version) this.setData({ loading: false }); }
  },
  onWebLoad() { this.setData({ loaded: true, error: '' }); },
  onWebError(event) { console.error('Mathematics web-view failed', event.detail); this.setData({ src: '', loaded: false, error: '数学学习页面未能加载，请稍后重试或返回其他学习板块。' }); },
  goLearn() { wx.redirectTo({ url: '/pages/learn/learn' }); }
});

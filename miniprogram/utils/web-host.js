const catalog = require('./catalog');
const config = require('./config');
const access = require('./board-access');
module.exports = function host(defaultId, accepts) {
  return {
    data: { src: '', title: '学习板块', loading: true, error: '', loaded: false },
    onLoad(options) { this._boardId = options.id || defaultId; return this.retry(); },
    onHide() { this._wasHidden = true; },
    onShow() {
      if (this._wasHidden) { this._wasHidden = false; this._autoRetried = false; return this.retry(); }
    },
    onUnload() { this._version = (this._version || 0) + 1; },
    async retry() {
      const version = this._version = (this._version || 0) + 1;
      this.setData({ src: '', loading: true, error: '', loaded: false });
      try {
        const boot = await catalog.bootstrap();
        if (version !== this._version) return;
        const board = (boot.boards || []).find(b => b.id === this._boardId && b.enabled && accepts(b.experience));
        if (!board) throw new Error('这个学习空间已调整，请返回选择其他板块。');
        this.setData({ title: board.title }); wx.setNavigationBarTitle({ title: board.title });
        const result = await access.open(board.id, () => version === this._version);
        if (version !== this._version || !result) return;
        if (typeof result.launchPath !== 'string' || !/^\/web-access\/[A-Za-z0-9_-]{20,100}$/.test(result.launchPath)) throw new Error('学习入口返回的数据有误');
        require('./study-space').visit(board);
        this.setData({ src: config.getApiBaseUrl() + result.launchPath });
      } catch (error) { if (version === this._version) this.setData({ error: error.message }); }
      finally { if (version === this._version) this.setData({ loading: false }); }
    },
    onWebLoad() { this.setData({ loaded: true, error: '' }); },
    onWebError(event) {
      console.error('Learning web-view failed', event && event.detail);
      if (!this._autoRetried) { this._autoRetried = true; return this.retry(); }
      this.setData({ src: '', loaded: false, error: '学习页面未能加载，请重新进入或检查兑换权限。' });
    },
    goLearn() { wx.redirectTo({ url: '/pages/learn/learn' }); }
  };
};

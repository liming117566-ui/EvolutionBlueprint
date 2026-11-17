const api = require('../../utils/api');
const config = require('../../utils/config');
Page({
  data: { loading: true, src: '', title: '', error: '' },
  onLoad(options) { this._id = options.id; this._alive = true; this.load(); },
  onHide() { if (wx.createVideoContext) wx.createVideoContext('course-player', this).pause(); },
  onUnload() { this._alive = false; this._version = (this._version || 0) + 1; },
  async load() {
    const version = this._version = (this._version || 0) + 1; this.setData({ loading: true, error: '', src: '' });
    try {
      if (!/^[A-Za-z0-9_-]{1,100}$/.test(this._id)) throw new Error('视频编号无效');
      const result = await api.request('/api/videos/' + this._id + '/play', { method: 'POST', data: {} });
      if (!this._alive || version !== this._version) return;
      if (!/^\/video-playback\/[A-Za-z0-9_-]{40,60}$/.test(result.playbackPath)) throw new Error('播放地址无效');
      const origin = config.getApiBaseUrl(); if (!config.validOrigin(origin)) throw new Error('视频服务地址未配置');
      this.setData({ src: origin + result.playbackPath, title: result.title });
      wx.setNavigationBarTitle({ title: result.title });
    } catch (error) { if (this._alive && version === this._version) this.setData({ error: error.message || '视频暂时无法播放' }); }
    finally { if (this._alive && version === this._version) this.setData({ loading: false }); }
  },
  onError() { this.setData({ error: '播放失败或入口已过期，请重新加载。若仍无法播放，请联系管理员转换为 MP4（H.264 / AAC）。' }); }
});

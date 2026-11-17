const api = require('../../utils/api');
Component({
  properties: { scope: { type: String, value: 'course' }, ownerId: { type: String, value: '' } },
  data: { loading: true, videos: [], error: '' },
  observers: { 'scope, ownerId': function () { if (this._alive) this.load(); } },
  lifetimes: { attached() { this._alive = true; this.load(); }, detached() { this._alive = false; this._version = (this._version || 0) + 1; if (this._request?.abort) this._request.abort(); } },
  methods: {
    async load() {
      const version = this._version = (this._version || 0) + 1;
      if (this._request?.abort) this._request.abort();
      this.setData({ loading: true, error: '', videos: [] });
      if (!['course', 'chapter', 'section'].includes(this.properties.scope) || !/^[A-Za-z0-9_-]{1,100}$/.test(this.properties.ownerId)) { this.setData({ loading: false }); return; }
      try {
        this._request = api.request('/api/videos?scope=' + this.properties.scope + '&ownerId=' + encodeURIComponent(this.properties.ownerId));
        const result = await this._request;
        if (!this._alive || version !== this._version) return;
        if (!Array.isArray(result.videos) || !result.videos.every(v => /^[A-Za-z0-9_-]{1,100}$/.test(v.id) && typeof v.title === 'string' && ['mp4', 'webm'].includes(v.fileType))) throw new Error('视频目录返回的数据有误');
        this.setData({ videos: result.videos });
      } catch (error) { if (this._alive && version === this._version) this.setData({ error: error.message || '视频暂时无法加载' }); }
      finally { if (this._alive && version === this._version) this.setData({ loading: false }); }
    },
    open(event) { const video = this.data.videos.find(v => v.id === event.currentTarget.dataset.id); if (video) wx.navigateTo({ url: '/pages/video/video?id=' + encodeURIComponent(video.id) }); }
  }
});

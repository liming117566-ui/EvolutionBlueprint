const learning = require('../../utils/learning');
const session = require('../../utils/session');
const catalog = require('../../utils/catalog');
const legacy = require('../../utils/legacy');
Page({
  data: { courses: [], info: null, settings: catalog.settings(), user: null, testSession: false, hasAccess: false, loading: false, error: '' },
  onLoad() { learning.authorized(); },
  onShow() { return this.retry(); },
  onHide() { this._version = (this._version || 0) + 1; this.setData({ courses: [], info: null }); },
  onUnload() { this._version = (this._version || 0) + 1; },
  async retry() {
    if (!learning.authorized()) return;
    const version = this._version = (this._version || 0) + 1;
    this.setData({ loading: true, error: '', courses: [] });
    try {
      const result = await learning.load();
      if (version !== this._version || !result) return;
      this.setData({ courses: result.courses, settings: result.settings, user: result.me.user, hasAccess: result.me.hasAccess, testSession: session.current().test });
    } catch (error) { if (version === this._version) this.setData({ error: error.message }); }
    finally { if (version === this._version) this.setData({ loading: false }); }
  },
  openCourse(event) {
    const course = this.data.courses.find(c => c.id === event.currentTarget.dataset.id);
    if (!course) return;
    if (!course.accessible) return this.redeem();
    wx.navigateTo({ url: '/pages/lesson/lesson?course=' + encodeURIComponent(course.id) });
  },
  showInfo(event) {
    const type = event.currentTarget.dataset.type;
    const map = { redeem: ['兑换说明', 'redeemHelp'], help: ['使用帮助', 'help'], about: ['关于' + this.data.settings.brandName, 'about'] };
    if (map[type]) this.setData({ info: { title: map[type][0], paragraphs: this.data.settings[map[type][1]] } });
  },
  closeInfo() { this.setData({ info: null }); },
  async importLegacy() {
    try { if (await legacy.offer(this.data.courses, true)) await this.retry(); }
    catch (error) { this.setData({ error: error.message }); }
  },
  async logout() {
    try { await session.logout(); } catch (_) {}
    this.setData({ courses: [], user: null });
    wx.redirectTo({ url: '/pages/gate/gate' });
  },
  redeem() { wx.redirectTo({ url: '/pages/gate/gate?redeem=1' }); },
  goLearn() { wx.redirectTo({ url: '/pages/learn/learn' }); }
});

const api = require('../../utils/api');
const session = require('../../utils/session');
const catalog = require('../../utils/catalog');
const config = require('../../utils/config');
Page({
  data: { code: '', error: '', loading: false, showHelp: false, statusBarHeight: 24, settings: catalog.settings(), signedIn: false, testSession: false, canDevLogin: false, hasAccess: false },
  async onLoad(options) {
    this._redeeming = options && options.redeem === '1';
    const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    this.setData({ statusBarHeight: info.statusBarHeight || 24, canDevLogin: config.canDevLogin() });
    await this.retry();
  },
  async retry() {
    this.setData({ error: '' });
    try {
      const boot = await catalog.bootstrap();
      this.setData({ settings: boot.settings });
      if (session.current()) {
        const me = await session.me();
        this.setData({ signedIn: true, testSession: session.current().test, hasAccess: me.hasAccess });
        if (me.hasAccess && !this._redeeming) wx.redirectTo({ url: '/pages/home/home' });
      }
    } catch (error) { this.setData({ error: error.message, signedIn: Boolean(session.current()) }); }
  },
  onInput(event) { this.setData({ code: event.detail.value.toUpperCase(), error: '' }); },
  help() { this.setData({ showHelp: true }); },
  closeHelp() { this.setData({ showHelp: false }); },
  browse() { wx.redirectTo({ url: '/pages/home/home' }); },
  async authenticate(test) {
    if (this.data.loading) return;
    this.setData({ loading: true, error: '' });
    try {
      await (test ? session.devLogin() : session.login());
      const me = await session.me();
      this.setData({ signedIn: true, testSession: session.current().test, hasAccess: me.hasAccess });
      if (me.hasAccess && !this._redeeming) wx.redirectTo({ url: '/pages/home/home' });
    } catch (error) { this.setData({ error: error.message }); }
    finally { this.setData({ loading: false }); }
  },
  login() { return this.authenticate(false); },
  devLogin() { return this.authenticate(true); },
  async redeem() {
    if (this.data.loading) return;
    const code = this.data.code.trim().toUpperCase();
    if (!code) return this.setData({ error: '请输入课程提供方发给你的兑换码。' });
    this.setData({ loading: true, error: '' });
    try {
      if (!session.current()) await session.login();
      this.setData({ signedIn: true, testSession: session.current().test });
      const result = await api.request('/api/redeem', { method: 'POST', data: { code } });
      if (!result.ok) throw new Error('兑换未完成，请重试');
      const me = await session.me();
      if (!me.hasAccess) throw new Error('兑换已处理，但当前暂无可用课程权限，请联系课程提供方');
      wx.redirectTo({ url: '/pages/home/home' });
    } catch (error) { this.setData({ error: error.message }); }
    finally { this.setData({ loading: false }); }
  },
  async logout() {
    try { await session.logout(); } catch (_) {}
    this.setData({ signedIn: false, testSession: false, hasAccess: false, error: '', code: '' });
  }
});

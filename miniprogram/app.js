App({
  globalData: { settings: null },
  onLaunch() {
    require('./utils/development-debug')(wx);
    // Remove obsolete local authorization artifacts; server sessions are the only access credential.
    try {
      if (typeof wx.removeStorageSync === 'function') { wx.removeStorageSync('blueprintUnlocked'); wx.removeStorageSync('blueprintToken'); }
    } catch (_) {}
  }
});

function open({ enabled, dealerId }) {
  if (!enabled || !dealerId) {
    wx.showToast({ title: '在线打印暂未开通', icon: 'none' });
    return;
  }

  wx.navigateToMiniProgram({
    appId: 'wx39aad317949b7fda',
    path: 'pages/index/index?sid=' + encodeURIComponent(dealerId),
    envVersion: 'release',
    fail(error) {
      if (/cancel/i.test(error.errMsg || '')) return;
      wx.showToast({ title: '暂时无法打开打印服务', icon: 'none' });
    }
  });
}

module.exports = { open };

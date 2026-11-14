const config = require('./config');
const KEY = 'blueprintSessionV2';
function current() {
  const saved = wx.getStorageSync(KEY);
  const origin = config.getApiBaseUrl();
  return saved && saved.origin === origin && config.validOrigin(origin) && typeof saved.token === 'string' && saved.token && saved.user && typeof saved.user.id === 'string' ? saved : null;
}
function clear() { wx.setStorageSync(KEY, null); }
function store(result, test) {
  if (!result || typeof result.token !== 'string' || !result.token || !result.user || typeof result.user.id !== 'string') throw new Error('登录服务返回的数据有误');
  wx.setStorageSync(KEY, { origin: config.getApiBaseUrl(), token: result.token, user: result.user, test: Boolean(test) });
  return current();
}
function headers(url) {
  const saved = current();
  const origin = config.getApiBaseUrl();
  if (!saved) throw new Error('请先登录后再访问课程');
  if (typeof url !== 'string' || !url.startsWith(origin + '/api/') || /[\\\s\x00-\x1f]/.test(url)) throw new Error('拒绝向其他服务发送登录凭据');
  return { Authorization: 'Bearer ' + saved.token };
}
async function login() {
  // code 必须来自本次 wx.login；无 AppSecret 的 503 原样反馈，绝不降级测试身份。
  const code = await new Promise((resolve, reject) => wx.login({
    timeout: 15000,
    success: result => result.code ? resolve(result.code) : reject(new Error('微信未返回登录凭据，请重试')),
    fail: () => reject(new Error('微信登录失败，请重试'))
  }));
  const result = await require('./api').request('/api/auth/wechat', { method: 'POST', data: { code }, auth: false });
  return store(result, false);
}
async function devLogin() {
  if (!config.canDevLogin()) throw new Error('本地测试登录仅允许开发工具连接回环 API');
  let deviceId = wx.getStorageSync('blueprintDevDeviceId');
  if (typeof deviceId !== 'string' || !/^[A-Za-z0-9_-]{8,100}$/.test(deviceId)) {
    deviceId = 'devtools-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
    wx.setStorageSync('blueprintDevDeviceId', deviceId);
  }
  const result = await require('./api').request('/api/auth/dev', { method: 'POST', data: { deviceId }, auth: false });
  return store(result, true);
}
async function me() { return require('./api').request('/api/me'); }
async function logout() {
  try { if (current()) await require('./api').request('/api/auth/logout', { method: 'POST' }); }
  finally { clear(); }
}
function userKey(name) {
  const saved = current();
  if (!saved) throw new Error('请先登录');
  return 'blueprintV2:' + encodeURIComponent(saved.origin) + ':' + encodeURIComponent(saved.user.id) + ':' + name;
}
module.exports = { current, clear, headers, login, devLogin, me, logout, userKey };

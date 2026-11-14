const config = require('./config');
const session = require('./session');
function request(path, options) {
  options = options || {};
  let task;
  const promise = new Promise((resolve, reject) => {
    const origin = config.getApiBaseUrl();
    if (!config.validOrigin(origin)) return reject(new Error('当前版本尚未配置有效的课程服务，正式版需配置 HTTPS 域名。'));
    if (typeof path !== 'string' || !/^\/api\/[A-Za-z0-9_/?=&%.-]+$/.test(path) || path.includes('..')) return reject(new Error('接口地址不安全'));
    const saved = session.current();
    let header = { 'content-type': 'application/json' };
    try { if (options.auth !== false) header = { ...header, ...session.headers(origin + path) }; }
    catch (error) { reject(error); return; }
    try {
      task = wx.request({
        url: origin + path, method: options.method || 'GET', data: options.data,
        header, timeout: 15000,
        success(response) {
          if (options.auth !== false && (!session.current() || session.current().token !== saved.token)) return reject(new Error('账号已切换，请重新加载'));
          if (response.statusCode >= 200 && response.statusCode < 300) return resolve(response.data || {});
          if (response.statusCode === 401 && saved && session.current() && session.current().token === saved.token) session.clear();
          const result = response.data || {};
          const error = new Error(result.error || (response.statusCode === 401 ? '登录已失效，请重新登录' : response.statusCode === 403 ? '当前账号暂无此课程权限，请兑换或联系课程提供方' : '服务暂时不可用，请稍后重试'));
          error.status = response.statusCode; error.code = result.code;
          reject(error);
        },
        fail(failure) {
          const detail = failure.errMsg || '';
          const error = new Error(/domain list|url not in|不在.*合法域名/i.test(detail)
            ? '微信拦截了调试接口，请检查 request 合法域名；开发版可在微信菜单开启调试。'
            : origin.startsWith('http://') ? '无法连接课程服务，请确认后端已启动；真机与电脑需在同一局域网。' : '无法连接课程服务，请检查网络后重试。');
          error.network = true; reject(error);
        }
      });
    } catch (_) { const error = new Error('无法连接课程服务，请稍后重试'); error.network = true; reject(error); }
  });
  promise.abort = () => { if (task && task.abort) task.abort(); };
  return promise;
}
module.exports = { request };

// 开发工具使用回环新版 API；真机调试必须与电脑同一局域网。
const developmentApiBaseUrl = 'http://10.12.195.50:3002';
const devtoolsApiBaseUrl = 'http://127.0.0.1:3002';
// 体验版/正式版需填写部署且已配置合法域名的 HTTPS origin（不能带路径）。
const productionApiBaseUrl = '';
function environment(api) {
  try { return api.getAccountInfoSync().miniProgram.envVersion; } catch (_) { return ''; }
}
function isDevtools(api) {
  try { return (api.getDeviceInfo ? api.getDeviceInfo() : api.getSystemInfoSync()).platform === 'devtools'; } catch (_) { return false; }
}
function getApiBaseUrl(api) {
  api = api || wx;
  return environment(api) === 'develop' ? (isDevtools(api) ? devtoolsApiBaseUrl : developmentApiBaseUrl) : productionApiBaseUrl;
}
function validOrigin(origin, api) {
  if (typeof origin !== 'string') return false;
  const match = /^(https?):\/\/([a-zA-Z0-9.-]+)(?::([0-9]{1,5}))?$/.exec(origin);
  if (!match || (match[3] && (+match[3] < 1 || +match[3] > 65535))) return false;
  if (!match[2].split('.').every(part => /^[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?$/.test(part))) return false;
  if (match[1] === 'https') return true;
  if (environment(api || wx) !== 'develop') return false;
  const host = match[2];
  if (host === 'localhost') return true;
  const parts = host.split('.');
  if (parts.length !== 4 || !parts.every(n => /^(0|[1-9][0-9]{0,2})$/.test(n) && +n <= 255)) return false;
  const p = parts.map(Number);
  return p[0] === 127 || p[0] === 10 || (p[0] === 192 && p[1] === 168) || (p[0] === 172 && p[1] >= 16 && p[1] <= 31);
}
function canDevLogin(api) {
  api = api || wx;
  return environment(api) === 'develop' && isDevtools(api) && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(getApiBaseUrl(api));
}
module.exports = { getApiBaseUrl, validOrigin, canDevLogin, environment, isDevtools, developmentApiBaseUrl, devtoolsApiBaseUrl, productionApiBaseUrl };

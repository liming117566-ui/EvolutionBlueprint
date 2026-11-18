const path = require('node:path');
function loadConfig(overrides = {}) {
  const production = process.env.NODE_ENV === 'production';
  const port = Number(process.env.PORT || 3002);
  const dataDir = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
  const config = { production, port, host: process.env.HOST || '127.0.0.1', dataDir,
    publicOrigin: process.env.PUBLIC_ORIGIN || `http://127.0.0.1:${port}`,
    appId: process.env.WX_APPID || 'wx08fe2b1891297fce', appSecret: process.env.WX_APPSECRET || '',
    devAuth: process.env.DEV_AUTH === '1', lanTestAuth: process.env.LAN_TEST_AUTH === '1', sessionDays: 30, uploadQuota: 1024 * 1024 * 1024,
    ...overrides };
  config.dataDir = path.resolve(config.dataDir);
  if (config.production && (!config.publicOrigin.startsWith('https://') || !config.appSecret || config.devAuth || config.lanTestAuth)) throw new Error('生产环境必须配置 HTTPS PUBLIC_ORIGIN、WX_APPSECRET，并关闭 DEV_AUTH 和 LAN_TEST_AUTH');
  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) throw new Error('PORT 无效');
  if (new URL(config.publicOrigin).origin !== config.publicOrigin) throw new Error('PUBLIC_ORIGIN 必须是无路径的服务来源');
  if (!config.production && process.env.PREVIEW_WEB_ORIGIN) {
    const previewWebOrigins = process.env.PREVIEW_WEB_ORIGIN.split(',').map(origin => origin.trim());
    for (const origin of previewWebOrigins) {
      const parsed = URL.parse(origin);
      const localHost = parsed && /^(?:127\.0\.0\.1|10\.\d+\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+|192\.168\.\d+\.\d+)$/.test(parsed.hostname);
      if (!localHost || parsed.protocol !== 'http:' || !parsed.port || parsed.origin !== origin) {
        throw new Error('PREVIEW_WEB_ORIGIN 必须是带端口且无路径的 HTTP 回环或私有 IPv4 地址');
      }
    }
    config.webOrigins = [...(config.webOrigins || []), ...previewWebOrigins];
  }
  return config;
}
module.exports = { loadConfig };

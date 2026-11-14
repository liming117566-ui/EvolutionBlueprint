const fs = require('node:fs');
const path = require('node:path');
if (require.main === module) {
  const envPath = path.resolve(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) process.loadEnvFile(envPath);
}
const { createApp } = require('./app');
if (require.main === module) {
  const app = createApp();
  const { host, port, devAuth, appSecret } = app.locals.config;
  const server = app.listen(port, host, () => {
    console.log(`课程管理服务：http://${host}:${port}/admin/`);
    if (!appSecret) console.log('微信正式登录尚未配置；不会伪造正式登录。');
    if (devAuth) console.log('本地测试身份已显式开启，仅回环地址可用。');
  });
  server.requestTimeout = 60000;
  function shutdown() { server.close(() => { app.locals.close(); process.exit(0); }); }
  process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
}
module.exports = { createApp };

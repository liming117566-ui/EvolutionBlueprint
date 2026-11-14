const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const source = path.join(root, 'integrations/english-starry-sky');
const output = path.join(root, 'server/english-web');
// Vite empties only this checked build directory; never pass an arbitrary output path.
if (path.resolve(output) !== path.join(root, 'server', 'english-web') || !output.startsWith(root + path.sep)) throw new Error('Unexpected English build directory');
for (const tool of ['typescript/bin/tsc', 'vite/bin/vite.js']) {
  const entry = path.join(source, 'node_modules', tool);
  if (!fs.existsSync(entry)) throw new Error('请先安装英语模块依赖：npm --prefix integrations/english-starry-sky ci');
  const args = tool.startsWith('typescript') ? ['-b'] : ['build', '--base', '/english/', '--outDir', output, '--emptyOutDir'];
  const result = spawnSync(process.execPath, [entry, ...args], { cwd: source, stdio: 'inherit', env: { ...process.env, VITE_CLOUD_ENV: '' } });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
const notices = path.join(output, 'licenses');
fs.mkdirSync(notices, { recursive: true });
for (const file of ['LICENSE', 'CONTENT_LICENSE.md', 'NOTICE.md']) fs.copyFileSync(path.join(source, file), path.join(notices, file));
for (const font of ['@fontsource/andika', '@fontsource-variable/fraunces']) {
  const license = path.join(source, 'node_modules', font, 'LICENSE');
  if (fs.existsSync(license)) fs.copyFileSync(license, path.join(notices, font.split('/').pop() + '-LICENSE'));
}
console.log('英语学习模块已构建到 server/english-web，访问 /english/。');

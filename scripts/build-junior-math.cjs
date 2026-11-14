const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const source = path.join(root, 'integrations/tainai-junior-math');
const output = path.join(root, 'server/junior-math-web');
if (path.resolve(output) !== path.join(root, 'server', 'junior-math-web') || !output.startsWith(root + path.sep)) throw new Error('Unexpected junior mathematics output path');
for (const tool of ['typescript/bin/tsc', 'vite/bin/vite.js']) {
  const entry = path.join(source, 'node_modules', tool);
  if (!fs.existsSync(entry)) throw new Error('请先安装初中数学模块依赖');
  const args = tool.startsWith('typescript') ? ['-p', 'tsconfig.blueprint.json'] : ['build', '--config', 'vite.blueprint.config.ts', '--outDir', output, '--emptyOutDir'];
  const result = spawnSync(process.execPath, [entry, ...args], { cwd: source, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
fs.copyFileSync(path.join(source, 'NOTICE.md'), path.join(output, 'NOTICE.md'));
console.log('初中数学已构建到 server/junior-math-web，访问 /junior-math/。');

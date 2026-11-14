const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = path.join(root, 'integrations/cn-math-taxonomy');
const output = path.join(root, 'server/math-web');
// This project is a static site. Copy its runtime assets; no dependency install is required.
const directories = ['assets', 'data', 'diagnose', 'explore', 'children'];
const files = ['index.html', 'sw.js', 'manifest.webmanifest', 'LICENSE', 'NOTICE.md'];
if (path.resolve(output) !== path.join(root, 'server', 'math-web') || !output.startsWith(root + path.sep)) throw new Error('Unexpected mathematics build directory');
for (const file of files) if (!fs.existsSync(path.join(source, file))) throw new Error('Missing mathematics source: ' + file);
if (fs.existsSync(output) && fs.lstatSync(output).isSymbolicLink()) throw new Error('Mathematics build directory must not be a link');
fs.mkdirSync(output, { recursive: true });
for (const directory of directories) fs.cpSync(path.join(source, directory), path.join(output, directory), { recursive: true });
for (const file of files) fs.copyFileSync(path.join(source, file), path.join(output, file));
console.log('数学知识图谱已构建到 server/math-web，访问 /math/。');

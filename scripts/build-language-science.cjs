'use strict';
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { execFileSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '..');
const OUTPUT = path.join(ROOT, 'server/modules-web');
function target(slug) { const dir = path.join(OUTPUT, slug); fs.mkdirSync(dir, { recursive: true }); return dir; }
function copy(source, dest) { fs.cpSync(source, dest, { recursive: true }); }
function words() {
  const source = path.join(ROOT, 'integrations/english-chinese-words');
  const dest = target('english-chinese-words');
  for (const name of ['index.html', 'app.js', 'style.css', 'LICENSE']) copy(path.join(source, name), path.join(dest, name));
  fs.mkdirSync(path.join(dest, 'data'), { recursive: true });
  const manifest = JSON.parse(fs.readFileSync(path.join(source, 'data/manifest.json'), 'utf8'));
  copy(path.join(source, 'data/manifest.json'), path.join(dest, 'data/manifest.json'));
  for (const book of manifest) {
    const json = zlib.gunzipSync(fs.readFileSync(path.join(source, 'data', book.id + '.json.gz')));
    const parsed = JSON.parse(json); if (parsed.words.length !== book.count) throw Error('Vocabulary count mismatch: ' + book.id);
    fs.writeFileSync(path.join(dest, 'data', book.id + '.json'), json);
  }
  console.log('英语单词:', manifest.length, 'books,', manifest.reduce((n, b) => n + b.count, 0), 'entries');
}
function science() {
  const source = path.join(ROOT, 'integrations/youwei-junior-science/site');
  const dest = target('youwei-junior-science'); copy(source, dest);
  const entry = path.join(dest, 'index.html');
  let html = fs.readFileSync(entry, 'utf8');
  html = html.replace('<title>科学 · 看见世界的联系</title>', '<title>浙教版初中科学学习</title>')
    .replace('<span>科学<small>看见世界的联系</small></span>', '<span>浙教版初中科学学习<small>学习 · 练习 · 复习</small></span>')
    .replace('</head>', '<link rel="stylesheet" href="blueprint.css"></head>');
  fs.writeFileSync(entry, html); console.log('浙教版初中科学学习: full static course and print resources');
}
function grammar() {
  const source = path.join(ROOT, 'integrations/english-grammar-lab');
  execFileSync(process.execPath, ['build.js'], { cwd: source, stdio: 'inherit' });
  const dest = target('english-grammar-lab');
  let html = fs.readFileSync(path.join(source, 'English-Grammar-Lab.html'), 'utf8');
  html = html.replace('</head>', '<style>' + fs.readFileSync(path.join(source, 'src/blueprint.css'), 'utf8') + '</style></head>');
  fs.writeFileSync(path.join(dest, 'index.html'), html); copy(path.join(source, 'LICENSE'), path.join(dest, 'LICENSE'));
  console.log('上海初高语法填空: local practice, review, notes and backup; copyright preserved');
}
words(); science(); grammar();

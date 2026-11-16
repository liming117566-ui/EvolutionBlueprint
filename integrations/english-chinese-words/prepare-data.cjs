// One-time import of the upstream JSONL books. Runtime builds use data/*.json.gz.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const dir = path.join(__dirname, 'data');
fs.mkdirSync(dir, { recursive: true });
const manifest = [];
function walk(root) {
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const file = path.join(root, entry.name);
    if (entry.isDirectory()) { walk(file); continue; }
    if (!entry.name.endsWith('.json')) continue;
    const rows = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(s => s.trim()).map(JSON.parse);
    const words = rows.map(row => {
      const c = row.content?.word?.content || {};
      return { word: row.headWord, uk: c.ukphone || '', us: c.usphone || '',
        trans: (c.trans || []).map(t => ({ pos: t.pos || '', text: t.tranCn || '' })),
        sentences: (c.sentence?.sentences || []).map(s => ({ en: s.sContent, cn: s.sCn })),
        phrases: (c.phrase?.phrases || []).map(s => ({ en: s.pContent, cn: s.pCn })),
        memory: c.remMethod?.val || '' };
    });
    const id = `book-${String(manifest.length + 1).padStart(3, '0')}`;
    const book = { id, title: path.basename(file, '.json'), group: path.basename(path.dirname(file)), words };
    fs.writeFileSync(path.join(dir, id + '.json.gz'), zlib.gzipSync(JSON.stringify(book), { level: 9 }));
    manifest.push({ id, title: book.title, group: book.group, count: words.length });
  }
}
walk(path.join(__dirname, 'books'));
fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`Imported ${manifest.length} books, ${manifest.reduce((n, b) => n + b.count, 0)} vocabulary entries`);

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const root = path.resolve(__dirname, '..');
const target = path.join(root, 'server/modules-web');
const slugs = ['MathKnowledgeAI', 'MathGraph', 'summer-camp-grade7', 'primary-english-knowledge-graph', 'zx-study'];
const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const write = (dir, file, value) => fs.writeFileSync(path.join(dir, file), typeof value === 'string' ? value : JSON.stringify(value));
for (const slug of slugs) {
  const src = path.join(root, 'integrations', slug), out = path.join(target, slug);
  fs.mkdirSync(out, { recursive: true });
  if (slug === 'summer-camp-grade7') {
    for (const name of ['index.html', 'css', 'js', 'audio']) fs.cpSync(path.join(src, name), path.join(out, name), { recursive: true });
  } else if (slug === 'primary-english-knowledge-graph') {
    for (const name of ['index.html', 'data.js', 'cytoscape.min.js']) fs.copyFileSync(path.join(src, 'app', name), path.join(out, name));
  } else {
    fs.cpSync(path.join(src, 'blueprint-web'), out, { recursive: true });
    if (slug === 'MathKnowledgeAI') {
      const docs = [];
      function walk(dir) { for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
        const file = path.join(dir, item.name);
        if (item.isDirectory()) walk(file);
        else if (item.name.endsWith('.md')) {
          const rel = path.relative(path.join(src, '01_Knowledge'), file).replace(/\\/g, '/');
          const text = fs.readFileSync(file, 'utf8');
          docs.push({ id: rel, title: text.match(/^title:\s*(.+)$/m)?.[1] || item.name.replace(/\.md$/, ''), group: rel.split('/')[0].replace(/^\d+_/, ''), chapter: rel.split('/')[1]?.replace(/^\d+_/, '') || '', text: text.replace(/^---[\s\S]*?---\s*/, '').replace(/```dataview[\s\S]*?```/g, '') });
        }
      }}
      walk(path.join(src, '01_Knowledge'));
      write(out, 'data.json', docs);
    } else if (slug === 'MathGraph') {
      const books = [['7-up', '七年级上册', ''], ['7-down', '七年级下册', '7-down'], ['8-up', '八年级上册', '8-up'], ['8-down', '八年级下册', '8-down'], ['9-up', '九年级上册', '9-up'], ['9-down', '九年级下册', '9-down']];
      write(out, 'data.json', books.map(([id, title, dir]) => ({ id, title, topics: json(path.join(src, 'data', dir, 'topics.json')).topics, dependencies: json(path.join(src, 'data', dir, 'dependencies.json')).dependencies })));
      fs.copyFileSync(path.join(src, 'app/static/js/vis-network.min.js'), path.join(out, 'vis-network.min.js'));
    } else {
      const db = new DatabaseSync(path.join(src, 'build/bank.db'), { readOnly: true });
      const subjects = db.prepare('SELECT id,name FROM subject').all();
      const groups = [];
      for (const subject of subjects) for (let grade = 1; grade <= 6; grade++) {
        const questions = db.prepare('SELECT id,knowledge_id,type,difficulty,stem,options,answer,solution FROM question WHERE subject_id=? AND grade=?').all(subject.id, grade);
        const file = `questions-${subject.id}-${grade}.json`;
        write(out, file, questions.map(q => ({ ...q, options: q.options ? JSON.parse(q.options) : null })));
        groups.push({ subject: subject.id, name: subject.name, grade, file, count: questions.length });
      }
      write(out, 'data.json', { groups, knowledge: db.prepare('SELECT id,name,grade,subject_id FROM knowledge_point').all(), poems: db.prepare('SELECT * FROM ref_poem').all(), words: db.prepare('SELECT * FROM ref_english_word').all() });
      db.close();
    }
  }
  for (const name of ['LICENSE', 'INTEGRATION.md']) if (fs.existsSync(path.join(src, name))) fs.copyFileSync(path.join(src, name), path.join(out, name));
  if (slug === 'primary-english-knowledge-graph') fs.copyFileSync(path.join(src, 'app/CYTOSCAPE-LICENSE'), path.join(out, 'CYTOSCAPE-LICENSE'));
  console.log(`Built /modules/${slug}/`);
}

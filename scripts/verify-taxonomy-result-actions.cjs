// Exercise the real home/demo renderers in an isolated DOM; no user browser or records are touched.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { parseHTML } = require(process.env.MATH_TEST_DOM_PATH || '../artifacts/math-dom-check/node_modules/linkedom');
const root = path.resolve(__dirname, '../integrations/cn-math-taxonomy');
const engine = require(path.join(root, 'diagnose/engine.js'));
const subjects = ['math', 'chinese', 'science', 'morality', 'history', 'geography', 'biology', 'chemistry', 'english', 'physics'];
const json = new Map();
function environment(relative) {
  const location = new URL(relative, 'http://isolated.test/math/');
  const html = fs.readFileSync(path.join(root, relative.startsWith('diagnose/') ? 'diagnose/index.html' : 'index.html'), 'utf8');
  const { window } = parseHTML(html);
  const records = new Map();
  window.location = location;
  window.scrollTo = () => {};
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  window.DiagEngine = engine;
  window.print = () => { window.printed = true; };
  const fetch = async url => {
    const pathname = new URL(url, location).pathname.replace(/^\/math\//, '');
    const file = path.resolve(root, pathname);
    assert(file.startsWith(root + path.sep));
    if (!json.has(file)) json.set(file, JSON.parse(fs.readFileSync(file, 'utf8')));
    return { ok: true, status: 200, json: async () => json.get(file) };
  };
  const context = vm.createContext({ window, document: window.document, location, URL, URLSearchParams,
    localStorage: { getItem: k => records.get(k) || null, setItem: (k, v) => records.set(k, v), removeItem: k => records.delete(k) },
    fetch, console, setTimeout, clearTimeout, requestAnimationFrame() {}, confirm: () => false });
  for (const file of ['assets/stem-compat.js', 'assets/children.js', 'assets/blindspots.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context);
  }
  return { window, document: window.document, context, records };
}
(async () => {
  const report = [];
  const source = fs.readFileSync(path.join(root, 'diagnose/app.js'), 'utf8');
  for (const subject of subjects) {
    const home = environment('?subject=' + subject);
    vm.runInContext(fs.readFileSync(path.join(root, 'assets/home.js'), 'utf8'), home.context);
    for (let i = 0; i < 4; i++) await new Promise(resolve => setImmediate(resolve));
    const href = home.document.querySelector('.quiet-link a').getAttribute('href');
    assert(href.includes('demo=1'), subject + ': missing demo entry');
    const demo = environment(href);
    vm.runInContext(source.replace(/\binit\(\);\s*\}\)\(\);\s*$/, 'globalThis.ready = init();\n})();'), demo.context);
    await demo.context.ready;
    const summary = demo.document.getElementById('summary');
    assert(summary, subject + ': demo did not render a result: ' + demo.document.getElementById('root').textContent.slice(0, 240));
    assert(!(summary.previousSibling && summary.previousSibling.nodeType === 3 && summary.previousSibling.textContent === 'null'), subject + ': demo rendered an empty child status as literal text');
    assert(!demo.document.getElementById('btn-share'), subject + ': share action remains');
    assert(!demo.document.getElementById('btn-export'), subject + ': JSON export remains');
    assert(!/生成分享图|导出\s*JSON/.test(summary.textContent), subject + ': removed action text remains');
    const print = demo.document.getElementById('btn-print');
    assert(print, subject + ': print action was removed');
    print.click(); assert(demo.window.printed, subject + ': print handler is broken');
    assert(summary.textContent.includes('重新开始') && summary.textContent.includes('撤销上一题'));
    assert.equal(demo.records.size, 0, subject + ': demo unexpectedly saved progress');
    report.push({ subject, demo: href, status: 'passed' });
    console.log('PASS ' + subject + ': demo renders without share/export; print/restart/undo retained');
  }
  fs.writeFileSync(path.resolve(__dirname, '../artifacts/taxonomy-result-actions.json'), JSON.stringify({ status: 'passed', subjects: report }, null, 2));
})().catch(error => { console.error(error.stack); process.exitCode = 1; });

const { execFileSync } = require('node:child_process');
const path = require('node:path');
for (const script of ['build-language-science.cjs', 'build-math-primary.cjs', 'build-attention-tcm.cjs', 'build-supplied-courses.cjs']) {
  execFileSync(process.execPath, [path.join(__dirname, script)], { stdio: 'inherit', cwd: path.join(__dirname, '..') });
}

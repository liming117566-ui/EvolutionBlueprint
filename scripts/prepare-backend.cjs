const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const dest = path.join(root, 'artifacts', 'source-backups', stamp);
for (const name of ['miniprogram', 'server', 'scripts', '.claude', 'package.json', 'package-lock.json', 'README.md', 'DESIGN_SYSTEM.md']) {
  fs.cpSync(path.join(root, name), path.join(dest, name), { recursive: true, filter: p => !p.includes(path.sep + 'data' + path.sep) });
}
const seedPath = path.join(root, 'server', 'seed.json');
if (!fs.existsSync(seedPath)) {
  let app;
  vm.runInNewContext(fs.readFileSync(path.join(root, 'miniprogram/app.js'), 'utf8'), { App: value => { app = value; } });
  const content = require(path.join(root, 'miniprogram/utils/lesson-content.js'));
  const courses = app.globalData.courses.map(c => ({
    id: c.id, categoryId: c.id + '-category', title: c.title, subtitle: c.subtitle, description: c.description,
    duration: c.duration, cover: '/assets/covers/' + c.id + '.svg', published: true,
    chapters: c.chapters.map((title, index) => {
      const source = content(c.id, index);
      return { id: c.id + '-chapter-' + index, title, legacyIndex: index, sections: [
        { id: c.id + '-chapter-' + index + '-question', title: '问题导入', question: source.question, body: ['带着这个问题阅读本节，联系自己的实际经历思考。'], practice: '', legacyIndex: 0 },
        { id: c.id + '-chapter-' + index + '-reading', title: '重点阅读', question: source.question, body: source.body, practice: '', legacyIndex: 1 },
        { id: c.id + '-chapter-' + index + '-exercise', title: '随堂练习', question: '把本节所学用起来', body: [], practice: source.practice, legacyIndex: 2 }
      ] };
    })
  }));
  const settings = {
    brandName: '进化蓝图', logo: '/assets/icons/mark.svg', avatar: '/assets/icons/user.svg', gateCover: '/assets/covers/focus.svg',
    welcomeTitle: '让学习成为日常', gateTitle: '开启你的进化蓝图', gateDescription: '输入课程提供方发放的兑换码，开始学习。',
    nav: [{ id: 'home', label: '首页', icon: '/assets/icons/home.svg' }, { id: 'learn', label: '学习', icon: '/assets/icons/book.svg' }, { id: 'profile', label: '我的', icon: '/assets/icons/user.svg' }],
    help: ['选择主题后，点击课程目录即可进入对应的小章节。', '学习记录将同步到当前账号。'], about: ['进化蓝图是一个专注于课程学习的小程序。'], redeemHelp: ['卡密由课程提供方发放，兑换后获得对应课程的访问权限。']
  };
  fs.writeFileSync(seedPath, JSON.stringify({ settings, categories: app.globalData.courses.map(c => ({ id: c.id + '-category', title: c.category })), courses }, null, 2));
}
console.log('Source backup:', dest);
console.log('Stable seed:', seedPath);

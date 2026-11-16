// Shared defaults for the first catalog upgrade. Published configuration is authoritative.
const features = () => [
  { id: 'courses', title: '系统课程', description: '循序渐进地学', icon: '/assets/icons/book.svg', type: 'courses' },
  { id: 'practice', title: '随堂练习', description: '把理解变成掌握', icon: '/assets/icons/pencil.svg', type: 'practice' },
  { id: 'progress', title: '学习进度', description: '看见每一步积累', icon: '/assets/icons/chart.svg', type: 'progress' }
];
function defaults() {
  return [
    { id: 'junior-english', experience: 'english-starry-sky', title: '初中英语', subtitle: '从一个单词，到一个更大的世界', description: '把词汇、阅读和语法串成清晰的学习路径。每天一点练习，让语言慢慢成为你的能力。', group: 'subject', badge: '学科精选', tone: 'blue', icon: '/assets/icons/language.svg', cover: '/assets/covers/english.svg', categoryIds: ['english-category'], home: true, learn: true, enabled: true, featured: true, features: features() },
    juniorMathBoard(),
    mathBoard()
  ].concat(moduleBoards()).map(artwork);
}
function artwork(board) {
  const base = '/assets/generated/' + board.id.toLowerCase();
  return { ...board, icon: base + '-icon.webp', cover: base + '-landscape.webp' };
}
function mathBoard() {
  return { id: 'math-taxonomy', experience: 'cn-math-taxonomy', title: '中小学高中知识图谱', subtitle: '从知识图谱，找到真正没学会的那一步', description: '浏览小学至高中的数学知识图谱，沿先修关系进行自适应诊断，查看薄弱知识点与建议学习路径。', group: 'subject', badge: '知识诊断', tone: 'blue', icon: '/assets/icons/math.svg', cover: '/assets/covers/math.svg', categoryIds: [], home: true, learn: true, enabled: true, featured: false, features: features() };
}
function juniorMathBoard() {
  return { id: 'junior-math', experience: 'tainai-junior-math', title: '初中数学', subtitle: '从补齐基础，到看懂每一步解题', description: '从小学基础衔接到七至九年级，跟随分步例题、知识图与动画学习，通过提示练习和自检巩固理解。', group: 'subject', badge: '系统学习', tone: 'blue', icon: '/assets/icons/book.svg', cover: '/assets/covers/math.svg', categoryIds: [], home: true, learn: true, enabled: true, featured: false, features: features() };
}
function moduleBoards() {
  return require('./integrations').modules.map(item => ({
    id: 'module-' + item.slug, experience: item.slug, title: item.title,
    subtitle: item.subtitle, description: item.subtitle, group: item.group,
    badge: item.meta, tone: item.group === 'subject' ? 'blue' : 'lilac',
    icon: '/assets/icons/' + item.icon + '.svg', cover: '/assets/covers/' + item.cover + '.svg',
    categoryIds: [], home: true, learn: true, enabled: true, featured: false, features: features()
  })).map(artwork);
}
module.exports = { defaults, features, mathBoard, juniorMathBoard, moduleBoards, artwork };

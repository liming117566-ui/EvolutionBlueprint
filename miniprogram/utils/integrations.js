// Shared allowlist for the server, board defaults and native module host.
// Paths are derived only from these fixed slugs, never from catalog input.
const modules = [
  { slug: 'english-chinese-words', title: '英语单词', subtitle: '词汇查询与日常记忆', group: 'subject', icon: 'language', cover: 'english', meta: '英语词汇', labels: '查询 · 记忆 · 练习' },
  { slug: 'youwei-junior-science', title: '浙教版初中科学学习', subtitle: '梳理科学知识，巩固实验与概念', group: 'subject', icon: 'book', cover: 'thinking', meta: '初中科学', labels: '知识 · 复习 · 练习' },
  { slug: 'english-grammar-lab', title: '上海初高语法填空', subtitle: '结合语境练习语法与表达', group: 'subject', icon: 'language', cover: 'english', meta: '初高中英语', labels: '语法 · 填空 · 解析' },
  { slug: 'MathKnowledgeAI', title: '人教版初中数学 AI 学习库', subtitle: '按章节查阅数学知识与学习资料', group: 'subject', icon: 'math', cover: 'math', meta: '人教版初中', labels: '知识 · 资料 · 复习' },
  { slug: 'MathGraph', title: '初中数学图谱', subtitle: '沿着知识关系理解初中数学', group: 'subject', icon: 'math', cover: 'math', meta: '初中数学', labels: '图谱 · 概念 · 关联' },
  { slug: 'summer-camp-grade7', title: '小升初 40 天在线作业', subtitle: '循序完成小升初衔接练习', group: 'subject', icon: 'pencil', cover: 'thinking', meta: '小升初衔接', labels: '计划 · 作业 · 巩固' },
  { slug: 'primary-english-knowledge-graph', title: '小学英语知识图谱（小升初方向）', subtitle: '连接小学英语知识与初中学习', group: 'subject', icon: 'language', cover: 'english', meta: '小学英语', labels: '图谱 · 词汇 · 语法' },
  { slug: 'zx-study', title: '小学 1-6 年级各学科学习', subtitle: '按年级与学科查找学习内容', group: 'subject', icon: 'book', cover: 'thinking', meta: '小学一至六年级', labels: '年级 · 学科 · 学习' },
  { slug: 'adhd-training-platform', title: 'ADHD儿童注意力训练平台', subtitle: '通过训练练习注意与反应能力', group: 'growth', icon: 'focus', cover: 'focus', meta: '注意力训练', labels: '训练 · 反应 · 记录' },
  { slug: 'nihaixia-app', title: '倪师中医经方学习', subtitle: '阅读中医经方与学习资料', group: 'life', icon: 'leaf', cover: 'energy', meta: '中医学习', labels: '经方 · 阅读 · 检索' },
  { slug: 'nihaisha-nishi-tcm', title: '倪海厦中医', subtitle: '查阅中医知识与课程资料', group: 'life', icon: 'leaf', cover: 'energy', meta: '中医学习', labels: '知识 · 课程 · 阅读' },
  { slug: 'geometry-between', title: '几何之间', subtitle: '探索几何模型、动点最值与函数关系', group: 'subject', icon: 'math', cover: 'math', meta: '110 个数学专题', labels: '图形 · 推导 · 原书阅读' },
  { slug: 'geo-bio-exam', title: '地生会考学习空间', subtitle: '梳理生物知识，完成复习与自测', group: 'subject', icon: 'leaf', cover: 'thinking', meta: '生物会考复习', labels: '知识 · 冲刺 · 出卷' },
  { slug: 'math-between-grade7', title: '数学之间·七年级上册', subtitle: '通过交互模型理解七年级数学', group: 'subject', icon: 'math', cover: 'math', meta: '北师大七年级上册', labels: '课程 · 练习 · 学习资料' }
];
function find(experience) { return modules.find(item => item.slug === experience); }
function basePath(slug) { return '/modules/' + slug + '/'; }
module.exports = { modules, find, basePath };

// Original introductory content; no third-party textbook or media is bundled here.
const unit = (id, title, question, body, practice) => ({ id, title, sections: [
  { id: id + '-reading', title: '理解与阅读', question, body, practice: '' },
  { id: id + '-practice', title: '动手练习', question: '先独立完成，再对照提示检查。', body: [], practice }
] });
module.exports = {
  category: { id: 'english-category', title: '初中英语' },
  course: { id: 'english-foundations', categoryId: 'english-category', title: '英语学习第一步', subtitle: '词汇 · 阅读 · 语法，建立清晰的起点', description: '用日常情境认识词汇、理解短文，并练习一般现在时。三组原创入门练习，适合开始建立英语学习习惯。', duration: '3 章 · 建议每次 10 分钟', cover: '/assets/covers/english.svg', published: true, chapters: [
    unit('english-words', '在情境里记住单词', '为什么在句子里遇见单词，更容易记住？', ['读一读：I bring a notebook to school.（我带一本笔记本去学校。）notebook 是笔记本，bring 表示带来。把单词和具体动作放在一起，比孤立地背意思更容易回想。', '试着为每个新词写一个与你有关的句子。今天学三个词，明天不看笔记回想它们，再检查遗漏。'], '用 notebook、school、friend 各写一句话。示例：My friend has a blue notebook. 写完检查：句首是否大写？名词前是否需要 a 或 my？'),
    unit('english-reading', '读懂一段日常生活', '读短文时，每个生词都要马上查吗？', ['Mia walks to school with her friend. They talk about books on the way. After school, Mia reads for twenty minutes. She enjoys stories about animals.', '第一遍先找人物与主要活动：Mia、步行上学、阅读。第二遍寻找具体信息：和谁一起？读多久？遇到不影响主旨的生词，可以先根据上下文推测。'], '1. Who walks to school with Mia? 2. How long does Mia read after school? 3. What stories does she enjoy?\n参考：1. Her friend. 2. For twenty minutes. 3. Stories about animals.'),
    unit('english-grammar', '用一般现在时说说自己', 'I read 和 She reads 为什么不同？', ['一般现在时可以描述习惯和经常发生的事情。I read every day.（我每天阅读。）当主语是 he、she、it 等第三人称单数时，肯定句的实义动词通常要变化：She reads every day.', '否定句可以用 do not 或 does not：I do not read at night. She does not read at night. does 后面的实义动词用原形。'], '填空：1. He ___ (play) basketball on Sundays. 2. They ___ (walk) to school. 3. She does not ___ (watch) TV in the morning.\n参考：1. plays 2. walk 3. watch。再写两句描述自己习惯的英文。')
  ] }
};

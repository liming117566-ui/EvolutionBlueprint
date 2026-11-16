// One-time, explicit source adaptation; author credits/watermarks remain intact.
const fs = require('node:fs');
const path = require('node:path');
const file = path.join(__dirname, 'src/ui-views.js');
let text = fs.readFileSync(file, 'utf8');
text = text.replace(/  function aboutPage\(\) \{[\s\S]*?(?=  \/\* ============ 设置)/, '  function aboutPage() { home(); }\n\n');
text = text.replace(/    \/\/ —— AI 出题 ——[\s\S]*?(?=    \/\/ —— 数据与关于 ——)/, "    // 在线服务未配置；保留内置练习、错题与本地备份。\n");
text = text.replace("'数据与关于'", "'学习数据'").replace("      + '<button class=\"btn ghost sm\" data-nav=\"about\">关于本工具</button>'\n", '');
fs.writeFileSync(file, text);

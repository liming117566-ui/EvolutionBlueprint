const { randomInt } = require('node:crypto');

const adjectives = ['晴朗', '明亮', '悠然', '轻盈', '向阳', '灵动', '清新', '勇敢', '自在', '温暖', '敏捷', '好奇'];
const companions = ['海豚', '白鹭', '松鼠', '小鹿', '星河', '云朵', '青竹', '山雀', '海鸥', '萤火', '溪流', '飞燕'];
const defaults = new Set(['', '蓝图学员', '进化蓝图学员', '新博途学员']);

function isDefaultNickname(value) {
  return value == null || defaults.has(String(value).trim());
}

function randomNickname(store) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const suffix = attempt < 8 ? randomInt(1000, 10000) : randomInt(10000000, 100000000);
    const nickname = adjectives[randomInt(adjectives.length)] + companions[randomInt(companions.length)] + suffix;
    if (!store.get('SELECT id FROM users WHERE nickname=?', nickname)) return nickname;
  }
  throw new Error('暂时无法生成学员昵称，请稍后重试');
}

module.exports = { isDefaultNickname, randomNickname };

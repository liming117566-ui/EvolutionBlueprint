const api = require('./api');
const session = require('./session');
function gate(id) { wx.redirectTo({ url: '/pages/gate/gate?redeem=1&board=' + encodeURIComponent(id) }); }
async function open(id, isCurrent) {
  const valid = () => !isCurrent || isCurrent();
  if (!session.current()) { if (valid()) gate(id); return null; }
  try { return await api.request('/api/boards/' + encodeURIComponent(id) + '/open', { method: 'POST' }); }
  catch (error) { if (error.status === 401 || error.code === 'BOARD_LOCKED') { if (valid()) gate(id); return null; } throw error; }
}
module.exports = { gate, open };

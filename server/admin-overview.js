const catalog = require('./catalog');
function register(router, store) {
  router.get('/overview', (_req, res) => {
    const draft = catalog.draft(store), published = catalog.published(store);
    const count = (table, where = '') => store.get(`SELECT count(*) AS n FROM ${table} ${where}`).n;
    const days = Array.from({ length: 30 }, (_, i) => {
      const date = new Date(); date.setUTCDate(date.getUTCDate() - 29 + i);
      return date.toISOString().slice(0, 10);
    });
    const updates = store.all('SELECT substr(updated_at,1,10) AS day,count(*) AS n FROM learning_sections GROUP BY day');
    const joins = store.all('SELECT substr(created_at,1,10) AS day,count(*) AS n FROM users GROUP BY day');
    res.json({
      users: count('users'), activeUsers: count('users', "WHERE status='active'"),
      courses: published.courses.filter(c => c.published).length, draftCourses: draft.courses.length,
      boards: published.boards.filter(b => b.enabled).length, assets: count('assets'),
      websites: count('web_packages'), cards: count('cards'), redeemed: count('redemptions'),
      hasDraft: JSON.stringify({ ...draft, version: 0 }) !== JSON.stringify({ ...published, version: 0 }),
      trend: days.map(day => ({ day, learning: updates.find(x => x.day === day)?.n || 0, users: joins.find(x => x.day === day)?.n || 0 })),
      recent: store.all('SELECT action,target,created_at AS createdAt FROM audit ORDER BY id DESC LIMIT 5')
    });
  });
}
module.exports = { register };

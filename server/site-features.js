const sanitizeHtml = require('sanitize-html');
const { fail, now } = require('./security');

const defaultPrinting = { enabled: true, dealerId: '' };
const announcementTags = [
  'p', 'div', 'span', 'br', 'hr', 'blockquote', 'h1', 'h2', 'h3', 'h4',
  'strong', 'b', 'em', 'i', 'u', 's', 'ul', 'ol', 'li', 'table',
  'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'pre', 'code', 'sub', 'sup'
];

function register(app, admin, store, audit) {
  function read(name, fallback) {
    const row = store.get('SELECT body FROM site_features WHERE name=?', name);
    return row ? JSON.parse(row.body) : fallback;
  }

  function save(actor, name, value, action) {
    store.transaction(() => {
      store.run('INSERT INTO site_features(name,body) VALUES(?,?) ON CONFLICT(name) DO UPDATE SET body=excluded.body', name, JSON.stringify(value));
      audit(actor, action, name);
    });
  }

  app.get('/api/site-features', (_req, res) => {
    const printing = read('printing', defaultPrinting);
    const announcement = read('announcement', null);
    res.json({
      printing: { enabled: printing.enabled, dealerId: printing.enabled ? printing.dealerId : '' },
      announcement: announcement?.publishedAt ? announcement : null
    });
  });

  admin.get('/site-features', (_req, res) => res.json({
    printing: read('printing', defaultPrinting),
    announcement: read('announcement', null)
  }));

  admin.put('/site-features/printing', (req, res) => {
    if (typeof req.body.enabled !== 'boolean' || typeof req.body.dealerId !== 'string') fail(400, '请填写有效的打印配置');
    const dealerId = req.body.dealerId.trim();
    if (dealerId && !/^[A-Za-z0-9_-]{1,80}$/.test(dealerId)) fail(400, '经销商编号仅支持字母、数字、连字符和下划线');
    if (req.body.enabled && !dealerId) fail(400, '开启打印前请填写经销商编号');
    const printing = { enabled: req.body.enabled, dealerId };
    save(req.admin.id, 'printing', printing, 'printing.update');
    res.json(printing);
  });

  admin.put('/site-features/announcement', (req, res) => {
    const { title, html } = req.body;
    if (typeof title !== 'string' || !title.trim() || title.trim().length > 80) fail(400, '请输入不超过 80 字的公告标题');
    if (typeof html !== 'string' || !html.trim() || html.length > 30000) fail(400, '请输入不超过 30000 字符的 HTML 正文');
    const safeHtml = sanitizeHtml(html, { allowedTags: announcementTags, allowedAttributes: {}, disallowedTagsMode: 'discard' }).trim();
    const visibleText = sanitizeHtml(safeHtml, { allowedTags: [], allowedAttributes: {} }).replace(/&nbsp;/g, '').trim();
    if (!visibleText) fail(400, '请至少填写一段可显示的公告文字');
    const announcement = { title: title.trim(), html: safeHtml, publishedAt: now() };
    save(req.admin.id, 'announcement', announcement, 'announcement.publish');
    res.json(announcement);
  });

  admin.delete('/site-features/announcement', (req, res) => {
    const announcement = read('announcement', null);
    if (announcement?.publishedAt) save(req.admin.id, 'announcement', { ...announcement, publishedAt: null }, 'announcement.unpublish');
    res.json({ ...announcement, publishedAt: null });
  });
}

module.exports = { register };

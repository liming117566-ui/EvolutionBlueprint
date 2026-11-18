const root = document.querySelector('#app');
let data, group = 'all', query = '', library = 'boards';
let stopHomeCarousel;
const announcementTags = new Set('p div span br hr blockquote h1 h2 h3 h4 strong b em i u s ul ol li table thead tbody tfoot tr th td pre code sub sup'.split(' '));
const storageKey = 'xinbotu-browser-space-v1';
let saved = { checkins: [], visits: [], notes: [], goal: 15 };
try {
  const value = JSON.parse(localStorage.getItem(storageKey) || '{}');
  saved = { checkins: Array.isArray(value.checkins) ? value.checkins.filter(v => typeof v === 'string').slice(-366) : [], visits: Array.isArray(value.visits) ? value.visits.filter(v => typeof v?.id === 'string').slice(-30) : [], notes: Array.isArray(value.notes) ? value.notes.filter(v => typeof v?.text === 'string').slice(-200) : [], goal: [10, 15, 30].includes(value.goal) ? value.goal : 15 };
} catch (_) {}
function write() { try { localStorage.setItem(storageKey, JSON.stringify(saved)); return true; } catch (_) { toast('浏览器无法保存，请检查是否禁用了本地存储'); return false; } }
function day(date = new Date()) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else if (key === 'class') node.className = value;
    else if (['value', 'checked', 'disabled'].includes(key)) node[key] = value;
    else node.setAttribute(key, String(value));
  }
  for (const child of children.flat(Infinity)) if (child !== undefined && child !== null && child !== false) node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  return node;
}
const icon = name => el('img', { src: `/assets/icons/ui-${name}.svg`, alt: '', class: 'icon' });
const btn = (label, action, cls = '') => el('button', { type: 'button', class: cls, onclick: action }, label);
const go = route => { location.hash = route; };
const image = value => typeof value === 'string' && (/^\/assets\/[a-zA-Z0-9_./-]+$/.test(value) && !value.includes('..') || /^\/api\/assets\/[a-zA-Z0-9_-]+$/.test(value)) ? value : '/assets/generated/home-hero.webp';
function toast(text) { const node = el('div', { class: 'toast', role: 'status' }, text); document.querySelector('#notices').append(node); setTimeout(() => node.remove(), 4500); }
function sheet(title, ...body) {
  const focus = document.activeElement, dialog = el('dialog', { 'aria-label': title });
  const close = () => { dialog.close(); dialog.remove(); if (focus?.isConnected) focus.focus(); };
  dialog.append(el('div', { class: 'sheet-head' }, el('h2', {}, title), btn('关闭', close, 'subtle')), ...body);
  dialog.addEventListener('close', () => dialog.remove()); document.body.append(dialog); dialog.showModal(); return close;
}
function loginNotice() { sheet('微信登录暂未开放', el('p', {}, '现在可以先浏览课程和学习空间。微信小程序开放登录后，使用微信账号登录并兑换课程，即可学习完整内容、阅读资料与同步学习记录。'), el('p', { class: 'muted' }, '这里的打卡、笔记和计划仅保存在当前浏览器，不会记入微信账号。')); }
function section(title, link, action) { return el('div', { class: 'section-head' }, el('h2', {}, title), link && btn([link, icon('right')], action, 'subtle')); }
function heading(title, subtitle) { return el('div', { class: 'page-heading' }, el('span', { class: 'eyebrow' }, 'YOUR LEARNING SPACE'), el('h1', {}, title), el('p', {}, subtitle)); }
function empty(title, copy, action) { return el('div', { class: 'empty card' }, icon('book'), el('h3', {}, title), el('p', {}, copy), action); }
function boardCard(board) {
  const count = data.courses.filter(c => board.categoryIds.includes(c.categoryId)).length;
  return el('a', { class: 'board-card', href: `#/board/${encodeURIComponent(board.id)}` }, el('div', { class: 'cover-wrap' }, el('img', { class: 'cover', src: image(board.cover), alt: '', loading: 'lazy' }), el('span', { class: 'cover-label' }, board.experience === 'courses' ? '系统课程' : '互动学习')),
    el('div', { class: 'board-copy' }, el('h3', {}, board.title), el('p', {}, board.subtitle || board.description || '找到喜欢的方向，迈出学习第一步'), el('div', { class: 'card-bottom' }, el('span', {}, count ? `${count} 门课程` : '知识 · 练习 · 探索'), icon('arrow'))));
}
function courseRow(course) { return el('a', { class: 'course-row', href: `#/course/${encodeURIComponent(course.id)}` }, el('img', { src: image(course.cover), alt: '', loading: 'lazy' }), el('div', {}, el('h3', {}, course.title), el('p', {}, course.subtitle || course.category || '系统课程'), el('small', {}, `${course.lessons} 章${course.duration ? ' · ' + course.duration : ''}`)), icon('right')); }
function checkin() { if (!saved.checkins.includes(day())) { saved.checkins.push(day()); saved.checkins = saved.checkins.slice(-366); if (write()) toast('今天的成长，已记下 · 保存在当前浏览器'); } render(); }
function showAnnouncement() {
  const announcement = data.announcement;
  if (!announcement) return toast('暂无公告');
  const template = document.createElement('template');
  template.innerHTML = announcement.html;
  const copyNode = node => {
    if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.textContent);
    if (!announcementTags.has(node.localName)) return null;
    return el(node.localName, {}, [...node.childNodes].map(copyNode));
  };
  sheet(announcement.title, el('div', { class: 'announcement-content' }, [...template.content.childNodes].map(copyNode)));
}
function openPrinting() {
  const dealerId = data.printing.dealerId;
  if (typeof dealerId !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(dealerId)) return toast('在线打印暂未开通');
  const params = new URLSearchParams({ appid: 'wx39aad317949b7fda', path: 'pages/index/index', query: 'sid=' + dealerId, env_version: 'release' });
  sheet('在线打印资料', el('p', {}, '请在安装了微信的手机上打开打印服务，上传文档并选择打印规格。'),
    el('a', { class: 'button dark', href: `weixin://dl/business/?${params}` }, '在微信中打开', icon('arrow')));
}
function homeBanners() {
  const courseBanner = el('section', { class: 'hero' }, el('div', { class: 'hero-copy' }, el('span', { class: 'eyebrow' }, 'A LITTLE EVERY DAY'), el('h2', {}, '今天，也要', el('br'), '向前一点点。'), el('p', {}, '从一节好课，开启新的可能。'), el('a', { href: '#/explore', class: 'button dark' }, '探索好课', icon('arrow'))), el('div', { class: 'hero-art', 'aria-hidden': 'true' }, el('div', { class: 'book' }, el('span', {}, 'ONE', el('br'), 'STEP.'), icon('sun'), el('small', {}, 'KEEP GROWING'))));
  if (!data.printing.enabled) return courseBanner;
  const printBanner = el('section', { class: 'hero print-banner' },
    el('div', { class: 'hero-copy' }, el('h2', {}, '在线打印资料'), el('p', {}, '上传文档，选择打印规格'), btn(['去打印', icon('arrow')], openPrinting, 'button dark')),
    el('div', { class: 'hero-art', 'aria-hidden': 'true' }, el('span', { class: 'print-banner-art' }, icon('file'))));
  const slides = [courseBanner, printBanner];
  let active = 0;
  let playing = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const selectors = ['探索好课', '在线打印资料'].map((title, index) => btn(title, () => select(index), 'banner-selector'));
  const pause = btn('', () => { playing = !playing; updatePause(); }, 'subtle banner-pause');
  const carousel = el('section', { class: 'home-carousel', 'aria-label': '首页轮播' }, ...slides,
    el('div', { class: 'banner-controls' }, ...selectors, pause));
  function select(index) {
    active = index;
    slides.forEach((slide, slideIndex) => { slide.hidden = slideIndex !== active; });
    selectors.forEach((selector, slideIndex) => selector.setAttribute('aria-pressed', String(slideIndex === active)));
  }
  function updatePause() { pause.textContent = playing ? '暂停轮播' : '播放轮播'; }
  select(0);
  updatePause();
  const timer = window.setInterval(() => {
    if (playing && !document.hidden && !carousel.matches(':hover, :focus-within')) select((active + 1) % slides.length);
  }, 6000);
  stopHomeCarousel = () => window.clearInterval(timer);
  return carousel;
}
function home(main) {
  const checked = saved.checkins.includes(day());
  const announcementButton = btn([icon('message'), '公告', data.announcement && el('span', { class: 'announcement-dot', 'aria-hidden': 'true' })], showAnnouncement, 'checkin');
  main.append(el('div', { class: 'greeting' }, el('div', {}, el('h1', {}, '嗨，今天想学点什么？'), el('p', {}, '每天一刻，让成长悄悄发生。')),
    el('div', { class: 'greeting-actions' }, announcementButton, btn([icon('sun'), checked ? '今日已打卡' : '今日打卡'], checkin, 'checkin'))),
    homeBanners(),
    el('div', { class: 'quick-grid' }, ...[['screen', '互动学习', 'explore'], ['file', '电子资料', 'resources'], ['pencil', '练习自测', 'practice'], ['calendar', '学习计划', 'plan']].map(([symbol, title, route], i) => el('a', { href: '#/' + route }, el('span', { class: 'quick-icon tone-' + i }, icon(symbol)), title))));
  const recent = saved.visits.map(v => data.boards.find(b => b.id === v.id && b.home)).find(Boolean);
  main.append(section('继续探索', '学习中心', () => go('/learn')), recent ? el('a', { class: 'continue card', href: '#/board/' + encodeURIComponent(recent.id) }, el('img', { src: image(recent.cover), alt: '' }), el('div', {}, el('h3', {}, recent.title), el('p', {}, '最近浏览 · 从感兴趣的地方继续')), el('span', { class: 'play' }, icon('play'))) : el('a', { class: 'continue card', href: '#/explore' }, el('span', { class: 'quick-icon tone-1' }, icon('book')), el('div', {}, el('h3', {}, '从一节好课开始'), el('p', {}, '找到喜欢的方向，留下第一步足迹')), el('span', { class: 'play' }, icon('play'))), section('为你精选', '全部课程', () => { group = 'all'; query = ''; go('/explore'); }));
  const cards = el('div', { class: 'board-grid' });
  const tabs = filters(() => { cards.replaceChildren(...filterBoards(data.boards.filter(b => b.home)).slice(0, 6).map(boardCard)); if (!cards.children.length) cards.append(empty('课程正在准备', '换一个方向，发现更多好课。')); });
  main.append(tabs, cards); tabs.querySelector('[aria-selected="true"]').click();
  main.append(el('p', { class: 'endnote' }, '保持好奇，进步自然发生。'));
}
function filters(draw) {
  const tabs = el('div', { class: 'filters', role: 'tablist', 'aria-label': '学习方向' });
  for (const [id, label] of [['all', '全部'], ['subject', '学科提升'], ['other', '兴趣拓展']]) {
    const tab = el('button', { role: 'tab', type: 'button', 'aria-selected': String(group === id) }, label);
    tab.addEventListener('click', () => { group = id; [...tabs.children].forEach(t => t.setAttribute('aria-selected', String(t === tab))); draw(); });
    tabs.append(tab);
  }
  return tabs;
}
function filterBoards(boards) { const q = query.trim().toLowerCase(); return boards.filter(b => (group === 'all' || (group === 'subject' ? b.group === 'subject' : b.group !== 'subject')) && (!q || [b.title, b.subtitle, b.description].join(' ').toLowerCase().includes(q))); }
function explore(main, mode = 'explore') {
  const titles = { explore: ['发现适合你的好课', '一点好奇，一次探索，找到你的学习方向。'], resources: ['随时翻一翻，好知识', '课程中的 PDF、Word 和视频资料，和知识一起整理。'], practice: ['学一点，再练一点', '在练习与互动中，把新知识变成自己的。'], recent: ['最近浏览', '回到感兴趣的学习空间。'] };
  main.append(heading(...titles[mode]));
  if (mode === 'resources') main.append(el('p', { class: 'notice' }, '先选择课程查看介绍。完整文档与视频需在微信登录开放后，凭课程权益访问。'));
  const input = el('input', { type: 'search', placeholder: '搜索课程或学习方向', 'aria-label': '搜索课程或学习方向', value: query });
  const result = el('div'), count = el('span', { class: 'muted result-count', role: 'status' });
  const draw = () => {
    const q = query.trim().toLowerCase();
    let boards = mode === 'recent' ? saved.visits.map(v => data.boards.find(b => b.id === v.id)).filter(Boolean) : data.boards.filter(b => b.learn);
    boards = filterBoards(boards);
    const courses = data.courses.filter(c => (!q || (c.title + c.description + c.category).toLowerCase().includes(q)) && (group === 'all' || data.boards.some(b => b.categoryIds.includes(c.categoryId) && (group === 'subject' ? b.group === 'subject' : b.group !== 'subject'))));
    const showCourses = library === 'courses' || mode === 'resources';
    const items = showCourses ? courses : boards; count.textContent = `共 ${items.length} ${showCourses ? '门课程' : '个学习空间'}`;
    result.className = showCourses ? 'course-list card' : 'board-grid';
    result.replaceChildren(...items.map(showCourses ? courseRow : boardCard));
    if (!items.length) result.replaceChildren(empty(mode === 'recent' ? '还没有浏览记录' : '没有找到匹配内容', '试试其他关键词，或返回全部学习空间。', btn('浏览全部课程', () => { query = ''; group = 'all'; library = 'boards'; go('/explore'); render(); }, 'button')));
  };
  input.addEventListener('input', () => { query = input.value; draw(); });
  const switcher = el('div', { class: 'view-switch' }, ...[['boards', '学习空间'], ['courses', '系统课程']].map(([id, title]) => btn(title, () => { library = id; render(); }, library === id ? 'selected' : '')));
  main.append(el('div', { class: 'search-box' }, icon('search'), input), filters(draw), el('div', { class: 'section-head compact' }, count, mode !== 'resources' && switcher), result); draw();
}
function learn(main) {
  main.append(heading('学习，按你的节奏', '每一个小进步，都值得被看见。'), weekCard(), section('我的学习空间'));
  const cards = [['screen', '互动式学习', '在互动中，学得更透', '/explore'], ['file', '电子资料', '好知识，随时翻一翻', '/resources'], ['clock', '最近浏览', '回到感兴趣的学习空间', '/recent'], ['pencil', '练习自测', '小小练习，巩固所学', '/practice'], ['book', '学习笔记', `${saved.notes.length} 条浏览器学习收获`, '/notes'], ['calendar', '学习计划', `每日 ${saved.goal} 分钟的小目标`, '/plan']].map(([symbol, title, copy, route], index) =>
    el('a', { class: 'module card tone-card-' + index, href: '#' + route }, el('span', { class: 'quick-icon' }, icon(symbol)), el('h3', {}, title), el('p', {}, copy), el('span', { class: 'module-arrow' }, '去看看', icon('arrow'))));
  if (data.printing.enabled) {
    cards.splice(2, 0, btn([el('span', { class: 'quick-icon' }, icon('file')), el('span', { class: 'print-module-copy' }, el('strong', {}, '在线打印资料'), el('span', {}, '上传文档，选择打印规格')), icon('arrow')], openPrinting, 'print-module card'));
  }
  main.append(el('div', { class: 'module-grid' }, cards));
  main.append(el('p', { class: 'endnote' }, '学习不必赶路，找到自己的步调就好。'));
}
function weekCard() {
  const monday = new Date(); monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);
  const days = Array.from({ length: 7 }, (_, i) => { const date = new Date(monday); date.setDate(date.getDate() + i); return { date, active: saved.checkins.includes(day(date)) }; });
  return el('section', { class: 'week-card card' }, el('div', { class: 'section-head compact' }, el('div', {}, el('h2', {}, '本周学习足迹'), el('p', { class: 'muted' }, '一点一滴，慢慢积累')), el('strong', { class: 'week-number' }, days.filter(d => d.active).length, el('small', {}, ' 天'))), el('div', { class: 'week' }, ...days.map(({ date, active }, i) => el('div', { class: (active ? 'done ' : '') + (day(date) === day() ? 'today' : '') }, el('small', {}, ['一', '二', '三', '四', '五', '六', '日'][i]), el('span', {}, active ? '✓' : date.getDate())))), el('p', { class: 'fineprint' }, '当前浏览器的打卡记录'));
}
function profile(main) {
  main.append(el('section', { class: 'profile card' }, el('img', { class: 'avatar', src: image(data.settings.avatar), alt: '' }), el('div', {}, el('span', { class: 'eyebrow' }, 'HELLO, LEARNER'), el('h1', {}, '你好，学习的朋友'), el('p', {}, '保持热爱，慢慢变厉害。'), el('span', { class: 'pill' }, '浏览访客'))),
    el('div', { class: 'numbers card' }, ...[[saved.checkins.length, '打卡天数'], [saved.visits.length, '浏览空间'], [saved.notes.length, '学习笔记']].map(([n, text]) => el('div', {}, el('strong', {}, n), el('span', {}, text)))),
    el('a', { class: 'goal-banner', href: '#/plan' }, icon('flag'), el('div', {}, el('h3', {}, `每天 ${saved.goal} 分钟的小目标`), el('p', {}, '给学习留点时间，给自己一点期待')), icon('right')), section('我的学习'));
  main.append(el('div', { class: 'menu-list card' }, ...[['clock', '最近浏览', () => go('/recent')], ['file', '电子资料', () => go('/resources')], ['pencil', '我的笔记', () => go('/notes')], ['calendar', '学习计划', () => go('/plan')]].map(([symbol, title, action]) => btn([icon(symbol), el('span', {}, title), icon('right')], action, 'menu-row'))), section('更多服务'), el('div', { class: 'menu-list card' }, btn([icon('user'), el('span', {}, '微信登录 · 暂未开放'), icon('right')], loginNotice, 'menu-row'), btn([icon('message'), el('span', {}, '兑换说明'), icon('right')], () => info('课程兑换', data.settings.redeemHelp), 'menu-row'), btn([icon('settings'), el('span', {}, '使用帮助'), icon('right')], () => info('使用帮助', data.settings.help), 'menu-row')),
    el('p', { class: 'fineprint center' }, '打卡、笔记、计划和浏览记录保存在当前浏览器。微信账号的学习记录将在登录开放后提供。'));
}
function info(title, paragraphs) { sheet(title, ...(paragraphs?.length ? paragraphs : ['浏览学习空间，发现感兴趣的课程。微信登录开放后，可登录并兑换课程，开始完整学习。']).map(p => el('p', {}, p))); }
function notes(main) {
  main.append(heading('把灵感，留给未来', '读到、想到、学到的，都可以成为下一次成长的起点。'));
  const text = el('textarea', { maxlength: 3000, required: '', placeholder: '今天学到了什么？记下你的想法…', 'aria-label': '学习笔记' });
  const form = el('form', { class: 'note-form card', onsubmit: event => { event.preventDefault(); const value = text.value.trim(); if (!value) { text.focus(); return; } if (saved.notes.length >= 200) { toast('已保存 200 条笔记，请先整理已有笔记'); return; } saved.notes.push({ text: value, date: day(), id: Date.now() + '-' + saved.notes.length }); if (write()) { toast('笔记已保存在当前浏览器'); render(); } } }, text, el('div', { class: 'form-foot' }, el('small', {}, '仅保存于当前浏览器 · 最多 200 条'), el('button', { type: 'submit', class: 'button' }, '保存笔记')));
  main.append(form, section('我的学习收获'));
  if (!saved.notes.length) main.append(empty('留住第一个小想法', '不用写得很长，一句话也是收获。'));
  else main.append(el('div', { class: 'note-grid' }, ...saved.notes.slice().reverse().map(note => el('article', { class: 'note card' }, el('small', {}, note.date), el('p', {}, note.text), btn('删除', () => { const close = sheet('删除这条笔记？', el('p', {}, '删除后无法恢复。'), btn('确认删除', () => { saved.notes = saved.notes.filter(n => n.id !== note.id); write(); close(); render(); }, 'button')); }, 'subtle')))));
}
function plan(main) {
  main.append(heading('给每天，留一点学习时间', '不必一口气走很远，重要的是每一天都向前。'), el('section', { class: 'plan-card card' }, el('span', { class: 'quick-icon tone-0' }, icon('sun')), el('h2', {}, '我的每日小目标'), el('div', { class: 'goal-options' }, ...[10, 15, 30].map(n => btn([el('strong', {}, n), el('span', {}, '分钟 / 天')], () => { saved.goal = n; if (write()) toast('学习目标已更新'); render(); }, n === saved.goal ? 'selected' : ''))), el('p', { class: 'muted' }, '选择适合自己的节奏，记得给坚持一点鼓励。'), btn(saved.checkins.includes(day()) ? '今天已打卡 ✓' : '完成今日打卡', checkin, 'button')), weekCard());
}
function detail(main, id, isCourse) {
  const item = (isCourse ? data.courses : data.boards).find(v => v.id === id);
  if (!item) { main.append(empty('这个学习内容暂未展示', '可能已调整或下架，回到课程目录看看其他内容。', el('a', { href: '#/explore', class: 'button' }, '浏览课程'))); return; }
  if (!isCourse) { saved.visits = [{ id, date: day() }, ...saved.visits.filter(v => v.id !== id)].slice(0, 30); write(); }
  main.append(el('a', { class: 'back', href: '#/explore' }, '← 返回课程目录'), el('section', { class: 'detail-hero card' }, el('img', { src: image(item.cover), alt: '', class: 'detail-cover' }), el('div', { class: 'detail-copy' }, el('span', { class: 'eyebrow' }, isCourse ? 'COURSE COLLECTION' : 'LEARNING SPACE'), el('h1', {}, item.title), el('p', {}, item.subtitle || item.description || '保持好奇，按自己的节奏探索新知识。'), el('span', { class: 'pill' }, isCourse ? `${item.lessons} 章 · ${item.category}` : item.experience === 'courses' ? '系统课程与练习' : '互动学习空间'), btn('微信登录开放后开始学习', loginNotice, 'button'))));
  if (item.description) main.append(section('学习介绍'), el('div', { class: 'article card' }, el('p', {}, item.description)));
  if (!isCourse) {
    const courses = data.courses.filter(c => item.categoryIds.includes(c.categoryId));
    if (item.features?.length) main.append(section('在这里，你可以'), el('div', { class: 'feature-grid' }, ...item.features.map(f => el('article', { class: 'card feature' }, el('img', { src: image(f.icon), alt: '' }), el('h3', {}, f.title), el('p', {}, f.description || '循序探索，温故知新。')))));
    if (courses.length) main.append(section('相关课程'), el('div', { class: 'course-list card' }, ...courses.map(courseRow)));
  }
  main.append(el('p', { class: 'notice' }, '当前可浏览课程介绍。完整课程、文档和视频将在微信登录开放后，按课程权益提供。'));
}
function render() {
  if (!data) return;
  stopHomeCarousel?.();
  stopHomeCarousel = null;
  const route = location.hash.replace(/^#/, '') || '/home', parts = route.split('/'), page = parts[1] || 'home';
  const active = page === 'home' ? 'home' : ['profile', 'notes', 'plan'].includes(page) ? 'profile' : 'learn';
  const navLinks = () => [['home', '首页', 'home'], ['learn', '学习', 'book'], ['profile', '我的', 'user']].map(([id, label, symbol]) => el('a', { href: '#/' + id, class: active === id ? 'active' : '', 'aria-current': active === id ? 'page' : undefined }, icon(symbol), label));
  const main = el('main', { id: 'main', tabindex: '-1' });
  root.replaceChildren(el('aside', { class: 'sidebar' }, el('a', { class: 'brand', href: '#/home' }, el('img', { src: image(data.settings.logo), alt: '' }), el('div', {}, el('strong', {}, data.settings.brandName), el('small', {}, '让学习成为日常'))), el('nav', { 'aria-label': '主导航' }, ...navLinks()), el('div', { class: 'side-note' }, icon('bulb'), el('p', {}, '不必着急，', el('br'), '你正在慢慢变好。'), el('small', {}, 'ONE STEP AT A TIME')), el('a', { class: 'admin-link', href: '/admin/' }, '管理后台 ↗')),
    el('div', { class: 'workspace' }, el('header', { class: 'topbar' }, el('a', { class: 'mobile-brand', href: '#/home' }, el('img', { src: image(data.settings.logo), alt: '' }), data.settings.brandName), el('span', { class: 'top-label' }, '今天也是适合学习的一天'), el('div', { class: 'top-right' }, el('span', { class: 'preview-pill' }, '浏览模式 · 无需登录'), btn([icon('user'), '我的空间'], () => go('/profile'), 'profile-button'))), main, el('footer', {}, '新博途 · 把进步变成日常', el('span', {}, 'A LITTLE EVERY DAY'))), el('nav', { class: 'bottom-nav', 'aria-label': '底部导航' }, ...navLinks()));
  document.title = `${({ home: '首页', learn: '学习空间', profile: '我的', explore: '课程目录', resources: '电子资料', practice: '练习自测', notes: '学习笔记', plan: '学习计划', recent: '最近浏览' })[page] || '课程介绍'} · ${data.settings.brandName}`;
  if (page === 'home') home(main); else if (page === 'learn') learn(main); else if (page === 'profile') profile(main); else if (page === 'notes') notes(main); else if (page === 'plan') plan(main); else if (['explore', 'resources', 'practice', 'recent'].includes(page)) explore(main, page); else if (page === 'board' || page === 'course') { let id; try { id = decodeURIComponent(parts[2] || ''); } catch (_) { id = ''; } detail(main, id, page === 'course'); } else main.append(empty('页面没有找到', '回到首页，继续发现好内容。', el('a', { href: '#/home', class: 'button' }, '回到首页')));
}
async function load() {
  try {
    const loadJson = async (path, options = {}) => {
      const response = await fetch(path, { cache: 'no-store', ...options });
      if (!response.ok) throw new Error('学习内容暂时无法读取，请稍后重试。');
      return response.json();
    };
    const [bootstrap, catalog, features] = await Promise.all([
      loadJson('/api/bootstrap'), loadJson('/api/courses'),
      loadJson('/api/site-features', { signal: AbortSignal.timeout?.(4000) }).catch(() => null)
    ]);
    if (!bootstrap.settings || !Array.isArray(bootstrap.boards) || !Array.isArray(catalog.courses)) throw new Error('学习内容格式有误，请稍后重试。');
    data = { ...bootstrap, courses: catalog.courses, printing: features?.printing || { enabled: false, dealerId: '' }, announcement: features?.announcement || null }; render();
  } catch (error) { root.replaceChildren(el('main', { class: 'boot' }, empty('暂时没有连接上', error.message, btn('重新加载', load, 'button')))); }
}
window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); document.querySelector('#main')?.focus({ preventScroll: true }); });
load();

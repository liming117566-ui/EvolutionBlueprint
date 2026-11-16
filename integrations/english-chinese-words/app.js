'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const KEY = 'blueprint-vocabulary-v1';
  let saved = {}, words = [], filtered = [], mode = 'browse', page = 0, quiz = null, manifest = [], requestId = 0;
  try { const raw = JSON.parse(localStorage.getItem(KEY) || '{}'); if (raw && typeof raw === 'object' && !Array.isArray(raw)) saved = raw; } catch (_) {}
  function store() { try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch (_) { $('status').textContent = '浏览器空间不足，生词暂未保存，请先备份或清理空间。'; } }
  function meaning(w) { return w.trans.map(t => `${t.pos ? t.pos + ' ' : ''}${t.text}`).join('；'); }
  function active() { for (const id of ['browse', 'practice', 'saved']) $(id).classList.toggle('active', mode === id); }
  function render() {
    active(); $('pager').innerHTML = '';
    const query = $('search').value.trim().toLowerCase();
    filtered = words.filter(w => (!query || w.word.toLowerCase().includes(query) || meaning(w).includes(query)) && (mode !== 'saved' || saved[w.word]));
    if (mode === 'practice') { startQuiz(); return; }
    $('status').textContent = `当前词库 ${words.length} 词 · 显示 ${filtered.length} 词 · 已收藏 ${Object.keys(saved).length} 个生词`;
    const total = Math.ceil(filtered.length / 30); page = Math.max(0, Math.min(page, total - 1));
    $('content').innerHTML = filtered.length ? filtered.slice(page * 30, page * 30 + 30).map(w => `<article class="card"><div class="card-top"><div><h2>${esc(w.word)}</h2><div class="phonetic">${w.uk ? '英 /' + esc(w.uk) + '/' : ''} ${w.us ? '美 /' + esc(w.us) + '/' : ''}</div></div><button data-save="${esc(w.word)}" aria-pressed="${!!saved[w.word]}">${saved[w.word] ? '已加入生词' : '加入生词'}</button></div><div class="meaning">${esc(meaning(w))}</div><button data-speak="${esc(w.word)}">听发音</button>${w.sentences.slice(0, 2).map(s => `<p class="example">${esc(s.en)}<small>${esc(s.cn)}</small></p>`).join('')}${w.phrases.length ? `<details><summary>常用短语</summary>${w.phrases.slice(0, 8).map(s => `<p>${esc(s.en)} · ${esc(s.cn)}</p>`).join('')}</details>` : ''}${w.memory ? `<p class="hint">记忆：${esc(w.memory)}</p>` : ''}</article>`).join('') : '<div class="empty">没有找到符合条件的单词。</div>';
    if (total > 1) { $('pager').innerHTML = `<button id="prev" ${page === 0 ? 'disabled' : ''}>上一页</button><span>${page + 1} / ${total}</span><button id="next" ${page + 1 === total ? 'disabled' : ''}>下一页</button>`; $('prev').onclick = () => { page--; render(); }; $('next').onclick = () => { page++; render(); }; }
  }
  function startQuiz() {
    if (!filtered.length) { $('content').innerHTML = '<div class="empty">没有可练习的单词，请调整搜索条件。</div>'; return; }
    const pool = [...filtered].sort(() => Math.random() - .5).slice(0, 10);
    quiz = { pool, index: 0, correct: 0, answered: false }; showQuestion();
  }
  function showQuestion() {
    const w = quiz.pool[quiz.index];
    $('status').textContent = `拼写练习 ${quiz.index + 1} / ${quiz.pool.length} · 已答对 ${quiz.correct} 题`;
    $('content').innerHTML = `<form class="quiz" id="quizForm"><span class="eyebrow">根据释义，写出单词</span><h2>${esc(meaning(w))}</h2><input id="answer" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="输入英文单词" aria-label="英文答案"><div id="result" role="status"></div><button class="primary" id="submit" type="submit">检查答案</button></form>`;
    $('quizForm').onsubmit = e => {
      e.preventDefault();
      if (quiz.answered) { quiz.index++; if (quiz.index >= quiz.pool.length) { $('status').textContent = '本轮练习完成'; $('content').innerHTML = `<article class="quiz"><h2>完成 ${quiz.pool.length} 题，答对 ${quiz.correct} 题</h2><p>错词已加入生词本，可以回到词汇学习继续复习。</p><button id="again">再练一轮</button></article>`; $('again').onclick = startQuiz; return; } quiz.answered = false; showQuestion(); return; }
      const answer = $('answer').value.trim(); if (!answer) { $('answer').focus(); return; }
      const ok = answer.toLowerCase() === w.word.trim().toLowerCase();
      if (ok) quiz.correct++; else { saved[w.word] = true; store(); }
      quiz.answered = true; $('answer').disabled = true;
      $('result').innerHTML = `<p class="answer ${ok ? '' : 'bad'}">${ok ? '回答正确！' : '正确答案：' + esc(w.word)}${!ok ? '（已加入生词）' : ''}</p>`; $('submit').textContent = quiz.index + 1 === quiz.pool.length ? '查看结果' : '下一题';
    };
  }
  async function load() {
    const id = ++requestId; $('status').textContent = '正在加载单词…'; $('content').innerHTML = ''; $('pager').innerHTML = '';
    try { const r = await fetch(`data/${$('book').value}.json`); if (!r.ok) throw Error('HTTP ' + r.status); const data = await r.json(); if (id !== requestId) return; words = data.words; page = 0; render(); }
    catch (_) { if (id === requestId) $('status').textContent = '词库加载失败，请检查网络后重新选择词库。'; }
  }
  $('book').onchange = load; $('search').oninput = () => { page = 0; render(); };
  for (const id of ['browse', 'practice', 'saved']) $(id).onclick = () => { mode = id; page = 0; render(); };
  $('content').onclick = e => {
    const save = e.target.closest('[data-save]'); if (save) { const word = save.dataset.save; if (saved[word]) delete saved[word]; else saved[word] = true; store(); render(); }
    const speak = e.target.closest('[data-speak]'); if (speak) {
      if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) { $('status').textContent = '当前设备暂不支持语音朗读，可参考音标学习。'; return; }
      speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(speak.dataset.speak); u.lang = 'en-US'; u.rate = .85; u.onerror = () => { $('status').textContent = '设备暂时无法朗读，可参考音标学习。'; }; speechSynthesis.speak(u);
    }
  };
  fetch('data/manifest.json').then(r => { if (!r.ok) throw Error(); return r.json(); }).then(data => {
    manifest = data; const groups = [...new Set(data.map(b => b.group))];
    $('book').innerHTML = groups.map(g => `<optgroup label="${esc(g)}">${data.filter(b => b.group === g).map(b => `<option value="${esc(b.id)}">${esc(b.title)}（${b.count}词）</option>`).join('')}</optgroup>`).join('');
    const initial = manifest.find(b => /人教版小学.*三年级上册/.test(b.title)); if (initial) $('book').value = initial.id; load();
  }).catch(() => { $('status').textContent = '词库目录加载失败，请刷新重试。'; });
})();

'use strict';
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const KEY = 'blueprint.mathknowledge.v1';
let docs = [], current;
let saved; try { saved = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { saved = {}; }
function persist() { try { localStorage.setItem(KEY, JSON.stringify(saved)); $('#status').textContent = '已保存在当前设备'; } catch { $('#status').textContent = '当前浏览器无法保存，请复制笔记备份'; } }
function list() {
  const query = $('#search').value.trim().toLowerCase(), grade = $('#grade').value;
  const items = docs.filter(d => (!grade || d.group === grade) && (!$('#review').checked || saved[d.id]?.review) && (!query || `${d.title} ${d.chapter} ${d.text}`.toLowerCase().includes(query)));
  $('#stats').textContent = `${items.length} / ${docs.length} 个知识点 · 已学 ${Object.values(saved).filter(s => s.learned).length}`;
  $('#list').innerHTML = items.map(d => `<button data-id="${esc(d.id)}">${saved[d.id]?.learned ? '✓ ' : ''}${esc(d.title)}<small>${esc(d.group)} · ${esc(d.chapter)}</small></button>`).join('') || '<p>没有匹配的知识点</p>';
}
function read(id, shouldScroll = true) {
  current = docs.find(d => d.id === id); if (!current) return;
  const state = saved[id] || {};
  // The upstream corpus is Markdown, including Obsidian links. Escape raw HTML before rendering.
  const markdown = current.text.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, link, label) => label || link.split('/').pop()).replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1');
  $('#reader').innerHTML = `<h2>${esc(current.title)}</h2><p class="muted">${esc(current.group)} · ${esc(current.chapter)}</p><div id="content">${marked.parse(markdown.replace(/</g, '&lt;'))}</div><hr><div class="row"><label><input id="learned" type="checkbox" ${state.learned ? 'checked' : ''}> 已学会</label><label><input id="needsReview" type="checkbox" ${state.review ? 'checked' : ''}> 加入复习</label></div><h3>我的错题与学习笔记</h3><textarea id="note" placeholder="记录题目、错误原因和复习思路"></textarea><button id="save" class="primary">保存记录</button><p class="muted">笔记与学习进度保存在当前设备。AI 学习建议可结合这些知识点自行提问，本页不自动生成答案。</p>`;
  $('#note').value = state.note || '';
  $('#save').onclick = () => { saved[id] = { learned: $('#learned').checked, review: $('#needsReview').checked, note: $('#note').value }; persist(); list(); };
  if (window.renderMathInElement) renderMathInElement($('#content'), { delimiters: [{left:'$$',right:'$$',display:true},{left:'$',right:'$',display:false},{left:'\\(',right:'\\)',display:false},{left:'\\[',right:'\\]',display:true}], throwOnError: false });
  if (shouldScroll && innerWidth < 760) $('#reader').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
$('#list').onclick = e => { const button = e.target.closest('[data-id]'); if (button) read(button.dataset.id); };
$('#search').oninput = list; $('#grade').onchange = list; $('#review').onchange = list;
fetch('data.json').then(r => { if (!r.ok) throw Error('资料读取失败'); return r.json(); }).then(data => { docs = data; $('#grade').innerHTML += [...new Set(docs.map(d => d.group))].map(g => `<option>${esc(g)}</option>`).join(''); list(); if (docs[0]) read(docs[0].id, false); }).catch(e => { $('#status').textContent = e.message; });

'use strict';
const $ = s => document.querySelector(s), esc = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let books=[],book,network,selected,graphReady=false;
let mastery;try{mastery=JSON.parse(localStorage.getItem('blueprint.mathgraph.v1')||'{}');}catch{mastery={};}
const nodeKey=id=>book.id+':'+id;
function visible(){const q=$('#search').value.trim().toLowerCase(),d=$('#domain').value;return book.topics.filter(t=>(!d||t.domain===d)&&(!q||(t.name+' '+t.description).toLowerCase().includes(q)));}
function render(){
 graphReady=false;['zoom-in','zoom-out','fit'].forEach(id=>$('#'+id).disabled=true);
 const topics=visible(),ids=new Set(topics.map(t=>t.id));
 $('#stats').textContent=topics.length+' 个知识点 · '+book.dependencies.length+' 条先修关系';
 $('#list').innerHTML=topics.map(t=>`<button data-id="${esc(t.id)}">${mastery[nodeKey(t.id)]?'✓ ':''}${esc(t.name)}<small>${esc(t.domain)}</small></button>`).join('')||'<p>没有匹配的知识点</p>';
 if(network)network.destroy();
 network=new vis.Network($('#graph'),{nodes:topics.map(t=>({id:t.id,label:t.name,group:t.domain,color:mastery[nodeKey(t.id)]?'#b2d4c1':'#e9eeeb',font:{size:15,color:'#191a1d'},shape:'box',margin:12})),edges:book.dependencies.filter(e=>ids.has(e.topicId)&&ids.has(e.prerequisiteId)).map(e=>({from:e.prerequisiteId,to:e.topicId,arrows:'to',dashes:e.strength==='soft',color:'#9baa9f',title:e.reason}))},{interaction:{hover:true},physics:{stabilization:{iterations:100}},layout:{improvedLayout:true},edges:{smooth:{type:'continuous'}},groups:{}});
 network.on('click',e=>{if(e.nodes[0])detail(e.nodes[0]);});
 const ready=()=>{if(graphReady)return;graphReady=true;network.stopSimulation();if(innerWidth<760&&topics.length)network.focus(topics[0].id,{scale:1,animation:false});['zoom-in','zoom-out','fit'].forEach(id=>$('#'+id).disabled=false);};
 network.once('stabilized',ready);network.once('stabilizationIterationsDone',ready);if(!topics.length)ready();
}
function detail(id){selected=id;const t=book.topics.find(x=>x.id===id);if(!t)return;
 const before=book.dependencies.filter(e=>e.topicId===id),after=book.dependencies.filter(e=>e.prerequisiteId===id);
 const link=(id,reason)=>{const node=book.topics.find(x=>x.id===id);return node?`<li><button data-id="${esc(id)}">${esc(node.name)}</button> ${esc(reason||'')}</li>`:'';};
 const order=[],seen=new Set();function visit(tid){if(seen.has(tid))return;seen.add(tid);book.dependencies.filter(e=>e.topicId===tid&&e.strength!=='soft').forEach(e=>visit(e.prerequisiteId));if(!mastery[nodeKey(tid)])order.push(tid);}visit(id);
 $('#detail').innerHTML=`<h2>${esc(t.name)}</h2><p>${esc(t.description)}</p><h3>掌握目标</h3><ul>${(t.evidence||[]).map(e=>`<li>${esc(e)}</li>`).join('')}</ul>${t.assessmentPrompt?`<h3>自测问题</h3><p>${esc(t.assessmentPrompt.replace(/\{\{name\}\}/g,'你'))}</p>`:''}<button class="primary" id="master">${mastery[nodeKey(id)]?'取消已掌握':'标记为已掌握'}</button><h3>先修知识</h3><ul>${before.map(e=>link(e.prerequisiteId,e.reason)).join('')||'<li>可从此处开始</li>'}</ul><h3>后续知识</h3><ul>${after.map(e=>link(e.topicId)).join('')||'<li>本册没有后续依赖</li>'}</ul><h3>建议学习顺序</h3><ol>${order.map(tid=>link(tid)).join('')||'<li>目标及必须先学的知识均已掌握</li>'}</ol><p class="muted">掌握状态由你自行标记，仅保存在当前设备。</p>`;
 $('#master').onclick=()=>{mastery[nodeKey(id)]=!mastery[nodeKey(id)];try{localStorage.setItem('blueprint.mathgraph.v1',JSON.stringify(mastery));}catch{$('#status').textContent='当前设备无法保存记录';}render();detail(id);};
}
function change(){book=books.find(b=>b.id===$('#book').value);$('#domain').innerHTML='<option value="">全部领域</option>'+[...new Set(book.topics.map(t=>t.domain))].map(d=>`<option>${esc(d)}</option>`).join('');$('#search').value='';render();detail(book.topics[0].id);}
$('#list').onclick=$('#detail').onclick=e=>{const b=e.target.closest('[data-id]');if(b)detail(b.dataset.id);};$('#book').onchange=change;$('#domain').onchange=render;$('#search').oninput=render;$('#fit').onclick=()=>network?.fit({animation:false});
function zoom(factor){if(network)network.moveTo({scale:Math.max(.1,Math.min(4,network.getScale()*factor)),animation:false});}
$('#zoom-in').onclick=()=>zoom(1.4);$('#zoom-out').onclick=()=>zoom(1/1.4);
fetch('data.json').then(r=>{if(!r.ok)throw Error('资料读取失败');return r.json();}).then(data=>{books=data;$('#book').innerHTML=books.map(b=>`<option value="${b.id}">${b.title}</option>`).join('');change();}).catch(e=>$('#status').textContent=e.message);

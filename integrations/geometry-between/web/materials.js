/* Developer-published catalog. The public site has no material write operations. */
const Materials = (() => {
 const TYPES={pages:'专题讲义',pdf:'PDF 文档',image:'图片资料',text:'文本资料'};
 let library=[],alive=false,epoch=0,selected=null,category='all';
 let currentPDF=null,pdfTask=null,renderTask=null,imageURL=null,currentPage=1,totalPages=1,query='',pdfLibrary;
 const $=id=>document.getElementById(id);
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function sizeLabel(n){return n<1024*1024?(n/1024).toFixed(n<1024?2:0)+' KB':(n/1024/1024).toFixed(1)+' MB'}
 function kindFor(name){const ext=name.split('.').pop().toLowerCase();return ext==='pdf'?'pdf':['png','jpg','jpeg','webp','gif'].includes(ext)?'image':['txt','md'].includes(ext)?'text':null}
 function parsePages(value,total){
  if(!Number.isInteger(total)||total<1)throw new Error('无法确定页数。');
  const input=String(value).trim();if(!input)return Array.from({length:total},(_,i)=>i+1);
  const pages=new Set();
  for(const part of input.replace(/，/g,',').split(',')){
   const match=/^\s*(\d+)(?:\s*[-—–]\s*(\d+))?\s*$/.exec(part);
   if(!match)throw new Error('页码格式不正确，请输入如 1-3,5,8。');
   const first=Number(match[1]),last=Number(match[2]||match[1]);
   if(first<1||last>total||first>last)throw new Error(`页码须在 1—${total} 内，且起始页不能大于结束页。`);
   for(let n=first;n<=last;n++)pages.add(n);
  }
  return [...pages].sort((a,b)=>a-b);
 }
 function pagesFor(file,value,total){
  let pages=[];
  if(file.kind==='pages'){pages=String(value).trim()?parsePages(value,file.pages.at(-1)):[...file.pages];if(pages.some(n=>!file.pages.includes(n)))throw new Error(`本讲义的书内页码为 ${file.pages[0]}—${file.pages.at(-1)}，请在此范围内选择。`)}
  else if(file.kind==='pdf')pages=parsePages(value,total);
  if(pages.length>100)throw new Error('每次最多准备 100 页，请分批输入页码打印。');return pages;
 }
 function buildLibrary(models,published){
  const topics=models.map(m=>{const next=models.find(n=>n.category===m.category&&n.number===m.number+1),end=next?next.page:({geometry:167,optimum:212,functions:296}[m.category]);return {id:'topic-'+m.id,name:m.title,kind:'pages',category:m.category,description:'原书图解与例题',pages:Array.from({length:end-m.page+1},(_,i)=>m.page+i)}});
  return [...published,...topics];
 }
 function pageURL(page){return './pages/'+String(page).padStart(3,'0')+'.jpg'}
 function categoryName(key){return ({published:'补充资料',geometry:'几何模型',optimum:'动点最值',functions:'函数专题'})[key]||'补充资料'}
 async function getFile(id){const file=library.find(f=>f.id===id);if(!file)throw new Error('这份资料暂未发布。');if(file.kind==='pages')return file;if(location.protocol==='file:')throw new Error('请运行“启动网站.ps1”，通过 http://localhost:4173 打开补充资料。');const response=await fetch(file.url);if(!response.ok)throw new Error('资料加载失败，请稍后重试。');return {...file,blob:await response.blob()}}
 function loadPDFLibrary(){
  if(!pdfLibrary)pdfLibrary=new Promise((resolve,reject)=>{
   const script=document.createElement('script');script.src='./vendor/pdf.min.js';
   script.onload=()=>{pdfjsLib.GlobalWorkerOptions.workerSrc='./vendor/pdf.worker.min.js';resolve(pdfjsLib)};
   script.onerror=()=>{script.remove();pdfLibrary=null;reject(new Error('PDF 阅读器加载失败，请使用本地启动方式打开网站。'))};document.head.append(script);
  });return pdfLibrary;
 }
 function mount(host){
  alive=true;++epoch;selected=null;query='';category='all';library=buildLibrary(MODELS,PUBLISHED_MATERIALS);
  host.innerHTML=`<div class="page-heading"><div class="eyebrow">PUBLISHED STUDY MATERIALS</div><h1>精选学习资料，按需打印。</h1><p>查看本站提供的讲义与例题，选择需要的页面，打印后继续练习。</p></div>
   <section class="materials-notice">${icon('book')}<div><strong>统一提供的学习资料</strong><p>资料由网站开发者发布与维护。选择下方资料，即可预览和打印。</p></div><span>可查看 · 可打印</span></section>
   <div class="materials-layout"><section class="materials-list-panel"><div class="materials-list-head"><h2>已发布资料 <span id="material-count">0</span></h2><label class="material-search">${icon('search')}<input id="material-search" type="search" aria-label="搜索已发布资料" placeholder="搜索专题或资料…"></label><label class="material-category-label">资料分类<select id="material-category" aria-label="资料分类"><option value="all">全部资料</option><option value="geometry">几何模型</option><option value="optimum">动点最值</option><option value="functions">函数专题</option><option value="published">补充资料</option></select></label></div><div id="material-list" class="material-list" aria-label="资料列表"></div></section><section id="material-viewer" class="material-viewer" aria-label="资料预览"><div class="material-empty">${icon('file')}<h2>选择资料，开始阅读。</h2><p>从资料列表选择一份讲义，查看内容并选择打印页码。</p></div></section></div>
   <div class="material-help">${icon('bulb')}专题讲义沿用原书页码，交界页可能包含相邻专题。打印前可先翻页查看，再输入所需页码。</div>`;
  $('material-search').oninput=e=>{query=e.target.value;renderList()};
  $('material-category').onchange=e=>{category=e.target.value;renderList()};
  renderList();if(library.length)selectFile((library.find(f=>f.kind==='pages')||library[0]).id);
 }
 function unmount(){document.getElementById('materials-print-dialog')?.close();alive=false;++epoch;releasePreview();selected=null}
 function renderList(){
  if(!alive)return;const filtered=library.filter(f=>(category==='all'||f.category===category)&&(f.name+' '+(f.description||'')).toLowerCase().includes(query.trim().toLowerCase()));$('material-count').textContent=filtered.length;
  $('material-list').innerHTML=filtered.length?filtered.map(f=>`<button class="material-file ${selected===f.id?'selected':''}" data-material="${esc(f.id)}" aria-pressed="${selected===f.id}"><span class="material-type ${f.kind}">${f.kind==='pages'?'讲义':f.kind==='pdf'?'PDF':f.kind==='image'?'IMG':'TXT'}</span><span class="material-file-copy"><strong>${esc(f.name)}</strong><small>${categoryName(f.category)}${f.pages?' · '+f.pages.length+' 页':''}</small><small>${f.pages?'书内 P.'+f.pages[0]+'—'+f.pages.at(-1):'开发者发布'}</small></span>${icon('chevron-right')}</button>`).join(''):`<div class="materials-placeholder">${icon('file')}<p>没有找到匹配的资料。</p></div>`;
  $('material-list').querySelectorAll('[data-material]').forEach(b=>b.onclick=()=>selectFile(b.dataset.material));
 }
 function releasePreview(){if(renderTask){renderTask.cancel();renderTask=null}if(pdfTask){pdfTask.destroy().catch(()=>{});pdfTask=null}if(currentPDF){currentPDF.destroy().catch(()=>{});currentPDF=null}if(imageURL){URL.revokeObjectURL(imageURL);imageURL=null}}
 async function selectFile(id){
  releasePreview();const selectionEpoch=++epoch;selected=id;currentPage=1;totalPages=1;renderList();$('material-viewer').innerHTML='<div class="material-empty"><h2>正在打开资料…</h2></div>';
  try{
   const file=await getFile(id);if(!alive||selectionEpoch!==epoch)return;
   let text='';
   if(file.kind==='pdf'){
    const pdfjs=await loadPDFLibrary();if(!alive||selectionEpoch!==epoch)return;
    const task=pdfjs.getDocument({data:new Uint8Array(await file.blob.arrayBuffer()),isEvalSupported:false,useSystemFonts:true,cMapUrl:'./vendor/cmaps/',cMapPacked:true,standardFontDataUrl:'./vendor/standard_fonts/'});
    pdfTask=task;let passwordProtected=false;task.onPassword=()=>{passwordProtected=true;task.destroy().catch(()=>{});if(alive&&selectionEpoch===epoch)showPreviewError(file,'这份资料暂时无法预览，请联系网站维护者。')};
    let pdf;try{pdf=await task.promise}catch(err){if(passwordProtected)throw new Error('这份资料暂时无法预览，请联系网站维护者。');throw err}if(!alive||selectionEpoch!==epoch){await pdf.destroy();return}currentPDF=pdf;if(pdfTask===task)pdfTask=null;totalPages=pdf.numPages;
   }else if(file.kind==='text'){text=await file.blob.text()}else if(file.kind==='pages'){totalPages=file.pages.length}
   if(!alive||selectionEpoch!==epoch)return;
   const paged=file.kind==='pdf'||file.kind==='pages',rangeHint=file.kind==='pages'?`全部，书内 ${file.pages[0]}—${file.pages.at(-1)} 页`:paged?'全部，如 1-3,5':'全部';
   $('material-viewer').innerHTML=`<div class="material-viewer-head"><div><span class="material-kind">${TYPES[file.kind]} · 开发者发布</span><h2>${esc(file.name)}</h2><p>${file.pages?'书内 P.'+file.pages[0]+'—'+file.pages.at(-1):sizeLabel(file.size)}${paged?' · 共 '+totalPages+' 页':''}${file.description?' · '+esc(file.description):''}</p></div><span class="material-readonly">${icon('eye')}查看与打印</span></div>
    <div class="material-print-settings"><label for="material-paper">纸张<select id="material-paper"><option value="A4">A4</option><option value="Letter">Letter</option></select></label><label for="material-orientation">方向<select id="material-orientation"><option value="portrait">纵向</option><option value="landscape">横向</option></select></label><label class="print-pages-label" for="material-page-range">打印页码<input id="material-page-range" aria-label="打印页码" placeholder="${rangeHint}" ${paged?'':'disabled'}></label><button class="button primary" id="material-print">${icon('file')}打印资料</button><p>${file.kind==='pages'?'按书内页码填写；留空打印本讲义全部页面。':''}先生成打印预览，确认后选择打印机、份数与双面设置。</p><div class="print-validation" id="material-print-message" role="status" hidden></div></div>
    ${paged?`<div class="material-page-navigation"><button class="button small" id="material-prev" disabled>${icon('back')}上一页</button><label for="material-page">${file.kind==='pages'?'书内页码':'页码'} <select id="material-page" aria-label="预览页码">${Array.from({length:totalPages},(_,i)=>`<option value="${i+1}">${file.pages?file.pages[i]:i+1}</option>`).join('')}</select> <span id="material-page-count">1 / ${totalPages}</span></label><button class="button small" id="material-next" ${totalPages===1?'disabled':''}>下一页${icon('arrow')}</button></div>`:''}
    <div id="material-preview" class="material-preview ${file.kind}">${file.kind==='pdf'?'<canvas id="material-pdf-canvas" role="img" aria-label="PDF 页面预览"></canvas><p class="pdf-render-status" id="pdf-render-status" role="status">正在渲染页面…</p>':file.kind==='image'||file.kind==='pages'?'<img id="material-image" alt="">':'<pre id="material-text"></pre>'}</div>`;
   if(file.kind==='pages'){
    const showPage=n=>{currentPage=n;$('material-page').value=String(n);$('material-prev').disabled=n===1;$('material-next').disabled=n===totalPages;$('material-page-count').textContent=n+' / '+totalPages;$('material-image').src=pageURL(file.pages[n-1]);$('material-image').alt=file.name+' · 书内第 '+file.pages[n-1]+' 页'};
    $('material-page').onchange=e=>showPage(Number(e.target.value));$('material-prev').onclick=()=>showPage(currentPage-1);$('material-next').onclick=()=>showPage(currentPage+1);showPage(1);
   }
   if(file.kind==='pdf'){
    $('material-page').onchange=e=>renderPDFPage(Number(e.target.value),selectionEpoch);
    $('material-prev').onclick=()=>renderPDFPage(currentPage-1,selectionEpoch);$('material-next').onclick=()=>renderPDFPage(currentPage+1,selectionEpoch);
    await renderPDFPage(1,selectionEpoch);
   }else if(file.kind==='image'){imageURL=URL.createObjectURL(file.blob);$('material-image').src=imageURL;$('material-image').alt=file.name}
   else if(file.kind==='text')$('material-text').textContent=text;
   if(!alive||selectionEpoch!==epoch)return;
   $('material-print').onclick=()=>preparePrint(file);
  }catch(err){if(alive&&selectionEpoch===epoch)showPreviewError(library.find(f=>f.id===id),err.message||'无法预览这份文件。')}
 }
 function showPreviewError(file,message){$('material-viewer').innerHTML=`<div class="material-empty"><h2>暂时无法预览</h2><p>${esc(message)}</p><p>${esc(file?.name||'')}</p><button class="button" id="material-retry">重新加载</button></div>`;if(file)$('material-retry').onclick=()=>selectFile(file.id)}
 async function renderPDFPage(n,selectionEpoch){
  if(!currentPDF||n<1||n>totalPages)return;if(renderTask)renderTask.cancel();currentPage=n;
  $('material-page').value=String(n);$('material-page-count').textContent=n+' / '+totalPages;$('material-prev').disabled=n===1;$('material-next').disabled=n===totalPages;$('pdf-render-status').hidden=false;$('pdf-render-status').textContent='正在渲染页面…';
  try{
   const pdf=currentPDF,page=await pdf.getPage(n);if(!alive||selectionEpoch!==epoch||n!==currentPage)return;
   const natural=page.getViewport({scale:1}),viewport=page.getViewport({scale:Math.min(1.8,1400/natural.width)}),canvas=$('material-pdf-canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);canvas.setAttribute('aria-label',`PDF 第 ${n} 页预览`);
   renderTask=page.render({canvasContext:canvas.getContext('2d'),viewport});await renderTask.promise;
   if(alive&&selectionEpoch===epoch&&n===currentPage){$('pdf-render-status').hidden=true;renderTask=null}
  }catch(err){if(err.name!=='RenderingCancelledException'&&alive&&selectionEpoch===epoch)$('pdf-render-status').textContent='页面渲染失败，请重新加载资料。'}
 }
 function printCSS(paper,orientation){
  const dimensions=paper==='Letter'?[215.9,279.4]:[210,297];if(orientation==='landscape')dimensions.reverse();const width=dimensions[0]-24,height=dimensions[1]-24;
  return `*{box-sizing:border-box}body{margin:0;background:#edf2ec;color:#233c27;font:15px/1.8 "Microsoft YaHei",sans-serif}.print-tools{position:sticky;top:0;z-index:2;padding:18px 25px;background:#fff;border-bottom:1px solid #dbe5d7;display:flex;align-items:center;gap:15px;flex-wrap:wrap}.print-tools h1{font-size:18px;margin:0;overflow-wrap:anywhere}.print-tools p{margin:0;font-size:13px;color:#607655}.print-tools button{padding:10px 20px;background:#177c69;color:#fff;border:0;border-radius:6px;font:700 15px "Microsoft YaHei",sans-serif;cursor:pointer}.print-tools button:disabled{background:#a1b5a5;cursor:wait}#print-content{padding:20px}.print-sheet{margin:0 auto 20px;width:min(100%,${width}mm);aspect-ratio:${width}/${height};height:auto;display:flex;align-items:center;justify-content:center;page-break-after:always;background:white;box-shadow:0 2px 15px #23412212;overflow:hidden}.print-sheet:last-child{page-break-after:auto}.print-sheet img{width:100%;height:100%;aspect-ratio:${width}/${height};object-fit:contain;display:block}.print-text{background:#fff;margin:0 auto;max-width:${width}mm;padding:0;white-space:pre-wrap;overflow-wrap:anywhere;font:12pt/1.7 "Microsoft YaHei",sans-serif;color:#000}.print-error{padding:24px;color:#9b4e32}@page{size:${paper} ${orientation};margin:12mm}@media print{html,body{background:#fff;color:#000}.print-tools{display:none!important}#print-content{padding:0}.print-sheet{margin:0;width:${width}mm;height:${height-.5}mm;box-shadow:none;break-inside:avoid}.print-text{margin:0;max-width:none;width:100%}}`;
 }
 async function preparePrint(file){
  const message=$('material-print-message');let pages=[];
  try{pages=pagesFor(file,$('material-page-range').value,totalPages)}catch(err){message.hidden=false;message.textContent=err.message;return}
  if(document.getElementById('materials-print-dialog'))return;const printDialog=document.createElement('dialog');printDialog.id='materials-print-dialog';printDialog.className='materials-print-dialog';printDialog.innerHTML='<div class="print-dialog-heading"><strong>打印预览</strong><button class="button small" id="close-print-preview">关闭预览</button></div><iframe title="资料打印预览"></iframe>';document.body.append(printDialog);printDialog.addEventListener('close',()=>printDialog.remove());printDialog.querySelector('#close-print-preview').onclick=()=>printDialog.close();printDialog.showModal();const printFrame=printDialog.querySelector('iframe'),popup=printFrame.contentWindow;
  const paper=$('material-paper').value,orientation=$('material-orientation').value;
  popup.document.open();popup.document.write('<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>资料打印</title></head><body><header class="print-tools"><div><h1 id="print-title"></h1><p id="print-status">正在生成清晰打印版，请稍候…</p></div><button id="confirm-print" disabled>确认打印</button><button id="close-print">关闭</button></header><main id="print-content"></main></body></html>');popup.document.close();
  const doc=popup.document,style=doc.createElement('style');style.textContent=printCSS(paper,orientation);doc.head.append(style);doc.title='打印 · '+file.name;doc.getElementById('print-title').textContent=file.name;doc.getElementById('close-print').onclick=()=>printDialog.close();const progress=doc.getElementById('print-status'),content=doc.getElementById('print-content');
  let jobPDF,temporaryURL;
  try{
   if(file.kind==='pdf'){
    const pdfjs=await loadPDFLibrary();jobPDF=await pdfjs.getDocument({data:new Uint8Array(await file.blob.arrayBuffer()),isEvalSupported:false,useSystemFonts:true,cMapUrl:'./vendor/cmaps/',cMapPacked:true,standardFontDataUrl:'./vendor/standard_fonts/'}).promise;
    for(let i=0;i<pages.length;i++){
     if(!printFrame.isConnected)return;progress.textContent=`正在准备第 ${i+1} / ${pages.length} 页（原文件第 ${pages[i]} 页）…`;
     const page=await jobPDF.getPage(pages[i]),natural=page.getViewport({scale:1}),viewport=page.getViewport({scale:Math.min(2.1,2000/Math.max(natural.width,natural.height))}),canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);await page.render({canvasContext:canvas.getContext('2d'),viewport,background:'white'}).promise;
     if(!printFrame.isConnected)return;const image=doc.createElement('img');image.alt=`第 ${pages[i]} 页`;image.src=canvas.toDataURL('image/jpeg',.95);await image.decode();const sheet=doc.createElement('section');sheet.className='print-sheet';sheet.append(image);content.append(sheet);canvas.width=0;canvas.height=0;page.cleanup();
    }
   }else if(file.kind==='pages'){
    for(let i=0;i<pages.length;i++){
     if(!printFrame.isConnected)return;progress.textContent=`正在准备第 ${i+1} / ${pages.length} 页（书内第 ${pages[i]} 页）…`;
     const image=doc.createElement('img');image.alt=`书内第 ${pages[i]} 页`;image.src=pageURL(pages[i]);await image.decode();if(!printFrame.isConnected)return;const sheet=doc.createElement('section');sheet.className='print-sheet';sheet.append(image);content.append(sheet);
    }
   }else if(file.kind==='image'){
    temporaryURL=URL.createObjectURL(file.blob);const image=doc.createElement('img');image.alt=file.name;image.src=temporaryURL;await image.decode();if(!printFrame.isConnected)return;const sheet=doc.createElement('section');sheet.className='print-sheet';sheet.append(image);content.append(sheet);
   }else{const pre=doc.createElement('pre');pre.className='print-text';pre.textContent=await file.blob.text();content.append(pre)}
   if(!printFrame.isConnected)return;progress.textContent=`${paper} · ${orientation==='portrait'?'纵向':'横向'}${pages.length?` · ${pages.length} 页（${file.kind==='pages'?'书内':'原'}页码 ${pages.join(', ')}）`:''}。准备完成，请确认打印。`;
   const confirm=doc.getElementById('confirm-print');confirm.disabled=false;confirm.onclick=()=>{try{popup.focus();popup.print()}catch{progress.textContent='浏览器未能打开打印对话框，请使用浏览器菜单中的“打印”或 Ctrl+P。'}};
   message.hidden=false;message.textContent='打印版已生成，请在预览中检查后点击“确认打印”。';
  }catch(err){if(printFrame.isConnected){progress.textContent='打印版生成失败，请关闭重试。';const error=doc.createElement('p');error.className='print-error';error.textContent=err.message;content.append(error)}}finally{if(jobPDF)await jobPDF.destroy();if(temporaryURL){if(!printFrame.isConnected)URL.revokeObjectURL(temporaryURL);else printDialog.addEventListener('close',()=>URL.revokeObjectURL(temporaryURL),{once:true})}}
 }
 return {mount,unmount,parsePages,pagesFor,buildLibrary,kindFor,sizeLabel,printCSS};
})();

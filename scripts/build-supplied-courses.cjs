// Preserve user-supplied sources; publish only the browser web/ trees behind module guards.
const fs=require('node:fs');const path=require('node:path');
const root=path.resolve(__dirname,'..');
const packs=[['geometry-between','几何之间'],['geo-bio-exam','地生会考学习空间'],['math-between-grade7','数学之间·七年级上册']];
for(const [slug,title] of packs){
 const source=path.join(root,'integrations',slug,'web'),dest=path.join(root,'server/modules-web',slug);
 if(!fs.existsSync(path.join(source,'index.html')))throw Error('Missing supplied course: '+slug);
 fs.mkdirSync(dest,{recursive:true});
 fs.cpSync(source,dest,{recursive:true,filter:file=>path.basename(file)!=='server.js'});
 // Keep the supplied HTML, styles, icons and navigation unchanged.
 // Remove only artifacts added by our earlier UI adaptation.
 for(const file of ['integration.css','brand-icon.webp'])fs.rmSync(path.join(dest,file),{force:true});
 if(slug==='geometry-between'){
  const app=path.join(dest,'app.js');let js=fs.readFileSync(app,'utf8');
  // The archive intentionally excludes its original 406MB PDF; use all 296 supplied page images.
  js=js.replace(/function sourceURL\(m\)\{[^\n]*\}/,"function sourceURL(m){return './book.html?page='+(m?m.page:1)}").replaceAll('打开完整 PDF','打开原书');
  if(js.includes("'/book.pdf'"))throw Error('Unadapted missing full-PDF link');
  fs.writeFileSync(app,js);fs.copyFileSync(path.join(root,'scripts/supplied-book-reader.html'),path.join(dest,'book.html'));
 }
 console.log('Built',title,'from supplied web source');
}

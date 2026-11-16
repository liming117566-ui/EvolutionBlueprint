/* Run on the developer's computer. This tool is never served by web/server.js. */
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const vm=require('node:vm');
const ROOT=path.resolve(__dirname,'..');
const EXTENSIONS={'.pdf':'pdf','.png':'image','.jpg':'image','.jpeg':'image','.webp':'image','.gif':'image','.txt':'text','.md':'text'};
function readCatalog(root){const ctx=vm.createContext({});vm.runInContext(fs.readFileSync(path.join(root,'web/materials-catalog.js'),'utf8'),ctx);return JSON.parse(vm.runInContext('JSON.stringify(PUBLISHED_MATERIALS)',ctx))}
function publish(source,title,root=ROOT){
 const absolute=path.resolve(source),extension=path.extname(absolute).toLowerCase(),kind=EXTENSIONS[extension];
 if(!kind)throw new Error('仅支持 PDF、JPG、PNG、WebP、GIF、TXT 和 Markdown；Office 文件请先导出为 PDF。');
 const stat=fs.statSync(absolute);if(!stat.isFile()||stat.size===0||stat.size>100*1024*1024)throw new Error('资料须为非空文件，且不超过 100 MB。');
 const bytes=fs.readFileSync(absolute);if(kind==='pdf'&&!bytes.subarray(0,1024).includes(Buffer.from('%PDF-')))throw new Error('文件不是有效的 PDF。');
 const records=readCatalog(root),hash=crypto.createHash('sha256').update(bytes).digest('hex');
 if(records.some(item=>item.sha256===hash))throw new Error('这份资料已发布，无需重复添加。');
 const id='published-'+crypto.randomUUID(),filename=id+extension,name=(title||path.basename(absolute,extension)).trim();if(!name)throw new Error('资料名称不能为空。');
 const folder=path.join(root,'web/materials');fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(path.join(folder,filename),bytes,{flag:'wx'});
 const record={id,name,kind,category:'published',url:'./materials/'+filename,size:stat.size,sha256:hash};records.unshift(record);
 const target=path.join(root,'web/materials-catalog.js');
 fs.writeFileSync(target,'/* Developer-published materials. Updated by tools/publish-material.cjs. */\nconst PUBLISHED_MATERIALS = '+JSON.stringify(records,null,2)+';\n','utf8');
 return record;
}
if(require.main===module){try{if(!process.argv[2])throw new Error('用法：node tools/publish-material.cjs "资料路径" "显示名称（可选）"');const item=publish(process.argv[2],process.argv[3]);console.log('已发布：'+item.name+'\n刷新网站“资料与打印”即可查看。部署时请同步 web 文件夹。')}catch(error){console.error(error.message);process.exitCode=1}}
module.exports={publish,readCatalog};

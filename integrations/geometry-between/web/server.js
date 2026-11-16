/* No npm dependencies. Run: node web/server.js */
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const root=__dirname;
const parent=path.dirname(root);
const book=fs.readdirSync(parent).find(name=>name.toLowerCase().endsWith('.pdf'));
const port=Number(process.env.PORT)||4173;
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.json':'application/json; charset=utf-8','.jpg':'image/jpeg','.png':'image/png','.pdf':'application/pdf'};
const server=http.createServer((req,res)=>{
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{Allow:'GET, HEAD'});return res.end()}
 let pathname;try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname)}catch{res.writeHead(400);return res.end('Bad request')}
 let target;if(pathname==='/book.pdf'){if(!book){res.writeHead(404);return res.end('Local PDF not found')}target=path.join(parent,book)}else{target=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));if(!target.startsWith(root+path.sep)||path.basename(target)==='server.js'){res.writeHead(403);return res.end('Forbidden')}}
 fs.stat(target,(err,stat)=>{
  if(err||!stat.isFile()){res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});return res.end('文件不存在')}
  const headers={'Content-Type':types[path.extname(target)]||'application/octet-stream','Accept-Ranges':'bytes','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'};
  let start=0,end=stat.size-1,status=200;
  if(req.headers.range){const m=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);if(!m||(!m[1]&&!m[2])){res.writeHead(416,{'Content-Range':`bytes */${stat.size}`});return res.end()}if(!m[1]){start=Math.max(0,stat.size-Number(m[2]))}else{start=Number(m[1]);if(m[2])end=Math.min(Number(m[2]),end)}if(start>end||start>=stat.size){res.writeHead(416,{'Content-Range':`bytes */${stat.size}`});return res.end()}status=206;headers['Content-Range']=`bytes ${start}-${end}/${stat.size}`}
  headers['Content-Length']=end-start+1;res.writeHead(status,headers);if(req.method==='HEAD')return res.end();const stream=fs.createReadStream(target,{start,end});stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);
 });
});
server.on('error',err=>{console.error(err.code==='EADDRINUSE'?`端口 ${port} 已占用，请尝试打开 http://localhost:${port} 或设置 PORT 环境变量。`:err.message);process.exitCode=1});
server.listen(port,'127.0.0.1',()=>console.log(`几何之间已启动：http://localhost:${port}\n按 Ctrl+C 停止服务。`));

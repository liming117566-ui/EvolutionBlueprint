/* Run from project root: node web/server.js */
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const root=__dirname,port=Number(process.env.PORT)||4174;
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.jpg':'image/jpeg','.json':'application/json; charset=utf-8'};
http.createServer((req,res)=>{
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{Allow:'GET, HEAD'});return res.end()}
 let pathname;try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname)}catch{res.writeHead(400);return res.end('Bad request')}
 const target=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
 if(!target.startsWith(root+path.sep)||path.basename(target)==='server.js'){res.writeHead(403);return res.end('Forbidden')}
 fs.stat(target,(error,stat)=>{
  if(error||!stat.isFile()){res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});return res.end('文件不存在')}
  res.writeHead(200,{'Content-Type':types[path.extname(target)]||'application/octet-stream','Content-Length':stat.size,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});
  if(req.method==='HEAD')return res.end();const stream=fs.createReadStream(target);stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);
 });
}).on('error',error=>{console.error(error.code==='EADDRINUSE'?`端口 ${port} 已被占用。请打开 http://localhost:${port} 或设置 PORT 使用其他端口。`:error.message);process.exitCode=1}).listen(port,'127.0.0.1',()=>console.log(`地生会考学习空间已启动：http://localhost:${port}\n按 Ctrl+C 停止服务。`));

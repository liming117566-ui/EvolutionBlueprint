/* Local read-only server. No external packages. */
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=__dirname,port=Number(process.env.PORT)||4175;
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.json':'application/json; charset=utf-8','.png':'image/png','.jpeg':'image/jpeg','.jpg':'image/jpeg'};
const server=http.createServer((req,res)=>{
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{Allow:'GET, HEAD'});return res.end()}
 let pathname;try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname)}catch{res.writeHead(400);return res.end()}
 const target=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
 if(!target.startsWith(root+path.sep)||path.basename(target)==='server.js'){res.writeHead(403);return res.end('Forbidden')}
 fs.stat(target,(err,stat)=>{if(err||!stat.isFile()){res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});return res.end('文件不存在')}
 res.writeHead(200,{'Content-Type':types[path.extname(target)]||'application/octet-stream','Content-Length':stat.size,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});if(req.method==='HEAD')return res.end();const stream=fs.createReadStream(target);stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res)});
});
server.on('error',err=>{console.error(err.code==='EADDRINUSE'?`端口 ${port} 已占用，请设置 PORT 后重试。`:err.message);process.exitCode=1});
server.listen(port,'127.0.0.1',()=>console.log(`数学之间已启动：http://localhost:${port}\n按 Ctrl+C 停止服务。`));

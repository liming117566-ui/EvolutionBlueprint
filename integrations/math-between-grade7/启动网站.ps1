$ErrorActionPreference='Stop'
$mathNode=Get-Command node.exe -ErrorAction SilentlyContinue
$mathNodePath=if($mathNode){$mathNode.Source}else{$null}
if(-not $mathNodePath -or $mathNodePath -like '*\Microsoft\WindowsApps\*'){
 $mathRuntime=Get-ChildItem -LiteralPath 'C:\Program Files\WindowsApps' -Directory -Filter 'OpenAI.CodexPrimaryRuntime*' -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
 if($mathRuntime){$mathBundledNode=Join-Path $mathRuntime.FullName 'dependencies\node\bin\node.exe';if(Test-Path -LiteralPath $mathBundledNode){$mathNodePath=$mathBundledNode}}
}
if(-not $mathNodePath){throw '请先安装 Node.js 18 或更高版本。学习内容也可直接打开 web/index.html 查看；资料打印建议使用本地服务。'}
$mathPort=if($env:PORT){$env:PORT}else{'4175'}
Write-Host '数学之间 · 北师大七年级上册' -ForegroundColor Green
Write-Host "在浏览器打开 http://localhost:$mathPort；保持此窗口运行，按 Ctrl+C 停止。"
& $mathNodePath (Join-Path $PSScriptRoot 'web/server.js')

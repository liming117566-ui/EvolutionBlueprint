$ErrorActionPreference = 'Stop'
$bioNode = Get-Command node.exe -ErrorAction SilentlyContinue
$bioNodePath = if ($bioNode) { $bioNode.Source } else { $null }
if (-not $bioNodePath -or $bioNodePath -like '*\Microsoft\WindowsApps\*') {
    $bioRuntime = Get-ChildItem -LiteralPath 'C:\Program Files\WindowsApps' -Directory -Filter 'OpenAI.CodexPrimaryRuntime*' -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
    if ($bioRuntime) {
        $bioBundledNode = Join-Path $bioRuntime.FullName 'dependencies\node\bin\node.exe'
        if (Test-Path -LiteralPath $bioBundledNode) { $bioNodePath = $bioBundledNode }
    }
}
if (-not $bioNodePath) { throw '未找到 Node.js。也可以直接打开 web 文件夹里的 index.html 使用。' }
Write-Host '地生会考学习空间 · 生物已开放，地理板块待定' -ForegroundColor Green
Write-Host '打开 http://localhost:4174；保持此窗口运行，按 Ctrl+C 停止。'
& $bioNodePath (Join-Path $PSScriptRoot 'web\server.js')

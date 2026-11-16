$ErrorActionPreference = 'Stop'
$siteFolder = Join-Path $PSScriptRoot 'web'
$siteNode = Get-Command node.exe -ErrorAction SilentlyContinue
if ($siteNode) { $siteNodePath = $siteNode.Source }
if (-not $siteNodePath -or $siteNodePath -like '*\Microsoft\WindowsApps\*') {
    $siteRuntime = Get-ChildItem -LiteralPath 'C:\Program Files\WindowsApps' -Directory -Filter 'OpenAI.CodexPrimaryRuntime*' -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
    if ($siteRuntime) {
        $siteBundledNode = Join-Path $siteRuntime.FullName 'dependencies\node\bin\node.exe'
        if (Test-Path -LiteralPath $siteBundledNode) { $siteNodePath = $siteBundledNode }
    }
}
if (-not $siteNodePath) { throw '未找到 Node.js。也可以直接打开 web 文件夹中的 index.html 使用网站。' }
Write-Host '几何之间 · 交互数学实验室' -ForegroundColor Green
Write-Host '请在浏览器打开 http://localhost:4173；保持此窗口运行，按 Ctrl+C 停止。'
& $siteNodePath (Join-Path $siteFolder 'server.js')

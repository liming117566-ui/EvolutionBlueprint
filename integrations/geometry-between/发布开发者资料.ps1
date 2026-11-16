param(
    [Parameter(Mandatory=$true)][string]$FilePath,
    [string]$Title = ''
)
$ErrorActionPreference = 'Stop'
$publisherNode = Get-Command node.exe -ErrorAction SilentlyContinue
if ($publisherNode) { $publisherNodePath = $publisherNode.Source }
if (-not $publisherNodePath -or $publisherNodePath -like '*\Microsoft\WindowsApps\*') {
    $publisherRuntime = Get-ChildItem -LiteralPath 'C:\Program Files\WindowsApps' -Directory -Filter 'OpenAI.CodexPrimaryRuntime*' -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
    if ($publisherRuntime) {
        $publisherBundledNode = Join-Path $publisherRuntime.FullName 'dependencies\node\bin\node.exe'
        if (Test-Path -LiteralPath $publisherBundledNode) { $publisherNodePath = $publisherBundledNode }
    }
}
if (-not $publisherNodePath) { throw '未找到 Node.js，请安装 Node.js 后重试。' }
& $publisherNodePath (Join-Path $PSScriptRoot 'tools\publish-material.cjs') (Resolve-Path -LiteralPath $FilePath).Path $Title
if ($LASTEXITCODE -ne 0) { throw '资料未发布，请检查上方提示。' }

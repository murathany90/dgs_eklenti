$ErrorActionPreference = 'Stop'
$registryPath = 'HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.ytbs.powerfactory.solver'
if (Test-Path -LiteralPath $registryPath) { Remove-Item -LiteralPath $registryPath }
$hostRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$manifest = Join-Path $hostRoot 'com.ytbs.powerfactory.solver.json'
if (Test-Path -LiteralPath $manifest) { Remove-Item -LiteralPath $manifest }
Write-Output 'Grid Analyzer Yerel Hesap Motoru unregistered.'

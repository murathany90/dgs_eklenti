$ErrorActionPreference = 'Stop'
$hostRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$registryPath = 'HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.ytbs.powerfactory.solver'
if (Test-Path -LiteralPath $registryPath) { Remove-Item -LiteralPath $registryPath }
foreach ($name in @('com.ytbs.powerfactory.solver.json', 'ytbs-solver-host.cmd')) {
  $target = Join-Path $hostRoot $name
  if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target }
}
Write-Output 'YTBS native host unregistered.'

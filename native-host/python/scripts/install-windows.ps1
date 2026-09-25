param(
  [Parameter(Mandatory=$true)][ValidatePattern('^[a-p]{32}$')][string]$ExtensionId,
  [string]$PythonPath = ''
)
$ErrorActionPreference = 'Stop'
$hostRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$venvPython = if ($PythonPath) { (Resolve-Path -LiteralPath $PythonPath).Path } else { Join-Path $hostRoot '.venv\Scripts\python.exe' }
if (-not $PythonPath -and -not (Test-Path -LiteralPath $venvPython)) { python -m venv (Join-Path $hostRoot '.venv') }
& $venvPython -m pip install --disable-pip-version-check -e $hostRoot
if ($LASTEXITCODE -ne 0) { throw 'Native host Python installation failed' }
$launcher = Join-Path $hostRoot 'ytbs-solver-host.cmd'
$manifest = Join-Path $hostRoot 'com.ytbs.powerfactory.solver.json'
$launcherBody = "@echo off`r`n`"$venvPython`" -m ytbs_solver_host.main`r`n"
[System.IO.File]::WriteAllText($launcher, $launcherBody, [System.Text.Encoding]::ASCII)
$payload = [ordered]@{
  name = 'com.ytbs.powerfactory.solver'
  description = 'YTBS local pandapower load flow solver'
  path = $launcher
  type = 'stdio'
  allowed_origins = @("chrome-extension://$ExtensionId/")
}
[System.IO.File]::WriteAllText($manifest, ($payload | ConvertTo-Json -Depth 3), [System.Text.Encoding]::UTF8)
$registryPath = 'HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.ytbs.powerfactory.solver'
New-Item -Path $registryPath -Force | Out-Null
Set-Item -Path $registryPath -Value $manifest
Write-Output "Installed native host for $ExtensionId at $manifest"

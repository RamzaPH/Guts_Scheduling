param()

$ErrorActionPreference = 'Stop'

function Write-Step([string]$message) {
    Write-Host "[docker-autofix] $message" -ForegroundColor Cyan
}

$runKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
$entryName = 'GutsDockerAutofix'
$scriptPath = Join-Path $PSScriptRoot 'restart-docker.ps1'

if (-not (Test-Path $scriptPath)) {
    throw "Missing helper script: $scriptPath"
}

$powershellExe = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
$command = "`"$powershellExe`" -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$scriptPath`" -SkipLaunch"

Write-Step "Registering HKCU Run entry '$entryName'"
New-Item -Path $runKey -Force | Out-Null
New-ItemProperty -Path $runKey -Name $entryName -Value $command -PropertyType String -Force | Out-Null

Write-Step "Run entry installed. Docker will self-heal on the next logon."
Write-Step "To remove it later, run: Remove-ItemProperty -Path '$runKey' -Name '$entryName'"
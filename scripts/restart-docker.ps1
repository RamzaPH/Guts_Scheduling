# Restart Docker Desktop safely - stop processes, backup config, unregister WSL, restart Docker
# Usage: PowerShell -NoProfile -ExecutionPolicy Bypass -File .\scripts\restart-docker.ps1

$ErrorActionPreference = 'Stop'
Write-Host "== Docker cleanup started ==" 

# Stop docker-related processes
$processNames = @('Docker Desktop', 'docker', 'vpnkit', 'com.docker', 'dockerd', 'docker-desktop', 'DockerDesktop')
$processes = @()
Get-Process | Where-Object { $_.ProcessName -in $processNames } | ForEach-Object { $processes += $_ }

# Also attempt to find processes by image/commandline using WMI (handles 'Docker Desktop.exe' exact image names)
try {
    $wmiMatches = Get-CimInstance Win32_Process | Where-Object { $_.Name -match 'Docker(.exe)?' -or ($_.CommandLine -and $_.CommandLine -match 'Docker Desktop') }
    foreach ($p in $wmiMatches) {
        if (-not ($processes | Where-Object { $_.Id -eq $p.ProcessId })) {
            try {
                $proc = Get-Process -Id $p.ProcessId -ErrorAction Stop
                $processes += $proc
            } catch {
                # If Get-Process failed, create a synthetic object with Id only
                $processes += (New-Object PSObject -Property @{ Id = $p.ProcessId; ProcessName = $p.Name })
            }
        }
    }
} catch {
    # ignore WMI errors
}

if ($processes.Count -gt 0) {
    Write-Host "Stopping processes"
    $processes | ForEach-Object { 
        try { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue } catch {}
    }
    Start-Sleep -Seconds 1
} else {
    Write-Host "No docker processes found"
}

# Backup Docker configuration directories
$timestamp = (Get-Date).ToString('yyyyMMddHHmmss')
$userProfile = $env:USERPROFILE
$backupFolder = Join-Path $userProfile "docker-cleanup-backup-$timestamp"
New-Item -Path $backupFolder -ItemType Directory -Force | Out-Null

$appData = $env:APPDATA
$localAppData = $env:LOCALAPPDATA

$appDockerPath = Join-Path $appData "Docker"
$localDockerPath = Join-Path $localAppData "Docker"

foreach ($dockerPath in @($appDockerPath, $localDockerPath)) {
    if (Test-Path $dockerPath) {
        $backupPath = Join-Path $backupFolder (Split-Path $dockerPath -Leaf)
        Write-Host "Backing up $dockerPath"
        Move-Item -Path $dockerPath -Destination $backupPath -Force -ErrorAction SilentlyContinue
    }
}

# Unregister docker-desktop WSL distro
$wslDistros = wsl --list --quiet 2>$null
if ($wslDistros -match "docker-desktop") {
    Write-Host "Unregistering docker-desktop WSL distro"
    wsl --unregister docker-desktop 2>$null
    Start-Sleep -Seconds 1
}

# Shutdown WSL
Write-Host "Shutting down WSL"
wsl --shutdown 2>$null
Start-Sleep -Seconds 1

# Start Docker Desktop
$dockerExe = 'C:\Program Files\Docker\Docker\Docker Desktop.exe'
if (-not (Test-Path $dockerExe)) { 
    Write-Host "Docker executable not found at $dockerExe" -ForegroundColor Red
    exit 2 
}
Write-Host "Starting Docker Desktop"
Start-Process -FilePath $dockerExe

# Wait for docker-desktop to start (max 90 seconds)
$maxWait = 90
$elapsed = 0
$started = $false
while ($elapsed -lt $maxWait) {
    $list = wsl --list --verbose 2>$null
    if ($list -match "docker-desktop\s+Running") { 
        $started = $true
        break 
    }
    Start-Sleep -Seconds 3
    $elapsed += 3
}
if (-not $started) { 
    Write-Host "Docker failed to start within $maxWait seconds" -ForegroundColor Red
    exit 3 
}

# Test docker daemon
Start-Sleep -Seconds 2
try {
    docker version 2>$null | Out-Null
    Write-Host "Docker is responding"
} catch {
    Write-Host "Docker not responding yet" -ForegroundColor Yellow
}

Write-Host "== Docker cleanup complete =="
exit 0

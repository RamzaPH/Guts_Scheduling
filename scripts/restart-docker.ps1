param(
    [switch]$SkipLaunch,
    [int]$StartTimeoutSeconds = 120,
    [switch]$Elevated
)

$ErrorActionPreference = 'Stop'

function Write-Step([string]$message) {
    Write-Host "[docker-fix] $message" -ForegroundColor Cyan
}

function Get-DockerProcessCandidates {
    $processes = @()
    $processNames = @(
        'Docker Desktop',
        'Docker desktop',
        'DockerDesktop',
        'com.docker.backend',
        'com.docker.build',
        'dockerd',
        'vpnkit',
        'docker'
    )

    foreach ($process in Get-Process -ErrorAction SilentlyContinue) {
        if ($process.ProcessName -in $processNames) {
            $processes += $process
        }
    }

    try {
        $wmiMatches = Get-CimInstance Win32_Process | Where-Object {
            $_.Name -match 'Docker|com\.docker|dockerd|vpnkit' -or ($_.CommandLine -and $_.CommandLine -match 'Docker Desktop')
        }

        foreach ($wmiProcess in $wmiMatches) {
            if (-not ($processes | Where-Object { $_.Id -eq $wmiProcess.ProcessId })) {
                try {
                    $processes += (Get-Process -Id $wmiProcess.ProcessId -ErrorAction Stop)
                } catch {
                    $processes += (New-Object PSObject -Property @{ Id = $wmiProcess.ProcessId; ProcessName = $wmiProcess.Name })
                }
            }
        }
    } catch {
        Write-Step "Skipping WMI lookup: $($_.Exception.Message)"
    }

    return $processes | Sort-Object Id -Unique
}

function Stop-DockerProcesses {
    $processes = Get-DockerProcessCandidates
    if (-not $processes -or $processes.Count -eq 0) {
        Write-Step "No lingering Docker processes found."
        return
    }

    Write-Step "Stopping lingering Docker processes: $($processes.ProcessName -join ', ')"
    foreach ($process in $processes) {
        try {
            Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
        } catch {
            Write-Step "Could not stop PID $($process.Id): $($_.Exception.Message)"
        }
    }

    Start-Sleep -Seconds 2

    $remaining = Get-DockerProcessCandidates
    if ($remaining -and $remaining.Count -gt 0) {
        Write-Step "Processes still present after first pass; retrying once."
        foreach ($process in $remaining) {
            try {
                Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
            } catch {
                Write-Step "Second pass could not stop PID $($process.Id): $($_.Exception.Message)"
            }
        }
        Start-Sleep -Seconds 2
    }
}

function Test-DockerResponsive {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        return $false
    }

    try {
        docker info *> $null
        return $LASTEXITCODE -eq 0
    } catch {
        return $false
    }
}

function Test-IsAdministrator {
    $currentIdentity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object System.Security.Principal.WindowsPrincipal($currentIdentity)
    return $principal.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Invoke-ElevatedSelf {
    $scriptPath = $PSCommandPath
    if (-not $scriptPath) {
        Write-Step "Cannot resolve script path for elevation handoff."
        exit 4
    }

    $argumentList = @(
        '-NoProfile'
        '-ExecutionPolicy'
        'Bypass'
        '-File'
        "`"$scriptPath`""
        '-Elevated'
    )

    if ($SkipLaunch) {
        $argumentList += '-SkipLaunch'
    }

    $argumentList += @('-StartTimeoutSeconds', $StartTimeoutSeconds)

    Write-Step "Requesting an elevated helper session to clear protected Docker processes."
    Start-Process -FilePath (Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe') -Verb RunAs -ArgumentList $argumentList
    exit 0
}

function Start-DockerDesktop {
    param(
        [string]$DockerExePath
    )

    if (Test-IsAdministrator) {
        try {
            Start-Service -Name 'com.docker.service' -ErrorAction Stop
            Write-Step "Docker service start requested from an elevated session."
        } catch {
            Write-Step "Could not start com.docker.service directly: $($_.Exception.Message)"
        }

        Start-Process -FilePath $DockerExePath
        return
    }

    Write-Step "Docker service needs elevation; launching Docker Desktop with a UAC prompt."
    Start-Process -FilePath $DockerExePath -Verb RunAs
}

Write-Step "Docker cleanup started"

if (-not $Elevated -and -not (Test-IsAdministrator)) {
    Invoke-ElevatedSelf
}

if (Test-DockerResponsive) {
    Write-Step "Docker is already responding; no cleanup needed."
    exit 0
}

Stop-DockerProcesses

if ($SkipLaunch) {
    Write-Step "Skipping Docker Desktop launch as requested."
    exit 0
}

$dockerExe = 'C:\Program Files\Docker\Docker\Docker Desktop.exe'
if (-not (Test-Path $dockerExe)) {
    Write-Step "Docker executable not found at $dockerExe"
    exit 2
}

Write-Step "Starting Docker Desktop"

if (Test-IsAdministrator) {
    try {
        Start-Service -Name 'com.docker.service' -ErrorAction Stop
        Write-Step "Docker service start requested from an elevated session."
    } catch {
        Write-Step "Could not start com.docker.service directly: $($_.Exception.Message)"
    }

    Start-Process -FilePath $dockerExe
} else {
    Start-DockerDesktop -DockerExePath $dockerExe
}

$elapsed = 0
while ($elapsed -lt $StartTimeoutSeconds) {
    Start-Sleep -Seconds 3
    $elapsed += 3

    if (Test-DockerResponsive) {
        Write-Step "Docker is responding"
        Write-Step "Docker cleanup complete"
        exit 0
    }
}

Write-Step "Docker Desktop started, but the daemon did not respond within $StartTimeoutSeconds seconds."
exit 3

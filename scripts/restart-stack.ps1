param(
  [switch]$NoBuild,
  [switch]$ShowLogs
)

$ErrorActionPreference = "Stop"

function Write-Step([string]$message) {
  Write-Host "[restart] $message" -ForegroundColor Cyan
}

function Require-Command([string]$name) {
  if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
    throw "Required command not found: $name"
  }
}

Require-Command "docker"

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

Write-Step "Restarting Docker stack from $repoRoot"

if ($NoBuild) {
  Write-Step "Using restart-only mode (no image rebuild)"
  docker compose -p guts restart backend frontend
} else {
  Write-Step "Using rebuild mode (recommended before presentations)"
  docker compose -p guts up -d --build backend frontend
}

Write-Step "Current service status"
docker compose -p guts ps

if ($ShowLogs) {
  Write-Step "Tailing recent backend/frontend logs"
  docker compose -p guts logs backend frontend --tail=60
}

Write-Step "Done. App URL: http://localhost:8080"

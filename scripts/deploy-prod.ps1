param(
  [switch]$SkipHealthCheck
)

$ErrorActionPreference = "Stop"

function Write-Step([string]$message) {
  Write-Host "[deploy-prod] $message" -ForegroundColor Cyan
}

function Require-Command([string]$name) {
  if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
    throw "Required command not found: $name"
  }
}

function Ensure-Env([string]$templatePath, [string]$targetPath) {
  if (Test-Path $targetPath) {
    Write-Step "Found existing .env; keeping current values."
    return
  }

  if (-not (Test-Path $templatePath)) {
    throw "Template file missing: $templatePath"
  }

  Copy-Item $templatePath $targetPath
  Write-Step "Created .env from .env.docker.example. Review secrets before exposing to users."
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $repoRoot ".env"
$envTemplate = Join-Path $repoRoot ".env.docker.example"
$appPort = "8080"

Write-Step "Repository root: $repoRoot"
Require-Command "docker"

Ensure-Env $envTemplate $envFile

if (Test-Path $envFile) {
  $appPortLine = Get-Content $envFile | Where-Object { $_ -match '^\s*APP_PORT=' } | Select-Object -First 1
  if ($appPortLine) {
    $appPort = ($appPortLine -split '=', 2)[1].Trim()
  }
}

Push-Location $repoRoot
try {
  Write-Step "Starting production stack (docker-compose.prod.yml)"
  docker compose -p guts -f docker-compose.prod.yml up -d --build

  Write-Step "Service status"
  docker compose -p guts -f docker-compose.prod.yml ps

  if (-not $SkipHealthCheck) {
    Write-Step "Running health checks via frontend entrypoint"
    Invoke-WebRequest -UseBasicParsing "http://localhost:$appPort/api/health" | Out-Null
    Invoke-WebRequest -UseBasicParsing "http://localhost:$appPort/api/health/ready" | Out-Null
    Write-Step "Health checks passed."
  }
}
finally {
  Pop-Location
}

Write-Step "Done. Open http://localhost:$appPort"
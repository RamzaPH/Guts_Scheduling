param(
  [ValidateSet("local", "docker")]
  [string]$Mode = "local",
  [switch]$SkipInstall,
  [switch]$SkipMigrate
)

$ErrorActionPreference = "Stop"

function Write-Step([string]$message) {
  Write-Host "[bootstrap] $message" -ForegroundColor Cyan
}

function Require-Command([string]$name) {
  if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
    throw "Required command not found: $name"
  }
}

function Ensure-FileFromTemplate([string]$templatePath, [string]$targetPath) {
  if (Test-Path $targetPath) {
    Write-Step "Found existing $(Split-Path $targetPath -Leaf); keeping your current values."
    return
  }

  if (-not (Test-Path $templatePath)) {
    throw "Template file missing: $templatePath"
  }

  Copy-Item $templatePath $targetPath
  Write-Step "Created $(Split-Path $targetPath -Leaf) from template."
}

function Add-OrUpdateLine([string]$filePath, [string]$key, [string]$value) {
  $lines = @()
  if (Test-Path $filePath) {
    $lines = Get-Content $filePath
  }

  $matched = $false
  for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match "^\s*$key=") {
      $lines[$i] = "$key=$value"
      $matched = $true
      break
    }
  }

  if (-not $matched) {
    $lines += "$key=$value"
  }

  Set-Content -Path $filePath -Value $lines
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$backendPath = Join-Path $repoRoot "backend"
$frontendPath = Join-Path $repoRoot "frontend"
$backendEnv = Join-Path $backendPath ".env"
$frontendEnv = Join-Path $frontendPath ".env"
$rootDockerEnv = Join-Path $repoRoot ".env"

Write-Step "Repository root: $repoRoot"

if ($Mode -eq "docker") {
  Write-Step "Preparing Docker-based startup"
  Require-Command "docker"

  Ensure-FileFromTemplate (Join-Path $repoRoot ".env.docker.example") $rootDockerEnv

  Push-Location $repoRoot
  try {
    docker compose -p guts up -d --build
  }
  finally {
    Pop-Location
  }

  Write-Step "Docker stack started. Open http://localhost:8080"
  exit 0
}

Write-Step "Preparing local development startup"
Require-Command "node"
Require-Command "npm"

$nodeVersion = node -v
Write-Step "Node version: $nodeVersion"

Ensure-FileFromTemplate (Join-Path $backendPath ".env.example") $backendEnv
Ensure-FileFromTemplate (Join-Path $frontendPath ".env.example") $frontendEnv

Add-OrUpdateLine $backendEnv "NODE_ENV" "development"
Add-OrUpdateLine $backendEnv "DB_SYNC" "false"
Add-OrUpdateLine $backendEnv "SEED_DEFAULT_USERS" "true"
Add-OrUpdateLine $frontendEnv "VITE_API_BASE_URL" "/api"
Add-OrUpdateLine $frontendEnv "VITE_API_PROXY_TARGET" "http://localhost:5000"

if (-not $SkipInstall) {
  Write-Step "Installing backend dependencies"
  Push-Location $backendPath
  try {
    npm install
  }
  finally {
    Pop-Location
  }

  Write-Step "Installing frontend dependencies"
  Push-Location $frontendPath
  try {
    npm install
  }
  finally {
    Pop-Location
  }
}

if (-not $SkipMigrate) {
  Write-Step "Running backend migrations"
  Push-Location $backendPath
  try {
    npm run migrate
  }
  finally {
    Pop-Location
  }
}

Write-Step "Bootstrap complete. Start servers in separate terminals:"
Write-Host "  1) cd backend && npm start"
Write-Host "  2) cd frontend && npm run dev"
Write-Host "  3) Open http://localhost:5173"

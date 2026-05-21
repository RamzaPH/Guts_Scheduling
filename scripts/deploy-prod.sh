#!/usr/bin/env bash
set -euo pipefail

SKIP_HEALTH_CHECK="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-health-check)
      SKIP_HEALTH_CHECK="true"
      shift
      ;;
    *)
      echo "Unknown argument: $1"
      exit 1
      ;;
  esac
done

step() {
  echo "[deploy-prod] $1"
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Required command not found: $1"
    exit 1
  fi
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$REPO_ROOT/.env"
ENV_TEMPLATE="$REPO_ROOT/.env.docker.example"
APP_PORT="8080"

step "Repository root: $REPO_ROOT"
require_cmd docker

if [[ ! -f "$ENV_FILE" ]]; then
  if [[ ! -f "$ENV_TEMPLATE" ]]; then
    echo "Template file missing: $ENV_TEMPLATE"
    exit 1
  fi
  cp "$ENV_TEMPLATE" "$ENV_FILE"
  step "Created .env from .env.docker.example. Review secrets before exposing to users."
else
  step "Found existing .env; keeping current values."
fi

if [[ -f "$ENV_FILE" ]]; then
  app_port_line="$(grep -E '^\s*APP_PORT=' "$ENV_FILE" | head -n 1 || true)"
  if [[ -n "$app_port_line" ]]; then
    APP_PORT="${app_port_line#*=}"
  fi
fi

(
  cd "$REPO_ROOT"
  step "Starting production stack (docker-compose.prod.yml)"
  docker compose -p guts -f docker-compose.prod.yml up -d --build

  step "Service status"
  docker compose -p guts -f docker-compose.prod.yml ps

  if [[ "$SKIP_HEALTH_CHECK" != "true" ]]; then
    step "Running health checks via frontend entrypoint"
    curl -fsS "http://localhost:${APP_PORT}/api/health" >/dev/null
    curl -fsS "http://localhost:${APP_PORT}/api/health/ready" >/dev/null
    step "Health checks passed."
  fi
)

step "Done. Open http://localhost:${APP_PORT}"
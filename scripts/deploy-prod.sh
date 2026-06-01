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

upsert_env_value() {
  local file_path="$1"
  local key="$2"
  local value="$3"
  local temp_file
  temp_file="$(mktemp)"

  if [[ -f "$file_path" ]]; then
    awk -v key="$key" -v value="$value" '
      BEGIN { updated=0 }
      $0 ~ "^[[:space:]]*" key "[[:space:]]*=" {
        print key "=" value
        updated=1
        next
      }
      { print }
      END {
        if (updated == 0) {
          if (NR > 0) {
            print ""
          }
          print key "=" value
        }
      }
    ' "$file_path" > "$temp_file"
    mv "$temp_file" "$file_path"
  else
    printf '%s=%s\n' "$key" "$value" > "$file_path"
  fi
}

ensure_env_contains_value() {
  local file_path="$1"
  local key="$2"
  local required_value="$3"

  if [[ ! -f "$file_path" ]]; then
    return
  fi

  local current_line current_value current_values joined_value
  current_line="$(grep -E "^[[:space:]]*${key}[[:space:]]*=" "$file_path" | head -n 1 || true)"

  if [[ -z "$current_line" ]]; then
    upsert_env_value "$file_path" "$key" "$required_value"
    return
  fi

  current_value="${current_line#*=}"
  current_value="$(printf '%s' "$current_value" | xargs)"

  if [[ -z "$current_value" ]]; then
    upsert_env_value "$file_path" "$key" "$required_value"
    return
  fi

  IFS=',' read -r -a current_values <<< "$current_value"
  for item in "${current_values[@]}"; do
    if [[ "$(printf '%s' "$item" | xargs)" == "$required_value" ]]; then
      return
    fi
  done

  joined_value="${current_value%,}"
  upsert_env_value "$file_path" "$key" "${joined_value},${required_value}"
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

upsert_env_value "$ENV_FILE" "VITE_PUBLIC_QR_BASE_URL" "https://guts-driving.site"
ensure_env_contains_value "$ENV_FILE" "CORS_ALLOWED_ORIGINS" "https://guts-driving.site"

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
#!/usr/bin/env bash
set -euo pipefail

MODE="local"
SKIP_INSTALL="false"
SKIP_MIGRATE="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode)
      MODE="$2"
      shift 2
      ;;
    --skip-install)
      SKIP_INSTALL="true"
      shift
      ;;
    --skip-migrate)
      SKIP_MIGRATE="true"
      shift
      ;;
    *)
      echo "Unknown argument: $1"
      exit 1
      ;;
  esac
done

step() {
  echo "[bootstrap] $1"
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Required command not found: $1"
    exit 1
  fi
}

ensure_file_from_template() {
  local template_path="$1"
  local target_path="$2"

  if [[ -f "$target_path" ]]; then
    step "Found existing $(basename "$target_path"); keeping your current values."
    return
  fi

  if [[ ! -f "$template_path" ]]; then
    echo "Template file missing: $template_path"
    exit 1
  fi

  cp "$template_path" "$target_path"
  step "Created $(basename "$target_path") from template."
}

add_or_update_line() {
  local file_path="$1"
  local key="$2"
  local value="$3"

  if grep -qE "^${key}=" "$file_path"; then
    sed -i.bak "s|^${key}=.*$|${key}=${value}|" "$file_path"
    rm -f "${file_path}.bak"
  else
    echo "${key}=${value}" >> "$file_path"
  fi
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKEND_PATH="$REPO_ROOT/backend"
FRONTEND_PATH="$REPO_ROOT/frontend"

step "Repository root: $REPO_ROOT"

if [[ "$MODE" == "docker" ]]; then
  step "Preparing Docker-based startup"
  require_cmd docker

  ensure_file_from_template "$REPO_ROOT/.env.docker.example" "$REPO_ROOT/.env"

  (cd "$REPO_ROOT" && docker compose -p guts up -d --build)
  step "Docker stack started. Open http://localhost:8080"
  exit 0
fi

step "Preparing local development startup"
require_cmd node
require_cmd npm

step "Node version: $(node -v)"

ensure_file_from_template "$BACKEND_PATH/.env.example" "$BACKEND_PATH/.env"
ensure_file_from_template "$FRONTEND_PATH/.env.example" "$FRONTEND_PATH/.env"

add_or_update_line "$BACKEND_PATH/.env" "NODE_ENV" "development"
add_or_update_line "$BACKEND_PATH/.env" "DB_SYNC" "false"
add_or_update_line "$BACKEND_PATH/.env" "SEED_DEFAULT_USERS" "true"
add_or_update_line "$FRONTEND_PATH/.env" "VITE_API_BASE_URL" "/api"
add_or_update_line "$FRONTEND_PATH/.env" "VITE_API_PROXY_TARGET" "http://localhost:5000"

if [[ "$SKIP_INSTALL" != "true" ]]; then
  step "Installing backend dependencies"
  (cd "$BACKEND_PATH" && npm install)

  step "Installing frontend dependencies"
  (cd "$FRONTEND_PATH" && npm install)
fi

if [[ "$SKIP_MIGRATE" != "true" ]]; then
  step "Running backend migrations"
  (cd "$BACKEND_PATH" && npm run migrate)
fi

step "Bootstrap complete. Start servers in separate terminals:"
echo "  1) cd backend && npm start"
echo "  2) cd frontend && npm run dev"
echo "  3) Open http://localhost:5173"

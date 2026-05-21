#!/usr/bin/env bash
set -euo pipefail

NO_BUILD="false"
SHOW_LOGS="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-build)
      NO_BUILD="true"
      shift
      ;;
    --show-logs)
      SHOW_LOGS="true"
      shift
      ;;
    *)
      echo "Unknown argument: $1"
      exit 1
      ;;
  esac
done

step() {
  echo "[restart] $1"
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Required command not found: $1"
    exit 1
  fi
}

require_cmd docker

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

step "Restarting Docker stack from $REPO_ROOT"

if [[ "$NO_BUILD" == "true" ]]; then
  step "Using restart-only mode (no image rebuild)"
  docker compose -p guts restart backend frontend
else
  step "Using rebuild mode (recommended before presentations)"
  docker compose -p guts up -d --build backend frontend
fi

step "Current service status"
docker compose -p guts ps

if [[ "$SHOW_LOGS" == "true" ]]; then
  step "Tailing recent backend/frontend logs"
  docker compose -p guts logs backend frontend --tail=60
fi

step "Done. App URL: http://localhost:8080"

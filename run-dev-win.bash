#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is not installed or not on PATH."
  exit 1
fi

if docker compose version >/dev/null 2>&1; then
  COMPOSE_CMD=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_CMD=(docker-compose)
else
  echo "Docker Compose is not available."
  exit 1
fi

if [ ! -f .env ] && [ -f template.env ]; then
  cp template.env .env
  echo "Created .env from template.env"
fi

echo "Starting database container..."
"${COMPOSE_CMD[@]}" up -d db

echo "Preparing database..."
"${COMPOSE_CMD[@]}" run --rm web bundle exec rails db:prepare

echo "Starting app on http://localhost:3000 ..."
"${COMPOSE_CMD[@]}" up --build web

#!/bin/bash
# Deploy RouteGuard services using Docker Compose
set -e

DEPLOY_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "=== Deploying RouteGuard ==="
cd "$DEPLOY_DIR"

docker compose pull
docker compose up -d --remove-orphans

echo "=== Running database migrations ==="
docker compose exec routeguard-api /api migrate

echo "=== Deploy complete ==="
docker compose ps

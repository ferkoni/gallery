#!/usr/bin/env bash
set -euo pipefail

RELEASE_URL="https://github.com/OWNER_PLACEHOLDER/gallery/releases/latest/download"

for cmd in docker curl openssl; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "Error: $cmd is required but not installed." >&2
    exit 1
  fi
done

if ! docker compose version &>/dev/null; then
  echo "Error: the docker compose plugin is required." >&2
  exit 1
fi

echo "Downloading docker-compose.yml..."
curl -fsSL "${RELEASE_URL}/docker-compose.yml" -o docker-compose.yml

echo "Downloading setup.sh..."
curl -fsSL "${RELEASE_URL}/setup.sh" -o setup.sh
chmod +x setup.sh

./setup.sh

echo "Pulling images..."
docker compose pull

echo "Starting containers..."
docker compose up -d

echo "Waiting for api to be ready..."
for i in $(seq 1 36); do
  if docker compose ps api 2>/dev/null | grep -q "healthy"; then
    break
  fi
  if [ "$i" = "36" ]; then
    echo "Error: api container did not become healthy within 3 minutes." >&2
    echo "Check logs with: docker compose logs api" >&2
    exit 1
  fi
  sleep 5
done

USER_EXISTS=$(docker compose exec -T api bin/rails runner "print(User.any?)" 2>/dev/null)
if [ "$USER_EXISTS" = "false" ]; then
  echo ""
  echo "No users found. Create your first account:"
  read -rp "Email: " EMAIL
  read -rsp "Password: " PASSWORD
  echo ""

  docker compose exec -T api bin/rails runner \
    "User.create!(email: '${EMAIL}', password: '${PASSWORD}')" || {
    echo "" >&2
    echo "Failed to create account. Re-run this script to try again." >&2
    exit 1
  }
fi

echo ""
echo "Gallery is running at http://localhost:8080"

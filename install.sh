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
  # Inspect the status directly — `docker compose ps | grep healthy` also
  # matches "unhealthy", so a failed container would read as ready.
  cid="$(docker compose ps -q api 2>/dev/null || true)"
  if [ -n "$cid" ] && [ "$(docker inspect -f '{{.State.Health.Status}}' "$cid" 2>/dev/null)" = "healthy" ]; then
    break
  fi
  if [ "$i" = "36" ]; then
    echo "Error: api container did not become healthy within 3 minutes." >&2
    echo "Check logs with: docker compose logs api" >&2
    exit 1
  fi
  sleep 5
done

# `< /dev/null` on every exec: under `curl ... | bash` stdin is the remaining
# script text, and `docker compose exec` would otherwise swallow it, silently
# ending the install partway through.
USER_EXISTS="$(docker compose exec -T api bin/rails runner "print(User.any?)" </dev/null 2>/dev/null || true)"
if [ "$USER_EXISTS" = "false" ]; then
  # This script is normally run as `curl ... | bash`, where stdin is the
  # script text itself — a bare `read` hits EOF and returns empty instead of
  # prompting. Read from the terminal explicitly.
  if ! ( : < /dev/tty ) 2>/dev/null; then
    echo "" >&2
    echo "No users found, and there is no terminal to prompt on." >&2
    echo "Create the first account with:" >&2
    echo "  docker compose exec -T -e E=you@example.com -e P=yourpassword api \\" >&2
    echo "    bin/rails runner 'User.create!(email: ENV.fetch(\"E\"), password: ENV.fetch(\"P\"))'" >&2
    exit 1
  fi

  echo ""
  echo "No users found. Create your first account:"
  read -rp "Email: " EMAIL < /dev/tty
  read -rsp "Password: " PASSWORD < /dev/tty
  echo ""

  # Passed through the environment rather than interpolated into the Ruby
  # string, so quotes in the password cannot break or inject into it.
  docker compose exec -T -e SEED_EMAIL="$EMAIL" -e SEED_PASSWORD="$PASSWORD" api \
    bin/rails runner \
    'User.create!(email: ENV.fetch("SEED_EMAIL"), password: ENV.fetch("SEED_PASSWORD"))' </dev/null || {
    echo "" >&2
    echo "Failed to create account. Re-run this script to try again." >&2
    exit 1
  }
fi

echo ""
echo "Gallery is running at http://localhost:8080"

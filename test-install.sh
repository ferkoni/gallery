#!/usr/bin/env bash
#
# Exercise the production Docker stack locally, without a GitHub Release.
#
# This is install.sh minus the download step: it builds both images from the
# working tree, then drives the real docker-compose.yml and setup.sh from a
# throwaway directory. That directory name becomes the Compose project name,
# which is what keeps the stack's volume separate from the gallery-api/ dev
# database (gallery-api_postgres_data). Never point TEST_DIR at the repo.
#
# Usage:
#   ./test-install.sh              # build, start, seed a user
#   ./test-install.sh --skip-build # reuse the images already built
#   ./test-install.sh down         # stop and delete the test stack + its volume
#
# Overrides: TEST_DIR, SEED_EMAIL, SEED_PASSWORD, HOST_PORT

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEST_DIR="${TEST_DIR:-$HOME/gallery-test}"
SEED_EMAIL="${SEED_EMAIL:-test@example.com}"
SEED_PASSWORD="${SEED_PASSWORD:-secret123}"
HOST_PORT="${HOST_PORT:-8080}"

API_IMAGE="ghcr.io/local/gallery-api:test"
NGINX_IMAGE="ghcr.io/local/gallery-nginx:test"

# A test dir inside the repo would overwrite tracked files, and under
# gallery-api/ it would collide with the dev database volume outright.
case "$(readlink -m "$TEST_DIR")/" in
  "$REPO_ROOT"/*) echo "Refusing to use a TEST_DIR inside the repo: $TEST_DIR" >&2; exit 1 ;;
esac

compose() { (cd "$TEST_DIR" && docker compose "$@"); }

# True once this test stack is up, so a re-run does not mistake its own
# published port for a conflict.
stack_running() {
  [ -f "$TEST_DIR/docker-compose.yml" ] && [ -n "$(compose ps -q nginx 2>/dev/null)" ]
}

teardown() {
  if [ ! -f "$TEST_DIR/docker-compose.yml" ]; then
    echo "Nothing to tear down at $TEST_DIR."
    exit 0
  fi
  echo "Removing the test stack and its volume (dev data is in a different volume)..."
  compose down -v
  rm -rf "$TEST_DIR"
  echo "Done."
}

if [ "${1:-}" = "down" ]; then
  teardown
  exit 0
fi

if [ "${1:-}" != "--skip-build" ]; then
  echo "Building $API_IMAGE..."
  docker build -t "$API_IMAGE" "$REPO_ROOT/gallery-api"
  echo "Building $NGINX_IMAGE..."
  docker build -f "$REPO_ROOT/nginx/Dockerfile" -t "$NGINX_IMAGE" "$REPO_ROOT"
fi

if ! stack_running &&
   (ss -ltn 2>/dev/null || netstat -ltn 2>/dev/null) | grep -q ":${HOST_PORT} "; then
  echo "Error: port ${HOST_PORT} is already in use. Set HOST_PORT to something else." >&2
  exit 1
fi

mkdir -p "$TEST_DIR"
cp "$REPO_ROOT/docker-compose.yml" "$REPO_ROOT/setup.sh" "$TEST_DIR/"

(cd "$TEST_DIR" && ./setup.sh)

# GHCR_OWNER and VERSION are substituted by the release workflow; supply them
# here so the compose file resolves to the locally built images.
if ! grep -q '^GHCR_OWNER=' "$TEST_DIR/.env"; then
  printf 'GHCR_OWNER=local\nVERSION=test\n' >> "$TEST_DIR/.env"
fi

echo "Starting containers..."
compose up -d

echo "Waiting for api to be healthy..."
for i in $(seq 1 36); do
  cid="$(compose ps -q api)"
  if [ -n "$cid" ] && [ "$(docker inspect -f '{{.State.Health.Status}}' "$cid")" = "healthy" ]; then
    break
  fi
  if [ "$i" = "36" ]; then
    echo "Error: api did not become healthy within 3 minutes." >&2
    compose logs api | tail -30 >&2
    exit 1
  fi
  sleep 5
done

# Passed through the environment rather than interpolated into the Ruby
# string, so quotes in the password cannot break or inject into it.
compose exec -T -e SEED_EMAIL="$SEED_EMAIL" -e SEED_PASSWORD="$SEED_PASSWORD" api \
  bin/rails runner \
  'User.any? ? print("user already exists") : (User.create!(email: ENV.fetch("SEED_EMAIL"), password: ENV.fetch("SEED_PASSWORD")); print("user created"))'
echo ""

echo ""
echo "Gallery is running at http://localhost:${HOST_PORT}"
echo "  Login:    ${SEED_EMAIL} / ${SEED_PASSWORD}"
echo "  Logs:     (cd ${TEST_DIR} && docker compose logs -f)"
echo "  Teardown: ${BASH_SOURCE[0]} down"

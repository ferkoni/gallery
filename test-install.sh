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
#   ./test-install.sh              # build, start, seed a user, smoke-test
#   ./test-install.sh --skip-build # reuse the images already built
#   ./test-install.sh smoke        # assert against a stack that is already up
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

# Two assertions about the deployed shape, both unauthenticated on purpose: no bucket, no
# login, no photo, no S3 spend. 401 means the body crossed nginx and reached Rails, because
# authentication is decided before the body is read (spec/requests/api_routes_spec.rb).
# Booting the stack proves nothing about uploads on its own, which is how the 1 MB default in
# nginx.conf survived a release (docs: upload-size-limit/).
smoke() {
  # The port comes from Compose, not from HOST_PORT: docker-compose.yml publishes 8080:80
  # literally, so HOST_PORT only drives the conflict check and the summary below. Asking the
  # running stack is right whatever that file says.
  local addr code
  addr="$(compose port nginx 80)"
  local url="http://localhost:${addr##*:}/api/v1/images"

  # 3 MB: over nginx's 1 MB default, under the 30m ceiling. A 413 here is the bug.
  head -c 3000000 /dev/zero > "$TEST_DIR/3mb.bin"
  # --max-time so a wedged stack fails the check instead of hanging it; a timeout prints 000.
  code="$(curl -s -o /dev/null -m 60 -w '%{http_code}' -X POST --data-binary "@$TEST_DIR/3mb.bin" "$url" || true)"
  if [ "$code" != "401" ]; then
    echo "Smoke: expected 401 for a 3 MB body, got $code" >&2
    [ "$code" = "413" ] && echo "  413 means nginx refused it: check client_max_body_size in nginx/nginx.conf." >&2
    rm -f "$TEST_DIR/3mb.bin"
    exit 1
  fi

  # And the ceiling still exists.
  head -c 40000000 /dev/zero > "$TEST_DIR/40mb.bin"
  code="$(curl -s -o /dev/null -m 60 -w '%{http_code}' -X POST --data-binary "@$TEST_DIR/40mb.bin" "$url" || true)"
  if [ "$code" != "413" ]; then
    echo "Smoke: expected 413 for a 40 MB body, got $code" >&2
    rm -f "$TEST_DIR/3mb.bin" "$TEST_DIR/40mb.bin"
    exit 1
  fi

  rm -f "$TEST_DIR/3mb.bin" "$TEST_DIR/40mb.bin"
  echo "Smoke: a 3 MB body reaches the API (401) and a 40 MB body is refused (413)."
}

if [ "${1:-}" = "down" ]; then
  teardown
  exit 0
fi

# Assert against a stack that is already up, without rebuilding or reseeding.
if [ "${1:-}" = "smoke" ]; then
  stack_running || { echo "No stack at $TEST_DIR. Run ${BASH_SOURCE[0]} first." >&2; exit 1; }
  smoke
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
cp "$REPO_ROOT/docker-compose.yml" "$REPO_ROOT/docker-compose.cpu.yml" "$REPO_ROOT/setup.sh" "$TEST_DIR/"

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

smoke

echo ""
echo "Gallery is running at http://localhost:${HOST_PORT}"
echo "  Login:    ${SEED_EMAIL} / ${SEED_PASSWORD}"
echo "  Logs:     (cd ${TEST_DIR} && docker compose logs -f)"
echo "  Teardown: ${BASH_SOURCE[0]} down"

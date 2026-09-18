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

# Unused unless .env's COMPOSE_FILE names it (AI search without an NVIDIA GPU).
# Fetched on every run anyway, so an update refreshes it along with the rest.
echo "Downloading docker-compose.cpu.yml..."
curl -fsSL "${RELEASE_URL}/docker-compose.cpu.yml" -o docker-compose.cpu.yml

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
#
# Answered by exit status, never by parsing output: a production Rails boot logs to
# stdout, so anything it prints arrives mixed with log lines. (It did: an Active
# Storage warning in front of "false" meant the prompt below never ran, and the
# install finished with no account — docs: closed-signup/01.) 0 = accounts exist,
# 2 = none, anything else = the check itself failed.
USERS_STATUS=0
docker compose exec -T api bin/rails runner 'exit(User.exists? ? 0 : 2)' </dev/null >/dev/null 2>&1 || USERS_STATUS=$?

# There is no sign-up page: an account is made on this machine or not at all
# (docs: closed-signup/02). Printed wherever the prompt below cannot finish.
first_account_help() {
  echo "Create the first account with:" >&2
  echo "  EMAIL=you@example.com PASSWORD='your password' \\" >&2
  echo "    docker compose exec -T -e EMAIL -e PASSWORD api bin/rails users:create" >&2
}

case "$USERS_STATUS" in
  0) ;;
  2)
    # This script is normally run as `curl ... | bash`, where stdin is the
    # script text itself — a bare `read` hits EOF and returns empty instead of
    # prompting. Read from the terminal explicitly.
    if ! ( : < /dev/tty ) 2>/dev/null; then
      echo "" >&2
      echo "No users found, and there is no terminal to prompt on." >&2
      first_account_help
      exit 1
    fi

    echo ""
    echo "No users found. Create your first account:"
    created=false
    for attempt in 1 2 3; do
      read -rp "Email: " EMAIL < /dev/tty
      # Hidden, so asked twice: a typo here is an account nobody can log in to.
      read -rsp "Password: " PASSWORD < /dev/tty
      echo ""
      read -rsp "Password again: " CONFIRM < /dev/tty
      echo ""
      if [ "$PASSWORD" != "$CONFIRM" ]; then
        echo "The passwords did not match." >&2
        continue
      fi

      # Passed through the environment, never interpolated, so quotes in the
      # password cannot break anything; and `-e NAME` with no value copies it from
      # this command's environment, so the password is not in docker's argv either.
      # users:create explains a refusal itself ("Password is too short ...").
      if EMAIL="$EMAIL" PASSWORD="$PASSWORD" \
           docker compose exec -T -e EMAIL -e PASSWORD api bin/rails users:create </dev/null; then
        created=true
        break
      fi
    done

    if [ "$created" != true ]; then
      echo "" >&2
      echo "No account was created." >&2
      first_account_help
      exit 1
    fi
    ;;
  *)
    # The check itself failed. Carrying on would finish an install with no account
    # and no way to make one from the browser.
    echo "" >&2
    echo "Could not check for existing accounts: the api did not answer." >&2
    echo "Its logs: docker compose logs api" >&2
    first_account_help
    exit 1
    ;;
esac

echo ""
echo "Gallery is running at http://localhost:8080"

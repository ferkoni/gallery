#!/usr/bin/env bash
set -euo pipefail

if [ -f .env ]; then
  echo ".env already exists — skipping secret generation."
  exit 0
fi

echo "Generating .env..."

POSTGRES_PASSWORD="$(openssl rand -hex 32)"

# .env holds SECRET_KEY_BASE, the database password and the Active Record
# encryption keys, so keep it off other accounts on this machine.
umask 077

cat > .env <<EOF
# Origin you browse the app from. Action Cable refuses WebSocket connections
# from any other origin, so change this if you reach the app from another
# machine (e.g. http://192.168.1.50:8080). Comma-separated for several.
CORS_ALLOWED_ORIGINS=http://localhost:8080

# AI search. Off by default: keyword matching only, no model downloaded, no GPU
# needed, no extra container. To search photos by what is in them, set
# INFERENCE_MODE=local AND uncomment COMPOSE_PROFILES, then run: docker compose up -d
# The first tells the app to use the AI container; the second starts it. Either
# one alone does nothing, and says nothing. See "Enabling AI search" in the README.
INFERENCE_MODE=none
# COMPOSE_PROFILES=inference
# No NVIDIA GPU? Uncomment this too, to run it on the CPU (about 3x slower):
# COMPOSE_FILE=docker-compose.yml:docker-compose.cpu.yml

SECRET_KEY_BASE=$(openssl rand -hex 64)
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
GALLERY_API_DATABASE_PASSWORD=${POSTGRES_PASSWORD}
ACTIVE_RECORD_ENCRYPTION_PRIMARY_KEY=$(openssl rand -hex 32)
ACTIVE_RECORD_ENCRYPTION_DETERMINISTIC_KEY=$(openssl rand -hex 32)
ACTIVE_RECORD_ENCRYPTION_KEY_DERIVATION_SALT=$(openssl rand -hex 32)
EOF

chmod 600 .env

echo "Done. Secrets written to .env."

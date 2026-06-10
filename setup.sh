#!/usr/bin/env bash
set -euo pipefail

if [ -f .env ]; then
  echo ".env already exists — skipping secret generation."
  exit 0
fi

echo "Generating .env..."

POSTGRES_PASSWORD="$(openssl rand -hex 32)"

cat > .env <<EOF
SECRET_KEY_BASE=$(openssl rand -hex 64)
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
GALLERY_API_DATABASE_PASSWORD=${POSTGRES_PASSWORD}
ACTIVE_RECORD_ENCRYPTION_PRIMARY_KEY=$(openssl rand -hex 32)
ACTIVE_RECORD_ENCRYPTION_DETERMINISTIC_KEY=$(openssl rand -hex 32)
ACTIVE_RECORD_ENCRYPTION_KEY_DERIVATION_SALT=$(openssl rand -hex 32)
EOF

echo "Done. Secrets written to .env."

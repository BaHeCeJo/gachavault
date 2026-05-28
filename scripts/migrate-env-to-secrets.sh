#!/usr/bin/env bash
# Convert a legacy /opt/gachavault/.env (or .env.prod) into Docker-secret
# files under /opt/gachavault/secrets/. Run once on the VPS during the
# cutover; idempotent (skips any file that already exists).
#
# Usage:
#   sudo bash scripts/migrate-env-to-secrets.sh /opt/gachavault/.env
#
# After this finishes, you can `docker compose -f docker-compose.prod.yml
# up -d` and remove the .env file. The plain env vars in compose were
# replaced with *_FILE: /run/secrets/<name> references.

set -euo pipefail

ENV_FILE="${1:-/opt/gachavault/.env}"
SECRETS_DIR="$(dirname "$ENV_FILE")/secrets"

if [ ! -f "$ENV_FILE" ]; then
  echo "env file not found: $ENV_FILE" >&2
  exit 1
fi

mkdir -p "$SECRETS_DIR"
chmod 700 "$SECRETS_DIR"

# Source the env file in a subshell so its vars are local to this script.
set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

write_secret() {
  local name="$1"
  local value="$2"
  local path="$SECRETS_DIR/$name"
  if [ -z "$value" ]; then
    echo "skip $name (empty)"
    return
  fi
  if [ -f "$path" ]; then
    echo "skip $name (already exists)"
    return
  fi
  printf '%s' "$value" > "$path"
  chmod 600 "$path"
  echo "wrote $path"
}

# Atomic secrets (one value per file)
write_secret postgres_password     "${POSTGRES_PASSWORD:-}"
write_secret redis_password        "${REDIS_PASSWORD:-}"
write_secret jwt_secret            "${JWT_SECRET:-}"
write_secret internal_secret       "${INTERNAL_SECRET:-}"
write_secret meilisearch_master_key "${MEILISEARCH_MASTER_KEY:-}"
write_secret google_client_secret  "${GOOGLE_CLIENT_SECRET:-}"
write_secret smtp_password         "${SMTP_PASSWORD:-}"

# Compound secrets — built from parts so a password rotation only needs
# to touch one file but the URL forms are still available to apps that
# expect a single DSN string.
write_secret database_url \
  "postgres://gachavault:${POSTGRES_PASSWORD:-}@postgres:5432/gachavault"
write_secret redis_url \
  "redis://:${REDIS_PASSWORD:-}@redis:6379"

echo
echo "Done. Verify with: ls -la $SECRETS_DIR"
echo "Remaining env-only vars (kept in .env): FRONTEND_URL, BACKEND_URL,"
echo "GOOGLE_CLIENT_ID, SMTP_HOST, SMTP_PORT, SMTP_USERNAME, FROM_EMAIL,"
echo "GHCR_OWNER. These are config, not secrets."

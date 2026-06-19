#!/usr/bin/env bash
# Convert a legacy /opt/gachavault/.env into Docker-secret files under
# /opt/gachavault/secrets/. Run once on the VPS during the cutover;
# idempotent (skips any file that already exists, never overwrites).
#
# Usage:
#   sudo bash scripts/migrate-env-to-secrets.sh /opt/gachavault/.env
#
# After this finishes, you can `docker compose -f docker-compose.prod.yml
# up -d` and remove the secret values from .env. The plain env vars in
# compose were replaced with *_FILE: /run/secrets/<name> references.

set -euo pipefail

ENV_FILE="${1:-/opt/gachavault/.env}"
SECRETS_DIR="$(dirname "$ENV_FILE")/secrets"

if [ ! -f "$ENV_FILE" ]; then
  echo "env file not found: $ENV_FILE" >&2
  exit 1
fi
if [ ! -r "$ENV_FILE" ]; then
  echo "env file not readable: $ENV_FILE (run with sudo)" >&2
  exit 1
fi

mkdir -p "$SECRETS_DIR"
chmod 700 "$SECRETS_DIR"

# Parse <KEY>=<VALUE> lines without sourcing the file (sourcing breaks on
# anything that looks like a heredoc or shell special token). Comments,
# blank lines, and `export KEY=...` prefixes are tolerated. Surrounding
# single or double quotes on the value are stripped.
get_env_value() {
  local target="$1"
  local line key value
  while IFS= read -r line || [ -n "$line" ]; do
    # Strip a leading 'export ' if present
    line="${line#export }"
    # Skip comments and blanks
    case "$line" in
      ''|\#*) continue ;;
    esac
    # Must contain an '='
    case "$line" in
      *=*) ;;
      *) continue ;;
    esac
    key="${line%%=*}"
    # Trim trailing whitespace on the key
    key="${key%"${key##*[![:space:]]}"}"
    if [ "$key" = "$target" ]; then
      value="${line#*=}"
      # Strip surrounding double quotes
      if [ "${value#\"}" != "$value" ] && [ "${value%\"}" != "$value" ]; then
        value="${value#\"}"
        value="${value%\"}"
      fi
      # Strip surrounding single quotes
      if [ "${value#\'}" != "$value" ] && [ "${value%\'}" != "$value" ]; then
        value="${value#\'}"
        value="${value%\'}"
      fi
      printf '%s' "$value"
      return 0
    fi
  done < "$ENV_FILE"
  return 1
}

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

POSTGRES_PASSWORD="$(get_env_value POSTGRES_PASSWORD || true)"
REDIS_PASSWORD="$(get_env_value REDIS_PASSWORD || true)"
JWT_SECRET="$(get_env_value JWT_SECRET || true)"
INTERNAL_SECRET="$(get_env_value INTERNAL_SECRET || true)"
MEILISEARCH_MASTER_KEY="$(get_env_value MEILISEARCH_MASTER_KEY || true)"
GOOGLE_CLIENT_SECRET="$(get_env_value GOOGLE_CLIENT_SECRET || true)"
SMTP_PASSWORD="$(get_env_value SMTP_PASSWORD || true)"
GRAFANA_ADMIN_PASSWORD="$(get_env_value GRAFANA_ADMIN_PASSWORD || true)"

# Auto-generate Grafana admin password on first run if it isn't in .env.
# Lets the observability stack come up cleanly without manual setup.
if [ -z "$GRAFANA_ADMIN_PASSWORD" ] && [ ! -f "$SECRETS_DIR/grafana_admin_password" ]; then
  GRAFANA_ADMIN_PASSWORD="$(head -c 24 /dev/urandom | base64 | tr -d '/+=' | head -c 24)"
  echo "generated grafana_admin_password (24 random chars) — save the printed value:"
  echo "  $GRAFANA_ADMIN_PASSWORD"
fi

# Atomic secrets (one value per file)
write_secret postgres_password      "$POSTGRES_PASSWORD"
write_secret redis_password         "$REDIS_PASSWORD"
write_secret jwt_secret             "$JWT_SECRET"
write_secret internal_secret        "$INTERNAL_SECRET"
write_secret meilisearch_master_key "$MEILISEARCH_MASTER_KEY"
write_secret google_client_secret   "$GOOGLE_CLIENT_SECRET"
write_secret smtp_password          "$SMTP_PASSWORD"
write_secret grafana_admin_password "$GRAFANA_ADMIN_PASSWORD"

# Compound secrets — built from parts so a password rotation only needs
# to touch one file but the URL forms are still available to apps that
# expect a single DSN string.
if [ -n "$POSTGRES_PASSWORD" ]; then
  write_secret database_url \
    "postgres://gachavault:${POSTGRES_PASSWORD}@postgres:5432/gachavault"
fi
if [ -n "$REDIS_PASSWORD" ]; then
  write_secret redis_url \
    "redis://:${REDIS_PASSWORD}@redis:6379"
fi

# Hand ownership of every secret file to the container's appuser
# (uid 10000). Service containers dropped to non-root, and Docker Compose
# `file:`-source secrets are bind-mounted into /run/secrets/<name> with
# host ownership preserved, so root-owned files become unreadable to the
# non-root process. chown'ing to 10000 keeps mode 600 effective — only
# the matching container UID can read — without widening the at-rest
# perms. Apply to every file (not just newly written ones) so existing
# secrets created by earlier runs get fixed on the next deploy.
chown -R 10000:10000 "$SECRETS_DIR" 2>/dev/null || true

# Grafana is the one consumer that does NOT run as appuser uid 10000 — its
# image runs as uid 472. A 600/uid-10000 file is therefore unreadable to it
# and Grafana crash-loops with "/run/secrets/grafana_admin_password:
# Permission denied". Widen just this one file to world-readable (0444). The
# SECRETS_DIR itself stays 700/uid-10000, so the value is still protected at
# the directory level on the host; only the in-container bind-mount (which
# Docker mounts the file directly into) becomes readable by uid 472.
if [ -f "$SECRETS_DIR/grafana_admin_password" ]; then
  chmod 0444 "$SECRETS_DIR/grafana_admin_password" 2>/dev/null || true
fi

echo
echo "Done. Verify with: ls -la $SECRETS_DIR"
echo "Remaining env-only vars (kept in .env): FRONTEND_URL, BACKEND_URL,"
echo "GOOGLE_CLIENT_ID, SMTP_HOST, SMTP_PORT, SMTP_USERNAME, FROM_EMAIL,"
echo "GHCR_OWNER. These are config, not secrets."

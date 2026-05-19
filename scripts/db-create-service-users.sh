#!/bin/sh
# Run this once after all services have started (schemas must exist first).
# Usage: docker exec gachawiki-postgres-1 sh /scripts/db-create-service-users.sh
#
# Required env vars (set on the postgres container or pass via -e):
#   AUTH_SVC_PASSWORD, GAMES_SVC_PASSWORD, ITEMS_SVC_PASSWORD,
#   COLLECTIONS_SVC_PASSWORD, TIERLISTS_SVC_PASSWORD, MEDIA_SVC_PASSWORD
set -e

AUTH_PW="${AUTH_SVC_PASSWORD:?AUTH_SVC_PASSWORD required}"
GAMES_PW="${GAMES_SVC_PASSWORD:?GAMES_SVC_PASSWORD required}"
ITEMS_PW="${ITEMS_SVC_PASSWORD:?ITEMS_SVC_PASSWORD required}"
COLL_PW="${COLLECTIONS_SVC_PASSWORD:?COLLECTIONS_SVC_PASSWORD required}"
TL_PW="${TIERLISTS_SVC_PASSWORD:?TIERLISTS_SVC_PASSWORD required}"
MEDIA_PW="${MEDIA_SVC_PASSWORD:?MEDIA_SVC_PASSWORD required}"

DB="${POSTGRES_DB:-gachavault}"

psql -v ON_ERROR_STOP=1 -U "${POSTGRES_USER:-gachavault}" -d "$DB" <<SQL

-- ── Create service users (idempotent) ──────────────────────────────────────
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'auth_svc') THEN
    CREATE USER auth_svc WITH PASSWORD '${AUTH_PW}';
  ELSE
    ALTER USER auth_svc WITH PASSWORD '${AUTH_PW}';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'games_svc') THEN
    CREATE USER games_svc WITH PASSWORD '${GAMES_PW}';
  ELSE
    ALTER USER games_svc WITH PASSWORD '${GAMES_PW}';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'items_svc') THEN
    CREATE USER items_svc WITH PASSWORD '${ITEMS_PW}';
  ELSE
    ALTER USER items_svc WITH PASSWORD '${ITEMS_PW}';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'collections_svc') THEN
    CREATE USER collections_svc WITH PASSWORD '${COLL_PW}';
  ELSE
    ALTER USER collections_svc WITH PASSWORD '${COLL_PW}';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tierlists_svc') THEN
    CREATE USER tierlists_svc WITH PASSWORD '${TL_PW}';
  ELSE
    ALTER USER tierlists_svc WITH PASSWORD '${TL_PW}';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'media_svc') THEN
    CREATE USER media_svc WITH PASSWORD '${MEDIA_PW}';
  ELSE
    ALTER USER media_svc WITH PASSWORD '${MEDIA_PW}';
  END IF;
END
\$\$;

-- ── Revoke default public schema access ────────────────────────────────────
REVOKE ALL ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON DATABASE ${DB} FROM PUBLIC;

-- ── auth_svc: auth schema only ─────────────────────────────────────────────
GRANT CONNECT ON DATABASE ${DB} TO auth_svc;
GRANT USAGE, CREATE ON SCHEMA auth TO auth_svc;
GRANT ALL ON ALL TABLES     IN SCHEMA auth TO auth_svc;
GRANT ALL ON ALL SEQUENCES  IN SCHEMA auth TO auth_svc;
ALTER DEFAULT PRIVILEGES IN SCHEMA auth GRANT ALL ON TABLES    TO auth_svc;
ALTER DEFAULT PRIVILEGES IN SCHEMA auth GRANT ALL ON SEQUENCES TO auth_svc;

-- ── games_svc: games schema only ───────────────────────────────────────────
GRANT CONNECT ON DATABASE ${DB} TO games_svc;
GRANT USAGE, CREATE ON SCHEMA games TO games_svc;
GRANT ALL ON ALL TABLES     IN SCHEMA games TO games_svc;
GRANT ALL ON ALL SEQUENCES  IN SCHEMA games TO games_svc;
ALTER DEFAULT PRIVILEGES IN SCHEMA games GRANT ALL ON TABLES    TO games_svc;
ALTER DEFAULT PRIVILEGES IN SCHEMA games GRANT ALL ON SEQUENCES TO games_svc;

-- ── items_svc: items schema only ───────────────────────────────────────────
GRANT CONNECT ON DATABASE ${DB} TO items_svc;
GRANT USAGE, CREATE ON SCHEMA items TO items_svc;
GRANT ALL ON ALL TABLES     IN SCHEMA items TO items_svc;
GRANT ALL ON ALL SEQUENCES  IN SCHEMA items TO items_svc;
ALTER DEFAULT PRIVILEGES IN SCHEMA items GRANT ALL ON TABLES    TO items_svc;
ALTER DEFAULT PRIVILEGES IN SCHEMA items GRANT ALL ON SEQUENCES TO items_svc;
-- items-service validates search sync via items.items; no other schema needed

-- ── collections_svc: collections schema only ──────────────────────────────
GRANT CONNECT ON DATABASE ${DB} TO collections_svc;
GRANT USAGE, CREATE ON SCHEMA collections TO collections_svc;
GRANT ALL ON ALL TABLES     IN SCHEMA collections TO collections_svc;
GRANT ALL ON ALL SEQUENCES  IN SCHEMA collections TO collections_svc;
ALTER DEFAULT PRIVILEGES IN SCHEMA collections GRANT ALL ON TABLES    TO collections_svc;
ALTER DEFAULT PRIVILEGES IN SCHEMA collections GRANT ALL ON SEQUENCES TO collections_svc;

-- ── tierlists_svc: tierlists schema only ──────────────────────────────────
GRANT CONNECT ON DATABASE ${DB} TO tierlists_svc;
GRANT USAGE, CREATE ON SCHEMA tierlists TO tierlists_svc;
GRANT ALL ON ALL TABLES     IN SCHEMA tierlists TO tierlists_svc;
GRANT ALL ON ALL SEQUENCES  IN SCHEMA tierlists TO tierlists_svc;
ALTER DEFAULT PRIVILEGES IN SCHEMA tierlists GRANT ALL ON TABLES    TO tierlists_svc;
ALTER DEFAULT PRIVILEGES IN SCHEMA tierlists GRANT ALL ON SEQUENCES TO tierlists_svc;

-- ── media_svc: media schema only ───────────────────────────────────────────
GRANT CONNECT ON DATABASE ${DB} TO media_svc;
GRANT USAGE, CREATE ON SCHEMA media TO media_svc;
GRANT ALL ON ALL TABLES     IN SCHEMA media TO media_svc;
GRANT ALL ON ALL SEQUENCES  IN SCHEMA media TO media_svc;
ALTER DEFAULT PRIVILEGES IN SCHEMA media GRANT ALL ON TABLES    TO media_svc;
ALTER DEFAULT PRIVILEGES IN SCHEMA media GRANT ALL ON SEQUENCES TO media_svc;

-- ── Verify isolation (informational) ──────────────────────────────────────
DO \$\$
DECLARE
  r RECORD;
BEGIN
  RAISE NOTICE 'Service users created:';
  FOR r IN SELECT rolname FROM pg_roles WHERE rolname LIKE '%_svc' ORDER BY rolname LOOP
    RAISE NOTICE '  %', r.rolname;
  END LOOP;
END
\$\$;
SQL

echo "Done. Service users created and granted schema-level access."
echo "Next: update DATABASE_URL for each service in docker-compose (see .env.example)."

#!/bin/sh
# Usage: ./scripts/db-restore.sh <backup-file.sql.gz>
# Restores a gzipped pg_dump into the running postgres container.
set -e

BACKUP_FILE="$1"
CONTAINER="${POSTGRES_CONTAINER:-gachawiki-postgres-1}"
PGUSER="${PGUSER:-gachavault}"
PGDATABASE="${PGDATABASE:-gachavault}"

if [ -z "$BACKUP_FILE" ]; then
    echo "Usage: $0 <backup-file.sql.gz>"
    exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
    echo "Error: file not found: $BACKUP_FILE"
    exit 1
fi

echo "Restoring $BACKUP_FILE into $CONTAINER ($PGDATABASE)..."
echo "WARNING: this will overwrite existing data. Press Ctrl-C to abort (5s)..."
sleep 5

gunzip -c "$BACKUP_FILE" | docker exec -i "$CONTAINER" psql -U "$PGUSER" "$PGDATABASE"

echo "Restore complete."

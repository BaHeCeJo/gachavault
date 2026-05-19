#!/bin/sh
set -e

BACKUP_DIR="${BACKUP_DIR:-/backups}"
KEEP_DAYS="${KEEP_DAYS:-7}"
PGHOST="${PGHOST:-postgres}"
PGUSER="${PGUSER:-gachavault}"
PGDATABASE="${PGDATABASE:-gachavault}"
BACKUP_INTERVAL="${BACKUP_INTERVAL:-86400}"

mkdir -p "$BACKUP_DIR"

run_backup() {
    TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    FILENAME="$BACKUP_DIR/gachavault_${TIMESTAMP}.sql.gz"
    echo "[backup] Starting pg_dump at $(date)"
    PGPASSWORD="$POSTGRES_PASSWORD" pg_dump \
        -h "$PGHOST" \
        -U "$PGUSER" \
        --no-password \
        --format=plain \
        --clean \
        --if-exists \
        "$PGDATABASE" | gzip > "$FILENAME"
    SIZE=$(du -sh "$FILENAME" | cut -f1)
    echo "[backup] Saved: $FILENAME ($SIZE)"
    find "$BACKUP_DIR" -name "gachavault_*.sql.gz" -mtime "+${KEEP_DAYS}" -delete
    KEPT=$(find "$BACKUP_DIR" -name "gachavault_*.sql.gz" | wc -l)
    echo "[backup] Retention: keeping ${KEPT} backup(s), pruning files older than ${KEEP_DAYS} days"
}

echo "[backup] Container started — first backup in 60s (then every ${BACKUP_INTERVAL}s)"
sleep 60
run_backup

while true; do
    sleep "$BACKUP_INTERVAL"
    run_backup
done

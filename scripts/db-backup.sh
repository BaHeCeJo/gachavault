#!/bin/sh
set -e

BACKUP_DIR="${BACKUP_DIR:-/backups}"
KEEP_DAYS="${KEEP_DAYS:-7}"
PGHOST="${PGHOST:-postgres}"
PGUSER="${PGUSER:-gachavault}"
PGDATABASE="${PGDATABASE:-gachavault}"
BACKUP_INTERVAL="${BACKUP_INTERVAL:-86400}"
# Set OFFSITE_UPLOAD_CMD in the env to ship each backup off-host. The literal
# string {FILE} is substituted with the absolute path to the backup file.
# Examples (pick one, wire credentials separately):
#   rclone (Backblaze B2, Hetzner Storage Box, S3, etc.):
#     OFFSITE_UPLOAD_CMD='rclone copy {FILE} backups-remote:gachavault/'
#   AWS S3 CLI:
#     OFFSITE_UPLOAD_CMD='aws s3 cp {FILE} s3://your-bucket/gachavault/'
#   SCP to a Hetzner Storage Box:
#     OFFSITE_UPLOAD_CMD='scp -i /run/secrets/sb_key {FILE} u123456@u123456.your-storagebox.de:/home/backups/'
OFFSITE_UPLOAD_CMD="${OFFSITE_UPLOAD_CMD:-}"

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

    if [ -n "$OFFSITE_UPLOAD_CMD" ]; then
        # Substitute {FILE} → backup path. Run with `sh -c` so commands with
        # pipes/redirects in OFFSITE_UPLOAD_CMD work as written. A failed
        # upload is logged loudly but does NOT fail the loop — the local
        # backup remains intact and the next interval will retry.
        #
        # The resolved command is NOT logged. If an operator embeds
        # credentials directly in OFFSITE_UPLOAD_CMD (e.g. an inline
        # access key) instead of using rclone/aws config files, echoing
        # the substituted command here would leak them to log scrapers.
        # The pre-substitution OFFSITE_UPLOAD_CMD already appears in
        # `docker inspect` and is fine to log; what we hide is whatever
        # tooling adds at runtime.
        UPLOAD_CMD=$(echo "$OFFSITE_UPLOAD_CMD" | sed "s|{FILE}|$FILENAME|g")
        echo "[backup] Off-site upload: starting (file=$FILENAME)"
        if sh -c "$UPLOAD_CMD"; then
            echo "[backup] Off-site upload OK"
        else
            echo "[backup] OFF-SITE UPLOAD FAILED at $(date) — retry next interval" >&2
        fi
    fi
}

echo "[backup] Container started — first backup in 60s (then every ${BACKUP_INTERVAL}s)"
if [ -n "$OFFSITE_UPLOAD_CMD" ]; then
    echo "[backup] Off-site upload configured: enabled"
else
    echo "[backup] Off-site upload: DISABLED — set OFFSITE_UPLOAD_CMD to enable"
fi
sleep 60
run_backup

while true; do
    sleep "$BACKUP_INTERVAL"
    run_backup
done

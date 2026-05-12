#!/usr/bin/env bash
set -euo pipefail

DB_NAME="${DB_NAME:-gestoresto}"
ARCHIVE_ROOT="${ARCHIVE_ROOT:-/mnt/bunker/resto}"
BACKUP_DIR="${BACKUP_DIR:-$ARCHIVE_ROOT/backups}"
STAMP="$(date +%Y%m%d-%H%M%S)"

mkdir -p "$BACKUP_DIR"

DB_DUMP="$BACKUP_DIR/${DB_NAME}-${STAMP}.dump"
ARCHIVE_TAR="$BACKUP_DIR/archive-${STAMP}.tar.gz"

sudo -u postgres pg_dump -Fc "$DB_NAME" > "$DB_DUMP"
tar --exclude="$BACKUP_DIR" -czf "$ARCHIVE_TAR" -C "$ARCHIVE_ROOT" .

sha256sum "$DB_DUMP" "$ARCHIVE_TAR" > "$BACKUP_DIR/checksums-${STAMP}.sha256"

echo "Backup criado:"
echo "$DB_DUMP"
echo "$ARCHIVE_TAR"

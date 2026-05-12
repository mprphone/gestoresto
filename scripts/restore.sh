#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 2 ]; then
  echo "Uso: $0 <db.dump> <archive.tar.gz>" >&2
  exit 1
fi

DB_DUMP="$1"
ARCHIVE_TAR="$2"
DB_NAME="${DB_NAME:-gestoresto}"
ARCHIVE_ROOT="${ARCHIVE_ROOT:-/mnt/bunker/resto}"

if [ ! -f "$DB_DUMP" ]; then
  echo "Dump nao encontrado: $DB_DUMP" >&2
  exit 1
fi

if [ ! -f "$ARCHIVE_TAR" ]; then
  echo "Arquivo nao encontrado: $ARCHIVE_TAR" >&2
  exit 1
fi

sudo -u postgres dropdb --if-exists "$DB_NAME"
sudo -u postgres createdb "$DB_NAME"
sudo -u postgres pg_restore -d "$DB_NAME" "$DB_DUMP"

mkdir -p "$ARCHIVE_ROOT"
tar -xzf "$ARCHIVE_TAR" -C "$ARCHIVE_ROOT"

echo "Restore concluido para $DB_NAME e $ARCHIVE_ROOT"

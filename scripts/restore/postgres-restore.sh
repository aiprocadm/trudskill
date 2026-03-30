#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
if [ $# -lt 1 ]; then
  echo "usage: $0 <backup.dump>"
  exit 1
fi

backup_file="$1"
if [ ! -f "$backup_file" ]; then
  echo "Backup file not found: $backup_file"
  exit 1
fi

pg_restore --clean --if-exists --no-owner --dbname="$DATABASE_URL" "$backup_file"
echo "Restore complete from $backup_file"

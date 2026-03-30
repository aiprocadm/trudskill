#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${BACKUP_DIR:=./.backups/postgres}"

mkdir -p "$BACKUP_DIR"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
file="$BACKUP_DIR/cdoprof-$stamp.dump"

pg_dump "$DATABASE_URL" --format=custom --file="$file"
sha256sum "$file" > "$file.sha256"

echo "Created $file"

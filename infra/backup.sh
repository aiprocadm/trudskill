#!/usr/bin/env bash
set -euo pipefail

# CDOProf nightly backup: PostgreSQL dump (critical) + MinIO volume snapshot.
# Run from the repo root on the server. Add to crontab (daily 03:00):
#   0 3 * * *  cd /path/to/repo && infra/backup.sh >> /var/log/cdoprof-backup.log 2>&1
#
# RESTORE (manual):
#   DB:    gunzip -c BACKUP_DIR/db-STAMP.sql.gz | \
#            docker compose -f infra/docker-compose.prod.yml exec -T postgres \
#            psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
#   FILES: docker run --rm -v cdoprof_minio-data:/data -v BACKUP_DIR:/backup alpine \
#            sh -c 'cd /data && tar xzf /backup/minio-STAMP.tar.gz'

COMPOSE_FILE="infra/docker-compose.prod.yml"
BACKUP_DIR="${CDOPROF_BACKUP_DIR:-/var/backups/cdoprof}"
RETENTION_DAYS="${CDOPROF_BACKUP_RETENTION_DAYS:-14}"
STAMP="$(date +%Y%m%d-%H%M%S)"

# Load DB/MinIO credentials.
if [ -f infra/.env.production ]; then
  set -a
  # shellcheck disable=SC1091
  . infra/.env.production
  set +a
fi

mkdir -p "$BACKUP_DIR"

# 1. PostgreSQL dump (gzip).
docker compose -f "$COMPOSE_FILE" exec -T postgres \
  pg_dump -U "${POSTGRES_USER:-cdoprof}" "${POSTGRES_DB:-cdoprof}" \
  | gzip >"$BACKUP_DIR/db-$STAMP.sql.gz"

# 2. MinIO objects (named-volume snapshot).
docker run --rm \
  -v cdoprof_minio-data:/data:ro \
  -v "$BACKUP_DIR:/backup" \
  alpine tar czf "/backup/minio-$STAMP.tar.gz" -C /data .

# 3. Prune backups older than retention.
find "$BACKUP_DIR" -name 'db-*.sql.gz' -mtime +"$RETENTION_DAYS" -delete
find "$BACKUP_DIR" -name 'minio-*.tar.gz' -mtime +"$RETENTION_DAYS" -delete

echo "[backup] done -> $BACKUP_DIR (db-$STAMP.sql.gz, minio-$STAMP.tar.gz)"

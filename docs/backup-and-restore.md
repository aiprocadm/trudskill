# Backup and restore

## Policy matrix (baseline)
- PostgreSQL: daily full backup + checksum, retention 14 days, priority P1 restore.
- S3 object storage artifacts/templates: bucket-level replication or snapshot policy (external storage policy), retention 30 days.

## Scripts
- backup: `scripts/backup/postgres-backup.sh`
- restore: `scripts/restore/postgres-restore.sh <dump-file>`

## RPO/RTO assumptions
- RPO: up to 24h without WAL shipping.
- RTO: 2h for full DB restore on standard staging resources.

Run quarterly restore drills on staging.

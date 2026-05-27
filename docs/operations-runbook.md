# Operations runbook

## Доменные runbook'и

- [Pillar A — выдача документов](runbooks/pillar-a-incidents.md) — инциденты по выдаче, отзыву, QR-верификации, 152-ФЗ.

## Daily checks

- health endpoints for backend and realtime.
- error-rate and latency trends from metrics.
- failed job count and queue depth from worker telemetry.
- verify `MVP_PERSISTENCE_DRIVER` and `DOCUMENTS_PERSISTENCE_DRIVER` in deployed env (`postgres` in production).

## Persistence health checks

- Confirm writes are landing in runtime JSON stores:
  - `learning.mvp_runtime_documents`
  - `documents.runtime_documents`
- Spot-check tenant isolation:
  - no cross-tenant rows for same business `id`/collection pair.
- For material attachments, verify `storage.file_links` primary links exist for updated material `fileId`.

## Incident response baseline

1. Capture `request_id`/`correlation_id` from failing request.
2. Trace across backend/worker/realtime logs.
3. Validate dependency health (DB/Redis/RabbitMQ/S3).
4. Execute rollback/restart only after confirming root cause.
5. If issue is tenant-specific data drift, isolate tenant and replay from backup before global restart.

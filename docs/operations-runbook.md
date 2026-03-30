# Operations runbook

## Daily checks
- health endpoints for backend and realtime.
- error-rate and latency trends from metrics.
- failed job count and queue depth from worker telemetry.

## Incident response baseline
1. Capture `request_id`/`correlation_id` from failing request.
2. Trace across backend/worker/realtime logs.
3. Validate dependency health (DB/Redis/RabbitMQ/S3).
4. Execute rollback/restart only after confirming root cause.

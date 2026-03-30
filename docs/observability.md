# Observability

## Logging
- JSON logs with: timestamp, level, service_name, environment, version, request/correlation IDs.
- Sensitive keys are redacted (`password`, `token`, `secret`, `api_key`, etc.).

## Health endpoints
- `/api/v1/health/live`
- `/api/v1/health/startup`
- `/api/v1/health/ready`

Readiness fails hard on DB unavailability, degrades on non-critical dependencies.

## Metrics
- `/api/v1/metrics` (Prometheus text format)
- metrics: total requests, active requests, avg latency per route/method.

# Troubleshooting

- Service not ready: inspect `/api/v1/health/ready` checks and backend logs.
- Missing request trace: verify `x-correlation-id` propagation and response headers.
- Queue stalls: verify RabbitMQ health and worker logs.
- Metrics missing: verify `/api/v1/metrics` and reverse-proxy path rewrites.

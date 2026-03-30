# Architecture overview

Platform is a modular monolith backend + dedicated worker + realtime app + frontend.

- Source of truth: PostgreSQL.
- Async/temporary: RabbitMQ, Redis.
- Files/artifacts: S3-compatible storage.
- Cross-cutting: request correlation (`x-request-id`, `x-correlation-id`), structured logs, health and metrics endpoints.

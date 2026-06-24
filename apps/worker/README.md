# Worker (documents pipeline)

## Run

- `pnpm --filter @trudskill/worker dev`

## Document generation flow

1. API enqueues document task (`queued`).
2. Worker consumes `DOCUMENT_GENERATION_QUEUE` from RabbitMQ.
3. Worker sets status `running`, resolves variables, reserves number, renders artifact.
4. Worker persists file metadata link and generated document registry row.
5. Worker marks task `completed` or `failed` with `error_message`.

## Restart-safe processing (document / integration / notification)

- Consumer работает в режиме `manual ack/nack` (`noAck=false`), поэтому незавершённые сообщения после падения воркера возвращаются в очередь.
- Для идемпотентности используется `core.processed_message_ids` (PK: `consumer_name + message_id`): дубликаты подтверждаются `ack` без повторного side effect.
- Для retry используется отдельный retry-exchange/queue:
  - сообщение публикуется в `WORKER_RETRY_EXCHANGE`;
  - TTL (`expiration`) = exponential backoff;
  - после TTL сообщение dead-letter'ом возвращается в `WORKER_EXCHANGE`.
- После исчерпания лимита (`WORKER_MAX_RETRIES`) выполняется `nack(requeue=false)` и сообщение уходит в DLQ (`WORKER_DLX_EXCHANGE` → `WORKER_DLQ_QUEUE`).
- Для producer-side гарантий используется outbox-таблица `core.outbox_events` + backend publisher (claim через `FOR UPDATE SKIP LOCKED`).

## Task statuses

- `queued`
- `running`
- `completed`
- `failed`

## Numbering

- Numbering rule is tenant scoped and document-type scoped.
- Reservation row is created before final registration.
- Reservation marked `used` only after successful generated document registration.

## Pipeline layering

- `DocumentGenerationPipeline` is a thin task entrypoint: claim task + delegate.
- `DocumentGenerationOrchestrator` owns orchestration steps for generation flow.
- `ErrorNameRetryPolicy` centralizes retry/fail decisions by error type.
- Tests validate orchestration and retry semantics without any queue/Celery runtime.

# Worker (documents pipeline)

## Run
- `pnpm --filter @cdoprof/worker dev`

## Document generation flow
1. API enqueues document task (`queued`).
2. Worker consumes `DOCUMENT_GENERATION_QUEUE` from RabbitMQ.
3. Worker sets status `running`, resolves variables, reserves number, renders artifact.
4. Worker persists file metadata link and generated document registry row.
5. Worker marks task `completed` or `failed` with `error_message`.

## Task statuses
- `queued`
- `running`
- `completed`
- `failed`

## Numbering
- Numbering rule is tenant scoped and document-type scoped.
- Reservation row is created before final registration.
- Reservation marked `used` only after successful generated document registration.

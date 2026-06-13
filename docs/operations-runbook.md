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

## Web Push (Phase 10 Track C) — включение

Web-push спит по умолчанию (`WEB_PUSH_ENABLED=false` → `NoopWebPushSender`, push не шлётся, email-уведомления работают как прежде). Чтобы включить:

1. Сгенерировать пару VAPID-ключей (один раз; ключи долгоживущие):

   ```bash
   npx web-push generate-vapid-keys
   ```

2. Прописать в backend-env (`infra/.env.production`):

   ```bash
   WEB_PUSH_ENABLED=true
   VAPID_PUBLIC_KEY=<публичный ключ из вывода>
   VAPID_PRIVATE_KEY=<приватный ключ из вывода>
   VAPID_SUBJECT=mailto:admin@your-center.ru   # контакт для push-сервисов
   ```

   При `WEB_PUSH_ENABLED=true` оба ключа обязательны — env-схема (`superRefine`) откажет в старте без них.

3. Перезапустить backend. Эндпоинт `GET /web-push/public-key` начнёт отдавать `{ enabled: true, publicKey }`; UI «Push-уведомления» на странице `/notifications` станет видимым, и пользователи смогут подписать свой браузер.

**Замечания:**

- **Same-origin / Caddy:** дополнительных правил Caddy не требуется. Push доставляется браузеру напрямую от push-сервиса (FCM/Mozilla) к service worker; запрос на подписку (`POST /web-push/subscribe`) идёт через `/api/v1/*`, который Caddy уже проксирует на backend.
- **Подписки** хранятся в MVP-state (`pushSubscriptions`, без отдельной таблицы) → в prod (postgres-драйвер) переживают рестарт; протухшие (404/410 от push-сервиса) зачищаются автоматически при отправке.
- **Иконки PWA** (`apps/frontend/public/icons/*`) — плейсхолдеры (сплошной бренд-цвет). **Заменить реальными ассетами перед публичным релизом** (те же пути/размеры — код менять не нужно; см. `public/icons/README.md`).
- **Откат:** выставить `WEB_PUSH_ENABLED=false` и перезапустить — мгновенно возвращает `NoopWebPushSender`, email-доставка не затрагивается.

## Incident response baseline

1. Capture `request_id`/`correlation_id` from failing request.
2. Trace across backend/worker/realtime logs.
3. Validate dependency health (DB/Redis/RabbitMQ/S3).
4. Execute rollback/restart only after confirming root cause.
5. If issue is tenant-specific data drift, isolate tenant and replay from backup before global restart.

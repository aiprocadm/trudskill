# Runbook: первый запуск и регулярный деплой

## Перед первым деплоем

1. Установить зависимости: `pnpm install` в корне monorepo.
2. Переменные окружения: скопировать шаблоны `.env.example` (root и при необходимости `apps/backend`, `apps/frontend`), задать `DATABASE_URL`, `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_REALTIME_URL`, `AUTH_JWT_SECRET`, `SESSION_SECRET`.
3. База: применить SQL-миграции из [`apps/backend/migrations`](../apps/backend/migrations) (включая `0025`–`0027` из handoff IAM/audit).

## Запуск локально для проверки

1. Инфра по желанию: `docker compose -f infra/docker-compose.yml up -d`.
2. Разработка: `pnpm dev` или точечный `pnpm dev:web` / backend-скрипты из `package.json`.
3. Контроль качества перед релизом: **`pnpm -s ci:check`**.

## После деплоя (smoke)

- Логин, открытие `/courses`, `/reports`, создание одиночного и при необходимости массового зачисления (`POST /enrollments/bulk`).
- При использовании `linkedIamUserId` у слушателей — проверка выдачи сертификата и ссылки со страницы «Мои курсы».

Подробнее о целевых NFR см. [NFR_LAUNCH_V1.md](./NFR_LAUNCH_V1.md). Резервы и откат — [BACKUP_ROLLBACK.md](./BACKUP_ROLLBACK.md).

## Мониторинг и наблюдаемость

- **Health / readiness:** используйте эндпоинты модуля health backend; в Docker задайте `depends_on` и политику перезапуска для `postgres`, `redis`, `rabbitmq`.
- **Логи:** worker пишет структурированные JSON-события (`service_name: worker`); backend — стандартный NestJS logger. При согласованных числовых NFR подключите алерты по росту `5xx` и недоступности health.
- **Очередь массовых назначений:** при `deliveryMode: queued` на `POST /enrollments/bulk` должны работать RabbitMQ, `apps/worker` и совпадающие `WORKER_CALLBACK_SECRET` / `WORKER_CALLBACK_TOKEN` (см. `apps/backend/.env.example`, `apps/worker/.env.example`).
- **Нагрузка:** после фиксации SLA в NFR — отдельный профиль на `POST /enrollments/bulk` и отчёты (см. SDOPROF_TZ_FINAL.md §706–709).

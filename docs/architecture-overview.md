# Architecture overview

Platform is a modular monolith backend + dedicated worker + realtime app + frontend.

- Source of truth: PostgreSQL.
- Async/temporary: RabbitMQ, Redis.
- Files/artifacts: S3-compatible storage.
- Cross-cutting: request correlation (`x-request-id`, `x-correlation-id`), structured logs, health and metrics endpoints.

## Зависимости модулей backend (разрешённые рёбра)

Модульный монолит в `apps/backend`: feature-модули не должны тянуть «чужие» сервисы без явной необходимости; общая инфраструктура и сквозные сервисы живут в `InfrastructureModule` и глобальном `CoreModule`.

| Модуль               | Импортирует (примеры)                                           | Экспортирует наружу                                                 |
| -------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------- |
| CoreModule           | — (global)                                                      | AppLogger, MetricsService, RealtimeEventsService                    |
| InfrastructureModule | —                                                               | DatabaseService, RedisService, S3, RabbitMQ, TenantScopedRepository |
| IamModule            | AuditModule                                                     | AuthService, IamService, guards                                     |
| TenantModule         | InfrastructureModule                                            | TenantService                                                       |
| AuditModule          | InfrastructureModule (optional DB)                              | AuditService                                                        |
| DocumentsModule      | AuditModule                                                     | DocumentsService                                                    |
| EsignModule          | AuditModule, DocumentsModule, CoreModule                        | EsignService                                                        |
| CommunicationModule  | — (Core global)                                                 | Chat, Notifications, Webinars services                              |
| IntegrationsModule   | AuditModule, CoreModule, подмодули credentials/exports/webhooks | IntegrationOrchestratorService                                      |
| MvpModule            | TenantScopedRepository, AuditModule                             | MvpService                                                          |
| WorkspaceModule      | зависит от доменных сервисов по сценарию                        | workspace API                                                       |

**События:** публикация в realtime и аудит предпочтительны прямым вызовам между несмежными доменами; имена событий для интеграций см. `integrations/domain/integration-realtime-events.ts`.

## Слои внутри крупных feature

- **Integrations:** `application/` (баррель оркестрации), `domain/` (константы событий), `infrastructure/` (in-memory state для оркестратора), `services/` (Nest-провайдеры).
- **MVP:** `application/` (баррель `MvpService`), `infrastructure/` (`InMemoryMvpState`, токен `MVP_STATE`).

Подробнее про DI и ESLint: [NEST_DI_IMPORTS.md](./NEST_DI_IMPORTS.md).

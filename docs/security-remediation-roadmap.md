# План доработки и снижения рисков

## Контекст

Документ фиксирует приоритизацию работ по безопасности, целостности данных и эксплуатационной надежности, а также выделяет технический долг, очистку репозитория и регрессионные риски.

## Приоритеты

### Срочно (P0)

1. Закрыть возможность подмены данных по `x-user-id` и `x-tenant-id`.
2. Переработать контур аутентификации/токена/сессии.
3. Исключить `passwordHash` и другие конфиденциальные поля из API-ответов.
4. Убрать хранение access/refresh токенов в `localStorage`.
5. Устранить расхождение между frontend и backend в формате API-ответов. **Статус (MVP):** клиент **`apiRequest`** жёстко ожидает **`{ data, meta }`**; см. задача **[§4](#4-синхронизация-frontendbackend-api-контракта)**.
6. Исправить ошибки сборки/выполнения, связанные с `apiClient`. **Статус (MVP):** доменные вызовы через **`apiRequest`**; **`workspaceApi`** вместо прямого **`apiClient`** на **`/workspace`**; см. **[§5](#5-починка-неработающей-api-абстракции-frontend)**.
7. Заменить Base64-представление секретов интеграций на реальное шифрование. **Статус (MVP):** в **`IntegrationCryptoService`** — **AES-256-GCM**, префикс **`enc`**, версии ключей из **`INTEGRATION_CRYPTO_KEYS`**; **`IntegrationOrchestratorService`** шифрует при **`createCredential`** / **`rotateSecret`**; **`decrypt`** поддерживает legacy **Base64**; в ответах API **`secretEncrypted`** маскируется (**`maskCredential`**). В **production** без **`INTEGRATION_CRYPTO_KEYS`** сервис падает при старте (см. код). Операционно: задать ключи в env (пример в **`apps/backend/.env.example`**).

### Следующий этап (P1)

1. Перенести домены со state-моделью из in-memory хранилища в БД.
2. Довести документы, интеграции и оценку до транзакционной модели.
3. Внедрить конкурентно-безопасную идемпотентность/нумерацию/ротацию сессий.
4. Повысить надежность health/readiness/audit.
5. Добавить интеграционные и e2e-тесты для критических сценариев.

### Позже (P2)

1. Очистить репозиторий и артефакты сборки.
2. Нормализовать слой DTO/mapper во всех модулях.
3. Разгрузить крупные сервисы и выделить прикладной/доменный/репозиторный уровни.
4. Зафиксировать единый стандарт для сгенерированных контрактов и общих типов.

## Технический долг

- `MvpService`, `DocumentsService`, `IntegrationOrchestratorService` имеют признаки «толстых» сервисов с высокой концентрацией бизнес-правил.
- Недостаточно четкое разграничение доменных сущностей, DTO и API-ответов.
- Конфигурации env/secret/security присутствуют частично, но не полностью интегрированы в runtime-контур.
- Наблюдаемость и аудит есть на архитектурном уровне, но не доведены до эксплуатационного SLA.
- Контрактный слой не является единым источником правды для frontend/backend.

## Мусор и очистка кода

- Одновременное наличие `package-lock.json` и `pnpm-lock.yaml`.
- Закоммиченные `tsconfig.tsbuildinfo`.
- Скомпилированные `.js/.d.ts/.map` рядом с исходниками в `packages/shared-types` и `packages/api-contracts`.
- Непоследовательность в API-абстракциях (`apiClient` vs `apiRequest`).
- Локальные отключения `react-hooks/exhaustive-deps` там, где предпочтительна архитектурная переработка хука.
- Вероятные следы промежуточной генерации/сборки внутри `src`.

## Риски регрессии (обязательное покрытие тестами)

- Аутентификация/сессии/разрешения: риск поломки login/refresh/logout/access.
- Изоляция арендаторов: риск кросс-tenant утечки данных (в MVP `MvpService.getById` ищет по паре `id` + `tenantId`; регресс в `mvp.service.test` и HTTP в `mvp.domains.http.integration.test`). Модуль **documents**: все пути через приватный **`must(arr, tenantId, id)`** уже фильтруют по паре; добавлен unit-regression в **`documents.service.test.ts`** на коллизию `id` между tenant. Модуль **e-sign**: **`EsignService.must`** — та же пара `(tenantId, id)`; unit-regression в **`esign.service.test.ts`** на коллизию `id` заявки между tenant. Модуль **integrations**: **`requireTask` / `getItem`** и др. уже по **`id` + `tenantId`**; unit-regression в **`integrations.service.test.ts`** на коллизию `id` export-task между tenant (`Provider` остаётся глобальным справочником без `tenantId`). Модуль **communication** (уведомления, вебинары, чат): выборка по **`tenantId` + `id`** в сервисах/репозиториях; unit-regression в **`communication.service.test.ts`** на коллизию `id` между tenant. Модуль **audit**: **`AuditService.list`** — только при непустом `tenantId` (иначе `[]`); SQL только `where tenant_id = $1`; unit-regression в **`audit.service.test.ts`**.
- Документы/нумерация/состояния задач: риск дублей и зависших статусов.
- Оценка (попытки/результаты): риск нарушения инвариантов лимитов и финализации.
- Интеграции/вебхуки/идемпотентность: риск повторных побочных эффектов.
- Начальная авторизация во frontend/роутинг: риск redirect-loop и скрытой auth-ошибки.
- API-оболочка/типизация: риск массовой деградации UI при изменении контракта.

## Конкретные задачи (беклог исполнения)

### 1) Доверенная аутентификация по токену

**Статус (MVP-бэклог):** в HTTP API идентичность задаётся в [`TenantGuard`](../apps/backend/src/common/guards/tenant.guard.ts) только из успешной верификации Bearer JWT; заголовки `x-user-id` / `x-tenant-id` в [`resolveRequestContext`](../apps/backend/src/common/utils/request.ts) попадают в `requestedTenantId` для bootstrap-путей входа и **не** становятся `userId`/`tenantId` без токена (`x-user-id` в production-коде **не читается**). При наличии Bearer, если клиент передаёт `x-tenant-id`, он **должен совпадать** с `tenant_id` в токене — иначе `400` с кодом `tenant_header_mismatch`. В `catch` ветки верификации токена пробрасываются все `HttpException`, чтобы не маскировать `BadRequest` под `invalid_token`. Оставшиеся задачи: периодически подтверждать отсутствие новых путей, трактующих заголовки как полномочия; расширять регресс при смене guard.

**Цель:** исключить подмену пользователя и tenant.

**Изменения:**

- запретить использование `x-user-id/x-tenant-id` как источника полномочий;
- определять identity только из верифицированного access token;
- refresh-flow выполнять только с валидацией сессии и ротацией токена.

**Критерии приемки:**

- подмена заголовков не влияет на авторизацию;
- все защищенные endpoint возвращают `401` без валидного bearer token;
- tenant и user в контексте запроса берутся только из токена.

### 2) Переход на Argon2/Bcrypt для паролей

**Статус (MVP):** новые пароли и автоматическая миграция при входе используют **scrypt** (Node `crypto.scryptSync`, параметры в [`crypto-policy.ts`](../apps/backend/src/modules/iam/crypto-policy.ts)); формат строки — префикс `scrypt$…`. Поддерживается верификация **legacy SHA-256(hex)** из [`0010_iam_role_permissions_and_seed.sql`](../apps/backend/migrations/0010_iam_role_permissions_and_seed.sql) (`verifyPassword`). После успешного **`AuthService.login`** для legacy-хэша вызывается **`IamService.upgradePasswordHash`** (PostgreSQL и in-memory) и пишется аудит **`iam.password_rehashed`** (`metadata.reason: legacy_sha256_seed`, `algorithm: scrypt`). Тесты: **`crypto.util.test.ts`**, **`auth.service.test.ts`**. Отдельный переход на Argon2id/bcrypt — по политике заказчика (post-MVP).

**Цель:** безопасное хранение паролей.

**Изменения:**

- заменить SHA-256 на memory-hard парольный хеш;
- обновить verify/login pipeline;
- добавить миграционную стратегию (rehash on login / batch migration).

**Критерии приемки:**

- новые пароли сохраняются в формате Argon2/Bcrypt;
- вход работает и для мигрируемых учетных записей;
- метрики миграции доступны в мониторинге.

### 3) Удаление конфиденциальных полей из IAM API

**Статус (MVP):** публичные ответы пользователя идут через **`toUserResponse`** / **`IamService.toPublicUser`**; сессии — **`toSessionResponse`**; токены — **`authCookie.toPublicTokens`**. Контрактные тесты **`auth.controller.contract.test.ts`**: `/auth/me`, список и карточка пользователя, **`createUser`**, **`updateUser`**, **`GET/PUT users/:id/roles`**, список сессий — без **`passwordHash`**, хэшей refresh/CSRF и прочих внутренних полей сессии.

**Цель:** устранить утечку security-sensitive данных.

**Изменения:**

- внедрить публичные DTO/mapper для user/session/auth ответов;
- исключить внутренние поля (`passwordHash`, `refreshTokenHash` и т.д.) из controller responses.

**Критерии приемки:**

- контрактные тесты гарантируют отсутствие закрытых полей;
- API-ответы стабильны и соответствуют OpenAPI/контрактам.

### 4) Синхронизация frontend/backend API-контракта

**Цель:** единый и рабочий контракт.

**Изменения:**

- унифицировать envelope формат (`{ data, meta }`) либо типы клиента;
- синхронизировать генерацию типов и runtime-десериализацию.

**Критерии приемки:**

- frontend корректно обрабатывает все backend ответы;
- нет runtime-ошибок из-за несовпадения shape.

**Статус (MVP, 2026-05-05):** transport-слой **`apiRequest`** / **`apiRequestEnvelope`** в [`apps/frontend/src/lib/api/client.ts`](../apps/frontend/src/lib/api/client.ts) проверяют ответ на envelope **`{ data, meta }`** и отдают **`data`**; доменные модули (**`mvpApi`**, **`authApi`**, **`workspaceApi`**) строятся на **`apiRequest`**. Дальнейшая унификация с OpenAPI/codegen — пост-MVP.

### 5) Починка неработающей API-абстракции frontend

**Цель:** восстановить typecheck/build/runtime интеграцию экранов.

**Изменения:**

- унифицировать использование `apiClient`/`apiRequest`;
- удалить устаревшие вызовы и дублирующие адаптеры.

**Критерии приемки:**

- frontend `typecheck` и `build` проходят;
- ключевые экраны работают на едином API-клиенте.

**Статус (MVP, 2026-05-05):** **`apiClient`** — тонкий фасад над **`apiRequest`** (тот же envelope); прямые вызовы **`apiClient`** с экранов сведены к нулю: оперативная панель переведена на **`workspaceApi`** ([`apps/frontend/src/features/workspace/api.ts`](../apps/frontend/src/features/workspace/api.ts), [`api.test.ts`](../apps/frontend/src/features/workspace/api.test.ts)). Остальной UI уже на **`apiRequest`** через фиче-модули (`mvp`, `integrations`, `auth`, communication).

### 6) Уход от localStorage для токенов

**Цель:** снизить XSS-риск компрометации токенов.

**Изменения:**

- хранить refresh token в `httpOnly` cookie;
- access token держать в памяти процесса/вкладки;
- переработать bootstrap/refresh/logout с CSRF-защитой.

**Критерии приемки:**

- токены отсутствуют в `window.localStorage`;
- refresh работает через cookie transport.

**Статус (MVP, 2026-05-05):** на текущем контуре **критерии приёмки по сути выполнены**: refresh и CSRF для ротации сессии идут через **httpOnly / cookie** и заголовок (`apps/backend/src/modules/iam/auth.controller.ts`, `authCookie`); во **frontend** `session-store` в `localStorage` сохраняет только профиль без `tokens` (`Omit<UserSession, 'tokens'>`, `apps/frontend/src/lib/auth/session-store.ts`). Дальнейшее усиление (SameSite/доменные политики, ревизия всех путей bootstrap, pen-test) — по отдельным карточкам.

### 7) Реальное шифрование секретов интеграций

**Цель:** криптографическая защита provider credentials.

**Изменения:**

- AES-GCM encryption service;
- версионирование ключей, ротация, безопасное хранение key material;
- миграция legacy-значений.

**Критерии приемки:**

- секреты в БД не хранятся в открытом виде/простом Base64;
- decrypt доступен только через сервис с ключами корректной версии.

**Статус (MVP, 2026-05-05):** реализовано в [`integration-crypto.service.ts`](../apps/backend/src/modules/integrations/services/integration-crypto.service.ts) и используется в [`integration-orchestrator.service.ts`](../apps/backend/src/modules/integrations/services/integration-orchestrator.service.ts). Новые и ротированные секреты хранятся как **`enc:<version>:<iv>:<tag>:<ciphertext>`** (base64url). Для строк без префикса **`enc`** сохраняется ветка **legacy Base64** при **`decrypt`** (до выравнивания данных). Инфраструктура: **`INTEGRATION_CRYPTO_KEYS`** (`version:base64(32-byte-key)` через запятую), **`INTEGRATION_CRYPTO_ACTIVE_KEY_VERSION`** — обязательны в production. Регресс: **`integration-crypto.service.test.ts`**, **`integrations.service.test.ts`**.

### 8) Перенос состояния из памяти в БД

**Цель:** устранить потерю состояния и подготовить масштабирование.

**Изменения:**

- вынести документы, задания, нумерацию, синхронизацию и credentials в persistent storage.

**Критерии приемки:**

- данные сохраняются между перезапусками/инстансами;
- in-memory fallback не используется как источник правды.

### 9) Конкурентно-безопасные переходы состояний

**Цель:** устранить race-condition и дубли побочных эффектов.

**Изменения:**

- транзакции, row-level locks, уникальные ограничения;
- надежное идемпотентное хранилище для внешних эффектов.

**Критерии приемки:**

- параллельные запросы не вызывают дублирование;
- state transitions атомарны.

### 10) Повышение готовности и аудита

**Цель:** эксплуатационная предсказуемость.

**Изменения:**

- корректные liveness/readiness semantics;
- гарантированная запись аудита/исходящих событий;
- корреляция логов по request/correlation/session.

**Критерии приемки:**

- деградация диагностируется заранее;
- аудит полон и непротиворечив.

**Статус (MVP, 2026-05-05):** **liveness** — unit-регресс **`HealthController.live`** (**`health.test.ts`**); HTTP-регресс публичного **`GET …/health/live`** с envelope и заголовками **`x-request-id`** / **`x-correlation-id`** — **`health.http.integration.test.ts`**; **readiness** — unit-регресс **`HealthController.ready`** в **`health.test.ts`**; HTTP-регресс **`GET …/health/ready`** (успешный сценарий и **503** / **`readiness_failed`** / **`error`+`meta`** при нездоровых миграциях в моках) — **`health.http.integration.test.ts`**; **tenant + workspace API** — **`workspace.http.integration.test.ts`** (JWT tenant scope, **`tenant_header_mismatch`**). **Уточнение (2026-05-06):** контур IAM аудита (`AuthService.writeCritical`, **`iam.user_created` / `iam.user_roles_updated`**) сохраняет **`metadata.correlation_id`** из **`RequestContext.correlationId`** (без отдельной колонки БД); см. **`AuditWritePayload`** / **`audit.service.test.ts`**, **`auth.controller.contract.test.ts`**. **Доп. (§5.68 handoff):** то же для **documents** (шаблоны, **`writeTaskAudit`**), **MVP** (`MvpService` private **`audit`**), **e-sign** (**`writeAudit`**), **integrations** (**`createCredential`** / **`rotateSecret`**). **§5.69:** событие **`learning.enrollment_completed`** + слушатель выдачи сертификата — **`requestId`/`correlationId`** из **`changeEnrollmentStatus`** до аудита задачи и **`generateDocument`**. **§5.70:** **`POST …/documents/generate/batch`** — тот же контекст на все элементы батча.

### 11) Очистка репозитория и унификация package manager

**Цель:** стабильная воспроизводимая сборка.

**Изменения:**

- удалить лишние lock/build/generated артефакты из дерева исходников;
- обновить `.gitignore` и правила CI.

**Критерии приемки:**

- чистый `git status` после типовой сборки;
- CI не зависит от «случайных» артефактов.

### 12) Регрессионный набор тестов

**Цель:** предотвратить возврат критических дефектов.

**Изменения:**

- добавить integration/e2e на spoofing, envelope mismatch, sensitive data leaks, token storage policy, numbering/idempotency under concurrency.

**Критерии приемки:**

- каждый зафиксированный дефект покрыт автоматическим тестом;
- тесты включены в обязательный CI gate.

## Рекомендуемый порядок исполнения

1. **P0.1** — задачи 1, 3, 6 (изоляция арендаторов и безопасный auth-контур).
2. **P0.2** — задачи 4, 5 (контракт и фронтовая API-абстракция).
3. **P0.3** — задача 7 (криптография секретов).
4. **P1.1** — задачи 8, 9 (переход к транзакционной domain-модели).
5. **P1.2** — задача 10 (операционная надежность и аудит).
6. **P1.3/P2** — задачи 11, 12 и дальнейшая архитектурная нормализация.

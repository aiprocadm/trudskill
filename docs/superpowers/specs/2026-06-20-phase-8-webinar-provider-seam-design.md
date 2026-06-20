# Phase 8 — Webinar provider seam (dormant, multi-provider + per-tenant) — Design

**Date:** 2026-06-20
**Branch (planned):** `feat/2026-06-20-phase-8-webinar-provider-seam`
**Status:** Design approved, awaiting plan
**Roadmap:** Phase 8 «Вебинары» (см. `docs/superpowers/plans/2026-05-21-cdoprof-v1-roadmap.md`)

## Context

Вебинары — пункт **роадмапа** (ТЗ §5.17 упоминает «создание, участники, приглашения»), глубина на наше усмотрение.
В `modules/communication` уже есть **ранняя CRUD-заглушка** вебинаров (миграция **0007** завела таблицы
`communication.webinars` + `communication.webinar_participants` с полями провайдера (`provider_session_id`,
`join_url`, `host_url`) и посещаемости (`attendance_status`, `joined_at`, `left_at`, `duration_seconds`) —
**все не используются**). `WebinarsService` — голый CRUD; `WebinarsController` — `@UseGuards(TenantGuard)`
**без** `@RequirePermissions` и **без** DTO-валидации (`@Body() body: any`); прав `webinars.*` нет (роут под
generic `tenant.read`); фронтенд `app/webinars/page.tsx` — read-only список.

Эта итерация **оживляет шов поверх готовой схемы** по проверенному dormant-seam паттерну последних 5 интеграций
(антивирус → esign-НЭП → export-КЭП → ЕСИА → платежи) и попутно подтягивает контроллер к конвенциям проекта.

## Approved decisions

| #            | Решение                                                                                                          |
| ------------ | ---------------------------------------------------------------------------------------------------------------- |
| Глубина      | **Чистый dormant-шов** (вариант 1) — сессии не текут, всё спит за `WEBINARS_ENABLED=false`                       |
| Провайдеры   | **Мульти-провайдер**, никакого «основного». Pruffme НЕ приоритет. Первый каркас — **самохостинг Jitsi** («своё») |
| Выбор        | **Per-tenant** — разные учебные центры выбирают разных провайдеров (настройка тенанта, НЕ глобальный env)        |
| Посещаемость | Пишется durable через webhook, но в этой итерации **НЕ влияет** на завершение курса (отложено)                   |
| UI           | Полный admin/learner + экран настроек провайдера (зеркало `/admin/orders` + `/learner/payments`)                 |
| Модуль       | Остаёмся в `modules/communication` (он уже владеет вебинарами); шов — `infrastructure/webinar-provider/`         |
| «С нуля»     | Свой WebRTC-движок **отвергнут** — отдельный крупный продукт вне LMS-скоупа. «Своё» = самохостинг open-source    |

## Architecture

Расширяем `apps/backend/src/modules/communication/`:

- `infrastructure/webinar-provider/` — шов (интерфейс + реализации + реестр + резолвер).
- `webinars-webhook.controller.ts` — **unguarded** колбэк провайдера (зеркало `payments-webhook.controller.ts`).
- `webinar-provider-settings.{repository,service}.ts` + dual-backend (in-memory + postgres) — per-tenant выбор провайдера.
- Хардбенинг существующих `webinars.controller.ts` / `webinars.service.ts` (права + DTO + проводка `createSession`).

### Provider seam — registry + per-tenant resolver

Per-tenant выбор превращает одиночный DI-токен (как `PAYMENT_PROVIDER`) в **реестр стратегий + резолвер**:

- **`WebinarProvider`** (интерфейс):
  - `createSession(input: CreateSessionInput): Promise<ProviderSession | null>` — зовётся при создании/планировании
    вебинара. `ProviderSession = { providerSessionId, joinUrl, hostUrl }`. `null` = провайдер спит/недоступен.
  - `parseWebhook(payload: unknown, signature?: string): WebinarAttendanceEvent[] | null` — нормализует колбэк
    провайдера в события посещаемости. `null` = не распознано/неверная подпись.
  - `readonly code: WebinarProviderCode` — самоидентификация для реестра.
- **Реализации:**
  - `NoopWebinarProvider` (default) — `createSession → null`, `parseWebhook → null`. Спит.
  - `FakeWebinarProvider` (staging, **prod-guard**) — синтетические `joinUrl`/`hostUrl` + синтетический webhook;
    owner-превью пайплайна без реального движка. Self-маркировка (`fake-webinar://`).
  - `JitsiWebinarProvider` (**каркас** самохостинг-«своего») — форма метода + warn; реальный create-room/JWT/HMAC =
    follow-up активации. Реалистичный первый реальный адаптер.
  - Реестр **открыт** для будущих (Pruffme/Zoom/BBB) — добавить = одна запись в реестре, резолвер не трогается.
- **`WebinarProviderRegistry`** — `Map<WebinarProviderCode, WebinarProvider>`; `get(code) → provider | undefined`.
- **`resolveProviderForTenant(tenantId): Promise<WebinarProvider>`** — читает `webinar_provider_settings` тенанта →
  если `WEBINARS_ENABLED` и `enabled` и код зарегистрирован → инстанс из реестра; иначе → `NoopWebinarProvider`.

### Env — мастер-выключатель, не селектор

`apps/backend/src/env.schema.ts` (зеркало `PAYMENTS_*`, кастомный boolean-парс — НЕ `z.coerce.boolean`):

- `WEBINARS_ENABLED: boolean` (default `false`) — включает подсистему вебинар-провайдеров.
- prod-guard: реализация `fake` запрещена при `NODE_ENV=production` (staging намеренно разрешён — owner preview),
  зеркало `PAYMENTS_PROVIDER=fake`. Гард срабатывает в резолвере/фабрике, т.к. провайдер теперь per-tenant
  (не один глобальный enum) — `fake` в настройке тенанта при проде → fallback на Noop + warn.

Env **не выбирает** провайдер — это делает per-tenant настройка.

## Data model — migration 0055 (schema `communication`)

**Без изменений** таблиц `webinars` / `webinar_participants` (они уже есть с 0007 со всеми нужными колонками).
Миграция добавляет права, таблицу настроек и индекс под webhook.

### `communication.webinar_provider_settings` (новая)

`tenant_id text primary key, provider_code text not null default 'noop', base_url text null,
enabled boolean not null default false, created_at timestamptz, updated_at timestamptz`

- Хранит **только несекретный** конфиг (код провайдера, base_url, флаг).
- **Решение по секретам:** реальные ключи (Jitsi app-secret/JWT, API-токены SaaS) **отложены до активации**
  (secret-ref или шифрованная колонка — follow-up). В dormant-итерации Noop/Fake/Jitsi-каркас секретов
  не требуют → **никакого plaintext-секрета в БД**.

### Permissions (seed + назначение ролям, в той же миграции)

| Право                | Кому                            | Назначение                                      |
| -------------------- | ------------------------------- | ----------------------------------------------- |
| `webinars.read`      | staff (admin/methodist/teacher) | список/детали вебинаров, участники              |
| `webinars.write`     | staff (admin/methodist)         | создать/изменить вебинар, управлять участниками |
| `webinars.attend`    | learner (self)                  | свои вебинары + получить join-ссылку            |
| `webinars.configure` | tenant_admin                    | выбор провайдера (`webinar_provider_settings`)  |

`webinars.configure` вынесено отдельно от `write` намеренно — конфиг провайдера чувствителен (tenant-admin level).

### Index

Partial index на `communication.webinars (provider_session_id)` where `provider_session_id is not null` —
для резолва тенанта по webhook (зеркало partial-unique `payments.payments.provider_payment_id`).

## Lifecycle & wiring

### Create (fail-soft)

`WebinarsService.create` → `resolveProviderForTenant(tenantId)` → `provider.createSession(...)`:

- успех → сохранить `provider_code`, `provider_session_id`, `join_url`, `host_url`, статус `planned`.
- провайдер `null`/ошибка → **fail-soft**: вебинар всё равно создаётся (статус `planned`, join_url пуст, лог).
  Создание вебинара никогда не валится из-за провайдера (зеркало fail-soft платежей/подписи).

### Webhook (unguarded, tenant-from-session)

**`POST /webinars/webhook`** (`WebinarsWebhookController`, без `TenantGuard` — в bootstrap/публичном списке,
зеркало `PaymentsWebhookController` и `PublicVerifyController`):

1. Найти вебинар по `provider_session_id` → получить `tenant_id` (тенант из строки, не из заголовка).
2. `resolveProviderForTenant(tenantId).parseWebhook(payload, signature)` → события посещаемости.
3. Upsert участников: `attendance_status` (`invited→joined→left`), `joined_at`, `left_at`, `duration_seconds`.
4. Опционально publish realtime `webinar.updated` (событие уже существует).

`raw_body` для проверки подписи реального провайдера — **follow-up активации** (как `rawBody` в `main.ts` у платежей);
Noop/Fake парсят JSON-фолбэк, ок для dormant/staging.

### Controller hardening

`WebinarsController`: каждый эндпоинт получает `@UseGuards(PermissionGuard) + @RequirePermissions(...)` +
`assertValidDto(<Request>, body)` с request-DTO классами (`class-validator`). Self-доступ слушателя —
отдельные `/me/webinars`-маршруты под `webinars.attend` (зеркало `/me/orders` под `payments.self_purchase`):
вернуть вебинары, где слушатель — участник, + join-ссылку.

## Frontend — `features/webinars/`

Новый feature-модуль по форме `features/payments/` (`api.ts`, `hooks.ts`, `types.ts`, `screens.tsx`,
`api.contract.test.ts`); страницы — тонкие обёртки (как `/admin/orders`, `/learner/payments`):

- **`/admin/webinars`** — создать вебинар, список + участники + посещаемость, статус (заменяет нынешний generic `/webinars`).
- **`/admin/webinars/settings`** (или секция-карточка) — выбрать провайдера, base_url, вкл/выкл; под `webinars.configure`.
- **`/learner/webinars`** — «Мои вебинары» + кнопка «Подключиться» (join_url).
- Навигация (`features/navigation/model.ts`): generic-гейт `tenant.read` → `webinars.read` (admin) / `webinars.attend` (learner).
  Старый `/webinars` сворачивается в `/admin/webinars` (без dangling-роута).

## Testing (трио как у платежей + реестр/настройки/резолвер)

- **Provider** (`*.provider.test.ts`): Noop (null/null), Fake (синтетика + prod-guard), Jitsi-каркас (форма).
- **Registry + resolver** (`webinar-provider-resolver.test.ts`): код→инстанс; нет настройки/выключено/`fake`-в-проде → Noop.
- **Env** (`env.webinars.test.ts`): `WEBINARS_ENABLED` парс + prod-guard `fake`.
- **DTO-валидация** (`webinars.dto-validation.test.ts`): формы create/participant/settings.
- **Settings** (`webinar-provider-settings.service.test.ts`): get/upsert per-tenant, default Noop.
- **Service** (`webinars.service.test.ts`): create-проводка fail-soft (провайдер ок / null / throws).
- **Webhook http-integration** (`webinars.http.integration.test.ts`): permission-boundaries authed-эндпоинтов +
  unguarded webhook резолвит тенант из `provider_session_id` + upsert посещаемости.
- **Frontend**: `features/webinars/api.contract.test.ts` (envelope unwrap) + `src/e2e/webinars.e2e.test.ts`
  (module smoke + routing/permissions).

## Out of scope (follow-up specs)

1. **Реальные адаптеры** за реестром: `JitsiWebinarProvider` (create-room + JWT + HMAC-webhook), при желании
   Pruffme/Zoom/BBB; + `rawBody:true` в `main.ts` для верификации подписи над сырыми байтами.
2. **Посещаемость → вебинар-часы/завершение** (кросс-модульная проводка `communication` → `mvp` enrollment/progress).
   Сознательно отложено — это самый рисковый класс сцепки (в Phase 7 дал CRITICAL).
3. **Per-tenant секреты провайдера** (secret-ref/шифрование) — нужно к реальной активации.
4. Ссылки на записи вебинаров; календарные инвайты (.ics); напоминания (переиспользовать Phase 5 `NotificationDispatcher`).

## Risks & mitigations

- **Cross-module coupling** — НЕ трогаем `mvp` в этой итерации (посещаемость durable, но не проводится в часы). Радиус = один модуль.
- **Unguarded webhook** — тенант строго из строки вебинара по `provider_session_id`, кросс-tenant изоляция; реальная
  проверка подписи — follow-up активации (dormant/staging безопасны, Noop/Fake не двигают реальных данных).
- **Plaintext secrets** — таблица настроек хранит только несекретный конфиг; секреты явно отложены.
- **Prod-guard на `fake`** — провайдер per-tenant, поэтому гард в резолвере (а не только в env-refinement): `fake`
  в настройке при `NODE_ENV=production` → Noop + warn.

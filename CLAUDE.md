# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository

trudskill (прежнее имя — CDOProf) — LMS/СДО platform for regulated professional education (ОТ, ПБ, медицина, МЧС, обязательные аттестации). `pnpm` 11.20.0 + Turborepo monorepo. Local path is `D:\Кодинг\7. Trudskill\Trudskill\Trudskill` (Windows, **Cyrillic + spaces — see Gotchas**).

## Documentation hierarchy (SSOT)

When docs disagree, follow the order in [docs/DOCUMENTATION_MAP.md](docs/DOCUMENTATION_MAP.md):

1. Customer-signed protocol (e.g. ТЗ §47 Appendix Б).
2. [TZ_TRUDSKILL_BASE.md](TZ_TRUDSKILL_BASE.md) — product spec / §39 acceptance criteria / §41 backlog. **Поверх него — четыре действующих дельта-ТЗ, разделённых по предмету:**
   - **Что делать дальше: переход с CDOPROF** — [TZ_TRUDSKILL_CDOPROF_MIGRATION.md](TZ_TRUDSKILL_CDOPROF_MIGRATION.md) (паритет функций с CDOPROF + перенос данных; требования `МГ-*`, фазы 0–8, решения РМ1–РМ14). **Единственный документ с незакрытыми задачами — активный фронт работ с 23.09.2026.** Статус, очередь и **правила автономии** — [docs/TZ_CDOPROF_MIGRATION_STATUS.md](docs/TZ_CDOPROF_MIGRATION_STATUS.md). API источника — [docs/audit/cdoprof-openapi-v1.yaml](docs/audit/cdoprof-openapi-v1.yaml).
   - **Стабилизация** — [TZ_TRUDSKILL_STABILIZATION_UX.md](TZ_TRUDSKILL_STABILIZATION_UX.md) (стабилизация, блокеры, UX и развитие; фазы 1–18, решения Р1–Р19, чек-лист приёмки 1–26). Очередь закрыта по коду; **решения Р1–Р19 действуют для всех ТЗ**. Статус — [docs/TZ_STABILIZATION_UX_STATUS.md](docs/TZ_STABILIZATION_UX_STATUS.md).
   - **Как это должно себя вести** — [TZ_TRUDSKILL_ARENDNAYA_SDO.md](TZ_TRUDSKILL_ARENDNAYA_SDO.md) (эпики A–I, ФТ-\*, фазы 0–6; в рамках его эпиков при конфликте деталей приоритет у него). Требования закрыты, остаётся каноном. Статус — [docs/TZ_ARENDNAYA_SDO_STATUS.md](docs/TZ_ARENDNAYA_SDO_STATUS.md).
   - **Как это должно выглядеть** — [docs/TZ_UI_REDESIGN_TRUDSKILL.md](docs/TZ_UI_REDESIGN_TRUDSKILL.md) (ИА, визуальный язык, компоненты, тексты интерфейса, ребрендинг UI; требования `IA-*`/`UI-*`/`CMP-*`/`TPL-*`/`TXT-*`/`A11Y-*`/`BR-*`, фазы 0–8; по вопросам представления приоритет у него). Требования закрыты (94 из 94), остаётся каноном. Статус — [docs/TZ_UI_REDESIGN_STATUS.md](docs/TZ_UI_REDESIGN_STATUS.md).
3. Code + tests; described in [LMS_AGENT_HANDOFF.md](LMS_AGENT_HANDOFF.md) §5.\* (sequentially numbered, currently up to §5.558 — always take the next number from the file) and [docs/TZ_MVP_TRACEABILITY.md](docs/TZ_MVP_TRACEABILITY.md) (BL → file paths).
4. [README.md](README.md) §2 «AI Agent State» — operational snapshot.

### «Продолжай по ТЗ» — что делать

**Шаг 0. Куда идти** (полное правило — [DOCUMENTATION_MAP.md#tz-routing](docs/DOCUMENTATION_MAP.md#tz-routing)):

- **без уточнения** (или «доделывай проект», «по миграции / по переносу / по CDOPROF / по календарю / по задачам») → [docs/TZ_CDOPROF_MIGRATION_STATUS.md](docs/TZ_CDOPROF_MIGRATION_STATUS.md), взять **первую позицию очереди не в ✅ и не целиком в 🚫**. Владельца ни о чём не спрашивать: очередь работ есть только в этом ТЗ, а развилки внутри задач агент решает сам (см. «Автономия по ТЗ перехода» ниже);
- «по стабилизации / по ревью / по UX / по блокерам» → [docs/TZ_STABILIZATION_UX_STATUS.md](docs/TZ_STABILIZATION_UX_STATUS.md) (очередь закрыта, остатки 🟡);
- сказано «по интерфейсу / по редизайну / по UI / по дизайну» → **ТЗ редизайна**; сказано «по аренде / по функциям / по правам» → **ТЗ «Арендная СДО»**. Оба закрыты по требованиям, поэтому чаще всего они не очередь, а **канон формы и поведения** для текущей задачи нового ТЗ;
- **задача названа** → задача важнее очереди: найти её в трекере нового ТЗ, форму взять из редизайна, поведение — из «Арендной СДО»;
- **незакрытых задач нет ни в одном трекере (🚫 «ждёт вход владельца» не считается) и журнал расхождений пуст** → [**режим ревизии**](docs/AUDIT_MODE.md): взять непройденный класс сверки из реестра, искать дефекты кода, находки писать в журнал расхождений. **Не спрашивать «чем заняться» и не придумывать функциональность.**

**Шаг 1. Порядок чтения:**
README §2 → LMS_AGENT_HANDOFF §1 (date/branch) + §5 (recent work) + §13 (Known Issues) → **статус-трекер выбранного ТЗ** (текущая фаза; что сделано / частично / требует сверки / не начато / переделать; решения владельца, блокирующие фазу) → дорожная карта фаз в самом ТЗ → TZ_TRUDSKILL_BASE §41 ↔ TZ_MVP_TRACEABILITY (детальные требования).

Rules for TZ phases (одинаковы для всех четырёх): перед фазой — план в `docs/superpowers/plans/` + апрув владельца (для ТЗ перехода с CDOPROF апрув делегирован — см. ниже); URL/RBAC/контракты `packages/api-contracts` не ломать; миграции только аддитивные; фаза = один PR = один обратимый шаг, ≤30 файлов; фаза заканчивается зелёным `pnpm ci:check`, обновлением handoff и статусов в трекере своего ТЗ. **`ia-architecture.e2e.test.ts` — жёсткий инвариант всех четырёх ТЗ:** конфликт требования с ним — остановиться и спросить (для ТЗ перехода — выбрать вариант, укладывающийся в инвариант, и записать решение), тест под себя не править.

**Автономия по ТЗ перехода с CDOPROF (поручение владельца 23.09.2026).** Владелец поручил решать возникающие вопросы самостоятельно, выбирая наиболее эффективный вариант, и хочет, чтобы «продолжай по ТЗ» доделывало проект. Поэтому по этому ТЗ:

- **вопросов владельцу не задавать**; развилку решать по приоритету: сохранность данных и изоляция → совместимость (контракты/URL/права только добавляются) → обратимость → меньший объём → рекомендация ТЗ; решение — строкой `РМ-N` в журнал решений трекера;
- план фазы писать в `docs/superpowers/plans/`, он **считается утверждённым** — паузы на апрув нет;
- добавления, перечисленные в ТЗ (роли `curator`/`viewer`, права §12, ручки §16, необязательные поля контрактов, новые маршруты и схемы §17), **уже разрешены** — это и есть «решение владельца» для раздела «Границы»;
- нужен вход, которого у агента нет (ключ API, выгрузки CDOPROF, почтовый провайдер, стенд, продление подписки) — код на синтетических фикстурах, живая часть в 🚫, **очередь идёт дальше**; в конце сессии — список открытых пунктов «Что нужно от владельца» одним сообщением (информирование, не вопрос);
- закрыл позицию — **сразу брать следующую**, до исчерпания контекста или очереди;
- необратимое (финальная миграция на боевом контуре, отключение CDOPROF, удаление данных, письма реальным людям) — только владелец, агент готовит runbook.

Специфика ТЗ стабилизации: решения **Р1–Р19 закрыты и не переоткрываются** — при невыполнимости описать препятствие и предложить замену, а не спрашивать «как вы хотите». Всё, что выглядит как число (срок, порог, лимит, число попыток), реализуется настройкой со значением по умолчанию, а не константой. Первая работа по этому ТЗ — **обязательный аудит 0.1**, без него задачи Н3, Н4, Я3, Э6 делать запрещено.

Специфика ТЗ редизайна: у него **шесть развилок с принятым решением по умолчанию** — они work **не блокируют**, действовать по умолчанию, пока владелец не сказал иначе. Шесть мест, где редизайн меняет поведение, а не только вид (§4.9), требуют предупреждения владельца перед реализацией.

## Сверка логики с ТЗ

Работа по коду **включает сверку** затронутого участка с ТЗ — это обязанность, а не инициатива. Смысл: код за 250+ сессий накопил дрейф от документов, и молчаливое «сделал как просили» этот дрейф закрепляет.

**Когда сверять** (не «всегда всё», иначе сверка превращается в ритуал):

1. Правишь экран или компонент → сверить с ТЗ редизайна: бюджеты плотности (§13.2), шаблон страницы (§7), чек-лист миграции экрана (§15.1), тексты (§9).
2. Правишь ручку, право или доменное правило → сверить с ФТ в `TZ_ARENDNAYA_SDO_STATUS.md` и §39 приёмки базового ТЗ.
3. Читаешь код по соседству с задачей и видишь расхождение → **записать**, даже если чинить не будешь.

**Что делать с найденным** — по классу расхождения:

| Класс             | Признак                                                                                                                | Действие                                                                                          |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| **Дефект логики** | Пользователь получает не тот результат: неверный расчёт, утечка между тенантами, fail-open в правах, потерянные данные | Чинить немедленно, независимо от текущей задачи. Права и изоляция — всегда приоритет над версткой |
| **Дефект UX**     | Результат верный, но человек его не находит или не понимает                                                            | Чинить, если экран и так в работе. Иначе — в журнал                                               |
| **Дрейф**         | Код разошёлся с записанным решением (готовый механизм не подключён, регламенты противоречат)                           | В журнал + в план ближайшей подходящей фазы                                                       |
| **Слепая зона**   | Сторожевой тест не покрывает то, что должен                                                                            | В журнал; расширять сторожа **в той же фазе**, где чинятся его нарушители                         |

**Куда записывать:** таблица «Журнал расхождений «код ↔ ТЗ»» в [docs/TZ_UI_REDESIGN_STATUS.md](docs/TZ_UI_REDESIGN_STATUS.md) — одна строка на расхождение, исправленные не удаляются. Расхождения по поведению — туда же, с пометкой класса; если оно тянет на ФТ, продублировать строкой в `TZ_ARENDNAYA_SDO_STATUS.md`.

**Границы — сверка не даёт права чинить всё подряд:**

- **Не править** исторические миграции, контракты `packages/api-contracts`, RBAC-модель и URL маршрутов (ТЗ редизайна §14.1) — только через решение владельца.
- **Не ослаблять сторожевые тесты.** Инвариант можно осознанно изменить с объяснением в описании PR; удалить — нельзя. Красный сторож после правки хардкода — это он работает, а не мешает.
- **Не расширять задачу молча.** Найденное вне рамок задачи идёт в журнал и (при весе) в `mcp__ccd_session__spawn_task`, а не в текущий диф.
- **Не чинить на догадке.** Наборы прав брать из `iam.role_permissions` живой базы, а не из названия роли и не из текста ТЗ (см. §5.242 — на этом уже обожглись дважды за одну сессию).

## Продукт должен быть понятен пользователю любого уровня

Целевой пользователь — администратор учебного центра, не инженер. При выборе между «технически чисто» и «человеку понятно» выигрывает второе; при выборе между «красиво» и «предсказуемо» — второе. Пять правил, действующих на **любом** экране, а не только в фазах редизайна:

1. **Экран отвечает «что делать дальше».** Одно первичное действие, очевидное глазом (`UI-007`). «Обновить» — не действие.
2. **Ни одного сырого URL, ID, кода или англицизма как значения** в таблице или подписи. `severity` → «Критичность», `/admin/tests` → название раздела ссылкой.
3. **Пустой экран объясняет: что это, зачем, что сделать первым** (`TPL-006`). Формулировка «Нет данных» запрещена.
4. **Ошибка говорит, что произошло и что делать**, технический код — под спойлером (`TXT-004`). «Ошибка 500» пользователю ничего не сообщает.
5. **Кнопка называет результат и не переименовывается по ходу сценария** (`TXT-002`, `TXT-003`): «Закрыть группу» — так же в реестре, в карточке, в подтверждении и в сообщении об успехе.

Массовые операции — по принципу частичного успеха: валидные строки принимаются, отказы показываются **поимённо с причиной**, вся пачка из-за одной плохой строки не отменяется.

## Plan-driven workflow

Non-trivial work goes through a written plan before code:

- **Specs** live in [`docs/superpowers/specs/`](docs/superpowers/specs/) — design decisions, scope, open questions.
- **Plans** live in [`docs/superpowers/plans/`](docs/superpowers/plans/) — TDD task breakdowns with file lists, acceptance criteria, deviations.
- Each plan is dated (`YYYY-MM-DD-<topic>.md`) and structured with `## Task N` sections containing `**Files:**`, `**Tasks:**` (checkbox list), `**Acceptance:**`.

Use the `superpowers:writing-plans` skill to author, `superpowers:executing-plans` (sequential) or `superpowers:subagent-driven-development` (parallel) to implement, `superpowers:finishing-a-development-branch` to close.

Recent reference plans: `2026-05-21-magic-link-auth.md` (Phase 1 magic-link), `2026-05-22-regulated-training-foundation-a.md` (Pillar A Plan A), `2026-05-28-phase-2-admin-bulk-enrollment-a.md` (Phase 2 Plan A). Phase 1 + Pillar A merged; Phase 2 Plan A is in PRs #191-#196 as of 2026-05-29.

## Commands

Everything runs from repo root.

```bash
pnpm ci:check            # lint + typecheck + contracts:lint + contracts:typecheck + test:unit + build
pnpm typecheck           # turbo typecheck (8 tasks, cached)
pnpm lint                # turbo lint (next lint for frontend; ESLint for rest)
pnpm test                # turbo test (all projects in parallel)
pnpm test:backend        # vitest --project @trudskill/backend (HEAVY — see Gotchas)
pnpm test:frontend       # vitest --project @trudskill/frontend (~190 tests in ~15s)
pnpm test:contracts      # vitest --project @trudskill/api-contracts
pnpm test:integration    # backend integration suite only
pnpm test:migrations     # SQL migration tests
pnpm test:security       # auth + webhook signatures + state machines

# Run a single test file (the reliable way on Windows):
pnpm --filter @trudskill/backend exec vitest run src/modules/<path>.test.ts --no-file-parallelism
pnpm --filter @trudskill/frontend exec vitest run src/<path>.test.ts --no-file-parallelism

# Lint a single file (useful when pre-existing lint errors elsewhere block full lint):
npx eslint <path> --max-warnings=0

pnpm dev:stack           # docker compose infra + dev backend + dev frontend
pnpm docker:infra        # postgres + redis + rabbitmq + minio only
pnpm contracts:generate  # regenerate OpenAPI/Zod from contracts
```

CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs lint+typecheck, backend tests, frontend tests, contracts tests, and Python tests in parallel jobs on Ubuntu.

## Architecture

**Monorepo layout** (don't deep-import — go through workspace package entrypoints like `@trudskill/shared-types`):

- `apps/backend` — NestJS API. Module-per-domain under `src/modules/` (`iam`, `mvp`, `documents`, `esign`, `communication`, `integrations`, `audit`, `org`, `files`, `health`, `workspace`).
- `apps/frontend` — Next.js 15 App Router + TypeScript. Pages in `app/`, features in `src/features/<domain>/` (each typically: `api.ts`, `hooks.ts`, `types.ts`, `screens.tsx`).
- `apps/realtime` / `apps/worker` — separate Node services for WebSocket push and RabbitMQ consumers (bulk enrollment worker, etc.).
- `packages/api-contracts` — DTO + generated OpenAPI/Zod schemas. **Don't edit `src/generated/*` by hand** — use `pnpm contracts:generate`.
- `packages/shared-types` — runtime-agnostic types shared across apps.
- `packages/ui` — shared UI primitives (`DataTable`, `Column`, etc.) imported as `@trudskill/ui`.

**Database schemas** (PostgreSQL):

- `core` — tenants, users-tenant links.
- `iam` — roles, permissions, role_permissions, sessions, magic_link_tokens.
- `learning` — courses, course_versions, modules, materials, groups, enrollments, progress, **commissions** (Pillar A), **course_document_sets**.
- `assessment` — question banks, tests, attempts, assignments, submissions, reviews.
- `documents` — templates, template_versions, template_variables, template_bindings, numbering_rules, generated_documents.
- `lookup` — global non-tenant data (regulatory_acts).
- `org` — tenant licenses (Pillar A Plan C).
- `audit` — append-only audit log.
- `storage` — file metadata (S3/MinIO refs).
- `crm` — counterparties, deals (early stub).

**Multi-tenant** with strict isolation. Every domain entity has `tenantId` + `createdAt` + `updatedAt` + `status` via `BaseEntity`. Backend uses `TenantGuard` (extracts tenant from JWT + `x-tenant-id` header — must match) + `PermissionGuard` + `@RequirePermissions(...)` decorator.

**Permission model**: dot-separated `<domain>.<action>` (e.g. `learners.write`, `enrollments.read`, `learning.commissions.write`, `assessment.tests.read`). Seeded via numbered SQL migrations (e.g. `0010_iam_role_permissions_and_seed.sql`, `0031_iam_pillar_a_permissions.sql`, `0038_iam_learner_role_and_seed.sql`). When adding a new permission: new migration + assign to roles in same file. `@RequirePermissions('a.b', 'c.d')` requires ALL listed; use multiple decorators for OR.

**Request-scoped state** in MVP module: `MvpService` and `InMemoryMvpState` are `Scope.REQUEST`. `MvpRequestPersistenceInterceptor` loads tenant state at request start, persists mutations at end. **If you add a new in-memory collection, register it in [`apps/backend/src/modules/mvp/infrastructure/mvp-collections.ts`](apps/backend/src/modules/mvp/infrastructure/mvp-collections.ts)** — otherwise it's lost between HTTP requests (this bit Pillar A Plan A Task 10 in HTTP integration tests).

**Persistence backend abstraction** in MVP: `MVP_PERSISTENCE_BACKEND` token has `MemoryMvpPersistenceBackend` + `PostgresMvpPersistenceBackend`. Selected via env (`ALLOW_IN_MEMORY_STATE=true` keeps memory). Bulk load/save tenant state at request boundary, not per-call.

**API envelope.** All responses wrap `{ data, meta: { requestId, correlationId, timestamp } }`. Errors: `{ error: { code, message }, meta }`. Frontend `apiRequest` from [`src/lib/api/client.ts`](apps/frontend/src/lib/api/client.ts) unwraps automatically; tests assert against the envelope shape (see `mvp.http.integration.test.ts`).

**Documents pipeline** ([`apps/backend/src/modules/documents/`](apps/backend/src/modules/documents/)): templates → variables → bindings → numbering → generated_documents. The `enrollment-document-issuance.listener` issues all `autoIssue=true` documents in the course's document set on enrollment completion (Pillar A extended this from «one cert» to «document set»). Variable resolvers are pure functions in `pillar-a-variables.ts` (program / commission / enrollment / document / group_learners categories).

**Canonical E2E for §39 acceptance** — see README §1 «Канонический E2E» for the exact test file list (`business-flows.e2e.test.ts`, HTTP integration tests, role-flow tests, IAM regression). These define what «green» means for product acceptance.

## Backend conventions

- **Controller pattern**: `@Controller()` (root) + `@UseInterceptors(MvpRequestPersistenceInterceptor)` + `@UseGuards(TenantGuard)`. Endpoints add `@UseGuards(PermissionGuard) + @RequirePermissions(...)`.
- **DTO validation**: always `assertValidDto(SomeRequestClass, raw)` from `common/app-validation.pipe.ts` in the controller handler — never trust `@Body()` directly. DTOs use `class-validator` decorators (`@IsString`, `@MinLength`, `@ArrayMaxSize`, `@ValidateNested`, etc.). Bad input throws `BadRequestException` with `{ code, message }` shape.
- **Request context**: `@CurrentContext() c: RequestContext` injects `{ tenantId, userId, sessionId, requestId, correlationId, ip, userAgent }`. Pass it to service methods as last arg.
- **Audit**: every mutation writes via `this.audit(tenantId, actorId, action, entityType, entityId, oldValues, newValues, ctx, metadata?)`. Action names are dot-separated (`learning.learner_created`, `documents.group_order_issued`).
- **Errors**: throw NestJS exceptions with object form `{ code, message }` — e.g. `throw new BadRequestException({ code: 'validation_error', message: '...' })`. `HttpExceptionEnvelopeFilter` wraps to the API envelope.
- **Service instantiation in unit tests**: `new MvpService(state, tenantRepo, audit, documents, files, eventEmitter)` — 6 positional args. Use a `makeServices()` helper (see `learners-bulk-import.service.test.ts`).
- **HTTP integration tests** use a _stub controller_ pattern, not the real `MvpController`. See [`apps/backend/src/modules/mvp/mvp.http.integration.test.ts`](apps/backend/src/modules/mvp/mvp.http.integration.test.ts) — boots a minimal Nest app with a hand-rolled controller that asserts only the permission boundary. Extend that file rather than creating new ones for permission-only tests.

## Frontend conventions

**Любая правка экрана идёт по ТЗ редизайна** ([docs/TZ_UI_REDESIGN_TRUDSKILL.md](docs/TZ_UI_REDESIGN_TRUDSKILL.md)): выбрать шаблон страницы (§7), уложиться в бюджеты плотности (§13.2 — ≤7 пунктов меню, **1** первичное действие, ≤3 блока до сгиба, ≤3 фильтра, ≤7 колонок, ≤3 клика до частой задачи), пройти чек-лист миграции экрана (§15.1). Требования ТЗ (`IA-*`, `UI-*`, `CMP-*`) указываются в описании PR. Оперативный регламент [FRONTEND_UX_GOVERNANCE.md](docs/FRONTEND_UX_GOVERNANCE.md) **подчинён** ТЗ: при расхождении правится governance, а не ТЗ (первое известное расхождение — §2 разрешает 2 первичных действия против 1 по ТЗ).

- **Компонент берётся из `@trudskill/ui`, а не пишется локально.** Новых внешних UI-библиотек не вводится (`RISK-002`), Tailwind и второй дизайн-системы не появляется. Если нужного компонента нет — он добавляется в пакет, а не в экран.
- **Никакого `<style jsx>` и хардкода цветов/радиусов** — только токены. Сторожа `token-discipline.test.ts` / `touch-targets.test.ts` читают `uiGlobalStyles`, поэтому CSS внутри styled-jsx им невиден: это не разрешение, а слепая зона (`UI-020`, `UI-022`).
- **Подтверждение опасного действия — `ConfirmDialog`, не `confirm()`.** ⚠️ В коде живут обе формы вызова: `window.confirm(` и голый `confirm(`. Поиск только по первой даёт неполный результат.
- **Mutations use `useState` + async/await, NOT React Query mutations.** See `useDomainMutations` `wrap` pattern in [`apps/frontend/src/features/mvp/hooks.ts`](apps/frontend/src/features/mvp/hooks.ts:131). Reference examples: `CommissionDetailsScreen.onSaveEditInfo`, `useBulkImportMutation`.
- **`exactOptionalPropertyTypes: true`.** `{ name?: string }` does NOT accept `{ name: undefined }`. Use conditional spread: `{ name, ...(value ? { extra: value } : {}) }`.
- **No React Testing Library in deps.** «E2E» tests in [`src/e2e/`](apps/frontend/src/e2e/) are permission/routing assertions via `evaluateRouteAccess` + `getVisibleNavigation` + pure-function pipeline integration + dynamic-import smoke. Don't write `render()` tests — match the convention in `canonical-e2e-readiness.e2e.test.ts` and `admin-bulk-enrollment.e2e.test.ts`.
- **Navigation entries are data, not JSX.** Add to [`apps/frontend/src/features/navigation/model.ts`](apps/frontend/src/features/navigation/model.ts) — both `routeMeta` (access policy) and `navigationModel` (label + nav slot). `AppShell` renders them dynamically; **no per-section custom layout needed**.
- All `/admin/*` and learner cabinet pages wrap in `<ProtectedPage>` ([`src/widgets/shell/protected-page.tsx`](apps/frontend/src/widgets/shell/protected-page.tsx)) which uses `<AppShell>` (sidebar + breadcrumbs + auth check).
- **State wrappers** for screens: `PageContainer`, `PageHeader`, `SectionCard`, `SectionEmpty`, `SectionError`, `FieldError`, `LoadingState` from `src/components/`.
- **Shared UI** primitives (`DataTable`, `Column`, `StatusChip`, `FilterBar`) from `@trudskill/ui`.
- **API contract tests** stub global `fetch` with `vi.stubGlobal` and assert envelope unwrap + payload shape. See `api.contract.test.ts` per feature.
- **Мобильная проверка 360px обязательна (ФТ-H4).** Каждый новый/изменённый экран проверяется на ширине 360px: без горизонтальной прокрутки (`document.documentElement.scrollWidth === 360`), тач-зоны ≥44×44px (решение владельца №C). Брейкпоинт телефона — `@media (max-width: 480px)` (см. `packages/ui/src/styles/*.ts`); кнопки/поля там становятся 44px автоматически, а `DataTable` превращается в карточки (подписи ячеек — `data-label` из заголовка колонки; сторожевые тесты `phone-breakpoint.test.ts` и `data-label.test.tsx`). Не выносите таблицу из `DataTable` в самодельную разметку — потеряете карточный режим.

## Test categorization

Tests are NOT split by `*.unit.test.ts` / `*.integration.test.ts` filename suffix — they're categorized by **what they exercise**:

- **Service unit tests** (`*.service.test.ts`): instantiate the class directly, test pure business logic without Nest DI.
- **DTO validation** (`*.dto-validation.test.ts`): `plainToInstance` + `validateSync` — schema-level assertions.
- **HTTP integration** (`*.http.integration.test.ts`): boot a minimal NestApplication, test permission boundaries + envelope shape against a stub controller.
- **Business flow E2E** (`business-flows.e2e.test.ts` in backend): full domain flow without browser, using real services.
- **«E2E»** (frontend `src/e2e/*.e2e.test.ts`): permission routing + module smoke; NO React mount.

When adding a feature, the typical test trio: unit tests for the service, DTO validation for the request shape, HTTP integration for the new endpoint's permission boundary.

## Workflow conventions

- **Branches**: `feat/<YYYY-MM-DD>-<slug>`, `fix/...`, `chore/...`, `docs/...`. Date-prefixed.
- **Commits**: Conventional Commits enforced by `commit-msg` hook. Scope is the area: `feat(backend): ...`, `feat(frontend): ...`, `docs(plan): ...`, `chore(tooling): ...`. Use HEREDOC for multi-line messages.
- **Pre-commit** runs `lint-staged` (ESLint `--max-warnings=0 --fix --cache` + Prettier) on staged files only. Pre-existing lint failures elsewhere do NOT block your commit; check your own file with `npx eslint <path> --max-warnings=0`.
- **Pre-push** runs `pnpm typecheck` across the whole monorepo.
- **Never bypass hooks** (no `--no-verify`) unless explicitly asked. If a hook fails, fix root cause and create a new commit (not `--amend` — the failed commit didn't happen).
- **Migrations** are numbered SQL in [`apps/backend/migrations/`](apps/backend/migrations/). **Don't edit historical files.** Latest is `0109_normalized_search_trgm_indexes.sql` as of 2026-09-23. Pick the next free number for new ones (numbers in the CDOPROF migration TZ are proposals).
- **PR description** template: `## Summary` (1-3 bullets) + `## Test plan` (checklist). PRs are squash-merged.

## Gotchas (Windows + Cyrillic path)

The repo path contains Cyrillic (`Кодинг`). This affects:

- **Full `pnpm test:backend` now runs green locally** (2026-06-27: 244 files / 1853 tests, single process, no crash). The long-standing `tinypool` / `ERR_IPC_CHANNEL_CLOSED` "crash" was NOT a path problem — it was `mvp.domains.http.integration.test.ts` booting the real `MvpController` while missing two providers (`LearnerPdfCardService`, `LearnersBulkImportService`); `NestFactory`'s default `abortOnError:true` reacted to the `UnknownDependenciesException` by calling `process.abort()`, which hard-kills the vitest worker pool. Fixed by providing the deps + `abortOnError:false`. A second class of failure (boot `beforeAll` hooks pinned to an explicit `}, 30_000)` timing out under full-suite CPU contention) was fixed by bumping all Nest-booting boot hooks to `120_000`.
- **Test output is buffered** under the Cyrillic path — a backgrounded vitest run often flushes only the final summary (or nothing until exit). Rely on the process exit code and the `Test Files` / `Tests` summary lines, and redirect to a file when you need per-test detail.
- When reading migration/fixture files in tests, resolve paths via `__dirname` (or an `existsSync` dual-candidate), **never `process.cwd()`** — cwd differs between root (`pnpm test:backend`) and `apps/backend` (`pnpm --filter` runs).
- Frontend full suite (`pnpm test:frontend`) works fine.

PowerShell-specific (the default shell on this machine): use `$null`, not `/dev/null`; use `$env:VAR`, not `$VAR`. Bash is available via the `Bash` tool for POSIX scripts.

## Gotchas (pnpm 11)

Проект перешёл на pnpm 11.20.0 (2026-08-05). Две особенности, о которые легко споткнуться:

- **Установочные скрипты зависимостей по умолчанию НЕ выполняются**, и неразрешённый скрипт — это **ошибка** установки (`ERR_PNPM_IGNORED_BUILDS`), а не предупреждение. Ответ по каждому пакету задаётся в `pnpm-workspace.yaml` → `allowBuilds`. Новая зависимость с установочным скриптом уронит `pnpm install`, пока её туда не впишут: `true` — если без скрипта пакет не работает (нативный бинарник), `false` — если скрипт печатает баннер или готовит то, чем мы не пользуемся.
- **`confirmModulesPurge: false` в `pnpm-workspace.yaml` убирать нельзя.** pnpm 11 переспрашивает перед сносом `node_modules`, а без терминала просто отказывается работать (`ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`). Наши установки идут из CI и из cron автообновления стенда — подтвердить там некому.
- Версия pnpm берётся из поля `packageManager`: старый pnpm 9 сам скачает и запустит 11.20.0, руками обновлять ничего не нужно. Поэтому же `pnpm --version` в проекте всегда печатает версию из `package.json`, а не установленную.

## Domain-specific patterns

- **СНИЛС validation** uses ПФР checksum algorithm (sum < 100 → sum / sum ∈ {100,101} → 00 / sum > 101 → mod 101, with result ∈ {100,101} → 00). Implementation + test vectors in [`apps/backend/src/modules/mvp/learners-bulk-import.service.ts`](apps/backend/src/modules/mvp/learners-bulk-import.service.ts:48). Frontend mirror in [`apps/frontend/src/features/bulk-enrollments/validators.ts`](apps/frontend/src/features/bulk-enrollments/validators.ts) (documented deliberate duplication — extract to `shared-types` if ≥3 drift fixes).
- **ФИО parsing** assumes Russian convention `Фамилия Имя [Отчество]`. Use `parseFullName` from `learners-bulk-import.service.ts`; **do NOT** naive `name.split(' ')` (the older `MvpService.createLearner` does this and gets it wrong — use `createLearnerExtended` instead when handling Russian FIO).
- **Partial-success principle**: bulk operations (Excel imports, mass enrollments) accept valid rows and report per-row errors; never abort the whole batch on one bad row. Outcome shape: `{ total, created, reused, failed, rows: [{ rowNumber, status, ... }] }`.
- **Idempotency**: bulk endpoints take `idempotencyKey`. Outcomes are cached per `(tenantId, idempotencyKey)` in a dedicated state collection. Separate keyspaces for separate flows (`bulkImportIdempotency` ≠ `bulkEnrollmentIdempotency`). When wrapping one bulk call inside another, derive a sub-key: `${userKey}::<flow-name>`.
- **Audit log** entries have `metadata.delegated = true` when an action was performed via `learners.act_as` delegation (e.g. teacher acting on behalf of a learner).

## After every engineering session

Per [docs/DOCUMENTATION_MAP.md §agent-handoff-protocol](docs/DOCUMENTATION_MAP.md#agent-handoff-protocol):

1. Update [README.md](README.md) §2 «AI Agent State»: Current Stage / Last Completed Task / Current Task / Next Task / Last Updated At / By.
2. Append a `### 5.XX` entry to [LMS_AGENT_HANDOFF.md](LMS_AGENT_HANDOFF.md) §5 with: summary, files changed, test status, deviations. **Номер брать из файла, а не из этой строки и не из README** — оба отстают (на 2026-08-11 handoff дошёл до §5.258, а README называл текущим §5.253).
3. Update the status tracker of the ТЗ you worked on: [TZ_CDOPROF_MIGRATION_STATUS.md](docs/TZ_CDOPROF_MIGRATION_STATUS.md) (активный фронт: «Где мы сейчас» + очередь + статусы `МГ-*` + журнал решений агента + «Что нужно от владельца» + чек-лист приёмки), [TZ_STABILIZATION_UX_STATUS.md](docs/TZ_STABILIZATION_UX_STATUS.md) (стабилизация), [TZ_ARENDNAYA_SDO_STATUS.md](docs/TZ_ARENDNAYA_SDO_STATUS.md) (поведение) или [TZ_UI_REDESIGN_STATUS.md](docs/TZ_UI_REDESIGN_STATUS.md) (интерфейс) — статусы требований + журнал сессий. Если сессия шла в [режиме ревизии](docs/AUDIT_MODE.md) — дописать строку в реестр прогнанных классов, даже если результат «чисто».
4. **Записать в журнал расхождений** ([TZ_UI_REDESIGN_STATUS.md](docs/TZ_UI_REDESIGN_STATUS.md)) всё, что сверка выявила по ходу, — включая исправленное в этой же сессии.
5. If working from a plan in `docs/superpowers/plans/`, cross-link the plan from the handoff entry and tick off completed checkboxes in the plan file.
6. If you spawned new follow-up work (e.g. via `mcp__ccd_session__spawn_task`), mention it so the next agent doesn't duplicate it.

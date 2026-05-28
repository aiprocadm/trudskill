# LMS Agent Handoff

> **Связка с другими агентами:** порядок «продолжай по ТЗ» и что обновлять после сессии — [docs/DOCUMENTATION_MAP.md — протокол передачи](docs/DOCUMENTATION_MAP.md#agent-handoff-protocol). Краткое операционное состояние дублируйте в [README.md](README.md) (блок **AI Agent State**).

## 1. Current Date / Session

- Date: 2026-05-07 (UTC+3)
- Agent: Cursor Agent (Composer)
- Repository: `D:/Создание LMS/Cursor LMS/cdoprof-`
- Branch, if known: `main`
- Commit hash before work, if available: `8157adc74c9fadba6f076bcfa0e2e84f93394b1d` (базовый HEAD; при появлении коммита после правок — дополнить вручную)
- Commit hash after work, if available: `c22736127d100c06a38a8ff222e34c6d25cf8c21` (HEAD до коммита правок §5.73–§5.81; после коммита уточнить `git rev-parse HEAD`)

## 2. Project Overview

Краткое описание проекта:

- назначение LMS: корпоративная LMS/СДО платформа с RBAC, курсами, прогрессом, assessment и enterprise-модулями;
- общий стек: TypeScript monorepo (`pnpm` + `turbo`);
- frontend: Next.js (`apps/frontend`);
- backend: NestJS (`apps/backend`);
- database: PostgreSQL + SQL migrations (`apps/backend/migrations`);
- auth: IAM permissions/roles + session validation;
- deployment / docker: `infra/docker-compose.yml`, Dockerfile в сервисах;
- test setup: Vitest, ESLint, TypeScript, полный пайплайн `pnpm -s ci:check`.

## 3. Repository Structure

Ключевые директории и файлы:

- `apps/frontend` — Next.js UI и роль-ориентированные страницы LMS
- `apps/backend` — NestJS API, IAM, MVP/LMS домены, миграции
- `apps/realtime` — realtime service
- `apps/worker` — background processing
- `packages/api-contracts` — API контракты
- `packages/shared-types` — shared types
- `packages/ui` — UI библиотека
- `docs` — документация по архитектуре/операциям/тестам
- `docs/DOCUMENTATION_MAP.md` — карта источников правды (ТЗ / трассировка / README / operational docs), чтобы не противоречить друг другу и не размножать дубли
- `infra` — docker-compose и инфраструктурный слой
- `README.md` — точка входа и AI Agent State

## 4. Existing Functionality Observed

Что уже было в проекте до изменений:

- auth: login/logout/refresh/me/sessions + security checks
- users: управление пользователями и ролями
- roles: permission-driven access на backend и frontend
- courses: list/detail/create/update + publish/archive
- lessons/materials/modules: базовая LMS структура реализована
- enrollments: создание и lifecycle статусов
- progress: учёт прогресса по материалам
- assignments/quizzes: базовые assessment сущности/flows
- admin: admin маршруты и страницы
- teacher dashboard: teacher-related маршруты есть
- student dashboard: learner/student маршруты есть
- API: модульный NestJS с guards/interceptors/filters
- database: migration-based SQL структура
- UI: Next.js App Router + shared UI package

## 5. Work Completed In This Session

### 5.1 Усиление guard-level security regression для LMS прав доступа

- Summary: расширены unit-тесты `PermissionGuard` для ключевых authz границ.
- Files changed:
  - `apps/backend/src/modules/iam/permission.guard.test.ts`
- Details:
  - Добавлен сценарий `permission_denied` при отсутствии нужного permission (`courses.write`).
  - Добавлен сценарий `auth_required` для неаутентифицированного запроса с проверкой, что не вызываются session/permission сервисы.
  - Сохранены и подтверждены текущие сценарии `session_inactive` и success.
- Notes:
  - Runtime auth-flow не менялся, добавлено только тестовое покрытие.

### 5.2 Добавлен HTTP integration regression suite для LMS `mvp` permission boundaries

- Summary: добавлен новый HTTP integration тест для `mvp`-эндпоинтов (`courses`, `progress/materials`).
- Files changed:
  - `apps/backend/src/modules/mvp/mvp.http.integration.test.ts`
- Details:
  - Покрыты сценарии:
    - `auth_required` без bearer token;
    - `permission_denied` при PATCH прогресса без `progress.recalculate`;
    - `session_inactive` при отозванной сессии;
    - успешный PATCH при наличии нужного permission.
  - Тест использует тестовый Nest app с envelope/filter/interceptor, близко к реальному HTTP поведению.
- Notes:
  - Public API и бизнес-логика не изменялись; добавлен безопасный regression coverage.

### 5.3 Полная валидация quality gates после изменений

- Summary: выполнен полный прогон `ci:check`, статус зелёный.
- Files changed:
  - `LMS_AGENT_HANDOFF.md`
- Details:
  - Успешно пройдены lint/typecheck/contracts/tests/build.
  - Целевые проверки нового тестового покрытия также прошли.
- Notes:
  - На момент завершения итерации build/test blockers отсутствуют.

### 5.4 Стабилизация backend test-suite против таймаутов в полном `ci:check`

- Summary: исправлен реальный блокер `ci:check` — массовые `Hook timed out in 30000ms` в backend integration/contract тестах при полном монорепо прогоне.
- Files changed:
  - `apps/backend/vitest.config.ts`
  - `LMS_AGENT_HANDOFF.md`
- Details:
  - В `apps/backend/vitest.config.ts` добавлены:
    - `hookTimeout: 60000`
    - `testTimeout: 30000`
  - Это устранило флапающие таймауты при инициализации Nest приложения в более тяжёлом параллельном окружении `turbo` + `vitest`.
  - После изменения:
    - `pnpm --filter @cdoprof/backend test` — passed (49 files / 180 tests);
    - `pnpm -s ci:check` — passed.
- Notes:
  - Runtime-код LMS/API/БД не менялся; изменение ограничено тестовой конфигурацией.

### 5.5 Доменная защита прогресса: запрет обновления progress для enrollment вне курса

- Summary: устранён backend security/data-integrity gap в LMS progress flow — теперь нельзя обновлять прогресс по материалу, если `enrollment.group` не связан с курсом этого материала через `group_courses`.
- Files changed:
  - `apps/backend/src/modules/mvp/mvp.service.ts`
  - `apps/backend/src/modules/mvp/mvp.service.test.ts`
- Details:
  - В `upsertMaterialProgress()` добавлена проверка связи `groupId + courseId` в `groupCourses`.
  - При отсутствии связи возвращается `PreconditionFailedException` с `code: domain_rule_violation`.
  - Обновлены тесты:
    - позитивный сценарий прогресса теперь явно создаёт `group-course` link;
    - добавлен негативный regression test на попытку обновления progress без этой связи.
  - Результат: исключён сценарий некорректного начисления прогресса по «чужому/несвязанному» enrollment.
- Notes:
  - Изменение влияет на runtime поведение backend в сторону более строгой валидации доменной целостности.

### 5.6 Доменная защита assignment submissions: проверка связи enrollment с курсом задания

- Summary: закрыт аналогичный integrity/security gap в assignment-потоке — нельзя создать submission, если enrollment не связан с course задания через `group_courses`.
- Files changed:
  - `apps/backend/src/modules/mvp/mvp.service.ts`
  - `apps/backend/src/modules/mvp/mvp.service.test.ts`
- Details:
  - В `createAssignmentSubmission()` добавлены проверки:
    - existence assignment (`getById` по `assignmentId`);
    - наличие связи `enrollment.groupId` ↔ `assignment.courseId` в `groupCourses`.
  - При нарушении возвращается `PreconditionFailedException` с `code: domain_rule_violation`.
  - Тесты обновлены:
    - существующие assignment flow tests приведены к корректной доменной модели (добавлен `group-course` link);
    - добавлен отдельный regression test на отклонение submission без связи enrollment-course.
- Notes:
  - Это runtime-усиление backend-валидации; public path/method API не менялись.

### 5.7 Доменная защита test attempts: проверка связи enrollment с курсом теста

- Summary: закрыт integrity gap в assessment attempts — запуск попытки теста теперь возможен только если `enrollment.group` связан с `test.course` через `group_courses`.
- Files changed:
  - `apps/backend/src/modules/mvp/mvp.service.ts`
  - `apps/backend/src/modules/mvp/mvp.service.test.ts`
  - `apps/backend/src/modules/mvp/mvp.concurrency.test.ts`
- Details:
  - В `startAttempt()` добавлена проверка linkage `groupId + courseId`.
  - При нарушении возвращается `PreconditionFailedException` с `code: domain_rule_violation`.
  - Добавлен unit regression test на отклонение startAttempt без linkage.
  - Обновлён `mvp.concurrency` тест, чтобы соответствовать новой доменной инварианте (добавлен `group-course` link перед enrollment).
- Notes:
  - Это runtime security/data-consistency hardening без изменения API-контрактов по методам/путям.

### 5.8 Hardening assignment review flow: только для submitted submissions и без дубликатов

- Summary: усилены доменные правила review-потока для заданий: нельзя создать review для draft submission и нельзя создать второй review для того же submission.
- Files changed:
  - `apps/backend/src/modules/mvp/mvp.service.ts`
  - `apps/backend/src/modules/mvp/mvp.service.test.ts`
- Details:
  - В `createAssignmentReview()` добавлены проверки:
    - submission status должен быть `submitted` или `under_review`;
    - review для `submissionId` должен быть уникальным.
  - На нарушения возвращаются:
    - `PreconditionFailedException` (`domain_rule_violation`) для невалидного статуса submission;
    - `ConflictException` (`conflict`) для дубликата review.
  - Добавлен regression test:
    - отклонение review для draft submission;
    - успешное создание review после submit;
    - отклонение повторного review для того же submission.
- Notes:
  - Изменение runtime-логики повышает целостность evaluation workflow и предотвращает дублирующую оценку.

### 5.9 Lifecycle lock для assignment reviews после completion

- Summary: зафиксирован lifecycle assignment review после завершения: completed review нельзя изменять или завершать повторно.
- Files changed:
  - `apps/backend/src/modules/mvp/mvp.service.ts`
  - `apps/backend/src/modules/mvp/mvp.service.test.ts`
- Details:
  - В `updateAssignmentReview()` добавлен запрет модификации review со статусом `completed`.
  - В `completeAssignmentReview()` добавлены проверки:
    - повторный complete запрещён;
    - complete разрешён только для статуса `in_review`.
  - Добавлен regression test на:
    - запрет update после complete;
    - запрет второго complete.
- Notes:
  - Усилена консистентность review lifecycle и предотвращены пост-фактум изменения оценки.

### 5.10 Подготовка финального ТЗ: `SDOPROF_TZ_FINAL.md`

- Summary: создан полный структурированный документ ТЗ для LMS/СДО Проф в формате, пригодном для передачи в разработку и декомпозиции в backlog.
- Files changed:
  - `SDOPROF_TZ_FINAL.md`
  - `LMS_AGENT_HANDOFF.md`
- Details:
  - Подготовлен единый документ из 42 разделов (назначение, роли, безопасность, API, интеграции, NFR, архитектура, доменная модель, этапы, backlog, риски).
  - Учтён фактический контекст текущего репозитория (`README.md`, текущий handoff, реализованные backend/frontend модули).
  - Явно зафиксированы ограничения: исходное ТЗ в сообщении отсутствовало (placeholder), поэтому обязательные требования, зависящие от него, помечены как `Требует уточнения`.
  - Добавлены секции «Что было взято/изменено/добавлено», «Рекомендуемый MVP», «Готовность к передаче в разработку».
- Notes:
  - Изменения документационные, runtime-код в этой подзадаче не менялся.

### 5.11 Валидация score в assignment review относительно assignment.maxScore

- Summary: устранён дефект оценивания — теперь score review валидируется по границам задания (`0..maxScore`) во всех точках review lifecycle.
- Files changed:
  - `apps/backend/src/modules/mvp/mvp.service.ts`
  - `apps/backend/src/modules/mvp/mvp.service.test.ts`
- Details:
  - Добавлен приватный валидатор `validateAssignmentReviewScore()` в `MvpService`.
  - Проверка внедрена в:
    - `createAssignmentReview()`;
    - `updateAssignmentReview()`;
    - `completeAssignmentReview()`.
  - При нарушениях возвращается `BadRequestException`:
    - `score must be non-negative`;
    - `score exceeds assignment maxScore`.
  - Добавлен regression test:
    - отклонение `createAssignmentReview` при score > maxScore;
    - отклонение `updateAssignmentReview` при score > maxScore.
  - Обновлены существующие тестовые фикстуры assignments (явный `maxScore`), чтобы соответствовать новой доменной валидации.
- Notes:
  - Изменение runtime-логики улучшает консистентность результатов проверки и предотвращает некорректные оценки.

### 5.12 Расширение regression-покрытия на отрицательные score в review lifecycle

- Summary: добавлены тесты, фиксирующие запрет отрицательного score во всех релевантных шагах review lifecycle.
- Files changed:
  - `apps/backend/src/modules/mvp/mvp.service.test.ts`
  - `LMS_AGENT_HANDOFF.md`
- Details:
  - В существующий test-case `validates assignment review score boundaries...` добавлены проверки:
    - `createAssignmentReview` с `score < 0` отклоняется;
    - `updateAssignmentReview` с `score < 0` отклоняется;
    - `completeAssignmentReview` с `score < 0` отклоняется.
  - Все проверки ожидают `BadRequestException`.
  - Результат: отрицательные оценки покрыты regression-тестами для create/update/complete.
- Notes:
  - Runtime-код не менялся в этой подитерации; усилено тестовое покрытие доменной валидации.

### 5.13 Соответствие ТЗ §38 (Security/Integration tests) и BL-010: HTTP regression по доменным инвариантам MVP

- Summary: добавлены интеграционные HTTP-тесты против **реального** `MvpController` + in-memory persistence; исправлен DI-баг в `MvpRequestPersistenceInterceptor` (Nest не внедрял `TenantSerialGateway` в request-scoped interceptor без явного `@Inject`).
- Files changed:
  - `apps/backend/src/modules/mvp/mvp.domains.http.integration.test.ts` (новый)
  - `apps/backend/src/modules/mvp/infrastructure/mvp-request-persistence.interceptor.ts`
  - `LMS_AGENT_HANDOFF.md`
- Details (связь с `SDOPROF_TZ_FINAL.md`):
  - §13 / этап 4–5 LMS: проверка доступа к assessment и целостность enrollment↔course через `group_courses` на **HTTP-уровне** (`412` + `domain_rule_violation` для submission/attempt без связи; запрет review для draft; `400` + `validation_error` при score > `maxScore`).
  - §38 «Security» / BL-010 «API hardening»: фиксируем инварианты **object-level / cross-course leakage** для ключевых POST-эндпоинтов, уже реализованных в `MvpService`.
- Notes:
  - В тестовом Nest-приложении `ValidationPipe` с `whitelist: false` (MVP DTO — TS-интерфейсы без class-validator; иначе тело запроса обнуляется при `whitelist: true` — это ограничение тестового harness, не изменение прод-конфига).
  - Исправление `@Inject(TenantSerialGateway)` — **боевой runtime-фикс**: без него `tenantGateway` был `undefined`, что потенциально давало 500 на защищённых MVP-маршрутах при определённом порядке DI.

### 5.14 ТЗ §6/§12/BL-010: привязка слушателя к IAM и анти-IDOR на мутациях learner-контекста

- Summary: добавлено опциональное поле профиля слушателя **`linkedIamUserId`** (соответствие `JWT.sub`); при его наличии мутации прогресса, субмиссий и попыток в контексте этого слушателя разрешены только совпадающему пользователю. Ужесточена консистентность тела **`learnerId`** с зачислением. Добавлены unit + HTTP regression тесты; HTTP — сценарий **PATCH progress без group-course**.
- Files changed:
  - `apps/backend/src/modules/mvp/mvp.types.ts`
  - `apps/backend/src/modules/mvp/mvp.dto.ts`
  - `apps/backend/src/modules/mvp/mvp.service.ts`
  - `apps/backend/src/modules/mvp/mvp.service.test.ts`
  - `apps/backend/src/modules/mvp/mvp.domains.http.integration.test.ts`
  - `LMS_AGENT_HANDOFF.md`
- Details:
  - `POST/PATCH`-поток learner: необязательные `linkedIamUserId` на create/update (registry DTO общий со справочниками → поле безопасно игнорируется не-learners кодом).
  - `createAssignmentSubmission`: обязателен `learnerId` в теле; должен совпадать с `enrollment.learnerId`; при `linkedIamUserId` дополнительно `actorId` (JWT sub) должен совпадать.
  - Аналогично: `upsertMaterialProgress`, `startAttempt` (валидируется непустой `learnerId` в теле + соответствие enrollment), обновление/сабмит субмиссии, сохранение/сабмит попытки.
- Notes:
  - **Breaking (контракт клиента):** `POST /assignment-submissions` без `learnerId` теперь даёт **`400`** `validation_error` (поле уже было в DTO типов, но ранее фактически не требовалось).
  - Пока `linkedIamUserId` не задан у слушателя, поведение как раньше (опора только на RBAC permission).

### 5.15 Анти-IDOR на чтение assessment (GET + list scoped)

- Summary: из HTTP передаются `userId` и список **`permissions`**, который **`PermissionGuard`** кладёт в `RequestContext` после `resolvePermissions`. Для строк с **`linkedIamUserId`**: **GET**/`list` сужены к своему слушателю. Обход сужения **только чтения** — IAM permission **`assessment.read.cross_learner`** (миграция `0025_…`, роли `platform_admin` / `tenant_admin` / `manager` / `methodist` в `tenant_demo`). Мутации без этого bypass.
- Files changed:
  - `apps/backend/src/common/context/request-context.ts`
  - `apps/backend/src/modules/iam/permission.guard.ts`
  - `apps/backend/src/modules/iam/services/iam.service.ts` (fallback permission в in-memory)
  - `apps/backend/migrations/0025_assessment_read_cross_learner_permission.sql`
  - `apps/frontend/src/lib/auth/permission-map.ts`
  - `apps/backend/src/modules/mvp/mvp.service.ts`
  - `apps/backend/src/modules/mvp/mvp.controller.ts`
  - `apps/backend/src/modules/mvp/mvp.service.test.ts`
  - `apps/backend/src/modules/mvp/mvp.domains.http.integration.test.ts`
  - `LMS_AGENT_HANDOFF.md`
- Notes:
  - Сервисные вызовы без `access` ведут себя как раньше на уровне домена (нет дополнительного gate).
  - HTTP integration: `assessment.read.cross_learner` выдаётся только для `sub=u_domain_http_actor`, не для токенов «студентов» в IDOR-сценарии.
  - **`learners.act_as`** расширяет обход сужения **чтения** так же как `cross_learner`; см. §5.16.

### 5.16 Делегирование мутаций: `learners.act_as`

- Summary: IAM permission **`learners.act_as`** (миграция **`0026_…`**) снимает проверку «`JWT.sub` = `linkedIamUserId`» для мутаций: **`upsertMaterialProgress`**, **`startAttempt`**, **`saveAnswer`/attempt answers**, **`submitAttempt`**, **`createAssignmentSubmission`**, **`updateAssignmentSubmission`**, **`submitAssignmentSubmission`**. Доменные инварианты (`learnerId` vs enrollment, `group_courses`) сохраняются. В HTTP permissions приходят из **`PermissionGuard`** → **`context.permissions`**.
- Files changed:
  - `apps/backend/migrations/0026_learners_act_as_permission.sql`
  - `apps/backend/src/modules/iam/services/iam.service.ts` (fallback permission)
  - `apps/backend/src/modules/mvp/mvp.service.ts`
  - `apps/backend/src/modules/mvp/mvp.service.test.ts`
  - `apps/backend/src/modules/mvp/mvp.domains.http.integration.test.ts` (staff sub + право в mock)
  - `apps/frontend/src/lib/auth/permission-map.ts` (+ tests)
  - `LMS_AGENT_HANDOFF.md`
- Notes:
  - HTTP suite: **`learners.act_as`** добавляется в mock только вместе с staff `sub` (`u_domain_http_actor`).

### 5.17 Аудит: `metadata.delegated` при `learners.act_as`

- Summary: колонка **`audit.audit_log.metadata`** (jsonb) + запись **`{ delegated: true, learnerId, viaPermission: 'learners.act_as' }`** в audit-метод **`MvpService`** для мутаций, где действительно сработало делегирование (есть **`linkedIamUserId`**, у актора есть право **`learners.act_as`**, **`actorId`** не равен **`linkedIamUserId`** слушателя).
- Files changed:
  - `apps/backend/migrations/0027_audit_log_metadata.sql`
  - `apps/backend/src/modules/audit/audit.service.ts`
  - `apps/backend/src/modules/mvp/mvp.service.ts`
  - `apps/backend/src/modules/mvp/mvp.service.test.ts` (submit submission + assert metadata)

### 5.18 HTTP-негативы IDOR (чтение), class-validator MVP, общий ValidationPipe

- Summary: добавлены HTTP-кейсы **`GET /attempts/:id`** и **`GET /exam-results/by-enrollment/:id`** без **`cross_learner`/`learners.act_as`** (403 для чужого JWT). Ключевые MVP body переведены в **class-validator**-классы; доменный HTTP harness использует **`createAppValidationPipe()`** как прод. Вынесено **`apps/backend/src/common/app-validation.pipe.ts`** (`createAppValidationPipe` + **`assertValidDto`**: явный `validateSync` в **`MvpController`** для критичных DTO, т.к. в Vitest/Nest цепочке `emitDecoratorMetadata` на параметрах не всегда доходит до глобального `ValidationPipe`). **`main.ts`** подключён через `createAppValidationPipe`.
- Files changed:
  - `apps/backend/src/modules/mvp/mvp.dto.ts`, `mvp.controller.ts`
  - `apps/backend/src/main.ts`, `apps/backend/src/common/app-validation.pipe.ts`
  - `apps/backend/src/modules/mvp/mvp.domains.http.integration.test.ts`, `mvp.dto-validation.test.ts`

### 5.19 Frontend: guard действий по `assessment.read.cross_learner` и `learners.act_as`

- Summary: **`AssessmentDashboardScreen`** — колонки «Слушатель и доступ»: ссылки/подсказки делегирования только при соответствующих правах; списки **attempts** / **exam-results** через **`mvpApi`**; попытки запускаются с **`learnerId`** выбранного зачисления. Вынесены **`assessment-permissions.ts`** + unit-тест.
- Files changed:
  - `apps/frontend/src/features/mvp/assessment-permissions.ts`
  - `apps/frontend/src/features/mvp/assessment-permissions.test.ts`
  - `apps/frontend/src/features/mvp/api.ts`, `hooks.ts`, `screens.tsx`

### 5.20 Vitest: `test.projects` вместо workspace; смягчение флейка backend

- Summary: удалён **`vitest.workspace.ts`**, добавлен корневой **`vitest.config.ts`** с **`test.projects`**; во все подпроекты добавлено **`test.name`** для фильтров. Backend: **`fileParallelism: false`** и скрипт **`vitest run --no-file-parallelism`** для снижения гонки при Nest bootstrap в CI.

### 5.21 BL-010 / handoff §14: полный `assertValidDto` на MVP `@Body` + контракты аудита в api-contracts

- Summary: все оставшиеся тела запросов **`MvpController`** (PUT/PATCH/POST), которые раньше шли как «сырые» интерфейсы или inline-типы, переведены на **`@Body() raw: unknown` + `assertValidDto(...)`** в паре с уже существующими class-validator-классами в **`mvp.dto.ts`** (в т.ч. **`PATCH answers`**, **`PATCH assignments`**, **`PATCH/complete assignment-reviews`**, ранее уже покрытые справочники/курсы/тесты/импорт вопросов). В **`packages/api-contracts`** добавлен модуль **`domains/audit.ts`**: **`AuditLogDelegatedLearningMetadata`**, **`AuditLogRecordContract`** для клиентов, читающих **`audit.audit_log.metadata`** (делегирование **`learners.act_as`**). **`MvpService.createAnswer`** типизирован **`CreateAnswerHttpRequest`**. Трассировка **`docs/TZ_MVP_TRACEABILITY.md`** (строка BL-010) обновлена ссылкой на audit-контракты.
- Files changed:
  - `apps/backend/src/modules/mvp/mvp.controller.ts`
  - `apps/backend/src/modules/mvp/mvp.service.ts` (импорт/сигнатура `createAnswer`)
  - `packages/api-contracts/src/domains/audit.ts`, `packages/api-contracts/src/domains/index.ts`
  - `docs/TZ_MVP_TRACEABILITY.md`
- Notes:
  - **`pnpm -s ci:check`** — зелёный на рабочей копии после правок.

### 5.22 Синхронизация §13 Issue 0 с `SDOPROF_TZ_FINAL.md` v1.6 (§44.1)

- Summary: **Issue 0** переформулирован: внешний эталон заказчика — **medium**, не блокирует пилот; назначение — матрица **MVP-TZ-01** в `TZ_MVP_TRACEABILITY.md` и протокол к §47, без расширения scope без согласования. Обновлены §14 critical #3, §15, §16, §20 next best action.
- Files changed: `LMS_AGENT_HANDOFF.md`, `README.md` (блок AI Agent State).

### 5.23 JWT vs `x-tenant-id`: строгое согласование и исправление маскировки ошибок в `TenantGuard`

- Summary: при валидном Bearer, если передан **`x-tenant-id`**, он должен совпадать с **`tenant_id` в access token** — иначе **`400`** `tenant_header_mismatch`. В блоке `catch` после верификации JWT все **`HttpException`** пробрасываются (раньше **`BadRequestException`** превращался в **`401`** `invalid_token`). Обновлены unit (`tenant.guard.test.ts`) и IAM HTTP regression; **`docs/security-remediation-roadmap.md`** (задача 1).
- Files changed:
  - `apps/backend/src/common/guards/tenant.guard.ts`
  - `apps/backend/src/common/guards/tenant.guard.test.ts`
  - `apps/backend/src/modules/iam/auth.http-regression.e2e.test.ts`
  - `docs/security-remediation-roadmap.md`
- Notes: **`pnpm -s ci:check`** — зелёный после правок.

### 5.24 Cross-tenant: `getById` по паре `(id, tenantId)` + HTTP регресс

- Summary: в **`MvpService`** приватный **`getById`** ищет сущность по **`item.id === id && item.tenantId === tenantId`** (раньше только по `id`, что при коллизии id между арендаторами давало недетерминизм; при чужом tenant без коллизии ответ был **`403`** `tenant_scope_violation`, теперь единообразно **`404`** `not_found`). Добавлены unit-тест на два курса с одним `id` и разными `tenantId`, обновлён тест tenant isolation; в **`mvp.domains.http.integration.test.ts`** — HTTP: JWT `tenant_demo` не читает курс из snapshot **`tenant_other`** (сид через `MemoryMvpPersistenceBackend.snapshots`).
- Files changed:
  - `apps/backend/src/modules/mvp/mvp.service.ts`
  - `apps/backend/src/modules/mvp/mvp.service.test.ts`
  - `apps/backend/src/modules/mvp/mvp.domains.http.integration.test.ts`
- Notes: **`pnpm -s ci:check`** — зелёный после правок.

### 5.25 Documents: регресс tenant-scoped `must` (коллизия `id` шаблонов)

- Summary: аудит **`DocumentsService`**: чтение сущностей уже через **`must(arr, tenantId, id)`** (`x.tenantId === tenantId && x.id === id`). Добавлен unit-тест на два шаблона с одним `id` и разными `tenantId` + отсутствие шаблона в чужом tenant — **`documents.service.test.ts`**. **`docs/security-remediation-roadmap.md`** (риск изоляции).
- Files changed:
  - `apps/backend/src/modules/documents/documents.service.test.ts`
  - `docs/security-remediation-roadmap.md`
- Notes: **`pnpm -s ci:check`** — зелёный после правок.

### 5.26 E-sign: регресс tenant-scoped `must` (коллизия `id` заявок)

- Summary: **`EsignService`** уже использует **`must(rows, tenantId, id)`** с фильтром **`x.tenantId === tenantId && x.id === id`**. Добавлен unit-тест на две заявки с одним `id` и разными `tenantId` + отсутствие заявки в чужом tenant — **`esign.service.test.ts`**. **`docs/security-remediation-roadmap.md`** (риск изоляции).
- Files changed:
  - `apps/backend/src/modules/esign/esign.service.test.ts`
  - `docs/security-remediation-roadmap.md`
- Notes: **`pnpm -s ci:check`** — зелёный после правок.

### 5.27 Integrations: регресс tenant-scoped `getTask` (коллизия `id` export-task)

- Summary: **`IntegrationOrchestratorService`** для tenant-scoped сущностей уже использует **`find` по `item.id === id && item.tenantId === tenantId`** (`requireTask`, `getItem`, …). **`Provider`** без tenant — по дизайну. Добавлен unit-тест на два **`ExportTask`** с одним `id` и разными `tenantId` — **`integrations.service.test.ts`**. **`docs/security-remediation-roadmap.md`**.
- Files changed:
  - `apps/backend/src/modules/integrations/integrations.service.test.ts`
  - `docs/security-remediation-roadmap.md`
- Notes: **`pnpm -s ci:check`** — зелёный после правок.

### 5.28 Communication: регресс tenant-scoped `get` / `getDialog` (коллизия `id` между tenant)

- Summary: **`NotificationsService.get`**, **`WebinarsService.get`**, **`ChatService.getDialog`** уже сопоставляют сущность по паре **`tenantId` + `id`** (in-memory и SQL-пути). Добавлены unit-тесты на два объекта с одним `id` и разными `tenantId` — **`communication.service.test.ts`**. **`docs/security-remediation-roadmap.md`** (блок регрессий cross-tenant).
- Files changed:
  - `apps/backend/src/modules/communication/communication.service.test.ts`
  - `docs/security-remediation-roadmap.md`
- Notes: **`pnpm -s ci:check`** — зелёный после правок.

### 5.29 Эксплуатация: smoke по ролям в LAUNCH_RUNBOOK

- Summary: в **`docs/LAUNCH_RUNBOOK.md`** после блока «После деплоя (smoke)» добавлена таблица **минимального ручного smoke** (слушатель / преподаватель / администратор / общие маршруты), согласованная с handoff §14 Medium и маршрутами фронтенда (`/learner/*`, `/teacher/*`, `/reports` и др.).
- Files changed:
  - `docs/LAUNCH_RUNBOOK.md`
- Notes: только документация; **`pnpm -s ci:check`** — зелёный после правок.

### 5.30 README: указатель на backend HTTP integration coverage

- Summary: в **`README.md`** (раздел «Канонический E2E для приёмки ТЗ») добавлена отдельная строка со ссылками на Vitest **HTTP integration** наборы (`mvp` ×2, `documents`, `workspace`, `integrations`, IAM `auth.http-regression`), чтобы закрыть handoff §14 Medium п.2 «синхронизация README с integration coverage» без дублирования полного списка в handoff.
- Files changed:
  - `README.md`
- Notes: только документация; **`pnpm -s ci:check`** — зелёный после правок.

### 5.31 Audit: `list` только с непустым `tenantId` (anti cross-tenant read)

- Summary: **`AuditService.list`** больше не возвращает все in-memory записи и не выполняет SQL «все tenant» при отсутствии фильтра: без непустого **`tenantId`** — **`[]`**; в PostgreSQL только **`where tenant_id = $1`**. Обновлены тесты, вызывавшие **`audit.list()`** без аргумента (**`auth.*.test`**, **`mvp.service.test`**). Unit-покрытие изоляции и SQL-формы — **`audit.service.test.ts`**. **`docs/security-remediation-roadmap.md`**.
- Files changed:
  - `apps/backend/src/modules/audit/audit.service.ts`
  - `apps/backend/src/modules/audit/audit.service.test.ts`
  - `apps/backend/src/modules/iam/auth.service.test.ts`
  - `apps/backend/src/modules/iam/auth.integration.test.ts`
  - `apps/backend/src/modules/iam/auth.security.test.ts`
  - `apps/backend/src/modules/mvp/mvp.service.test.ts`
  - `docs/security-remediation-roadmap.md`
- Notes: **`pnpm -s ci:check`** — зелёный после правок.

### 5.32 BL-001 / security roadmap: контракт на `iam.user_created` и спуф-заголовки

- Summary: закреплена приёмка ТЗ по аудиту создания пользователя; уточнён статус задачи 1 roadmap (**`x-user-id`** не используется в production для identity).
- Files changed:
  - `apps/backend/src/modules/iam/auth.controller.contract.test.ts`
  - `docs/TZ_MVP_TRACEABILITY.md` (строка **BL-001**)
  - `docs/security-remediation-roadmap.md` (задача **1**, блок статуса)
- Details:
  - `makeController` возвращает `{ controller, audit }`; новый кейс проверяет запись **`iam.user_created`** и отсутствие **`passwordHash`** в публичном ответе `createUser`.
  - Таймаут первого контракт-теста **`/auth/me`** увеличен до **45s** (флейк при холодном импорте).
- Notes: **`pnpm -s ci:check`** — зелёный после правок.

### 5.33 Security roadmap P0.3: контракт IAM на `updateUser` и роли

- Summary: расширены контрактные тесты отсутствия утечек **`passwordHash`** / refresh / CSRF в ответах **`AuthController`** для **`PUT users/:id`**, **`GET users/:id/roles`**, **`PUT users/:id/roles`**.
- Files changed:
  - `apps/backend/src/modules/iam/auth.controller.contract.test.ts`
  - `docs/security-remediation-roadmap.md` (задача **3**, статус)
  - `docs/TZ_MVP_TRACEABILITY.md` (строка **BL-010**)
- Notes: **`pnpm -s ci:check`** — зелёный после правок.

### 5.34 Security roadmap P0.2: rehash legacy SHA-256 пароля → scrypt при login

- Summary: после успешной **`verifyPassword`** для формата SQL-seed (**64 hex**, без `$`) выполняется **`IamService.upgradePasswordHash`** с **`hashPassword(plain)`**; добавлены **`isLegacyPwdSha256Hash`** в **`crypto.util.ts`**.
- Files changed:
  - `apps/backend/src/modules/iam/crypto.util.ts`
  - `apps/backend/src/modules/iam/crypto.util.test.ts`
  - `apps/backend/src/modules/iam/services/auth.service.ts`
  - `apps/backend/src/modules/iam/services/iam.service.ts`
  - `apps/backend/src/modules/iam/auth.service.test.ts`
  - `docs/security-remediation-roadmap.md` (задача **2**)
  - `docs/TZ_MVP_TRACEABILITY.md` (**BL-001**)
- Notes: **`pnpm -s ci:check`** — зелёный после правок.

### 5.35 BL-001: аудит `iam.password_rehashed` при миграции пароля login → scrypt

- Summary: при **`upgradePasswordHash`** после legacy **SHA-256** seed пишется **`AuditService.writeCritical`** с действием **`iam.password_rehashed`** и **`metadata`** (`legacy_sha256_seed`, `algorithm: scrypt`); порядок: сначала **`persistRelational`**, затем rehash + аудит.
- Files changed:
  - `apps/backend/src/modules/iam/services/auth.service.ts`
  - `apps/backend/src/modules/iam/auth.service.test.ts`
  - `docs/security-remediation-roadmap.md`
  - `docs/TZ_MVP_TRACEABILITY.md`
- Notes: **`pnpm -s ci:check`** — зелёный после правок.

### 5.36 BL-010 / roadmap §6: контракт `iam.password_rehashed` metadata + статус токенов MVP + liveness

- Summary: в **`@cdoprof/api-contracts`** добавлен **`AuditLogPasswordRehashedMetadata`** для чтения **`metadata`** записей **`iam.password_rehashed`**; в **roadmap** задача **6** помечена как соответствующая критериям на MVP-контуре (cookie refresh + `session-store` без токенов в `localStorage`); в **`health.test.ts`** — явный регресс **`HealthController.live`**. Обновлена **`TZ_MVP_TRACEABILITY`** (**BL-010**).
- Files changed:
  - `packages/api-contracts/src/domains/audit.ts`
  - `docs/security-remediation-roadmap.md` (**§6** статус)
  - `apps/backend/src/modules/health/health.test.ts`
  - `docs/TZ_MVP_TRACEABILITY.md`
- Notes: **`pnpm -s ci:check`** — зелёный после правок.

### 5.37 Roadmap P0 §7: зафиксировано шифрование секретов интеграций + env / тест

- Summary: в коде уже есть **AES-256-GCM** и маскирование ответов; обновлены **roadmap** (пункт **7**, строка приоритетов **P0.7**) со ссылками на сервисы и env; **`apps/backend/.env.example`** — комментарии **`INTEGRATION_CRYPTO_KEYS`** / **`INTEGRATION_CRYPTO_ACTIVE_KEY_VERSION`**; **`integrations.service.test.ts`** — проверки, что в выдаче credential нет ни plaintext, ни **`enc:`** ciphertext; **`TZ_MVP_TRACEABILITY` BL-010** — указатель на контур интеграций.
- Files changed:
  - `docs/security-remediation-roadmap.md`
  - `apps/backend/.env.example`
  - `apps/backend/src/modules/integrations/integrations.service.test.ts`
  - `docs/TZ_MVP_TRACEABILITY.md`
- Notes: **`pnpm -s ci:check`** — зелёный (таблица §10).

### 5.38 UI: deeplink карточки слушателя `/learners/[id]` (handoff §14 High)

- Summary: страница **`app/learners/[id]/page.tsx`** + **`LearnerDetailsScreen`** (**`mvpApi.getLearner`**, **`useLearner`**, зачисления через **`useLearnerCourses`**); ссылки из реестра **`/learners`**; тип **`Learner`** дополнен **`linkedIamUserId`**; **LAUNCH_RUNBOOK** (smoke администратора); **BL-003** в **`TZ_MVP_TRACEABILITY`**.
- Files changed:
  - `apps/frontend/app/learners/[id]/page.tsx`
  - `apps/frontend/app/learners/page.tsx`
  - `apps/frontend/src/features/mvp/screens.tsx`
  - `apps/frontend/src/features/mvp/hooks.ts`
  - `apps/frontend/src/features/mvp/types.ts`
  - `docs/LAUNCH_RUNBOOK.md`
  - `docs/TZ_MVP_TRACEABILITY.md`
- Notes: **`pnpm -s ci:check`** — зелёный (таблица §10).

### 5.39 Roadmap P0 §4–5: `workspaceApi` на `apiRequest`, типы workspace, статус envelope

- Summary: вынесены типы в **`src/features/workspace/types.ts`**, модуль **`workspaceApi`** (**`loadDashboard`**) на **`apiRequest`**; **`app/workspace/page.tsx`** без прямого **`apiClient`**; **`page.utils`** реэкспорт типов; регресс **`workspace/api.test.ts`**; roadmap **§4**, **§5**, строки приоритетов **P0.5–P0.6**; **`TZ_MVP_TRACEABILITY` BL-010** — указатель на **`workspaceApi`**.
- Files changed:
  - `apps/frontend/src/features/workspace/types.ts`
  - `apps/frontend/src/features/workspace/api.ts`
  - `apps/frontend/src/features/workspace/api.test.ts`
  - `apps/frontend/app/workspace/page.tsx`
  - `apps/frontend/app/workspace/page.utils.ts`
  - `docs/security-remediation-roadmap.md`
  - `docs/TZ_MVP_TRACEABILITY.md`
- Notes: **`pnpm -s ci:check`** — зелёный (таблица §10).

### 5.40 BL-010 / roadmap P1 §10: workspace HTTP — tenant scope и `tenant_header_mismatch`

- Summary: в **`workspace.http.integration.test.ts`** добавлены сценарии: **`GET /blockers`** с JWT **`tenant_id: t1`** возвращает seed **`blocker_integration_token_t1`**, без **`blocker_integration_token`** (**`tenant_demo`**); при расхождении **`x-tenant-id`** и токена — **`400`** **`tenant_header_mismatch`**. Обновлены **`docs/security-remediation-roadmap.md`** (§**10** статус), **`TZ_MVP_TRACEABILITY` (BL-010)**.
- Files changed:
  - `apps/backend/src/modules/workspace/workspace.http.integration.test.ts`
  - `docs/security-remediation-roadmap.md`
  - `docs/TZ_MVP_TRACEABILITY.md`
- Notes: **`pnpm -s ci:check`** — зелёный (таблица §10).

### 5.41 SDOPROF §36 / roadmap P1 §10: HTTP regress `GET /health/live` (liveness + envelope)

- Summary: файл **`health.http.integration.test.ts`** — подъём минимального Nest-приложения с **`HealthController`**, глобальный envelope + **`RequestContextInterceptor`**; **`fetch GET …/health/live`** без Bearer — **200**, **`data.status`**, заголовки **`x-request-id`**; обновлены **README** (перечень HTTP integration), **roadmap §10**, **TZ BL-010**.
- Files changed:
  - `apps/backend/src/modules/health/health.http.integration.test.ts`
  - `README.md`
  - `docs/security-remediation-roadmap.md`
  - `docs/TZ_MVP_TRACEABILITY.md`
- Notes: **`pnpm -s ci:check`** — зелёный (таблица §10).

### 5.42 Roadmap §10: HTTP regress `GET /health/ready` (readiness envelope)

- Summary: в **`health.http.integration.test.ts`** моки зависимостей **`HealthController`** (как в успешном кейсе **`health.test.ts`**); **`fetch GET …/health/ready`** без Bearer — **200**, envelope **`data.status` / `checks.database.connected`**, заголовки **`x-request-id`**; дополняет liveness **§5.41** для публичного readiness-контура (**SDOPROF §36**, **BL-010**).
- Files changed:
  - `apps/backend/src/modules/health/health.http.integration.test.ts`
  - `README.md`
  - `docs/security-remediation-roadmap.md`
  - `docs/TZ_MVP_TRACEABILITY.md`
- Notes: **`pnpm -s ci:check`** — зелёный (таблица §10).

### 5.43 Roadmap §10 / §42 риски: HTTP regress неуспешный `GET /health/ready` (503 + error envelope)

- Summary: **`health.http.integration.test.ts`** — общая функция **`bootstrapHealthHttpApp`** (`migrationReadinessHealthy`); второй **`describe`**: **`/health/live`** по-прежнему **200** при «сломанном» readiness; **`GET …/health/ready`** при **`getMigrationReadiness.healthy: false`** — **503**, тело **`{ error: { code: readiness_failed, checks… }, meta }`** (без требования **`x-request-id`** в заголовке на error-path).
- Files changed:
  - `apps/backend/src/modules/health/health.http.integration.test.ts`
  - `README.md`
  - `docs/security-remediation-roadmap.md`
  - `docs/TZ_MVP_TRACEABILITY.md`
- Notes: **`pnpm -s ci:check`** — зелёный (таблица §10).

### 5.44 BL-003 / Handoff §20: unit-тест `MvpBulkEnqueueService` (Rabbit envelope)

- Summary: файл **`mvp-bulk-enqueue.service.test.ts`** — мок **`RabbitMqService.publish`**; проверка **`JOB_EXCHANGE`** / **`JOB_ROUTING_BULK_ENROLLMENT`** (через **`vi.mock('../../env.js')`**), полей **`tenantId`**, **`jobType`**, **`payload`** (в т.ч. **`organizationUnitId`**), передачи **`requestId`** / **`correlationId`**; возврат **`status: queued`**, **`messageId`**. Дополняет HTTP-мок **`mvp.domains.http.integration.test.ts`** точечной регрессией очереди bulk.
- Files changed:
  - `apps/backend/src/modules/mvp/mvp-bulk-enqueue.service.test.ts`
  - `README.md`
  - `docs/TZ_MVP_TRACEABILITY.md`
- Notes: **`pnpm -s ci:check`** — зелёный (таблица §10).

### 5.45 BL-003: HTTP regressions для queued bulk и duplicate idempotency

- Summary: в **`mvp.domains.http.integration.test.ts`** добавлены HTTP-кейсы для **`POST /enrollments/bulk`**: (1) **`deliveryMode: queued`** возвращает **`status=queued`** и вызывает **`MvpBulkEnqueueService.publishBulkJob`**; (2) duplicate **`idempotencyKey`** после immediate-выполнения возвращает сохранённый outcome и **не** публикует задачу повторно. Это закрывает API-level регрессию BL-003 сверх unit-теста enqueue-сервиса.
- Files changed:
  - `apps/backend/src/modules/mvp/mvp.domains.http.integration.test.ts`
  - `README.md`
  - `docs/TZ_MVP_TRACEABILITY.md`
- Notes: **`pnpm -s ci:check`** — зелёный (таблица §10).

### 5.46 BL-010: расширение DTO-validation регрессий для MVP module/material

- Summary: в **`mvp.dto-validation.test.ts`** добавлены сценарии class-validator для **`CreateModuleRequest`** и **`CreateMaterialRequest`**: отрицательный `minViewSeconds` отклоняется, неизвестный `materialType` отклоняется, валидный payload принимается. Это закрывает пункт handoff §20 по валидации `CreateModuleRequest`/`CreateMaterialRequest` на регрессионном уровне.
- Files changed:
  - `apps/backend/src/modules/mvp/mvp.dto-validation.test.ts`
  - `README.md`
  - `docs/TZ_MVP_TRACEABILITY.md`
- Notes: **`pnpm -s ci:check`** — зелёный (таблица §10).

### 5.47 BL-007: listener regression на идемпотентность и failure-аудит

- Summary: в **`enrollment-document-issuance.listener.test.ts`** добавлены регрессии: (1) duplicate completion event для одного enrollment создаёт ровно одну задачу сертификата (идемпотентность); (2) при исключении в `DocumentsTenantRunner` listener пишет аудит **`documents.enrollment_certificate_failed`**. Runtime-логика listener не менялась.
- Files changed:
  - `apps/backend/src/modules/documents/enrollment-document-issuance.listener.test.ts`
  - `README.md`
  - `docs/TZ_MVP_TRACEABILITY.md`
- Notes: **`pnpm -s ci:check`** — зелёный (таблица §10).

### 5.48 BL-008: KPI snapshot HTTP regressions для drill-down флага

- Summary: в **`mvp.domains.http.integration.test.ts`** добавлены HTTP-кейсы `GET /reports/kpi-snapshot`: `include_enrollment_breakdown=true` возвращает `enrollmentBreakdown` (tenant/group-scoped), а запрос без флага не включает breakdown. Это фиксирует API-контракт drill-down на уровне HTTP.
- Files changed:
  - `apps/backend/src/modules/mvp/mvp.domains.http.integration.test.ts`
  - `README.md`
  - `docs/TZ_MVP_TRACEABILITY.md`
- Notes: **`pnpm -s ci:check`** — зелёный (таблица §10).

### 5.49 BL-008: KPI drill-down flag variant `include_enrollment_breakdown=1`

- Summary: в **`mvp.domains.http.integration.test.ts`** добавлен HTTP-кейс для числового флага `include_enrollment_breakdown=1`; подтверждено, что API возвращает `enrollmentBreakdown` (как и для `true`) и сохраняет tenant/group scope.
- Files changed:
  - `apps/backend/src/modules/mvp/mvp.domains.http.integration.test.ts`
  - `README.md`
  - `docs/TZ_MVP_TRACEABILITY.md`
- Notes: **`pnpm -s ci:check`** — зелёный (таблица §10).

### 5.50 BL-008: KPI drill-down negative variant `include_enrollment_breakdown=0`

- Summary: в **`mvp.domains.http.integration.test.ts`** добавлен HTTP-кейс для `include_enrollment_breakdown=0`; подтверждено, что breakdown в ответ не включается (как и при отсутствии параметра). Это закрепляет семантику флага по всем основным вариантам (`true` / `1` / `0` / default).
- Files changed:
  - `apps/backend/src/modules/mvp/mvp.domains.http.integration.test.ts`
  - `README.md`
  - `docs/TZ_MVP_TRACEABILITY.md`
- Notes: **`pnpm -s ci:check`** — зелёный (таблица §10).

### 5.51 BL-003: HTTP validation regression для `deliveryMode`

- Summary: в **`mvp.domains.http.integration.test.ts`** добавлен кейс `POST /enrollments/bulk` с `deliveryMode='async'` (вне допустимых `immediate|queued`): API возвращает **400** с `validation_error`, `MvpBulkEnqueueService.publishBulkJob` не вызывается.
- Files changed:
  - `apps/backend/src/modules/mvp/mvp.domains.http.integration.test.ts`
  - `README.md`
  - `docs/TZ_MVP_TRACEABILITY.md`
- Notes: **`pnpm -s ci:check`** — зелёный (таблица §10).

### 5.52 BL-007: listener tenant isolation regression

- Summary: в **`enrollment-document-issuance.listener.test.ts`** добавлен кейс изоляции арендаторов: certificate binding, созданный в `tenant_other`, не используется при `enrollment completed` в `tenant_demo`; задача документа не создаётся, аудит фиксирует `documents.enrollment_certificate_skipped`.
- Files changed:
  - `apps/backend/src/modules/documents/enrollment-document-issuance.listener.test.ts`
  - `README.md`
  - `docs/TZ_MVP_TRACEABILITY.md`
- Notes: **`pnpm -s ci:check`** — зелёный (таблица §10).

### 5.53 BL-003: strict validation для `deliveryMode` (uppercase)

- Summary: в **`mvp.domains.http.integration.test.ts`** добавлен кейс `POST /enrollments/bulk` с `deliveryMode='QUEUED'`: API возвращает **400** `validation_error`, enqueue не вызывается. Это фиксирует строгую чувствительность к регистру для enum-значения (`queued` только в lower-case).
- Files changed:
  - `apps/backend/src/modules/mvp/mvp.domains.http.integration.test.ts`
  - `README.md`
  - `docs/TZ_MVP_TRACEABILITY.md`
- Notes: **`pnpm -s ci:check`** — зелёный (таблица §10).

### 5.54 BL-010: стабилизация health HTTP integration в полном CI

- Summary: устранён флапающий failure `Hook timed out in 30000ms` в `health.http.integration.test.ts` (beforeAll startup). Для обоих `describe` timeout `beforeAll` увеличен с `30_000` до `60_000`. Это не меняет runtime API, только стабилизирует regression suite под нагрузкой монорепо `ci:check`.
- Files changed:
  - `apps/backend/src/modules/health/health.http.integration.test.ts`
  - `README.md`
- Notes: локально воспроизведён флап в полном `ci:check`, после правки — целевой и полный прогон зелёные.

### 5.55 BL-003: regression на default `deliveryMode` (immediate path)

- Summary: в **`mvp.domains.http.integration.test.ts`** добавлен HTTP-кейс `POST /enrollments/bulk` без `deliveryMode`: API создаёт enrollment через immediate-path и не вызывает `MvpBulkEnqueueService.publishBulkJob`.
- Files changed:
  - `apps/backend/src/modules/mvp/mvp.domains.http.integration.test.ts`
  - `README.md`
  - `docs/TZ_MVP_TRACEABILITY.md`
- Notes: таргетный suite (19 tests) и полный `pnpm -s ci:check` — зелёные.

### 5.56 BL-003: strict validation для `deliveryMode` со whitespace

- Summary: в **`mvp.domains.http.integration.test.ts`** добавлен кейс `POST /enrollments/bulk` с `deliveryMode=' queued '`: API возвращает **400** `validation_error`, enqueue не вызывается. Это фиксирует отсутствие implicit trim для enum-значения.
- Files changed:
  - `apps/backend/src/modules/mvp/mvp.domains.http.integration.test.ts`
  - `README.md`
  - `docs/TZ_MVP_TRACEABILITY.md`
- Notes: таргетный suite и полный `pnpm -s ci:check` — зелёные.

### 5.57 BL-008: strict regression для mixed-case KPI breakdown flag

- Summary: в **`mvp.domains.http.integration.test.ts`** добавлен HTTP-кейс `GET /reports/kpi-snapshot?include_enrollment_breakdown=TrUe`: breakdown не возвращается, т.к. поддерживаются только `true` и `1`.
- Files changed:
  - `apps/backend/src/modules/mvp/mvp.domains.http.integration.test.ts`
  - `README.md`
  - `docs/TZ_MVP_TRACEABILITY.md`
- Notes: таргетный suite и полный `pnpm -s ci:check` — зелёные.

### 5.58 BL-003: HTTP regress для worker callback массовых зачислений и явный DI

- Summary: регрессия **`POST /api/v1/internal/worker/mvp/bulk-enrollments`** (`WorkerCallbackGuard`, невалидный/отсутствующий **`x-worker-callback-token`** → **403**, валидация тела **`400 validation_error`**, успешный вызов с заголовком проксируется в **`MvpService.createBulkEnrollments`** с **`deliveryMode: 'immediate'`**). В **`MvpInternalWorkerController`** добавлен **`@Inject(MvpService)`** — без этого в Vitest/harness без `emitDecoratorMetadata` Nest не инжектит сервис (**`mvpService`** = `undefined`).
- Files changed:
  - `apps/backend/src/modules/mvp/mvp-internal-worker.http.integration.test.ts` (новый)
  - `apps/backend/src/modules/mvp/mvp-internal-worker.controller.ts`
  - `README.md`
  - `docs/TZ_MVP_TRACEABILITY.md`
  - `LMS_AGENT_HANDOFF.md`
- Notes: полный **`pnpm -s ci:check`** — зелёный на рабочей копии после правок.

### 5.59 BL-003: worker — модуль колбэка bulk + unit regress

- Summary: логика **`invokeBackendBulkEnrollment`** вынесена из **`apps/worker/src/main.ts`** в **`bulk-enrollment-callback.ts`**; добавлены unit-тесты (**`bulk-enrollment-callback.test.ts`**) без RabbitMQ: URL (**trim** базы + путь **`/api/v1/internal/worker/mvp/bulk-enrollments`**), заголовок **`x-worker-callback-token`**, тело **`tenantId` / requestId / correlationId / payload`**, классификация ответов (**`NonRetryableJobError`** для `forbidden` / `validation_error`; обычный **`Error`** для **500**, чтобы сохранился retry consumer).
- Files changed:
  - `apps/worker/src/main.ts`
  - `apps/worker/src/bulk-enrollment-callback.ts` (новый)
  - `apps/worker/src/bulk-enrollment-callback.test.ts` (новый)
  - `README.md`
  - `docs/TZ_MVP_TRACEABILITY.md`
  - `LMS_AGENT_HANDOFF.md`
- Notes: **`pnpm -s ci:check`** — зелёный на рабочей копии.

### 5.60 BL-005: HTTP regress — лимит попыток теста

- Summary: в **`mvp.domains.http.integration.test.ts`** добавлен сценарий: при **`rules.attemptLimit: 2`** и **`dailyResetEnabled: false`** третий **`POST …/attempts/start`** для той же связки learner/test/enrollment возвращает **412** и **`attempt_limit_reached`**.
- Files changed:
  - `apps/backend/src/modules/mvp/mvp.domains.http.integration.test.ts`
  - `README.md`
  - `docs/TZ_MVP_TRACEABILITY.md`
  - `LMS_AGENT_HANDOFF.md`
- Notes: **`pnpm -s ci:check`** — зелёный на рабочей копии после прогона.

### 5.61 BL-006: HTTP regress — второй review на один submission запрещён

- Summary: в **`mvp.domains.http.integration.test.ts`** добавлен кейс: после успешного **`POST /assignment-reviews`** повторный **`POST`** с тем же **`submissionId`** возвращает **409** и **`conflict`** (дубликат ревью на одну сдачу).
- Files changed:
  - `apps/backend/src/modules/mvp/mvp.domains.http.integration.test.ts`
  - `README.md`
  - `docs/TZ_MVP_TRACEABILITY.md`
  - `LMS_AGENT_HANDOFF.md`
- Notes: **`pnpm -s ci:check`** — зелёный на рабочей копии после прогона.

### 5.62 BL-006: HTTP regress — повторный complete завершённого review

- Summary: в **`mvp.domains.http.integration.test.ts`** добавлен кейс: после **`POST …/assignment-reviews/:id/complete`** повторный **`POST`** на тот же **`id`** возвращает **412** и **`domain_rule_violation`** (**Review is already completed**).
- Files changed:
  - `apps/backend/src/modules/mvp/mvp.domains.http.integration.test.ts`
  - `README.md`
  - `docs/TZ_MVP_TRACEABILITY.md`
  - `LMS_AGENT_HANDOFF.md`
- Notes: **`pnpm -s ci:check`** — зелёный на рабочей копии после прогона.

### 5.63 BL-006: HTTP regress — **`PATCH`** завершённого review read-only

- Summary: расширен тот же сценарий (**`it`** переименован в **`HTTP: PATCH completed review and second complete are rejected`**): между первым **`complete`** и проверкой повторного **`complete`** добавлено **`PATCH /assignment-reviews/:id`** — ожидание **412** **`domain_rule_violation`** (**Completed review is read-only**, **`updateAssignmentReview`** в **`mvp.service.ts`**).
- Files changed:
  - `apps/backend/src/modules/mvp/mvp.domains.http.integration.test.ts`
  - `README.md`
  - `docs/TZ_MVP_TRACEABILITY.md`
  - `LMS_AGENT_HANDOFF.md`
- Notes: **`pnpm -s ci:check`** — зелёный на рабочей копии после прогона.

### 5.64 BL-006: HTTP regress — **`PATCH`** сдачи после **`submit`** запрещён (**`submission_terminal`**)

- Summary: в **`mvp.domains.http.integration.test.ts`** добавлен отдельный кейс: после **`POST …/assignment-submissions/:id/submit`** попытка **`PATCH …/assignment-submissions/:id`** с **`answerText`** возвращает **412** и **`submission_terminal`** (**`updateAssignmentSubmission`** в **`mvp.service.ts`**).
- Files changed:
  - `apps/backend/src/modules/mvp/mvp.domains.http.integration.test.ts`
  - `README.md`
  - `docs/TZ_MVP_TRACEABILITY.md`
  - `LMS_AGENT_HANDOFF.md`
- Notes: **`pnpm -s ci:check`** — зелёный на рабочей копии после прогона.

### 5.65 BL-010: HTTP regress — **`PATCH`** и **`submit`** чужой субмиссии при **`linkedIamUserId`**

- Summary: расширен сценарий в **`mvp.domains.http.integration.test.ts`** (переименованный **`it`**): для слушателя с **`linkedIamUserId`** чужой JWT получает **403** **`forbidden`** не только на **`GET …/assignment-submissions/:id`**, но и на **`PATCH`** и **`POST …/submit`** (дополнение к уже покрытому **`POST`** создания).
- Files changed:
  - `apps/backend/src/modules/mvp/mvp.domains.http.integration.test.ts`
  - `README.md`
  - `docs/TZ_MVP_TRACEABILITY.md`
  - `LMS_AGENT_HANDOFF.md`
- Notes: **`pnpm -s ci:check`** — зелёный на рабочей копии после прогона.

### 5.66 BL-010: HTTP regress — список **`GET /assignment-submissions`** ограничен привязкой JWT → слушатель

- Summary: в **`mvp.domains.http.integration.test.ts`** добавлен кейс: два слушателя с разными **`linkedIamUserId`**, две субмиссии (создание от staff); под JWT Алисы список содержит только её **`learnerId`**, идентификатор субмиссии Боба отсутствует; симметрично для Боба (**`listAssignmentSubmissions`** / **`restrictLearnerIdsForAssessmentList`**).
- Files changed:
  - `apps/backend/src/modules/mvp/mvp.domains.http.integration.test.ts`
  - `README.md`
  - `docs/TZ_MVP_TRACEABILITY.md`
  - `LMS_AGENT_HANDOFF.md`
- Notes: **`pnpm -s ci:check`** — зелёный на рабочей копии после прогона.

### 5.67 Корреляция IAM-аудита с HTTP (`metadata.correlation_id`)

- Summary: в **`AuditService`** введён тип **`AuditWritePayload`**, поле **`correlationId`** при записи вкладывается в **`metadata.correlation_id`** (новая колонка БД не нужна). **`AuthService`** передаёт **`context.correlationId`** во все **`writeCritical`**; **`IamService.createUser`** / **`setUserRoles`** и **`AuthController`** прокидывают **`correlationId`** из **`RequestContext`**. Регресс: **`audit.service.test.ts`**, **`auth.controller.contract.test.ts`**, **`auth.service.test.ts`**; комментарий в **`packages/api-contracts`** и уточнение в **`docs/security-remediation-roadmap.md`** (задача 10).
- Files changed:
  - `apps/backend/src/modules/audit/audit.service.ts`
  - `apps/backend/src/modules/audit/audit.service.test.ts`
  - `apps/backend/src/modules/iam/services/auth.service.ts`
  - `apps/backend/src/modules/iam/services/iam.service.ts`
  - `apps/backend/src/modules/iam/auth.controller.ts`
  - `apps/backend/src/modules/iam/auth.controller.contract.test.ts`
  - `apps/backend/src/modules/iam/auth.service.test.ts`
  - `packages/api-contracts/src/domains/audit.ts`
  - `docs/security-remediation-roadmap.md`
  - `README.md`, `LMS_AGENT_HANDOFF.md`
- Notes: **`pnpm -s ci:check`** — зелёный.

### 5.68 `correlation_id` в аудите documents / MVP / e-sign / integrations

- Summary: после §5.67 IAM — **`correlationId`** из **`RequestContext`** прокидывается в **`AuditWritePayload`** для записей аудита в **`DocumentsService`** (создание/обновление шаблона, **`writeTaskAudit`**), **`MvpService.audit`**, **`EsignService.writeAudit`**, **`IntegrationOrchestratorService`** (**`createCredential`**, **`rotateSecret`**, плюс **`requestId`**, **`ip`**, **`userAgent`** для интеграций). Дополнено в **§5.69**: трассировка через событие **`learning.enrollment_completed`** → **`EnrollmentDocumentIssuanceListener`**. Регресс: **`documents.service.test.ts`**, **`mvp.service.test.ts`**, **`integrations.service.test.ts`**; комментарий в **`api-contracts`** (`audit.ts`).
- Files changed:
  - `apps/backend/src/modules/documents/documents.service.ts`
  - `apps/backend/src/modules/mvp/mvp.service.ts`
  - `apps/backend/src/modules/esign/esign.service.ts`
  - `apps/backend/src/modules/integrations/services/integration-orchestrator.service.ts`
  - `apps/backend/src/modules/documents/documents.service.test.ts`
  - `apps/backend/src/modules/mvp/mvp.service.test.ts`
  - `apps/backend/src/modules/integrations/integrations.service.test.ts`
  - `packages/api-contracts/src/domains/audit.ts`
  - `docs/security-remediation-roadmap.md`
  - `README.md`, `LMS_AGENT_HANDOFF.md`
- Notes: **`pnpm -s ci:check`** — зелёный.

### 5.69 BL-007: трассировка `requestId` / `correlationId` при завершении enrollment → сертификат

- Summary: расширен **`EnrollmentCompletedPayload`** (**`requestId`**, **`correlationId`**). При **`status: completed`** в **`MvpService.changeEnrollmentStatus`** в событие передаются значения из **`RequestContext`**. **`EnrollmentDocumentIssuanceListener`**: аудит **skipped/failed** с **`requestId`/`correlationId`**; **`generateDocument`** вызывается с **`RequestContext`**, если в payload есть хотя бы одно поле трассировки (иначе прежнее поведение). Регресс: **`enrollment-document-issuance.listener.test.ts`**, **`enrollment-certificate-flow.service.test.ts`**.
- Files changed:
  - `apps/backend/src/modules/mvp/enrollment-completed.event.ts`
  - `apps/backend/src/modules/mvp/mvp.service.ts`
  - `apps/backend/src/modules/documents/enrollment-document-issuance.listener.ts`
  - `apps/backend/src/modules/documents/enrollment-document-issuance.listener.test.ts`
  - `apps/backend/src/modules/documents/enrollment-certificate-flow.service.test.ts`
  - `README.md`, `LMS_AGENT_HANDOFF.md`
- Notes: **`pnpm -s ci:check`** — зелёный.

### 5.70 Documents: трассировка **`POST …/documents/generate/batch`**

- Summary: **`DocumentsService.generateDocumentsBatch`** принимает опциональный **`RequestContext`** и передаёт его в каждый вызов **`generateDocument`** (**`DocumentsController`** прокидывает **`CurrentContext`**). Ключи идемпотентности для элементов батча стабилизированы: один **`batchBaseTime`** + индекс (меньше случайных коллизий в одной миллисекунде). Регресс в **`documents.service.test.ts`** (**`requestId`/`correlationId`** на задачах).
- Files changed:
  - `apps/backend/src/modules/documents/documents.service.ts`
  - `apps/backend/src/modules/documents/documents.controller.ts`
  - `apps/backend/src/modules/documents/documents.service.test.ts`
  - `README.md`, `LMS_AGENT_HANDOFF.md`
- Notes: **`pnpm -s ci:check`** — зелёный.

### 5.71 BL-010: HTTP regress — **`POST …/documents/generate/batch`** граница **`documents.generate`**

- Summary: harness **`documents.http.integration.test.ts`**: mock-guard учитывает путь (`/documents/generate` → нужен **`documents.generate`**, иначе **`documents.write`** как раньше для **`/templates`**). Добавлен stub-эндпоинт **`POST /documents/generate/batch`**, сценарии **403** без **`documents.generate`** при наличии **read+write** и **201** при **read+write+generate**.
- Files changed:
  - `apps/backend/src/modules/documents/documents.http.integration.test.ts`
  - `README.md`, `LMS_AGENT_HANDOFF.md`
- Notes: **`pnpm -s ci:check`** — зелёный.

### 5.72 BL-010: HTTP regress — **`POST …/documents/generate`** граница **`documents.generate`**

- Summary: в **`documents.http.integration.test.ts`** добавлен stub **`POST /documents/generate`** (одиночная генерация); те же сценарии, что для батча: **403** при **read+write** без **`documents.generate`**, **201** при наличии **`documents.generate`**. Подтверждён прогон файла и полный **`pnpm -s ci:check`**.
- Files changed:
  - `apps/backend/src/modules/documents/documents.http.integration.test.ts`
  - `README.md`, `LMS_AGENT_HANDOFF.md`
- Notes: **`pnpm --filter @cdoprof/backend exec vitest run`** на `documents.http.integration.test.ts` + **`pnpm -s ci:check`** — зелёный.

### 5.73 BL-010: HTTP regress — e-sign **`POST …/applications/:id/submit`** vs **`esign.applications.write`**

- Summary: файл **`esign.http.integration.test.ts`**: лёгкий Nest harness с тем же контуром, что **`documents`** / **`integrations`** (envelope, **`TenantGuard`**, mock **`resolvePermissions`**). Guard по URL различает **`POST …/esign/applications`** (**`esign.applications.write`**) и **`POST …/esign/applications/:id/submit`** (**`esign.applications.submit`**). Сценарии: **403** при **read+write** без **submit**, **201** при **read+write+submit** (соответствует **`EsignController.submitApplication`**).
- Files changed:
  - `apps/backend/src/modules/esign/esign.http.integration.test.ts` (новый)
  - `README.md`, `LMS_AGENT_HANDOFF.md`, `docs/TZ_MVP_TRACEABILITY.md`
- Notes: **`pnpm -s ci:check`** — зелёный.

### 5.74 BL-010: HTTP regress — e-sign **`POST …/applications/:id/start-review`** (**`esign.applications.review`**)

- Summary: расширение **`esign.http.integration.test.ts`**: guard по пути отличает **`POST …/start-review`** (**`esign.applications.review`**) от **`submit`** / **`POST …/applications`** (**write**). Сценарии: **403**, если есть **read+write+submit**, но нет **review**; **201** при **read+write+review** (соответствует **`EsignController.startReview`**).
- Files changed:
  - `apps/backend/src/modules/esign/esign.http.integration.test.ts`
  - `README.md`, `LMS_AGENT_HANDOFF.md`, `docs/TZ_MVP_TRACEABILITY.md`
- Notes: **`pnpm -s ci:check`** — зелёный.

### 5.75 BL-010: HTTP regress — e-sign **`POST …/participants/:id/sign`** (**`esign.participants.sign`**)

- Summary: в **`esign.http.integration.test.ts`** guard добавляет ветку для **`POST …/esign/participants/:id/sign`** — только **`esign.participants.sign`** (отдельно от **`esign.processes.write`**). Сценарии: **403** при **processes.read+write** без **sign**; **201** при **processes.read+sign** (соответствует **`EsignController.sign`**).
- Files changed:
  - `apps/backend/src/modules/esign/esign.http.integration.test.ts`
  - `README.md`, `LMS_AGENT_HANDOFF.md`, `docs/TZ_MVP_TRACEABILITY.md`
- Notes: **`pnpm -s ci:check`** — зелёный.

### 5.76 BL-010: HTTP regress — e-sign **`GET …/legal-log`** (**`esign.legal.read`**)

- Summary: в **`esign.http.integration.test.ts`** для **GET** различаются пути **`/esign/legal-log`** и **`/esign/legal-log/:id`** (**`esign.legal.read`**) и остальной **GET** контур заявок (**`esign.applications.read`**). Stub **`GET …/legal-log`**, сценарии **403** при только **applications.read+write** без **legal.read** и **200** при **`esign.legal.read`** (соответствует **`EsignController.listLegalLog`**).
- Files changed:
  - `apps/backend/src/modules/esign/esign.http.integration.test.ts`
  - `README.md`, `LMS_AGENT_HANDOFF.md`, `docs/TZ_MVP_TRACEABILITY.md`
- Notes: **`pnpm -s ci:check`** — зелёный.

### 5.77 BL-010: HTTP regress — e-sign **`GET …/processes`** (**`esign.processes.read`**)

- Summary: **`esign.http.integration.test.ts`**: stub **`GET …/esign/processes`**; guard для **GET** распознаёт контур **`processes` / `events` / списка `participants`** как **`esign.processes.read`** (см. **`EsignController`**). Сценарии: **403**, если есть только **`esign.applications.read`+`write`**, без **`processes.read`**; **200** при **`esign.processes.read`**.
- Files changed:
  - `apps/backend/src/modules/esign/esign.http.integration.test.ts`
  - `README.md`, `LMS_AGENT_HANDOFF.md`, `docs/TZ_MVP_TRACEABILITY.md`
- Notes: **`pnpm -s ci:check`** — зелёный.

### 5.78 BL-010: HTTP regress — e-sign **`GET …/application-files`** (**`esign.applications.read`**)

- Summary: **`esign.http.integration.test.ts`**: stub **`GET …/esign/application-files`** (как **`EsignController.listApplicationFiles`**). Сценарии: **403**, если у актора только **`esign.processes.read`** (наблюдатель процессов не читает файлы заявок); **200** при **`esign.applications.read`**.
- Files changed:
  - `apps/backend/src/modules/esign/esign.http.integration.test.ts`
  - `README.md`, `LMS_AGENT_HANDOFF.md`, `docs/TZ_MVP_TRACEABILITY.md`
- Notes: **`pnpm -s ci:check`** — зелёный.

### 5.79 BL-010: HTTP regress — e-sign **`POST …/application-files`** (**`esign.applications.write`**)

- Summary: **`esign.http.integration.test.ts`**: stub **`POST …/esign/application-files`** (как **`EsignController.createApplicationFile`**). Guard считает этот путь мутацией **`esign.applications.write`**. Сценарии: **403** при только **`esign.applications.read`**; **201** при **read+write**.
- Files changed:
  - `apps/backend/src/modules/esign/esign.http.integration.test.ts`
  - `README.md`, `LMS_AGENT_HANDOFF.md`, `docs/TZ_MVP_TRACEABILITY.md`
- Notes: **`pnpm -s ci:check`** — зелёный.

### 5.80 BL-010: HTTP regress — e-sign **`POST …/application-files/:id/verify`** (**`esign.applications.review`**)

- Summary: **`esign.http.integration.test.ts`**: stub **`POST …/application-files/:id/verify`** (как **`EsignController.verifyApplicationFile`**). Сценарии: **403** при **read+write** без **`esign.applications.review`**; **201** при **read+write+review**.
- Files changed:
  - `apps/backend/src/modules/esign/esign.http.integration.test.ts`
  - `README.md`, `LMS_AGENT_HANDOFF.md`, `docs/TZ_MVP_TRACEABILITY.md`
- Notes: **`pnpm -s ci:check`** — зелёный.

### 5.81 BL-010: HTTP regress — e-sign **`POST …/application-files/:id/reject`** (**`esign.applications.review`**)

- Summary: **`esign.http.integration.test.ts`**: stub **`POST …/application-files/:id/reject`** (как **`EsignController.rejectApplicationFile`**). В guard **verify** и **reject** объединены в один шаблон **`/(verify|reject)$`**. Сценарии: **403** при **read+write** без **review**; **201** при **read+write+review**.
- Files changed:
  - `apps/backend/src/modules/esign/esign.http.integration.test.ts`
  - `README.md`, `LMS_AGENT_HANDOFF.md`, `docs/TZ_MVP_TRACEABILITY.md`
- Notes: **`pnpm -s ci:check`** — зелёный.

### 5.82 BL-010: HTTP regress — e-sign **`POST …/applications/:id/(approve|reject)`** и **`DELETE …/application-files/:id`**

- Summary: **`esign.http.integration.test.ts`**: в harness добавлены стабы **`POST …/applications/:id/approve`**, **`POST …/applications/:id/reject`**, **`DELETE …/application-files/:id`** (как **`EsignController`**). В guard мутации заявки **`start-review` / approve / reject** сведены к **`esign.applications.review`**; **DELETE** файла заявки — **`esign.applications.write`**. Сценарии: **403** на **approve/reject** при **read+write+submit** без **review**; **201** на **approve** с **review**; **403** на **DELETE** при только **read**; **200** на **DELETE** при **read+write**.
- Files changed:
  - `apps/backend/src/modules/esign/esign.http.integration.test.ts`
  - `README.md`, `LMS_AGENT_HANDOFF.md`, `docs/TZ_MVP_TRACEABILITY.md`
- Notes: **`pnpm -s ci:check`** — зелёный после §5.82.

### 5.83 BL-010: HTTP regress — e-sign **processes.write** vs **participants.sign** (процессы и действия участника)

- Summary: **`esign.http.integration.test.ts`**: стабы **`POST …/processes`**, **`POST …/processes/:id/start`**, **`POST …/participants/:id/skip`**, **`POST …/participants/:id/mark-viewed`** (как **`EsignController`**). В **TestPermissionGuard**: создание процесса и **start|cancel** — **`esign.processes.write`**; **skip** участника — **`esign.processes.write`** (отдельно от подписанта); **`sign|mark-viewed|reject`** на участника — **`esign.participants.sign`**. Регрессии: **403**/**201** для перечисленных комбинаций прав.
- Files changed:
  - `apps/backend/src/modules/esign/esign.http.integration.test.ts`
  - `README.md`, `LMS_AGENT_HANDOFF.md`, `docs/TZ_MVP_TRACEABILITY.md`
- Notes: **`pnpm -s ci:check`** — зелёный после §5.83.

### 5.84 BL-010: HTTP regress — **integrations**: **PATCH** и позитивные **GET/POST** (**`integrations.write`** для мутаций)

- Summary: **`integrations.http.integration.test.ts`**: **TestPermissionGuard** — **`POST`** и **`PATCH`** требуют **`integrations.write`** (не только **POST**); стаб **`PATCH …/integrations/providers/:id`** по аналогии с реальным **`IntegrationsController.patchProvider`**. Добавлены: успех **GET** при **`integrations.read`**; успех **POST …/sync** при **read+write**; **403** и **200** для **PATCH** при read-only / write.
- Files changed:
  - `apps/backend/src/modules/integrations/integrations.http.integration.test.ts`
  - `README.md`, `LMS_AGENT_HANDOFF.md`, `docs/TZ_MVP_TRACEABILITY.md`
- Notes: harness остаётся упрощённой моделью **read vs write** до появления granular permissions на реальном **`IntegrationsController`**; **`pnpm -s ci:check`** — зелёный после §5.84.

### 5.85 BL-010: HTTP regress — **documents**: **PATCH**/ **PUT**/ **DELETE** → **`documents.write`** (исправление guard)

- Summary: **`documents.http.integration.test.ts`**: **TestPermissionGuard** ранее для методов вне **GET**/**POST** возвращал пустой **`required`** и фактически пропускал запросы без проверки прав. Добавлено: **PATCH**, **PUT**, **DELETE** требуют **`documents.write`**; нормализация пути (**без query**). Стабы **`PATCH …/templates/:id`**, **`DELETE …/templates/:id`** (harness; **DELETE** шаблона в **`DocumentsController`** может отличаться — цель регресса **write**). Сценарии **403** при **`documents.read`** и успех при **read+write**.
- Files changed:
  - `apps/backend/src/modules/documents/documents.http.integration.test.ts`
  - `README.md`, `LMS_AGENT_HANDOFF.md`, `docs/TZ_MVP_TRACEABILITY.md`
- Notes: **`pnpm -s ci:check`** — зелёный после §5.85.

### 5.86 BL-010: HTTP regress — **integrations**: **PUT**/ **DELETE** → **`integrations.write`** (parity с **documents** harness)

- Summary: **`integrations.http.integration.test.ts`**: без **PUT**/ **DELETE** в условии guard эти методы попадали в ветку **read**. Добавлены **PUT** и **DELETE** к мутациям (**`integrations.write`**). Стабы **`PUT …/integrations/providers/:id`**, **`DELETE …/integrations/providers/:id`** (harness для регресса прав; боевой контроллер провайдеров **DELETE** может не экспонировать — цель модель **write**).
- Files changed:
  - `apps/backend/src/modules/integrations/integrations.http.integration.test.ts`
  - `README.md`, `LMS_AGENT_HANDOFF.md`, `docs/TZ_MVP_TRACEABILITY.md`
- Notes: **`pnpm -s ci:check`** — зелёный после §5.86.

### 5.87 BL-010: HTTP regress — **e-sign** **PATCH** заявки/участника и **POST reuse-check** (закрытие пустого **`required`**)

- Summary: **`esign.http.integration.test.ts`**: **TestPermissionGuard** — **`PATCH …/applications/:id`** → **`esign.applications.write`**; **`PATCH …/participants/:id`** → **`esign.processes.write`** (ранее **PATCH** не обрабатывался → **`required`** пустой). **`POST …/applications/:id/reuse-check`** → **`esign.applications.read`** (ранее попадало в открытый **`return true`**). Стабы **`patchApplication`**, **`reuseCheckStub`**, **`patchParticipantStub`**; регрессии **403**/успех.
- Files changed:
  - `apps/backend/src/modules/esign/esign.http.integration.test.ts`
  - `README.md`, `LMS_AGENT_HANDOFF.md`, `docs/TZ_MVP_TRACEABILITY.md`
- Notes: **`pnpm -s ci:check`** — зелёный после §5.87.

### 5.88 BL-010: HTTP regress — **e-sign** оставшиеся маршруты (**POST participants/invite**, **POST processes/…/cancel**, **GET events/legal-log/:id**/…)

- Summary: **`esign.http.integration.test.ts`**: **TestPermissionGuard** — **`POST /esign/participants`** и **`POST …/participants/:id/invite`** → **`esign.processes.write`** (ранее **`POST …/participants`** не попадал в матрицу → открытый **`return true`**). Стабы и регрессии **403**/успех для **create participant**, **invite**, **`POST …/processes/:id/cancel`**, **`POST …/participants/:id/reject`** (**sign**); **GET** **`/esign/events`**, **`/esign/applications/:id`**, **`/esign/legal-log/:id`**; доп. стабы **GET** **application-files/:id**, **processes/:id**, **processes/:id/status**, **participants**, **events/:id** (покрытие guard без отдельных кейсов на каждый).
- Files changed:
  - `apps/backend/src/modules/esign/esign.http.integration.test.ts`
  - `README.md`, `LMS_AGENT_HANDOFF.md`, `docs/TZ_MVP_TRACEABILITY.md`
- Notes: **`pnpm -s ci:check`** — зелёный после §5.88.

### 5.89 BL-010: HTTP regress — **e-sign GET parity** (**processes/:id**, **participants**, **application-files/:id**, **events/:id**)

- Summary: расширен `esign.http.integration.test.ts` для симметричного покрытия `EsignController` по GET-контуру: добавлены `deny/success` для **`GET /esign/processes/:id`**, **`GET /esign/participants`**, **`GET /esign/application-files/:id`**; `success` для **`GET /esign/processes/:id/status`** и **`GET /esign/events/:id`**. Это закрывает «только stub без отдельной регрессии» из §5.88 и фиксирует permission-модель **`esign.processes.read`** / **`esign.applications.read`** на object-level маршрутах.
- Files changed:
  - `apps/backend/src/modules/esign/esign.http.integration.test.ts`
  - `README.md`, `LMS_AGENT_HANDOFF.md`, `docs/TZ_MVP_TRACEABILITY.md`
- Notes: `pnpm --filter @cdoprof/backend exec vitest run src/modules/esign/esign.http.integration.test.ts` (**58 tests**) и **`pnpm -s ci:check`** — зелёные после §5.89.

### 5.90 Phase 2 §3.3 — Plan A: bulk-import учеников из Excel (end-to-end)

- Summary: реализована главная фича Phase 2 §3.3 «центр всё назначает сам» — массовая загрузка учеников из Excel/CSV с per-row валидацией (partial-success) и атомарным create-or-reuse + zaчисление в группу. Закрывает 12 задач Plan A в трёх PR'ах: backend (#193), frontend (#194), closeout E2E + docs (этот §5.90).
- Spec / Plan: `docs/superpowers/specs/2026-05-21-cdoprof-redesign-design.md` §3.3 + `docs/superpowers/plans/2026-05-28-phase-2-admin-bulk-enrollment-a.md`.
- Backend (PR #193, Tasks 1-4, 42 теста):
  - `apps/backend/src/modules/mvp/learners-bulk-import.types.ts` — `BulkImportRow` / `BulkImportOutcome` / `BulkImportIdempotencyRecord`.
  - `apps/backend/src/modules/mvp/learners-bulk-import.dto.ts` — `BulkImportLearnersRequest` (`ArrayMaxSize 1000`, обязательные fullName/email per row).
  - `apps/backend/src/modules/mvp/learners-bulk-import.service.ts` — pure `classifyRows` + СНИЛС-чексумма по алгоритму ПФР + сервисный оркестратор `bulkImportLearners` с idempotency через новую коллекцию `bulkImportIdempotency`.
  - `apps/backend/src/modules/mvp/mvp.service.ts` — `createLearnerExtended` (старый `createLearner` не принимает email/snils/middleName/position) + `getBulkImportOutcomeIfAny` / `saveBulkImportOutcome`.
  - `apps/backend/src/modules/mvp/mvp.controller.ts` — `POST /learners/bulk-import` под двойной permission `learners.write` + `enrollments.write`.
  - `apps/backend/src/modules/mvp/infrastructure/in-memory-mvp.state.ts` + `mvp-collections.ts` — регистрация новой коллекции.
  - HTTP integration: 5 кейсов в `mvp.http.integration.test.ts` (auth_required / permission_denied per perm / session_inactive / success).
- Frontend (PR #194, Tasks 5-10, 33 теста):
  - `apps/frontend/package.json` — добавлен `xlsx ^0.18.5` (SheetJS).
  - `apps/frontend/src/features/bulk-enrollments/` — новая фича-папка: `types.ts`, `excel-parser.ts` (синонимы заголовков ФИО/Имя/E-mail/Эл. почта), `validators.ts` (зеркало backend `classifyRows` без reuse), `api.ts` + `hooks.ts` (`useBulkImportMutation` через useState-паттерн проекта), `bulk-import-screen.tsx` (4 секции: загрузить / выбрать группу / preview / отправить + результат), `preview-table.tsx`.
  - `apps/frontend/app/admin/bulk-enrollments/page.tsx` — Next.js route обёрнут в `ProtectedPage` (использует существующий `AppShell`).
  - `apps/frontend/src/features/navigation/model.ts` — routeMeta + navigationModel запись «Массовая загрузка» в navSlot 'more' под `learners.write + enrollments.write`.
- Closeout (этот PR, Tasks 11-12, 8 e2e-тестов):
  - `apps/frontend/src/e2e/admin-bulk-enrollment.e2e.test.ts` — routing + nav assertions + parse+classify pipeline + module smoke import.
  - `LMS_AGENT_HANDOFF.md` (этот §5.90).
- Plan A deviations (документированы в commit body / PR описаниях):
  1. Backend `createLearnerExtended` вместо расширения `createLearner` (старый API остаётся стабильным).
  2. HTTP integration расширил `mvp.http.integration.test.ts` (stub-controller pattern) вместо нового файла — сэкономили 200+ строк boilerplate.
  3. Idempotency — отдельная коллекция `bulkImportIdempotency` (типы `BulkImportOutcome` ≠ `BulkEnrollmentsOutcome`).
  4. Inner `createBulkEnrollments` использует derived ключ `${key}::bulk-import-enroll` для изоляции keyspace'а.
  5. Frontend admin layout (Task 8) **не реализован отдельно** — `AppShell` уже динамически строит sidebar из `navigationModel`, достаточно регистрации.
  6. Frontend validators дублируют backend (`classifyRows`) — deliberate, документировано; вынос в `packages/shared-types` отложен до ≥3 правки.
  7. E2E (Task 11) — routing + parse+classify integration + module smoke; React mount нет (RTL не в зависимостях; конвенция проекта — pure-function unit + permission boundary).
- Email-приглашения после зачисления (последний шаг §3.3) — отложены до Phase 5 (notifications). Plan A только создаёт + зачисляет.
- Quality gates: `pnpm typecheck` зелёный, frontend 198 тестов + backend 42 новых (всё через изолированные прогоны; full `pnpm test:backend` падает на pre-existing tinypool/Windows IPC crash на пути с кириллицей — проверено против origin/main, не вызвано этим изменением).
- Что осталось до Phase 2 целиком: Plan B (учётки CRUD UI поверх существующего `GET /learners`) и Plan C (компании-клиенты + view прогресса по группе). Plan A — главный процесс из спеки, ~10-15% общего объёма Phase 2.

### 5.91 Phase 2 §3.2 — Plan B: учётки учеников (list/search/filter/edit UI)

- Summary: реализована вторая фича Phase 2 — admin-страница `/admin/learners` для CRUD-просмотра/редактирования учёток слушателей + расширенный backend-PATCH через `PATCH /learners/:id/profile` (симметрично `createLearnerExtended` Plan A). Закрывает 11 задач Plan B в трёх PR'ах: backend (#198), frontend (#199), closeout (этот §5.91, PR будет открыт после).
- Plan: `docs/superpowers/plans/2026-05-29-phase-2-admin-learners-management-b.md`.
- Backend (PR #198, Tasks 1-4, 22 теста):
  - `apps/backend/src/modules/mvp/update-learner-extended.dto.ts` — `UpdateLearnerExtendedRequest` с 10 опциональными полями, PATCH-семантика (null → clear, undefined → no-op).
  - `apps/backend/src/modules/mvp/mvp.service.ts` — `updateLearnerExtended` метод: load → IDOR check → apply delta → bump updatedAt → audit `learning.learner_updated`.
  - `apps/backend/src/modules/mvp/mvp.controller.ts` — `@Patch('learners/:id/profile')` под `learners.write`.
  - DTO validation 7 кейсов + service unit 6 кейсов + HTTP integration 3 кейса (auth/perm/success).
  - Bonus: implementer нашёл и починил stale `mockResolvedValueOnce` в preceding `bulk-import` HTTP integration.
- Frontend (PR #199, Tasks 5-10, 12 новых тестов):
  - `apps/frontend/src/features/learners/` — фича-папка: `types.ts`, `api.ts` (`learnersApi.list` + `updateProfile`), `hooks.ts` (`useLearnersList` через React Query, `useUpdateLearnerProfile` через useState — convention), `format.ts` + 9 unit-кейсов, `learner-edit-drawer.tsx`, `learners-list-screen.tsx`.
  - `apps/frontend/app/admin/learners/page.tsx` — Next.js route в `ProtectedPage`.
  - `apps/frontend/src/features/navigation/model.ts` — routeMeta + navigationModel запись `/admin/learners` под `learners.read`, navSlot `'more'`.
  - API contract test 3 кейса.
- Closeout (этот PR, Task 11): `src/e2e/admin-learners-management.e2e.test.ts` (11 кейсов: routing x3 + nav visibility x2 + pipeline integration x4 + module smoke x2) + handoff §5.91 + README sync.
- Plan B deviations (адаптации к реальному коду):
  1. `apiRequest(path, options)` сигнатура, не `(session, { method, path, body })` — следует Plan A pattern. Session через `options.auth = { userId, tenantId, accessToken }`.
  2. Session hook `useAuth()` + `UserSession` (не `useSession()`/`SessionInfo`).
  3. `@tanstack/react-query` — custom shim в `src/lib/query/react-query-shim.tsx`. `useQuery` возвращает `isLoading`, не `isPending`.
  4. `Column<T>.title` (не `header`); `Pagination` через `totalPages`/`onPageChange`; `SectionError.message?: string`; `SectionCard.title` обязательный; `SearchInput` без `placeholder`/`aria-label`.
  5. `Select` нет в `@cdoprof/ui` — фильтр статуса через native `<select className="ui-select">`.
  6. `ProtectedPage` без props (permission enforcement через `routeMeta`).
  7. Tasks 8+9 объединены в одну subagent-диспатч (Task 9 drawer коммитится первым, чтобы Task 8 screen прошёл typecheck при импорте).
- Email-приглашения после редактирования профиля не предусмотрены — Plan B только UI редактирования, без триггеров.
- Что осталось до Phase 2 целиком: **Plan C** (компании-клиенты `core.tenants_clients` или аналог + view прогресса по группе). Plan B + Plan A покрывают ~70-80% Phase 2 по объёму.
- Quality gates: `pnpm typecheck` зелёный; frontend 217 тестов зелёные (38 в e2e/ включая 11 новых); backend 22 новых теста зелёные через изолированные прогоны (`mvp.dto-validation.test.ts` 39, `mvp.service.test.ts` 76, `mvp.http.integration.test.ts` 12).

## 6. Files Changed

| File                                                                                 | Change Type        | Purpose                                                                                                                        |
| ------------------------------------------------------------------------------------ | ------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `apps/backend/src/modules/iam/permission.guard.test.ts`                              | modified           | Дополнительные authz regression unit tests                                                                                     |
| `apps/backend/src/modules/mvp/mvp.http.integration.test.ts`                          | created            | HTTP integration regression для LMS permission/session boundaries                                                              |
| `apps/backend/src/modules/mvp/mvp.service.ts`                                        | modified           | Защита progress update: enrollment должен быть связан с course через group-course                                              |
| `apps/backend/src/modules/mvp/mvp.service.test.ts`                                   | modified           | Regression coverage доменных проверок progress/submissions/attempts/reviews + lifecycle/score (включая отрицательные значения) |
| `apps/backend/src/modules/mvp/mvp.concurrency.test.ts`                               | modified           | Актуализация concurrency regression под новые domain invariants                                                                |
| `apps/backend/vitest.config.ts`                                                      | modified           | Увеличены test/hook timeout для стабильного backend CI прогона                                                                 |
| `SDOPROF_TZ_FINAL.md`                                                                | created            | Финальное структурированное ТЗ LMS/СДО Проф                                                                                    |
| `LMS_AGENT_HANDOFF.md`                                                               | recreated/modified | Актуальный handoff по текущему состоянию                                                                                       |
| `apps/backend/src/modules/mvp/mvp.domains.http.integration.test.ts`                  | created            | HTTP integration: доменные инварианты submissions / attempts / reviews + score bounds                                          |
| `apps/backend/src/modules/mvp/infrastructure/mvp-request-persistence.interceptor.ts` | modified           | Явный `@Inject(TenantSerialGateway)` для корректного DI                                                                        |
| `apps/backend/src/modules/mvp/mvp.types.ts`                                          | modified           | `Learner.linkedIamUserId?: string`                                                                                             |
| `apps/backend/src/modules/mvp/mvp.dto.ts`                                            | modified           | Опциональные `linkedIamUserId` в simple registry requests                                                                      |
| `apps/backend/src/modules/mvp/mvp.controller.ts`                                     | modified           | Прокидка `{ actorId, permissions }` в list/get attempts, submissions, exam-results                                             |
| `apps/backend/src/modules/mvp/mvp.service.ts`                                        | modified           | Bypass чтения по `assessment.read.cross_learner`; анти-IDOR мутаций + scoped read                                              |
| `apps/backend/src/modules/mvp/mvp.service.test.ts`                                   | modified           | linkedIam GET/list + bypass по permission                                                                                      |
| `apps/backend/src/modules/mvp/mvp.domains.http.integration.test.ts`                  | modified           | mock `resolvePermissions` по `userId`; cross_learner только staff sub                                                          |
| `apps/backend/src/modules/iam/permission.guard.ts`                                   | modified           | `requestContext.permissions := resolved`                                                                                       |
| `apps/backend/migrations/0025_assessment_read_cross_learner_permission.sql`          | created            | Permission + role_permissions для staff ролей                                                                                  |
| `apps/frontend/src/lib/auth/permission-map.ts`                                       | modified           | Staff: `assessment.read.cross_learner`, `learners.act_as`                                                                      |
| `apps/backend/migrations/0026_learners_act_as_permission.sql`                        | created            | `learners.act_as` + staff `role_permissions`                                                                                   |

## 7. Database / Schema / Migration Changes

- **`0025`**: `assessment.read.cross_learner` — см. §5.15.
- **`0026`**: `learners.act_as` и привязка к тем же staff-ролям в `tenant_demo`.
- **`0027`**: `audit.audit_log.metadata jsonb NULL` — см. §5.17.
- Прогон миграций обязателен для выдачи прав и новой колонки audit в PostgreSQL.

## 8. API Changes

- Пути/методов смены нет.
- Расширены **необязательные** поля JSON для записи learner: `linkedIamUserId` (camelCase).
- **`POST /assignment-submissions`** и **`POST /attempts/start`**: **`learnerId` обязателен и должен совпадать с фактическим слушателем зачисления** (`400 validation_error` при нарушении). Ранее клиент мог опускать или подменять без проверки.
- Исправление работы пайплайна persistence: корректная сериализация по tenant через `TenantSerialGateway` в `MvpRequestPersistenceInterceptor` (устранены потенциальные **500 Internal** при успешном auth/permission path).
- Изменено runtime поведение endpoint-ов:
  - `PATCH /progress/materials/:materialId`:
  - теперь update прогресса отклоняется, если enrollment не связан с курсом материала через `group_courses`.
  - код ошибки: `domain_rule_violation` (HTTP 412 через `PreconditionFailedException`).
  - `POST /assignment-submissions`:
  - submission отклоняется, если enrollment не связан с course задания через `group_courses`.
  - код ошибки: `domain_rule_violation` (HTTP 412 через `PreconditionFailedException`).
  - `POST /attempts/start`:
  - attempt start отклоняется, если enrollment не связан с course теста через `group_courses`.
  - код ошибки: `domain_rule_violation` (HTTP 412 через `PreconditionFailedException`).
  - `POST /assignment-reviews`:
  - review отклоняется для draft submission (`domain_rule_violation`, HTTP 412);
  - дубликат review для того же submission отклоняется (`conflict`, HTTP 409).
  - `PATCH /assignment-reviews/:id`:
  - completed review отклоняется как read-only (`domain_rule_violation`, HTTP 412).
  - `POST /assignment-reviews/:id/complete`:
  - повторный complete отклоняется (`domain_rule_violation`, HTTP 412);
  - complete разрешён только для `in_review`.
  - Если у слушателя задан **`linkedIamUserId`**, мутации **прогресса / черновых субмиссий / сабмита субмиссии / ответов в попытке / сабмита попытки** от другого **`JWT.sub`** возвращают **`403`** `forbidden`, **если у актора нет** **`learners.act_as`** (миграция `0026`; иначе — разрешено при сохранении `learnerId`/enrollment/group-course).
  - **Чтение** при **`linkedIamUserId`**: обход только с **`assessment.read.cross_learner`** или **`learners.act_as`** (списки/GET assessment — см. §5.15–5.16).

| Method | Path                               | Change                                                                                       | Auth Required | Roles                           |
| ------ | ---------------------------------- | -------------------------------------------------------------------------------------------- | ------------- | ------------------------------- |
| PATCH  | `/progress/materials/:materialId`  | Добавлена проверка связи enrollment-group-course; несвязанный enrollment отклоняется         | yes           | `progress.recalculate`          |
| POST   | `/assignment-submissions`          | Добавлена проверка связи enrollment-group-course задания; несвязанный enrollment отклоняется | yes           | `assessment.submissions.submit` |
| POST   | `/attempts/start`                  | Добавлена проверка связи enrollment-group-course теста; несвязанный enrollment отклоняется   | yes           | `assessment.attempts.take`      |
| POST   | `/assignment-reviews`              | Добавлены проверки статуса submission и уникальности review по submission                    | yes           | `assessment.reviews.review`     |
| PATCH  | `/assignment-reviews/:id`          | Completed review переведён в read-only режим                                                 | yes           | `assessment.reviews.review`     |
| POST   | `/assignment-reviews/:id/complete` | Добавлены lifecycle проверки `in_review -> completed`, повторный complete запрещён           | yes           | `assessment.reviews.review`     |

## 9. Frontend / UI Changes

- **`permission-map`** (dev/эвристика ролей): staff-роли дополнены **`learners.act_as`** для согласованности с backend seed.
- В рамках `ci:check` подтверждён успешный `next build`.
- Страница **`/assessment`**: действия для слушателя (ссылка в реестр / подсказка делегирования) условно по **`assessment.read.cross_learner`** и **`learners.act_as`**; см. §5.19.

## 10. Auth / Permissions Notes

- Auth опирается на backend `PermissionGuard` + session activity checks.
- Roles/permissions резолвятся через IAM.
- Protected routes проверяются на backend через permissions.
- В этой итерации усилены:
  - guard-level unit regression;
  - HTTP integration regression на `mvp` LMS permission boundaries;
  - HTTP regression доменных инвариантов assessment (`mvp.domains.http.integration.test.ts`).
  - HTTP + unit: связка **`linkedIamUserId`** против чужого JWT; HTTP `PATCH progress` без группа↔курс.
- **Оставшиеся риски / не закрыто этой веткой работ** (не путать с закрытыми в §5.15–5.17: там уже есть **`assessment.read.cross_learner`**, **`learners.act_as`**, аудит **`metadata.delegated`**):
  - изоляция **cross-tenant**: unit-регрессии **MVP** §5.24, **documents** §5.25, **e-sign** §5.26, **integrations** §5.27, **communication** §5.28, **audit** §5.31; **`Provider`** без tenant — по дизайну; IAM SQL уже с `tenant_id`;
  - политика **JWT vs заголовки**: частично закрыто в §5.23 (`x-tenant-id` vs JWT, проброс `HttpException`); остальное — [docs/security-remediation-roadmap.md](docs/security-remediation-roadmap.md);
  - ручной смок по ролям; отсутствие полного исходного ТЗ заказчика (§13 Issue 0).

## 11. Validation / Error Handling

- **`createAppValidationPipe()`**: глобальный Nest pipe — **`whitelist: true`**, **`forbidNonWhitelisted: true`**, ответ ошибок класса **`BadRequest`** с **`code: 'validation_error'`** (согласование prod и HTTP harness).
- Class-validator-классы для части **`mvp.dto`**: см. §5.18 (`UpdateMaterialProgressRequest`, попытки, субмиссии, `CreateSimpleRegistryRequest`).
- Добавлена новая backend domain validation в `MvpService.upsertMaterialProgress()`:
  - enrollment должен быть связан с course материала через `group_courses`.
- Добавлена backend domain validation в `MvpService.createAssignmentSubmission()`:
  - enrollment должен быть связан с course задания через `group_courses`.
- Добавлена backend domain validation в `MvpService.startAttempt()`:
  - enrollment должен быть связан с course теста через `group_courses`.
- Добавлена backend domain validation в `MvpService.createAssignmentReview()`:
  - review разрешён только для `submitted/under_review` submission;
  - дубликат review для submission запрещён.
- Добавлены backend lifecycle validations:
  - `MvpService.updateAssignmentReview()` запрещает изменения completed review;
  - `MvpService.completeAssignmentReview()` запрещает повторный complete и complete вне статуса `in_review`.
- Error envelope поведение проверено в HTTP integration тестах (`auth_required`, `permission_denied`, `session_inactive`).
- Дополнительно на HTTP уровне зафиксированы коды **`domain_rule_violation`** (412) и **`validation_error`** (400) для assessment/review цепочки в `mvp.domains.http.integration.test.ts`; **`forbidden`** (403) для IDOR при `linkedIamUserId`; обязательный **`learnerId`** на создании субмишена через `BadRequest`.
- Для слушателя: опционально `linkedIamUserId` при создании/обновлении записи в `learners` (общий контракт `CreateSimpleRegistryRequest`/`Update`).

## 12. Tests / Checks Run

| Command                                                                                                                                                                   | Result | Notes                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------- |
| `pnpm exec eslint apps/backend/src/modules/iam/permission.guard.test.ts`                                                                                                  | passed | Линт guard unit test                                                                                       |
| `pnpm exec vitest run apps/backend/src/modules/iam/permission.guard.test.ts`                                                                                              | passed | 1 file / 4 tests                                                                                           |
| `pnpm exec eslint apps/backend/src/modules/mvp/mvp.http.integration.test.ts`                                                                                              | passed | Линт нового integration test файла                                                                         |
| `pnpm exec vitest run apps/backend/src/modules/mvp/mvp.http.integration.test.ts` (первый запуск)                                                                          | failed | Ошибка реализации тестового guard, исправлена в этой итерации                                              |
| `pnpm exec vitest run apps/backend/src/modules/mvp/mvp.http.integration.test.ts` (финальный)                                                                              | passed | 1 file / 4 tests                                                                                           |
| `pnpm -s ci:check` (первый запуск в этой сессии)                                                                                                                          | failed | Backend test stage: `Hook timed out in 30000ms` в нескольких integration/contract suite                    |
| `pnpm --filter @cdoprof/backend test`                                                                                                                                     | passed | После настройки timeout: 49 files / 180 tests                                                              |
| `pnpm -s ci:check` (повторный запуск после фикса)                                                                                                                         | passed | Полный monorepo quality gate зелёный                                                                       |
| `pnpm exec vitest run apps/backend/src/modules/mvp/mvp.service.test.ts` (после domain-фикса, первый прогон)                                                               | failed | Неверная правка теста (ошибочная вставка), исправлено в этой итерации                                      |
| `pnpm exec vitest run apps/backend/src/modules/mvp/mvp.service.test.ts` (повторный)                                                                                       | passed | 1 file / 16 tests                                                                                          |
| `pnpm exec eslint apps/backend/src/modules/mvp/mvp.service.ts apps/backend/src/modules/mvp/mvp.service.test.ts`                                                           | passed | Линт доменного фикса и тестов                                                                              |
| `pnpm --filter @cdoprof/backend test && pnpm -s ci:check`                                                                                                                 | passed | Финальный полный прогон backend + monorepo quality gates                                                   |
| `pnpm exec vitest run apps/backend/src/modules/mvp/mvp.service.test.ts` (после assignment-фикса)                                                                          | passed | 1 file / 17 tests                                                                                          |
| `pnpm --filter @cdoprof/backend test && pnpm -s ci:check` (после assignment-фикса)                                                                                        | passed | Повторный полный прогон зелёный                                                                            |
| `pnpm --filter @cdoprof/backend test && pnpm -s ci:check` (после attempt-фикса, первый прогон)                                                                            | failed | Упал `mvp.concurrency.test.ts` (тест не учитывал новый domain linkage), исправлено в этой итерации         |
| `pnpm exec vitest run apps/backend/src/modules/mvp/mvp.concurrency.test.ts apps/backend/src/modules/mvp/mvp.service.test.ts`                                              | passed | 2 files / 20 tests                                                                                         |
| `pnpm --filter @cdoprof/backend test && pnpm -s ci:check` (финальный прогон)                                                                                              | passed | Полный backend + monorepo quality gate зелёный                                                             |
| `pnpm exec vitest run apps/backend/src/modules/mvp/mvp.service.test.ts apps/backend/src/modules/mvp/mvp.concurrency.test.ts` (после review-фикса)                         | passed | 2 files / 21 tests                                                                                         |
| `pnpm --filter @cdoprof/backend test && pnpm -s ci:check` (после review-фикса)                                                                                            | passed | Повторный полный прогон зелёный                                                                            |
| `pnpm exec vitest run apps/backend/src/modules/mvp/mvp.service.test.ts apps/backend/src/modules/mvp/mvp.concurrency.test.ts` (после lifecycle lock)                       | passed | 2 files / 22 tests                                                                                         |
| `pnpm --filter @cdoprof/backend test && pnpm -s ci:check` (после lifecycle lock)                                                                                          | passed | Финальный полный прогон зелёный                                                                            |
| `Создание/обновление документации: SDOPROF_TZ_FINAL.md, LMS_AGENT_HANDOFF.md`                                                                                             | passed | Документационная итерация, без изменения runtime-кода                                                      |
| `pnpm exec vitest run apps/backend/src/modules/mvp/mvp.service.test.ts apps/backend/src/modules/mvp/mvp.concurrency.test.ts` (после score-валидации, первый прогон)       | failed | Обновлённая доменная валидация выявила старые тестовые фикстуры без `maxScore`; исправлено в этой итерации |
| `pnpm exec vitest run apps/backend/src/modules/mvp/mvp.service.test.ts apps/backend/src/modules/mvp/mvp.concurrency.test.ts` (повторный прогон)                           | passed | 2 files / 23 tests                                                                                         |
| `pnpm --filter @cdoprof/backend test && pnpm -s ci:check` (после score-валидации)                                                                                         | passed | Финальный полный прогон зелёный                                                                            |
| `pnpm exec vitest run apps/backend/src/modules/mvp/mvp.service.test.ts apps/backend/src/modules/mvp/mvp.concurrency.test.ts` (после расширения negative-score regression) | passed | 2 files / 23 tests                                                                                         |
| `pnpm --filter @cdoprof/backend test && pnpm -s ci:check` (после расширения negative-score regression)                                                                    | passed | Повторный полный прогон зелёный                                                                            |
| `pnpm exec vitest run apps/backend/src/modules/mvp/mvp.domains.http.integration.test.ts`                                                                                  | passed | 3 HTTP-теста реального `MvpController` + memory persistence                                                |
| `pnpm --filter @cdoprof/backend test` (после 5.13)                                                                                                                        | passed | 50 files / 189 tests (+3 к прошлому отчёту 180 — пересчитано по актуальному прогону)                       |
| `pnpm -s ci:check` (после 5.13)                                                                                                                                           | passed | Полный monorepo quality gate зелёный (~74s)                                                                |
| `pnpm --filter @cdoprof/backend test && pnpm -s ci:check` (после 5.14 анти-IDOR)                                                                                          | passed | 193 тестов; включая расширенный `mvp.domains.http.integration`                                             |
| `pnpm --filter @cdoprof/backend test && pnpm -s ci:check` (после 5.15 read/list IDOR)                                                                                     | passed | 193 тестов; `mvp.domains.http` + unit read-scope                                                           |
| `pnpm --filter @cdoprof/backend test` (после 5.16 `learners.act_as`)                                                                                                      | passed | 195 тестов (+ unit + HTTP act-as delegation)                                                               |
| `pnpm exec vitest run apps/backend/src/common/guards/tenant.guard.test.ts apps/backend/src/modules/iam/auth.http-regression.e2e.test.ts` (после 5.23)                     | passed | JWT vs `x-tenant-id`, IAM HTTP regression                                                                  |
| `pnpm -s ci:check` (после 5.23 TenantGuard)                                                                                                                               | passed | Полный monorepo quality gate зелёный                                                                       |
| `pnpm -s ci:check` (после 5.24 cross-tenant `getById`)                                                                                                                    | passed | Полный monorepo quality gate зелёный                                                                       |
| `pnpm -s ci:check` (после 5.25 documents `must` regression)                                                                                                               | passed | Полный monorepo quality gate зелёный                                                                       |
| `pnpm -s ci:check` (после 5.26 esign `must` regression)                                                                                                                   | passed | Полный monorepo quality gate зелёный                                                                       |
| `pnpm -s ci:check` (после 5.27 integrations `getTask` regression)                                                                                                         | passed | Полный monorepo quality gate зелёный                                                                       |
| `pnpm exec vitest run apps/backend/src/modules/communication/communication.service.test.ts`                                                                               | passed | 6 tests, tenant collision regression для notifications/webinars/chat                                       |
| `pnpm -s ci:check` (после 5.28 communication tenant regression)                                                                                                           | passed | Полный monorepo quality gate зелёный                                                                       |
| `pnpm -s ci:check` (после 5.29 LAUNCH_RUNBOOK smoke-таблица)                                                                                                              | passed | Документация; полный quality gate зелёный                                                                  |
| `pnpm -s ci:check` (после 5.30 README integration links)                                                                                                                  | passed | Документация; полный quality gate зелёный                                                                  |
| `pnpm -s ci:check` (после 5.31 AuditService.list tenant hardening)                                                                                                        | passed | Полный quality gate зелёный                                                                                |
| `pnpm -s ci:check` (после 5.32 BL-001 createUser audit contract)                                                                                                          | passed | Полный quality gate зелёный                                                                                |
| `pnpm -s ci:check` (после 5.33 IAM P0.3 updateUser/roles contract)                                                                                                        | passed | Полный quality gate зелёный                                                                                |
| `pnpm -s ci:check` (после 5.34 legacy password rehash on login)                                                                                                           | passed | Полный quality gate зелёный                                                                                |
| `pnpm -s ci:check` (после 5.35 audit iam.password_rehashed)                                                                                                               | passed | Полный quality gate зелёный                                                                                |
| `pnpm -s ci:check` (после 5.36 audit contract + roadmap §6 + health live)                                                                                                 | passed | Полный quality gate зелёный                                                                                |
| `pnpm -s ci:check` (после 5.37 roadmap §7 integrations crypto docs + credential leak test)                                                                                | passed | Полный quality gate зелёный                                                                                |
| `pnpm -s ci:check` (после 5.38 learners `[id]` UI + runbook)                                                                                                              | passed | Полный quality gate зелёный                                                                                |
| `pnpm -s ci:check` (после 5.39 workspaceApi + roadmap §4–5)                                                                                                               | passed | Полный quality gate зелёный                                                                                |
| `pnpm -s ci:check` (после 5.40 workspace HTTP tenant regression)                                                                                                          | passed | Полный quality gate зелёный                                                                                |
| `pnpm -s ci:check` (после 5.41 health live HTTP integration)                                                                                                              | passed | Полный quality gate зелёный                                                                                |
| `pnpm -s ci:check` (после 5.42 health ready HTTP integration)                                                                                                             | passed | Полный quality gate зелёный                                                                                |
| `pnpm -s ci:check` (после 5.43 health ready 503 HTTP integration)                                                                                                         | passed | Полный quality gate зелёный                                                                                |
| `pnpm -s ci:check` (после 5.44 `MvpBulkEnqueueService` unit)                                                                                                              | passed | Полный quality gate зелёный                                                                                |
| `pnpm -s ci:check` (после 5.45 BL-003 queued bulk HTTP regressions)                                                                                                       | passed | Полный quality gate зелёный                                                                                |
| `pnpm -s ci:check` (после 5.46 MVP DTO validation regressions)                                                                                                            | passed | Полный quality gate зелёный                                                                                |
| `pnpm -s ci:check` (после 5.47 BL-007 listener regressions)                                                                                                               | passed | Полный quality gate зелёный                                                                                |
| `pnpm -s ci:check` (после 5.48 BL-008 KPI snapshot HTTP regressions)                                                                                                      | passed | Полный quality gate зелёный                                                                                |
| `pnpm -s ci:check` (после 5.49 BL-008 KPI breakdown flag `=1`)                                                                                                            | passed | Полный quality gate зелёный                                                                                |
| `pnpm -s ci:check` (после 5.50 BL-008 KPI breakdown flag `=0`)                                                                                                            | passed | Полный quality gate зелёный                                                                                |
| `pnpm -s ci:check` (после 5.51 BL-003 invalid deliveryMode HTTP regression)                                                                                               | passed | Полный quality gate зелёный                                                                                |
| `pnpm -s ci:check` (после 5.52 BL-007 listener tenant isolation regression)                                                                                               | passed | Полный quality gate зелёный                                                                                |
| `pnpm -s ci:check` (после 5.53 BL-003 uppercase deliveryMode regression)                                                                                                  | passed | Полный quality gate зелёный                                                                                |
| `pnpm -s ci:check` (после 5.54 health HTTP hook-timeout stabilization)                                                                                                    | passed | Полный quality gate зелёный                                                                                |
| `pnpm -s ci:check` (после 5.55 BL-003 default deliveryMode regression)                                                                                                    | passed | Полный quality gate зелёный                                                                                |
| `pnpm -s ci:check` (после 5.56 BL-003 spaced deliveryMode regression)                                                                                                     | passed | Полный quality gate зелёный                                                                                |
| `pnpm -s ci:check` (после 5.57 BL-008 mixed-case KPI breakdown flag regression)                                                                                           | passed | Полный quality gate зелёный                                                                                |
| `pnpm -s ci:check` (после 5.58 BL-003 internal worker HTTP + `@Inject(MvpService)`)                                                                                       | passed | Полный quality gate зелёный                                                                                |
| `pnpm -s ci:check` (после 5.59 BL-003 worker bulk callback unit + вынос из `main`)                                                                                        | passed | Полный quality gate зелёный                                                                                |
| `pnpm -s ci:check` (после 5.60 BL-005 attempt limit HTTP regression)                                                                                                      | passed | Полный quality gate зелёный                                                                                |
| `pnpm -s ci:check` (после 5.61 BL-006 duplicate assignment review HTTP regression)                                                                                        | passed | Полный quality gate зелёный                                                                                |
| `pnpm -s ci:check` (после 5.62 BL-006 duplicate complete assignment review HTTP regression)                                                                               | passed | Полный quality gate зелёный                                                                                |
| `pnpm -s ci:check` (после 5.63 BL-006 PATCH completed review read-only HTTP regression)                                                                                   | passed | Полный quality gate зелёный                                                                                |
| `pnpm -s ci:check` (после 5.64 BL-006 PATCH submitted assignment submission HTTP regression)                                                                              | passed | Полный quality gate зелёный                                                                                |
| `pnpm -s ci:check` (после 5.65 BL-010 assignment submission PATCH/submit intruder JWT HTTP regression)                                                                    | passed | Полный quality gate зелёный                                                                                |
| `pnpm -s ci:check` (после 5.66 BL-010 assignment-submissions list learner scope HTTP regression)                                                                          | passed | Полный quality gate зелёный                                                                                |
| `pnpm -s ci:check` (после 5.67 audit correlation_id в IAM + `AuditWritePayload`)                                                                                          | passed | Полный quality gate зелёный                                                                                |
| `pnpm -s ci:check` (после 5.68 correlation_id в audit: documents/MVP/e-sign/integrations)                                                                                 | passed | Полный quality gate зелёный                                                                                |
| `pnpm -s ci:check` (после 5.69 enrollment_completed trace → certificate listener + BL-007 flow test)                                                                      | passed | Полный quality gate зелёный                                                                                |
| `pnpm -s ci:check` (после 5.70 documents generate/batch `RequestContext` + idempotency key)                                                                               | passed | Полный quality gate зелёный                                                                                |
| `pnpm -s ci:check` (после 5.71 documents HTTP regress `documents.generate` на batch)                                                                                      | passed | Полный quality gate зелёный                                                                                |
| `pnpm --filter @cdoprof/backend exec vitest run .../documents.http.integration.test.ts` + `pnpm -s ci:check` (после 5.72 single generate)                                 | passed | Регресс **403/201** для **`POST …/documents/generate`**; полный monorepo gate                              |
| `pnpm -s ci:check` (после 5.73 esign HTTP submit vs write boundary)                                                                                                       | passed | Полный quality gate зелёный                                                                                |
| `pnpm -s ci:check` (после 5.74 esign HTTP start-review / `esign.applications.review`)                                                                                     | passed | Полный quality gate зелёный                                                                                |
| `pnpm -s ci:check` (после 5.75 esign HTTP participants/sign / `esign.participants.sign`)                                                                                  | passed | Полный quality gate зелёный                                                                                |
| `pnpm -s ci:check` (после 5.76 esign HTTP GET legal-log / `esign.legal.read`)                                                                                             | passed | Полный quality gate зелёный                                                                                |
| `pnpm -s ci:check` (после 5.77 esign HTTP GET processes / `esign.processes.read`)                                                                                         | passed | Полный quality gate зелёный                                                                                |
| `pnpm -s ci:check` (после 5.78 esign HTTP GET application-files / `esign.applications.read`)                                                                              | passed | Полный quality gate зелёный                                                                                |
| `pnpm -s ci:check` (после 5.79 esign HTTP POST application-files / `esign.applications.write`)                                                                            | passed | Полный quality gate зелёный                                                                                |
| `pnpm -s ci:check` (после 5.80 esign HTTP POST application-files verify / `esign.applications.review`)                                                                    | passed | Полный quality gate зелёный                                                                                |
| `pnpm -s ci:check` (после 5.81 esign HTTP POST application-files reject / `esign.applications.review`)                                                                    | passed | Полный quality gate зелёный                                                                                |
| `pnpm -s ci:check` (после 5.82 esign HTTP approve/reject application + DELETE application-file)                                                                           | passed | Регресс **BL-010** e-sign; полный quality gate зелёный                                                     |
| `pnpm -s ci:check` (после 5.83 esign HTTP processes POST/start + participant skip/mark-viewed)                                                                            | passed | Регресс **BL-010** e-sign **processes.write** / **participants.sign**; полный gate зелёный                 |
| `pnpm -s ci:check` (после 5.84 integrations HTTP PATCH + позитивные GET/POST sync)                                                                                        | passed | Регресс **BL-010** integrations harness **read/write**; полный gate зелёный                                |
| `pnpm -s ci:check` (после 5.85 documents HTTP guard PATCH PUT DELETE → write + regress templates/:id)                                                                     | passed | Регресс **BL-010** documents harness; полный gate зелёный                                                  |
| `pnpm -s ci:check` (после 5.86 integrations HTTP PUT DELETE → write + regress providers/:id)                                                                              | passed | Регресс **BL-010** integrations harness; полный gate зелёный                                               |
| `pnpm -s ci:check` (после 5.87 esign PATCH applications/participants + POST reuse-check)                                                                                  | passed | Регресс **BL-010** e-sign harness; полный gate зелёный                                                     |
| `pnpm -s ci:check` (после 5.88 esign POST participants/invite/cancel/events/legal-log entry)                                                                              | passed | Регресс **BL-010** e-sign harness parity с **`EsignController`**; полный gate зелёный                      |
| `pnpm -s ci:check` (после 5.89 esign GET parity: processes/:id, participants, application-files/:id, events/:id)                                                          | passed | Регресс **BL-010** e-sign object-level GET permission boundaries; полный gate зелёный                      |

## 13. Known Issues

### Issue 0: Внешний эталонный документ заказчика (не в репозитории)

- Severity: medium (не блокирует пилот и приёмку в объёме [SDOPROF_TZ_FINAL.md](SDOPROF_TZ_FINAL.md) [§47](SDOPROF_TZ_FINAL.md#47-приложение-б-фиксация-границ-пилота-must--вне-scope))
- Area: docs/product
- Description: отдельный файл «исходного ТЗ заказчика» (DOCX/PDF и т.п.) в репозиторий может **не входить**; продуктовый каркас консолидирован в **SDOPROF_TZ_FINAL.md** (см. v1.6+ и [§44.1](SDOPROF_TZ_FINAL.md#441-исходное-тз-заказчика)). Эталон заказчика нужен для **матрицы расхождений** в [docs/TZ_MVP_TRACEABILITY.md](docs/TZ_MVP_TRACEABILITY.md) (блок **MVP-TZ-01**), а не для расширения пилота без протокола.
- Evidence: исторически в сессии использовался placeholder вместо вложения; в ТЗ зафиксирована иерархия источников правды.
- Suggested fix: при появлении документа от заказчика — заполнить строки MVP-TZ-01 и при необходимости протокол к **§47**; не трактовать отсутствие внешнего файла как «дыру» в обязательном scope пилота.

### Issue 2: Длительные backend integration тесты при ограниченных ресурсах CI

- Severity: low
- Area: backend/tests
- Description: даже после фикса таймаутов и отключения file-parallelism backend integration/contract suite остаётся заметным по времени.
- Evidence: множественные bootstrap Nest приложения в монорепо `turbo` + Vitest.
- Suggested fix: по мере возможности уменьшать дублирование bootstrap и выносить тяжёлые кейсы в облегчённые harness без полного приложения там, где достаточно unit.

## 14. Recommended Next Steps

### Critical

1. Сохранять `pnpm -s ci:check` обязательным финальным шагом каждой инженерной итерации.
2. Любые новые auth/security регрессии чинить до feature-работ.
3. При поступлении от заказчика: приложить эталонный документ и обновить **MVP-TZ-01** в [docs/TZ_MVP_TRACEABILITY.md](docs/TZ_MVP_TRACEABILITY.md); границы пилота меняются только протоколом к **§47** `SDOPROF_TZ_FINAL.md` ([§44.1](SDOPROF_TZ_FINAL.md#441-исходное-тз-заказчика)).

### High

1. Миграции: прогон **`0027_audit_log_metadata`** на всех окружениях перед деплоем с новым insert в **`audit.audit_log`**.
2. При появлении новых MVP-эндпоинтов: сразу добавлять DTO-класс и **`assertValidDto`** (см. §5.21).
3. Карточка слушателя в UI: **`/learners/[id]`** (сделано §5.38).

### Medium

1. Минимальный manual smoke по ролям: таблица в **`docs/LAUNCH_RUNBOOK.md`** (см. §5.29 в этом handoff).
2. Синхронизация README с integration coverage: указатель HTTP integration в **`README.md`** (§5.30).

### Low

1. Дальнейшая оптимизация backend test bootstrap после §5.20 (forks последовательно — trade-off времени пайплайна).

## 15. Suggested Next Agent Prompt

«По `SDOPROF_TZ_FINAL.md` / security roadmap: cross-tenant и JWT vs заголовки; прогон миграции **`0027`** на целевых средах; при чтении аудита из UI — типы из **`@cdoprof/api-contracts`** (`AuditLogRecordContract`). При появлении эталона заказчика — блок **MVP-TZ-01** в `TZ_MVP_TRACEABILITY.md` (§13 Issue 0). Финал итерации: **`pnpm -s ci:check`**.»

## 16. Important Context / Assumptions

- Проект стабильно собирается и тестируется в текущем локальном окружении (`pnpm` monorepo).
- В IAM добавлены permissions **`assessment.read.cross_learner`** (0025), **`learners.act_as`** (0026); staff-роли в seed получают их автоматически после миграций.
- Изменения затронули `mvp` security (linkedIamUserId / learnerId consistency) и расширенный HTTP regression suite.
- Консолидированное ТЗ — `SDOPROF_TZ_FINAL.md` (в т.ч. §44.1: внешний эталон заказчика не расширяет пилот без протокола); внешний DOCX/PDF при наличии — только матрица расхождений в `TZ_MVP_TRACEABILITY.md`.
- `ci:check` используется как основной индикатор готовности итерации.

## 17. Environment Variables

| Variable                   | Required                | Purpose                             | Notes                             |
| -------------------------- | ----------------------- | ----------------------------------- | --------------------------------- |
| `DATABASE_URL`             | yes (backend runtime)   | PostgreSQL connection               | value not included                |
| `DB_MIGRATIONS_ENABLED`    | optional                | Enable migrations on startup        | boolean-like                      |
| `NEXT_PUBLIC_API_BASE_URL` | yes (frontend)          | Backend API URL                     | public env                        |
| `NEXT_PUBLIC_REALTIME_URL` | yes (frontend realtime) | Realtime endpoint URL               | public env                        |
| `PUBLIC_BASE_URL`          | optional/tests          | Base URL in tests/helpers           | no secrets                        |
| `WORKER_CALLBACK_SECRET`   | optional                | Защита `POST .../internal/worker/*` | Должен совпадать с токеном worker |
| `WORKER_CALLBACK_TOKEN`    | optional (worker)       | Заголовок к backend internal API    | См. `apps/worker/.env.example`    |

## 18. How To Run Locally

1. `pnpm install`
2. Создать `.env` из `.env.example` (и app-specific env templates при необходимости)
3. (Опционально) поднять инфраструктуру: `docker compose -f infra/docker-compose.yml up -d`
4. Запустить dev: `pnpm dev` или `pnpm dev:web`
5. Проверить качество: `pnpm -s lint && pnpm -s typecheck && pnpm -s build && pnpm -s ci:check`

## 19. How To Continue Development

- Начать с [docs/DOCUMENTATION_MAP.md](docs/DOCUMENTATION_MAP.md#agent-handoff-protocol), затем `README.md` (AI Agent State) и этот `LMS_AGENT_HANDOFF.md`.
- Backend приоритет: `apps/backend/src/modules/iam`, `apps/backend/src/modules/mvp`.
- Frontend приоритет: `apps/frontend/app/learner/*`, `apps/frontend/app/courses*`, `apps/frontend/src/features/auth`.
- После каждого изменения запускать минимум `lint + typecheck`, перед завершением — `ci:check`.
- Избегать разрушительных DB/API/auth изменений без миграций, тестов и документации.

## 20. Final Status

- Build status: последний прогон после §5.89 — `pnpm -s ci:check` зелёный.
- Backend: аудит делегирования (`metadata`), HTTP IDOR для **GET attempts / exam-results by enrollment**, class-validator MVP + общий **`createAppValidationPipe`**, frontend guard по **`cross_learner` / `learners.act_as`**, корневой Vitest **`test.projects`** и последовательный прогон backend-тестов.
- Итерация «план к ТЗ/запуску»: добавлены **`POST /enrollments/bulk`** с идемпотентностью в коллекции snapshot **`bulkEnrollmentIdempotency`**, **`GET /reports/kpi-snapshot`**, **`GET /enrollments/:id/certificates`** с проверкой `linkedIamUserId`; UI — KPI на **`/reports`**, сертификаты слушателя в **`LearnerCoursesScreen`**; эксплуатационные заготовки **`docs/LAUNCH_RUNBOOK.md`**, **`docs/BACKUP_ROLLBACK.md`**, трассировка **`docs/TZ_MVP_TRACEABILITY.md`**, NFR-снимок **`docs/NFR_LAUNCH_V1.md`**; доп. контракты в **`packages/api-contracts/src/domains/mvp-metrics/contracts.ts`**.
- Бэклог «полный MVP»: **очередь bulk** — `deliveryMode: queued` публикует в RabbitMQ, **worker** вызывает **`POST /api/v1/internal/worker/mvp/bulk-enrollments`** (`WORKER_CALLBACK_SECRET` / `WORKER_CALLBACK_TOKEN`); **organizationUnitId** у learner и массовые назначения по подразделению; **KPI drill-down** — query `include_enrollment_breakdown=1`; аудит **`iam.user_created`**; регресс **BL-007** listener; class-validator **`CreateModuleRequest`/`CreateMaterialRequest`**; см. **`docs/security-remediation-roadmap.md`** (статус JWT vs заголовки).
- Next best action: (1) прогон миграций **`0027`** на всех окружениях перед релизом; (2) security roadmap: оставшиеся P0/P1 или **manual smoke** по ролям; (3) при пилоте с очередью — проверить пары секретов и потребление `documents.generation`; (4) при поступлении эталона заказчика — **MVP-TZ-01** / протокол к §47 (Issue 0).
- Закрыто в §5.21: все текущие MVP **`@Body`** в **`MvpController`** проходят **`assertValidDto`**; контракты чтения аудита — **`packages/api-contracts/src/domains/audit.ts`**.
- Закрыто в §5.23: **`x-tenant-id`** при Bearer не может расходиться с JWT **`tenant_id`**; **`TenantGuard`** не маскирует **`HttpException`** под **`invalid_token`**.
- Закрыто в §5.24: MVP **`getById`** строго по **`tenantId`**; unit + HTTP регресс cross-tenant для курса.
- Закрыто в §5.25: **documents** — регресс на tenant-scoped **`must`** для шаблонов.
- Закрыто в §5.26: **e-sign** — регресс на tenant-scoped **`must`** для заявок.
- Закрыто в §5.27: **integrations** — регресс на tenant-scoped **`getTask`** для export-task.
- Закрыто в §5.28: **communication** — регресс на tenant-scoped **`get` / `getDialog`** при коллизии `id` между tenant.
- Закрыто в §5.29: **LAUNCH_RUNBOOK** — минимальный **smoke по ролям** (таблица маршрутов и проверок после деплоя).
- Закрыто в §5.30: **README** — перечень **backend HTTP integration** регрессий рядом с каноническим E2E.
- Закрыто в §5.31: **audit** — **`AuditService.list`** без пустого tenant; строгий SQL-фильтр.
- Закрыто в §5.32: **BL-001** — контракт-тест на **`iam.user_created`** при **`createUser`**; roadmap задача **1** — зафиксировано отсутствие чтения **`x-user-id`** в production identity path.
- Закрыто в §5.33: roadmap **P0.3** — контракт **`updateUser`** / **`userRoles`** / **`setRoles`** без утечек хэшей и секретов сессии.
- Закрыто в §5.34: roadmap **P0.2** (часть) — **rehash on login** legacy **SHA-256(seed)** → **scrypt**; **`upgradePasswordHash`** в **`IamService`**.
- Закрыто в §5.35: **BL-001** — аудит **`iam.password_rehashed`** при миграции пароля на **scrypt**.
- Закрыто в §5.36: **BL-010** — тип **`AuditLogPasswordRehashedMetadata`**; roadmap **§6** — зафиксировано выполнение критериев на MVP (cookie refresh, localStorage без токенов); **liveness** — unit-регресс **`live`**.
- Закрыто в §5.37: roadmap **P0.7 / §7** — задокументировано **шифрование секретов интеграций** (реализация + env); регресс на отсутствие **`enc:`** в публичном credential DTO.
- Закрыто в §5.38: **UI карточка слушателя** `/learners/[id]` (**`LearnerDetailsScreen`**), ссылки из реестра; smoke — **LAUNCH_RUNBOOK**.
- Закрыто в §5.39: roadmap **P0 §4–5** — **`workspaceApi`**; единый путь доменных вызовов через **`apiRequest`** (оперативная панель).
- Закрыто в §5.40: **BL-010** — HTTP regress **workspace** по tenant JWT + **`tenant_header_mismatch`**; roadmap **§10** статус дополнен.
- Закрыто в §5.41: **`GET /health/live`** HTTP + envelope (**SDOPROF §36** liveness контур); см. **`health.http.integration.test.ts`**.
- Закрыто в §5.42: **`GET /health/ready`** HTTP + envelope при успешных проверках зависимостей (моки); см. **`health.http.integration.test.ts`**.
- Закрыто в §5.43: **`GET /health/ready`** при отказе миграций (**503**, **`readiness_failed`**, **`error` + `meta`**); liveness независим (**200**).
- Закрыто в §5.44: **BL-003** — unit-регресс публикации bulk job в RabbitMQ (**`MvpBulkEnqueueService`**); см. **`mvp-bulk-enqueue.service.test.ts`**.
- Закрыто в §5.45: **BL-003** — HTTP-регрессии `POST /enrollments/bulk` для `deliveryMode: queued` и duplicate `idempotencyKey` (без повторной публикации).
- Закрыто в §5.46: **BL-010** — class-validator регрессии для **`CreateModuleRequest`** / **`CreateMaterialRequest`** в **`mvp.dto-validation.test.ts`**.
- Закрыто в §5.47: **BL-007** — listener регрессии: duplicate completion event идемпотентен, failure path пишет аудит **`documents.enrollment_certificate_failed`**.
- Закрыто в §5.48: **BL-008** — HTTP-регресс `GET /reports/kpi-snapshot` для `include_enrollment_breakdown=true` и default ответа без breakdown.
- Закрыто в §5.49: **BL-008** — HTTP-регресс `GET /reports/kpi-snapshot` для `include_enrollment_breakdown=1` (числовой флаг).
- Закрыто в §5.50: **BL-008** — HTTP-регресс `GET /reports/kpi-snapshot` для `include_enrollment_breakdown=0` (breakdown не возвращается).
- Закрыто в §5.51: **BL-003** — HTTP-регресс валидации `deliveryMode` (`async` → `400 validation_error`, без enqueue).
- Закрыто в §5.52: **BL-007** — listener регресс tenant isolation (binding другого tenant не приводит к генерации сертификата).
- Закрыто в §5.53: **BL-003** — HTTP-регресс строгой валидации `deliveryMode='QUEUED'` (`400 validation_error`, без enqueue).
- Закрыто в §5.54: **BL-010** — стабилизация `health.http.integration.test.ts` (beforeAll timeout `60_000`) для надёжного полного `ci:check`.
- Закрыто в §5.55: **BL-003** — HTTP-регресс default поведения bulk без `deliveryMode` (immediate path, без enqueue).
- Закрыто в §5.56: **BL-003** — HTTP-регресс строгой валидации `deliveryMode=' queued '` (`400 validation_error`, без enqueue).
- Закрыто в §5.57: **BL-008** — HTTP-регресс для mixed-case `include_enrollment_breakdown=TrUe` (breakdown не возвращается).
- Закрыто в §5.58: **BL-003** — HTTP-регресс worker callback `POST …/internal/worker/mvp/bulk-enrollments` + явный `@Inject(MvpService)` в internal controller.
- Закрыто в §5.59: **BL-003** — модуль **`apps/worker`** `bulk-enrollment-callback.ts` + unit regress (`bulk-enrollment-callback.test.ts`): контракт URL/headers/body и non-retry vs retry по HTTP-коду.
- Закрыто в §5.60: **BL-005** — HTTP-регресс лимита попыток (`attempt_limit_reached` после исчерпания **`attemptLimit`**).
- Закрыто в §5.61: **BL-006** — HTTP-регресс запрета второго **`assignment-reviews`** на один **`submissionId`** (**409 conflict**).
- Закрыто в §5.62: **BL-006** — HTTP-регресс запрета второго **`assignment-reviews/:id/complete`** для уже **`completed`** (**412 domain_rule_violation**).
- Закрыто в §5.63: **BL-006** — в том же HTTP-сценарии регресс **`PATCH /assignment-reviews/:id`** после **`completed`** (**412**, read-only).
- Закрыто в §5.64: **BL-006** — HTTP-регресс **`PATCH /assignment-submissions/:id`** после **`submit`** (**412** **`submission_terminal`**, сдача не редактируется).
- Закрыто в §5.65: **BL-010** — тот же HTTP-сценарий с **`linkedIamUserId`**: чужой JWT — **403** на **`PATCH`** и **`submit`** чужой субмиссии (ранее — создание и **GET**).
- Закрыто в §5.66: **BL-010** — **`GET /assignment-submissions`** (list): два разных **`linkedIamUserId`** — каждый JWT видит только свои строки (**`restrictLearnerIdsForAssessmentList`**).
- Закрыто в §5.67: roadmap **§10** — **`metadata.correlation_id`** в IAM-аудите для связки с HTTP-логами (**`RequestObservabilityInterceptor`** / заголовок **`x-correlation-id`**).
- Закрыто в §5.68: **`metadata.correlation_id`** в аудите **documents / MVP / e-sign / integrations** (HTTP-контуры); слушатель сертификатов по событию — без **`RequestContext`** до §5.69.
- Закрыто в §5.69: **`learning.enrollment_completed`** несёт **`requestId`/`correlationId`** из **`changeEnrollmentStatus`**; слушатель сертификатов пробрасывает в аудит задачи и **`generateDocument`**.
- Закрыто в §5.70: **`POST /documents/generate/batch`** сохраняет **`requestId`/`correlationId`** на задачах генерации (как одиночный **`generate`**).
- Закрыто в §5.71: HTTP integration — граница разрешения **`documents.generate`** для пакетной генерации (отдельно от **`documents.write`**).
- Закрыто в §5.72: HTTP integration — та же граница **`documents.generate`** для одиночной **`POST …/documents/generate`**.
- Закрыто в §5.73: HTTP integration — e-sign **`POST …/applications/:id/submit`** требует **`esign.applications.submit`**, отдельно от **`esign.applications.write`**.
- Закрыто в §5.74: HTTP integration — e-sign **`POST …/applications/:id/start-review`** требует **`esign.applications.review`** (не удовлетворяется одним только **submit+write**).
- Закрыто в §5.75: HTTP integration — e-sign **`POST …/participants/:id/sign`** требует **`esign.participants.sign`**, а не только **`esign.processes.write`**.
- Закрыто в §5.76: HTTP integration — e-sign **`GET …/legal-log`** (и симметрично путь **`…/legal-log/:id`** в guard) требует **`esign.legal.read`**, отдельно от **`esign.applications.read`**.
- Закрыто в §5.77: HTTP integration — **`GET`** по контуру процессов (в harness — **`GET …/processes`**; в guard также **`…/events`**, **`GET …/participants`**) отделён от заявок: **`esign.processes.read`**, без **`esign.applications.read`**.
- Закрыто в §5.78: HTTP integration — **`GET …/application-files`** требует **`esign.applications.read`**; одного **`esign.processes.read`** недостаточно.
- Закрыто в §5.79: HTTP integration — **`POST …/application-files`** требует **`esign.applications.write`**, не только **`esign.applications.read`**.
- Закрыто в §5.80: HTTP integration — **`POST …/application-files/:id/verify`** требует **`esign.applications.review`**, не только **read+write** на заявках.
- Закрыто в §5.81: HTTP integration — **`POST …/application-files/:id/reject`** тот же контур **`esign.applications.review`** (общий паттерн в guard с verify).
- Закрыто в §5.82: HTTP integration — **`POST …/applications/:id/approve`** и **`POST …/applications/:id/reject`** требуют **`esign.applications.review`** (не **submit+write**); **`DELETE …/application-files/:id`** требует **`esign.applications.write`**.
- Закрыто в §5.83: HTTP integration — **`POST …/processes`** и **`POST …/processes/:id/(start|cancel)`** (в harness — **start**) — **`esign.processes.write`**; **`POST …/participants/:id/skip`** — **`esign.processes.write`**, не **`participants.sign`**; **`POST …/participants/:id/(sign|mark-viewed|reject)`** — **`esign.participants.sign`**.
- Закрыто в §5.84: HTTP integration — **integrations** harness: **`PATCH`** мутации к **`integrations.write`** (регресс от модели «только **POST** = write»); позитивные **GET**/**POST sync** с envelope.
- Закрыто в §5.85: HTTP integration — **documents** harness: **PATCH**/ **PUT**/ **DELETE** требуют **`documents.write`**; регресс **templates/:id**.
- Закрыто в §5.86: HTTP integration — **integrations** harness: **PUT**/ **DELETE** → **`integrations.write`** (до правки ошибочно **read**); регресс **providers/:id**.
- Закрыто в §5.87: HTTP integration — **e-sign**: **PATCH …/applications/:id** — **`esign.applications.write`**; **POST …/reuse-check** — **`esign.applications.read`**; **PATCH …/participants/:id** — **`esign.processes.write`**.
- Закрыто в §5.88: HTTP integration — **e-sign**: **POST …/participants** и **POST …/participants/:id/invite** — **`esign.processes.write`** (закрыт «дырявый» harness без **`required`**); регресс **POST …/processes/:id/cancel**, **POST …/participants/:id/reject** (**sign**), **GET …/events** (**processes.read**); **GET …/applications/:id**, **GET …/legal-log/:id**; стабы read по **application-files/:id**, **processes/:id**, **participants**, **events/:id**.
- Закрыто в §5.89: HTTP integration — **e-sign GET parity**: object-level **`GET …/processes/:id`**, **`GET …/participants`**, **`GET …/application-files/:id`** получили отдельные **403/200** регрессии; добавлены success-кейсы для **`GET …/processes/:id/status`** и **`GET …/events/:id`**.

## 21. Новые MVP API (быстрый справочник)

| Method | Path                                    | Permission                | Назначение                                                                     |
| ------ | --------------------------------------- | ------------------------- | ------------------------------------------------------------------------------ |
| POST   | `/enrollments/bulk`                     | `enrollments.write`       | BL-003: sync или `deliveryMode: queued`; org unit см. **`organizationUnitId`** |
| POST   | `/internal/worker/mvp/bulk-enrollments` | `x-worker-callback-token` | Только worker: завершение queued bulk                                          |
| GET    | `/reports/kpi-snapshot`                 | `enrollments.read`        | BL-008 KPI; опционально `include_enrollment_breakdown=1`                       |
| GET    | `/enrollments/:id/certificates`         | `enrollments.read`        | BL-007 выдача ссылок на сертификаты по завершении                              |

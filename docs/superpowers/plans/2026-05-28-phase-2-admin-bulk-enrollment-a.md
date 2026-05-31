# Phase 2 — Plan A: Admin Layout + Bulk Excel Enrollment

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Дать сотруднику центра возможность массово загрузить Excel со списком слушателей и одной операцией создать недостающих учеников + назначить их на учебную группу. Закрывает главный процесс из спеки §3.3: «Компания шлёт Excel → центр загружает → автопроверка ФИО/СНИЛС/email/дубликатов → массовое назначение валидным (BL-003 worker)». Принцип `partial-success`: невалидные строки возвращаются для исправления, валидные уходят в назначение.

**Architecture:** Расширение существующего `mvp` модуля (NestJS) + новый admin-layout на фронте. Backend уже имеет `MvpBulkEnqueueService` + `mvp-internal-worker.controller.ts` + `MvpService.createBulkEnrollments` (через очередь RabbitMQ → worker). Чего нет — атомарного «создать-или-найти-учеников-и-зачислить» endpoint'а: текущий `POST /enrollments/bulk` принимает уже существующие `learnerIds[]`. Plan A добавляет `POST /learners/bulk-import` (новый) и подключает к нему frontend-pipeline парсера Excel + валидаторов + preview-таблицы.

Email-приглашения (последний шаг потока §3.3) отложены до Phase 5 (уведомления) — Plan A только создаёт + зачисляет.

**Tech Stack:** PostgreSQL (без новых миграций — текущая схема `mvp.learners` + `mvp.enrollments` достаточна), NestJS + TypeScript (backend), Vitest (тесты), Next.js App Router + TypeScript (frontend), `xlsx` npm-пакет (SheetJS, MIT) для парсинга Excel в браузере. Используется существующая инфраструктура `mvp.controller` (permission boundaries), `MvpService` (CRUD), `mvp-bulk-enqueue.service` (RabbitMQ publish).

**Спецификация:** [../specs/2026-05-21-cdoprof-redesign-design.md](../specs/2026-05-21-cdoprof-redesign-design.md) — §3.3 «Главный процесс: центр всё назначает сам», §9.1 BL-003 bulk enrollment.

**Роадмап:** [2026-05-21-cdoprof-v1-roadmap.md](2026-05-21-cdoprof-v1-roadmap.md) — Phase 2 «Админка центра + массовые операции», задача «Массовые назначения: drag&drop загрузка Excel + автопроверка ФИО, СНИЛС, email, поиск дубликатов».

**Зависимости перед стартом:**

- `main` на коммите ≥ `6d43f04` (PR #189 learner-documents merged).
- PR #191 «commission edit UI + README sync» желательно смерджен, но не блокирует.
- Ветка плана отрезается от `main`.

**Что НЕ входит в Plan A (другие планы Phase 2):**

- Plan B: учётные записи учеников — list/search/filter/edit UI поверх `GET /learners` (endpoint уже есть).
- Plan C: управление компаниями-клиентами (CRUD `core.tenants_clients` или аналог) + view прогресса по группе.
- Phase 5: email-приглашения после создания+зачисления.
- Phase 10: Excel-конструктор для произвольных выгрузок (не путать с **загрузкой** Excel из Plan A — это **разные** фичи).

---

## File Structure

### Create — backend

- `apps/backend/src/modules/mvp/learners-bulk-import.types.ts` — типы для одной строки импорта и outcome.
- `apps/backend/src/modules/mvp/learners-bulk-import.dto.ts` — `BulkImportLearnersRequest` DTO с валидацией.
- `apps/backend/src/modules/mvp/learners-bulk-import.service.ts` — pure-function классификатор строк (`classifyRows`) + сервисный метод `bulkImportLearners` (resolveOrCreate + enroll).
- `apps/backend/src/modules/mvp/learners-bulk-import.service.test.ts` — unit-тесты для classifyRows + bulkImportLearners.
- `apps/backend/src/modules/mvp/learners-bulk-import.http.integration.test.ts` — HTTP integration с permission boundaries (`auth_required` / `permission_denied` / success).

### Modify — backend

- `apps/backend/src/modules/mvp/mvp.controller.ts` — добавить endpoint `POST /learners/bulk-import` (permission `learners.write` + `enrollments.write`).
- `apps/backend/src/modules/mvp/mvp.module.ts` (или текущий модуль-провайдер) — зарегистрировать `LearnersBulkImportService`.
- `apps/backend/src/modules/mvp/mvp.dto-validation.test.ts` — расширить DTO-валидацию новыми кейсами.
- `apps/backend/src/modules/mvp/infrastructure/mvp-collections.ts` — если новые in-memory сущности не нужны, не трогать; иначе зарегистрировать.

### Create — frontend

- `apps/frontend/app/admin/layout.tsx` — shared admin shell с боковой навигацией (Cockpit / Слушатели / Группы / Комиссии / Журнал выдачи / Лицензии / Массовая загрузка).
- `apps/frontend/app/admin/bulk-enrollments/page.tsx` — страница массовой загрузки (Protected).
- `apps/frontend/src/features/bulk-enrollments/types.ts` — типы для строки парсинга + outcome.
- `apps/frontend/src/features/bulk-enrollments/excel-parser.ts` — pure-function парсер `parseExcelBuffer(buffer): RawRow[]`.
- `apps/frontend/src/features/bulk-enrollments/excel-parser.test.ts` — тесты парсера с примерами файлов.
- `apps/frontend/src/features/bulk-enrollments/validators.ts` — pure-function валидаторы (ФИО, СНИЛС, email, in-file дубликаты).
- `apps/frontend/src/features/bulk-enrollments/validators.test.ts` — тесты валидаторов (включая edge cases СНИЛС-чексумы).
- `apps/frontend/src/features/bulk-enrollments/api.ts` — REST-клиент `bulkImport(session, payload)`.
- `apps/frontend/src/features/bulk-enrollments/api.contract.test.ts` — contract-тест с MSW (по образцу `mvp/api.contract.test.ts`).
- `apps/frontend/src/features/bulk-enrollments/hooks.ts` — React Query хуки (`useBulkImportMutation`).
- `apps/frontend/src/features/bulk-enrollments/bulk-import-screen.tsx` — основной экран (upload + preview-table + submit).
- `apps/frontend/src/features/bulk-enrollments/preview-table.tsx` — таблица с строками и статусами (valid/error/duplicate).

### Modify — frontend

- `apps/frontend/src/features/navigation/model.ts` — добавить `/admin/bulk-enrollments` с permission `learners.write` + `enrollments.write`.
- `apps/frontend/src/features/navigation/role-blueprints.ts` или `role-journeys.ts` — добавить пункт в навигацию tenant_admin.
- `apps/frontend/package.json` — добавить `xlsx` (^0.20.x) в dependencies.

### Untouched (используется как есть)

- `mvp.learners` / `mvp.enrollments` / `learning.groups` — схема не меняется.
- `MvpBulkEnqueueService` / `mvp-internal-worker.controller` — Plan A не задействует RabbitMQ-путь; для V1-пилота при количестве строк до ~500 синхронный путь достаточен. Расширение до queued/worker — Plan B или follow-up при первой проблеме производительности.
- `PermissionGuard` / `WorkerCallbackGuard` — используются как есть.

---

## Task 1: BulkImportLearnersRequest DTO + типы

**Files:**

- `apps/backend/src/modules/mvp/learners-bulk-import.types.ts` (новый)
- `apps/backend/src/modules/mvp/learners-bulk-import.dto.ts` (новый)
- `apps/backend/src/modules/mvp/mvp.dto-validation.test.ts` (extend)

**Why:** Внешний контракт endpoint'а должен принимать строки Excel в нормализованном виде. Frontend парсит файл и шлёт массив объектов; backend валидирует и обрабатывает.

**Tasks:**

- [x] Создать `learners-bulk-import.types.ts`:
  - `BulkImportRow`: `{ rowNumber: number; fullName: string; email: string; snils?: string; position?: string; }`.
  - `BulkImportOutcomeRow`: `{ rowNumber: number; status: 'created' | 'reused' | 'enrolled_only' | 'failed'; learnerId?: string; enrollmentId?: string; errorCode?: string; errorMessage?: string; }`.
  - `BulkImportOutcome`: `{ idempotencyKey: string; groupId: string; total: number; created: number; reused: number; failed: number; rows: BulkImportOutcomeRow[]; }`.
- [x] Создать `learners-bulk-import.dto.ts` с `BulkImportRowDto` (вложенный) и `BulkImportLearnersRequest`:
  - `idempotencyKey: string` (MinLength 1).
  - `groupId: string` (MinLength 1).
  - `rows: BulkImportRowDto[]` (ArrayMaxSize 1000, ArrayMinSize 1).
  - `BulkImportRowDto`: rowNumber/fullName/email обязательны; snils/position опциональны.
  - На уровне DTO **только** структурная валидация; бизнес-валидация (формат СНИЛС, дубликаты) — в Task 2.
- [x] Добавить ≥6 кейсов в `mvp.dto-validation.test.ts`:
  - happy path с 3 валидными строками,
  - пустой `rows` → ошибка,
  - `rows.length > 1000` → ошибка,
  - `idempotencyKey` пустой → ошибка,
  - `groupId` пустой → ошибка,
  - row без `fullName` → ошибка.

**Acceptance:**

- Все новые тесты `mvp.dto-validation.test.ts` зелёные.
- `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/mvp.dto-validation.test.ts` зелёный.

---

## Task 2: `classifyRows` — pure-function валидация

**Files:**

- `apps/backend/src/modules/mvp/learners-bulk-import.service.ts` (новый — добавить exported pure function)
- `apps/backend/src/modules/mvp/learners-bulk-import.service.test.ts` (новый)

**Why:** Бизнес-валидация выделена в pure function, чтобы её можно было тестировать без infrastructure mock'ов и переиспользовать на frontend.

**Tasks:**

- [x] Реализовать `classifyRows(rows: BulkImportRow[], existing: { learners: { id; email; snils? }[] }): ClassifiedRow[]`:
  - `ClassifiedRow`: `{ row: BulkImportRow; classification: 'create' | 'reuse' | 'invalid'; reuseLearnerId?: string; errors: { field; code; message }[] }`.
  - Проверки:
    - `fullName`: trim, ≥ 2 слов кириллицей с заглавных букв.
    - `email`: regex `^[^@\s]+@[^@\s]+\.[^@\s]+$`, lowercase normalize.
    - `snils` (optional): формат `XXX-XXX-XXX YY` (или `XXXXXXXXXYY`); если задан — валидировать чексумму по алгоритму ПФР.
    - `position` (optional): trim, ≤ 200 символов.
    - В рамках одного запроса: дубликаты email/snils → все вхождения помечаются `invalid` с кодом `duplicate_in_file`.
    - Против `existing.learners`: если email или snils совпадает с существующим — `classification: 'reuse'`, `reuseLearnerId`.
- [x] СНИЛС-чексумма (algorithm):
  1. Взять первые 9 цифр.
  2. Умножить каждую на её позицию (`d[0]*9 + d[1]*8 + ... + d[8]*1`).
  3. `sum < 100` → checksum = sum.
  4. `sum == 100 || sum == 101` → checksum = `00`.
  5. `sum > 101` → `sum % 101`; если результат `100` или `101` → `00`, иначе результат.
  6. Сравнить с последними 2 цифрами.
- [x] Тесты в `learners-bulk-import.service.test.ts` (≥ 12 кейсов):
  - happy path 3 строки → все `create`.
  - все 4 типа errors: bad fullName, bad email, bad snils format, bad snils checksum.
  - дубликат email в файле → обе строки `invalid`.
  - дубликат snils в файле → обе строки `invalid`.
  - email совпадает с existing learner → `reuse`.
  - snils совпадает с existing learner → `reuse`.
  - email совпадает с одним existing + snils с другим → `invalid` (конфликт идентификации).
  - case-insensitive email comparison.
  - СНИЛС в формате `XXX-XXX-XXX YY` принят.
  - СНИЛС в формате `XXXXXXXXXYY` принят.
  - СНИЛС с чексумм == 00 (sum > 101 / sum == 100) корректно валидирован.

**Acceptance:**

- 12+ тестов зелёные.
- `classifyRows` экспортирована и не зависит от DI/state.

---

## Task 3: `LearnersBulkImportService.bulkImportLearners`

**Files:**

- `apps/backend/src/modules/mvp/learners-bulk-import.service.ts` (extend)
- `apps/backend/src/modules/mvp/learners-bulk-import.service.test.ts` (extend)

**Why:** Сервис-метод, инжектируемый в controller, который применяет `classifyRows` к persistence-снимку, создаёт новых учеников, зачисляет всех (created + reused) в группу, возвращает `BulkImportOutcome`.

**Tasks:**

- [x] Конструктор: `@Inject(MvpService) private readonly mvpService`.
- [x] Реализовать `async bulkImportLearners(tenantId, actorId, request, ctx): Promise<BulkImportOutcome>`:
  1. Idempotency: проверить через `mvpService.getBulkEnrollmentOutcomeIfAny(tenantId, idempotencyKey)` (Plan B может это переименовать) — если есть, вернуть кэшированный outcome.
  2. Загрузить существующих учеников tenant'а: `mvpService.listLearners(tenantId, { page: 1, pageSize: <large> })`. **TODO для performance**: если > 10k учеников — добавить bulk-lookup-by-emails endpoint.
  3. Вызвать `classifyRows(request.rows, { learners: existing })`.
  4. Для каждой `'create'`-строки: `mvpService.createLearner(tenantId, actorId, ..., ctx)`. Собрать `learnerId`s.
  5. Для каждой `'reuse'`-строки: использовать `reuseLearnerId`.
  6. Сформировать массив всех `learnerIds` (created + reused).
  7. Вызвать `mvpService.createBulkEnrollments(tenantId, actorId, { idempotencyKey, groupId, learnerIds, deliveryMode: 'immediate' }, ctx)` — переиспользует существующий путь с `enrollments.write`.
  8. Сформировать `BulkImportOutcome.rows` с per-row статусами на основе результатов шагов 4-7.
  9. Записать outcome в новую in-memory коллекцию `bulkImportOutcomes` (или существующую `bulkEnrollmentOutcomes` с переименованием — выбрать при имплементации) для idempotency.
- [x] Тесты (≥ 8 кейсов):
  - 3 валидные строки → 3 `created` + 3 enrollments.
  - 2 валидных + 1 invalid → 2 `created` + 1 `failed`.
  - 1 reuse + 2 create → 1 `reused` + 2 `created`, 3 enrollments.
  - повторный вызов с тем же idempotencyKey → возвращён тот же outcome, ни одного нового learner/enrollment.
  - все строки invalid → `failed: N`, `created: 0`, `enrollments: 0`.
  - `groupId` несуществующий → `NotFoundException` или классификация всех строк как failed (выбрать поведение — рекомендую исключение).
  - audit log: каждое создание + bulk-enrollment пишут в audit с `actorId` и `tenantId`.
  - tenant-isolation: ученик другого tenant'а в `existing` НЕ попадает (т.к. `listLearners` уже tenant-scoped).

**Acceptance:**

- 8+ unit-тестов зелёные.
- Метод idempotent.
- Метод использует существующие `MvpService.createLearner` и `MvpService.createBulkEnrollments` — без прямого доступа к state.

---

## Task 4: HTTP endpoint `POST /learners/bulk-import`

**Files:**

- `apps/backend/src/modules/mvp/mvp.controller.ts` (extend)
- `apps/backend/src/modules/mvp/learners-bulk-import.http.integration.test.ts` (новый)

**Tasks:**

- [x] В контроллер добавить:
  ```ts
  @Post('learners/bulk-import')
  @UseGuards(PermissionGuard)
  @RequirePermissions('learners.write', 'enrollments.write')
  bulkImportLearners(@CurrentContext() c: RequestContext, @Body() raw: unknown) {
    const b = assertValidDto(BulkImportLearnersRequest, raw);
    return this.learnersBulkImport.bulkImportLearners(c.tenantId!, c.userId, b, c);
  }
  ```
  Inject `LearnersBulkImportService` в конструктор.
- [x] HTTP integration tests (по образцу `mvp.http.integration.test.ts`):
  - `auth_required`: 401 без bearer token.
  - `permission_denied`: 403 при отсутствии `learners.write` (только `enrollments.write`).
  - `permission_denied`: 403 при отсутствии `enrollments.write` (только `learners.write`).
  - `session_inactive`: 401 при revoked session.
  - happy path: 200, outcome с per-row статусами.
  - валидная idempotency: 2 одинаковых вызова → 1 фактическое создание.
- [x] Проверить, что `MVP_COLLECTIONS` зарегистрировал bulkImportOutcomes коллекцию (если используется новая).

**Acceptance:**

- 6+ HTTP-тестов зелёные.
- `RequirePermissions` требует **обе** permission (`learners.write` AND `enrollments.write`) — иначе 403.

---

## Task 5: Frontend `xlsx` dependency + excel-parser

**Files:**

- `apps/frontend/package.json` (modify — add `xlsx`)
- `apps/frontend/src/features/bulk-enrollments/excel-parser.ts` (новый)
- `apps/frontend/src/features/bulk-enrollments/excel-parser.test.ts` (новый)

**Tasks:**

- [x] Добавить `xlsx` в `apps/frontend/package.json` → `"xlsx": "^0.20.3"`. Запустить `pnpm install` в worktree.
- [x] Реализовать `parseExcelBuffer(buffer: ArrayBuffer): { rows: ParsedRow[]; errors: ParseError[]; }`:
  - Через `XLSX.read(buffer, { type: 'array' })` прочесть первый лист.
  - Первая строка — заголовки. Принимаем синонимы: `ФИО`/`Имя`/`Фамилия Имя Отчество` → `fullName`, `Email`/`E-mail`/`Эл. почта` → `email`, `СНИЛС`/`SNILS` → `snils`, `Должность`/`Position` → `position`.
  - Регистронезависимый матч, trim, lowercase для match.
  - Если в заголовках не найдены `fullName` И `email` → вернуть `errors: [{ code: 'missing_required_columns', ...}]`.
  - Пропускать полностью пустые строки.
  - rowNumber = индекс строки в Excel (header = 1, первая данных = 2 и т.д.).
- [x] Также поддержать CSV (тот же `XLSX.read` с `type: 'binary'`).
- [x] Тесты (≥ 8 кейсов) — генерировать xlsx в коде через `XLSX.utils.aoa_to_sheet` + `XLSX.write`:
  - happy: 3 строки с 4 колонками → 3 ParsedRow.
  - заголовки в разном регистре `ФИО` / `фио` / `Фио` — все принимаются.
  - синонимы (`Имя` вместо `ФИО`) принимаются.
  - пустые строки между данными — игнорируются, rowNumber сохраняет позицию.
  - нет header'а `fullName` → error `missing_required_columns`.
  - нет header'а `email` → error `missing_required_columns`.
  - snils/position отсутствуют — ParsedRow возвращён без них.
  - CSV с теми же данными → тот же результат.

**Acceptance:**

- 8+ тестов parser'а зелёные.
- Парсер чисто pure — принимает `ArrayBuffer`, возвращает данные без I/O.

---

## Task 6: Frontend validators (зеркало backend Task 2)

**Files:**

- `apps/frontend/src/features/bulk-enrollments/validators.ts` (новый)
- `apps/frontend/src/features/bulk-enrollments/validators.test.ts` (новый)

**Why:** Дублирование валидаторов на frontend для **instant feedback** перед отправкой. Backend — source of truth (Task 2), frontend — preview UX.

**Tasks:**

- [x] Перенести логику `classifyRows` из backend на frontend (можно скопировать). **TODO для future refactoring**: вынести в `packages/shared-types` или `packages/api-contracts` как pure-function модуль, чтобы избежать drift.
- [x] Реализовать `classifyParsedRows(rows: ParsedRow[]): ClassifiedRow[]` — без аргумента `existing` (т.к. на фронте мы НЕ знаем существующих учеников; reuse-классификация делается backend'ом). Frontend помечает только: `valid` / `invalid` с per-field errors + `duplicate_in_file`.
- [x] Тесты (≥ 10 кейсов) — те же, что Task 2, но без reuse-сценариев. Включить СНИЛС-чексумму (тестовый набор корректных и некорректных).

**Acceptance:**

- 10+ тестов зелёные.
- Поведение идентично backend Task 2 для общих случаев.

---

## Task 7: Frontend api + hook

**Files:**

- `apps/frontend/src/features/bulk-enrollments/types.ts` (новый)
- `apps/frontend/src/features/bulk-enrollments/api.ts` (новый)
- `apps/frontend/src/features/bulk-enrollments/api.contract.test.ts` (новый)
- `apps/frontend/src/features/bulk-enrollments/hooks.ts` (новый)

**Tasks:**

- [x] `types.ts`: `BulkImportRequest`, `BulkImportOutcome`, `BulkImportOutcomeRow` — зеркало backend.
- [x] `api.ts`: `bulkImportLearners(session, payload): Promise<BulkImportOutcome>` — через существующий `apiRequest` + `withAuth(session)`.
- [x] `api.contract.test.ts` — по образцу `mvp/api.contract.test.ts` через MSW:
  - mock 200 → outcome парсится в правильный тип.
  - mock 400 → `ApiClientError` с code/message.
  - mock 403 → `ApiClientError`.
- [x] `hooks.ts`:
  - `useBulkImportMutation()` — обёртка через существующий `wrap((authSession) => mvpApi.bulkImportLearners(authSession, payload))` (проект не использует React Query mutations, см. CommissionDetailsScreen паттерн).
  - Без React Query инвалидации на этом этапе — outcome возвращается напрямую в UI.

**Acceptance:**

- 3+ contract-тестов зелёные.
- Hook возвращает функцию, которую можно вызвать с `payload`.

---

## Task 8: Admin layout shell

**Files:**

- `apps/frontend/app/admin/layout.tsx` (новый)
- `apps/frontend/src/widgets/admin-shell/admin-side-nav.tsx` (новый — компонент)
- `apps/frontend/src/widgets/admin-shell/admin-side-nav.test.ts` (новый)

**Why:** Сейчас `/admin/*` страницы независимы без общего layout. Нужно sidebar/top-nav с разделами «Cockpit / Слушатели / Группы / Комиссии / Журнал выдачи / Лицензии / Массовая загрузка», видимыми с учётом permission'ов пользователя.

**Tasks:**

- [x] `apps/frontend/app/admin/layout.tsx`:
  - Принимает `children`.
  - Оборачивает в `<div className="admin-shell">` с двумя областями: nav-aside + content-main.
  - Использует существующий `ProtectedPage` (или не использует, если page-level уже его подключают — проверить).
- [x] `AdminSideNav` компонент:
  - Берёт список разделов из конфига (новый `apps/frontend/src/widgets/admin-shell/admin-sections.ts`).
  - Каждый раздел: `{ href, label, requiredPermissions }`.
  - Фильтрует по permission'ам через существующий хук `useAuth().session.permissions`.
  - Highlight активного раздела по `usePathname()`.
- [x] Разделы Plan A:
  ```ts
  [
    { href: '/admin/cockpit', label: 'Cockpit', requiredPermissions: ['auth.manage_sessions'] },
    {
      href: '/admin/bulk-enrollments',
      label: 'Массовая загрузка',
      requiredPermissions: ['learners.write', 'enrollments.write']
    },
    {
      href: '/admin/commissions',
      label: 'Комиссии',
      requiredPermissions: ['learning.commissions.read']
    },
    { href: '/admin/licenses', label: 'Лицензии', requiredPermissions: ['org.licenses.read'] },
    {
      href: '/admin/issuance-journal',
      label: 'Журнал выдачи',
      requiredPermissions: ['documents.read']
    }
  ];
  ```
  (Слушатели/Группы — добавляются в Plan B.)
- [x] CSS-стили в существующем `app/globals.css` или новом scoped — sidebar 240px, content fill, mobile-collapse через media query.
- [x] Тест `admin-side-nav.test.ts`:
  - Render с user, имеющим все permissions → видны все пункты.
  - Render без `learners.write` → скрыт пункт «Массовая загрузка».
  - Active-pathname highlight.

**Acceptance:**

- 3+ компонент-теста зелёные.
- Все существующие `/admin/*` страницы открываются с новым layout без визуальных регрессий (smoke-проверка в браузере или через snapshot — на усмотрение).

---

## Task 9: Bulk import screen — upload + preview-table

**Files:**

- `apps/frontend/app/admin/bulk-enrollments/page.tsx` (новый)
- `apps/frontend/src/features/bulk-enrollments/bulk-import-screen.tsx` (новый)
- `apps/frontend/src/features/bulk-enrollments/preview-table.tsx` (новый)

**Tasks:**

- [x] `app/admin/bulk-enrollments/page.tsx` — обёртка `<ProtectedPage><BulkImportScreen /></ProtectedPage>` по образцу `app/admin/commissions/[id]/page.tsx`.
- [x] `BulkImportScreen`:
  - State: `{ file, parseResult, classifiedRows, groupId, idempotencyKey, isSubmitting, outcome, error }`.
  - Section «Загрузить файл»:
    - `<input type="file" accept=".xlsx,.xls,.csv">`.
    - On change: read as ArrayBuffer, вызвать `parseExcelBuffer`, затем `classifyParsedRows`. Сохранить в state.
    - Сгенерировать `idempotencyKey = crypto.randomUUID()` при загрузке нового файла.
  - Section «Выбрать группу»:
    - Select из `useGroups()` (хук уже существует).
  - Section «Предпросмотр»:
    - `<PreviewTable rows={classifiedRows} />`.
    - Счётчик «Валидно: N, Ошибки: M».
  - Section «Загрузить»:
    - Кнопка disabled пока: !file || !groupId || N валидных == 0.
    - On click: `useBulkImportMutation` с `rows = валидные`.
    - Показать outcome или error.
- [x] `PreviewTable`:
  - Columns: `№`, `ФИО`, `Email`, `СНИЛС`, `Должность`, `Статус`, `Ошибки`.
  - Статус рендерится бейджем (green «Валидно» / red «Ошибка»).
  - Ошибки — список field/code/message.

**Acceptance:**

- Страница рендерится без ошибок в браузере на `/admin/bulk-enrollments`.
- Загрузка валидного xlsx → preview-таблица с 3 валидными строками + счётчик.
- Загрузка xlsx с 1 ошибкой → 2 валидных + 1 invalid с подсветкой.
- Submit с валидными → отправлен запрос + показан outcome.

---

## Task 10: Navigation + permission wiring

**Files:**

- `apps/frontend/src/features/navigation/model.ts` (modify)
- `apps/frontend/src/features/navigation/role-blueprints.ts` (modify, если нужно)
- `apps/frontend/src/features/navigation/role-journeys.test.ts` (extend)

**Tasks:**

- [x] В `routeMeta` добавить:
  ```ts
  { pattern: '/admin/bulk-enrollments', meta: { public: false, requiredPermissions: ['learners.write', 'enrollments.write'] } },
  ```
- [x] В соответствующий role-blueprint для `tenant_admin` добавить пункт навигации (если используется отдельный blueprint).
- [x] Тест в `role-journeys.test.ts`:
  - tenant_admin видит `/admin/bulk-enrollments`.
  - methodist (без `learners.write`) НЕ видит.
  - learner НЕ видит.

**Acceptance:**

- Тест `role-journeys.test.ts` зелёный.
- `evaluateRouteAccess('/admin/bulk-enrollments', user_без_perm)` → denied.

---

## Task 11: E2E smoke

**Files:**

- `apps/frontend/src/e2e/admin-bulk-enrollment.e2e.test.ts` (новый) **или** extend existing `lms-role-flows.e2e.test.ts`.

**Tasks:**

- [x] Сценарий через MSW + happy-dom (нет реального браузера, проект использует Vitest e2e):
  - Mount `BulkImportScreen`.
  - Симулировать загрузку файла (через File API mock).
  - Дождаться preview-таблицы.
  - Кликнуть submit.
  - Проверить, что MSW intercepted `POST /learners/bulk-import` с правильным payload.
  - Проверить outcome render.

**Acceptance:**

- E2E зелёный.
- Покрывает full pipeline: parse → classify → preview → submit.

---

## Task 12: Документация

**Files:**

- `README.md` (modify) — обновить **AI Agent State** под завершение Plan A.
- `LMS_AGENT_HANDOFF.md` (modify) — добавить §5.XX «Phase 2 Plan A — bulk Excel import».
- `docs/TZ_MVP_TRACEABILITY.md` (modify) — связать BL-003 → новые файлы.
- (Опционально) обновить [project-v1-status](memory) в memory.

**Acceptance:**

- README отражает завершение Plan A.
- Handoff содержит файлы + commit hash.

---

## Open questions (не блокируют старт Plan A)

- **Q1.** Что показывать на «Cockpit», когда `/admin/*` получит shell? Сейчас это `RoleWidgetGrid` placeholder. Решить отдельно (вне Plan A).
- **Q2.** Лимит 1000 строк/файл — достаточно для пилота? У среднего корпоративного клиента 50-300 сотрудников за раз. Если придёт клиент с >1000 — добавить chunking или RabbitMQ-путь (Plan B).
- **Q3.** Дублирование валидаторов backend↔frontend — приемлемое drift-risk на 1 итерацию или выносить в `packages/shared-types` сразу? Рекомендация: оставить дублирование в Plan A, вынести в follow-up если появится ≥3 правки.
- **Q4.** В каком виде показывать «Какие учётки уже существуют» при reuse? Сейчас Plan A backend возвращает `reused` статус, но frontend в preview этого не знает. Решение: после submit показать outcome с пояснением «3 ученика созданы, 1 переиспользован».
- **Q5.** Нужен ли download-template-кнопка («Скачать шаблон Excel»)? Рекомендация: да, generate простой xlsx с правильными заголовками + 1 примером. Можно добавить в Plan A Task 9 как мелкий sub-task или в follow-up.

---

## Deviations from existing patterns to note during execution

- Проект не использует React Query mutations — все мутации через `wrap` + `useDomainMutations` паттерн (см. `apps/frontend/src/features/mvp/hooks.ts:214+`). Plan A следует этому паттерну.
- `exactOptionalPropertyTypes: true` в TS — опциональные поля передавать через условный spread, не `key: undefined`. См. `CommissionDetailsScreen.onSaveEditInfo` (commit `157fce3`).
- Husky `lint-staged` запустит ESLint на изменённых `.ts/.tsx` — без локального warning'а коммит не пройдёт.
- Backend in-memory state: новые коллекции регистрировать в `MVP_COLLECTIONS` (`infrastructure/mvp-collections.ts`), иначе данные потеряются между HTTP-запросами в memory backend (это поймало Pillar A Plan A Task 10).

---

## Estimated effort

| Task                             | Effort (часов)                                            |
| -------------------------------- | --------------------------------------------------------- |
| 1. DTO + типы                    | 1.5                                                       |
| 2. classifyRows + СНИЛС-чексумма | 3                                                         |
| 3. bulkImportLearners service    | 3                                                         |
| 4. HTTP endpoint + integration   | 2                                                         |
| 5. xlsx parser + tests           | 2.5                                                       |
| 6. Frontend validators (зеркало) | 1.5                                                       |
| 7. API + hook                    | 1.5                                                       |
| 8. Admin layout + side-nav       | 3                                                         |
| 9. Bulk import screen + preview  | 4                                                         |
| 10. Navigation wiring            | 1                                                         |
| 11. E2E smoke                    | 1.5                                                       |
| 12. Документация                 | 1                                                         |
| **Итого**                        | **~25.5 часов** (~3-4 рабочих дня на одного разработчика) |

Phase 2 в roadmap оценена в 8 недель командой 2 фронт + 1 бэк. Plan A покрывает ~10-15% этого объёма (главный процесс §3.3). Оставшиеся 85% — Plan B (учётки UI) и Plan C (компании, группы, прогресс).

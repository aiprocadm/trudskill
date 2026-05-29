# Phase 3 — Plan A: Admin Assessment Surface (Q-Bank + Tests + Assignments + Reviewer Queue Skeleton)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Дать сотруднику учебного центра (роли admin / teacher с уже посеянными в [0010](../../../apps/backend/migrations/0010_iam_role_permissions_and_seed.sql) permissions `assessment.question_banks.write` / `assessment.questions.write` / `assessment.tests.write` / `assessment.tests.publish` / `assessment.assignments.write`) полный admin surface для assessment: 5 admin routes (`/admin/question-banks`, `/admin/tests`, `/admin/assignments`, `/teacher/review` + детальные) с CRUD по банкам вопросов, вопросам (5 типов: single/multi/number/text/essay), тестам с правилами и подбором вопросов, шаблонам практических заданий, и read-only reviewer queue. Plan A — структурная основа Phase 3: Plan B (learner test player + autograding) и Plan C (manual review + practical submissions) опираются на сущности и UI, заложенные здесь.

**Architecture:** Backend — расширение data model (`QuestionType` union + 2 поля numeric) единой миграцией `0040`; ~6 групп DTO; ~25 endpoints в `MvpController` с уже существующими `@RequirePermissions(...)`; ~20 новых методов в `MvpService` с request-scoped state + audit на каждую мутацию. Reviewer queue — pure-function агрегатор по существующим `TestAttempt` / `AssignmentSubmission` (в V1 пустой, ибо Plans B+C ещё не отгрузили рантайм). Frontend — новая feature-папка `apps/frontend/src/features/assessment-admin/` с list/detail screens по каждой сущности + type-aware question editor drawer + test builder с question picker. Categories отложены в V1.1 — используем `Question.tags?` для фильтрации. Reviewer scoring actions отложены в Plan C — здесь только read-only список pending.

**Tech Stack:** TypeScript, NestJS (backend), Vitest (тесты), Next.js App Router + TypeScript (frontend), `@cdoprof/ui` (`DataTable`, `Column`, `FilterBar`, `Pagination`, `Dialog`, `StatusChip`, `SearchInput`, `SectionCard`, `SectionEmpty`, `LookupSelect`), `class-validator` для DTO с условной валидацией (для number_input нужен `numericExpected`, для single/multi нужны `answerOptions[]`, и т.д.). Без новых npm-пакетов.

**Спецификация:** [../specs/2026-05-30-phase-3-assessment-design.md](../specs/2026-05-30-phase-3-assessment-design.md) — §3 Plan A scope, §2.1 question types extension, §2.3 binary grading, §2.4 read-only reviewer queue.

**Роадмап:** [2026-05-21-cdoprof-v1-roadmap.md](2026-05-21-cdoprof-v1-roadmap.md) — Phase 3 «Тестирование и оценивание», tasks: «Сущности Question/QuestionPool/Test/Attempt», «CRUD банка вопросов в кабинете преподавателя», «Конструктор теста».

**Базовая ветка:** `main` (после merge Plan C PRs #201-#205, HEAD ≥ `1af251a`). Работа в трёх стэкнутых impl PR'ах симметрично Phase 2 Plan C:

- `feat/2026-05-30-phase-3-plan-a-impl` — backend (Tasks 1-6).
- `feat/2026-05-30-phase-3-plan-a-frontend` — frontend (Tasks 7-13).
- `feat/2026-05-30-phase-3-plan-a-closeout` — closeout (Tasks 14-15).

Текущий PR (doc-only) — этот файл + спека на ветке `feat/2026-05-30-phase-3-plan-a`.

**Зависимости перед стартом:**

- `main` ≥ `1af251a` (после merge PR #205 Phase 2 Plan C closeout).
- Существующие assessment миграции `0009` + `0024-0026` + `0031` уже применены (предположение — это main на сегодня).
- Pillar A hardening §5.15-5.18 — для понимания, какие assessment endpoints уже имеют permission boundary (мы их расширяем, не дублируем).

**Что НЕ входит в Plan A:**

- **Learner test player** — Plan B (`feat/2026-06-XX-phase-3-plan-b`).
- **Backend attempt lifecycle**: `POST /attempts/start`, `PATCH /attempts/:id/answer`, `POST /attempts/:id/submit`, autograding — Plan B.
- **Assignment submission lifecycle**: upload файла, submit/resubmit — Plan C.
- **Reviewer scoring actions**: grade essay, comment, finalize — Plan C.
- **Категории вопросов** (отдельная таксономия) — V1.1.
- **Partial credit** в multi-choice — V1.1 (binary в Plan A).
- **Question import из Excel** — V1.1 / Phase 10.
- **Test versions** (v1/v2 публикации) — V1.1.
- **Прокторинг / запись попытки** — Phase 4.

---

## File Structure

### Create — backend

- `apps/backend/migrations/0040_assessment_question_types_extension.sql` — миграция: расширить CHECK на `assessment.questions.type` до `single_choice | multiple_choice | number_input | text | essay`; добавить `numeric_expected numeric NULL` + `numeric_tolerance numeric NULL` на `assessment.questions`; partial CHECK что `numeric_expected IS NOT NULL` когда `type = 'number_input'`.
- `apps/backend/src/modules/mvp/migrations.0040.test.ts` — regex / structural тесты миграции (как `migrations.0039.test.ts`).
- `apps/backend/src/modules/mvp/create-question-bank.dto.ts` — `CreateQuestionBankRequest` (title required, description optional, courseId optional).
- `apps/backend/src/modules/mvp/update-question-bank.dto.ts` — `UpdateQuestionBankRequest` (PATCH semantics).
- `apps/backend/src/modules/mvp/create-question.dto.ts` — `CreateQuestionRequest` с условной валидацией: для single/multi требуется `answerOptions: AnswerOptionInput[]` с минимум одним `isCorrect: true`; для number_input — `numericExpected: number` обязателен; для text/essay — поле ожидаемого ответа опционально.
- `apps/backend/src/modules/mvp/update-question.dto.ts` — `UpdateQuestionRequest`.
- `apps/backend/src/modules/mvp/answer-option.dto.ts` — `AnswerOptionInput` (nested + standalone PATCH).
- `apps/backend/src/modules/mvp/create-test.dto.ts` — `CreateTestRequest` (courseId, title, optional questionBankId).
- `apps/backend/src/modules/mvp/update-test.dto.ts` — `UpdateTestRequest`.
- `apps/backend/src/modules/mvp/update-test-rule.dto.ts` — `UpdateTestRuleRequest` (attemptLimit, randomize, timeLimitMinutes, questionCount, passingScore, dailyResetEnabled).
- `apps/backend/src/modules/mvp/add-test-question.dto.ts` — `AddTestQuestionRequest` (questionId, optional sortOrder).
- `apps/backend/src/modules/mvp/create-assignment.dto.ts` — `CreateAssignmentRequest` (courseId, title, maxScore, isReviewRequired).
- `apps/backend/src/modules/mvp/update-assignment.dto.ts` — `UpdateAssignmentRequest`.
- `apps/backend/src/modules/mvp/reviewer-queue.service.ts` — pure-function aggregator: `aggregateReviewerQueue(snapshot, { tenantId, reviewerId? }) → { pendingAttempts: [{ attemptId, testId, learnerId, submittedAt }], pendingSubmissions: [{ submissionId, assignmentId, learnerId, submittedAt }] }`.
- `apps/backend/src/modules/mvp/reviewer-queue.service.test.ts` — unit-тесты агрегатора.

### Modify — backend

- `apps/backend/src/modules/mvp/mvp.types.ts` — расширить `QuestionType = 'single_choice' | 'multiple_choice' | 'number_input' | 'text' | 'essay'`; добавить опциональные `numericExpected?: number`, `numericTolerance?: number` в `Question`. Новые формы данных reviewer queue: `ReviewerQueueItem`, `ReviewerQueueSnapshot`.
- `apps/backend/src/modules/mvp/mvp.service.ts` — ~20 новых методов (см. §3.4 спеки). Каждый mutation метод пишет `audit.audit_log` с действием `assessment.<entity>_<action>`. Все list/get применяют `tenantId` фильтр первым шагом (anti-IDOR).
- `apps/backend/src/modules/mvp/mvp.service.test.ts` — расширить unit-coverage по каждому новому методу (happy / not-found / tenant mismatch / archive idempotency / audit emission).
- `apps/backend/src/modules/mvp/mvp.controller.ts` — добавить ~25 endpoints, каждый с `@UseGuards(PermissionGuard) + @RequirePermissions(...)` под одним из существующих `assessment.*` permissions; `assertValidDto(...)` в каждом handler'е.
- `apps/backend/src/modules/mvp/mvp.dto-validation.test.ts` — кейсы под каждый новый DTO (минимум: happy, missing required, type-conditional rule).
- `apps/backend/src/modules/mvp/mvp.domains.http.integration.test.ts` — для каждого нового endpoint: `auth_required`, `permission_denied`, `tenant_mismatch`, success envelope shape.
- `apps/backend/src/modules/mvp/infrastructure/mvp-collections.ts` — зарегистрировать новые in-memory collections: `questionBanks`, `questions`, `answerOptions`, `tests`, `testQuestions`, `testRules`, `assignments`. (TestAttempt/AttemptAnswer/ExamResult/AssignmentSubmission/AssignmentReview уже зарегистрированы.)

### Create — frontend

- `apps/frontend/app/admin/question-banks/page.tsx` — Next.js route (ProtectedPage) → `QuestionBanksListScreen`.
- `apps/frontend/app/admin/question-banks/[id]/page.tsx` — Next.js route → `QuestionBankDetailScreen`.
- `apps/frontend/app/admin/tests/page.tsx` — Next.js route → `TestsListScreen`.
- `apps/frontend/app/admin/tests/[id]/page.tsx` — Next.js route → `TestBuilderScreen`.
- `apps/frontend/app/admin/assignments/page.tsx` — Next.js route → `AssignmentsListScreen`.
- `apps/frontend/app/admin/assignments/[id]/page.tsx` — Next.js route → `AssignmentDetailScreen`.
- `apps/frontend/app/teacher/review/page.tsx` — Next.js route → `ReviewerQueueScreen`.
- `apps/frontend/src/features/assessment-admin/types.ts` — типы DTO + form state + list items.
- `apps/frontend/src/features/assessment-admin/api.ts` — REST-клиент по 8 endpoint groups.
- `apps/frontend/src/features/assessment-admin/api.contract.test.ts` — envelope unwrap + URL/method/body assertions (минимум по 1 кейсу на endpoint group).
- `apps/frontend/src/features/assessment-admin/hooks.ts` — React Query queries + `useState`-based mutations (CLAUDE.md convention).
- `apps/frontend/src/features/assessment-admin/format.ts` — pure-function форматтеры (label по `QuestionType`, summary правил теста, `numericTolerance` formatting).
- `apps/frontend/src/features/assessment-admin/format.test.ts` — тесты форматтеров.
- `apps/frontend/src/features/assessment-admin/question-banks-list-screen.tsx` — list (FilterBar + DataTable + Pagination + кнопка «Создать»).
- `apps/frontend/src/features/assessment-admin/question-bank-detail-screen.tsx` — detail с вкладкой «Вопросы» (вложенный список + кнопка «Добавить вопрос»).
- `apps/frontend/src/features/assessment-admin/question-bank-edit-drawer.tsx` — create/edit drawer для bank.
- `apps/frontend/src/features/assessment-admin/question-editor-drawer.tsx` — type-aware форма вопроса (5 ветвей по `QuestionType`).
- `apps/frontend/src/features/assessment-admin/tests-list-screen.tsx` — list тестов.
- `apps/frontend/src/features/assessment-admin/test-builder-screen.tsx` — детали теста (title/description) + редактор правил (`TestRule`) + question picker.
- `apps/frontend/src/features/assessment-admin/test-question-picker.tsx` — модальный picker: выбор банка, фильтр по tags, multi-select вопросов.
- `apps/frontend/src/features/assessment-admin/assignments-list-screen.tsx`.
- `apps/frontend/src/features/assessment-admin/assignment-detail-screen.tsx`.
- `apps/frontend/src/features/assessment-admin/assignment-edit-drawer.tsx`.
- `apps/frontend/src/features/assessment-admin/reviewer-queue-screen.tsx` — read-only DataTable (2 секции: pending attempts + pending submissions).
- `apps/frontend/src/e2e/admin-assessment-surface.e2e.test.ts` — E2E (routing + nav + dynamic-import smoke + pipeline integration для форматтеров).

### Modify — frontend

- `apps/frontend/src/features/navigation/model.ts` — добавить 4 новые записи `routeMeta` + `navigationModel`:
  - `/admin/question-banks` + `/admin/question-banks/[id]` под `assessment.question_banks.read`
  - `/admin/tests` + `/admin/tests/[id]` под `assessment.tests.read`
  - `/admin/assignments` + `/admin/assignments/[id]` под `assessment.assignments.read`
  - `/teacher/review` под `assessment.reviews.review`

### Untouched (используется как есть)

- Существующие assessment-permission seed'ы в `0010` — переиспользуем.
- Pillar A hardening (`0025`/`0026`, `assessment.read.cross_learner`, `learners.act_as`) — не трогаем; Plan A только admin surface, не learner-scoped reads.
- `TestAttempt` / `AttemptAnswer` / `ExamResult` / `AssignmentSubmission` / `AssignmentReview` типы + таблицы — не меняются (мутации в Plans B+C).
- Существующий `mvp-internal-worker.http.integration.test.ts` (BL-003 bulk-enrollment) — никак не пересекается с Plan A.

---

## Task 1: Миграция `0040_assessment_question_types_extension.sql` + types extension

**Files:**

- `apps/backend/migrations/0040_assessment_question_types_extension.sql` (новый)
- `apps/backend/src/modules/mvp/migrations.0040.test.ts` (новый)
- `apps/backend/src/modules/mvp/mvp.types.ts` (modify)

**Why:** Без расширения `QuestionType` админ не сможет создать `number_input` / `essay` вопрос — а это явная часть Phase 3 deliverables (роадмап §149-175). Plan B autograder (single/multi/number) и Plan C essay review требуют, чтобы соответствующие типы уже существовали в банке. Делать миграцию сейчас единым шагом дешевле, чем по одной на план.

**Tasks:**

- [x] **Step 1: написать SQL миграции 0040.**

```sql
-- Phase 3 Plan A: расширение QuestionType до 5 значений + поля для number_input grading.
-- Дата: 2026-05-30. Назначение: дать админу создавать вопросы 5 типов (single_choice,
-- multiple_choice, number_input, text, essay); поля numeric_expected/numeric_tolerance
-- хранят эталон для автогрейдинга в Plan B.

BEGIN;

-- 1. Поднять CHECK на questions.type. Старые записи (single/multi/text) остаются валидными.
ALTER TABLE assessment.questions
  DROP CONSTRAINT IF EXISTS questions_type_chk;
ALTER TABLE assessment.questions
  ADD CONSTRAINT questions_type_chk
    CHECK (type IN ('single_choice', 'multiple_choice', 'number_input', 'text', 'essay'));

-- 2. Добавить эталон для number_input. Nullable: существующие записи валидны.
ALTER TABLE assessment.questions
  ADD COLUMN IF NOT EXISTS numeric_expected numeric NULL,
  ADD COLUMN IF NOT EXISTS numeric_tolerance numeric NULL;

-- 3. Domain rule: number_input должен иметь numeric_expected.
ALTER TABLE assessment.questions
  ADD CONSTRAINT questions_numeric_expected_required_for_number_input_chk
    CHECK (type <> 'number_input' OR numeric_expected IS NOT NULL);

-- 4. tolerance >= 0 (по дизайну absolute tolerance в V1).
ALTER TABLE assessment.questions
  ADD CONSTRAINT questions_numeric_tolerance_nonneg_chk
    CHECK (numeric_tolerance IS NULL OR numeric_tolerance >= 0);

COMMIT;
```

- [x] **Step 2: написать `migrations.0040.test.ts`** — regex / structural тесты по образцу `migrations.0039.test.ts`:
  - имя файла соответствует pattern `00NN_<slug>.sql`;
  - содержит `BEGIN`/`COMMIT`;
  - содержит CHECK с пятью значениями типа;
  - содержит partial CHECK на `numeric_expected` для `number_input`;
  - содержит CHECK на `numeric_tolerance >= 0`.

- [x] **Step 3: расширить `QuestionType` union** в `mvp.types.ts:210`:

```ts
export type QuestionType = 'single_choice' | 'multiple_choice' | 'number_input' | 'text' | 'essay';
```

- [x] **Step 4: добавить опциональные поля в `Question`** в `mvp.types.ts:221`:

```ts
export interface Question extends BaseEntity {
  // ... existing fields ...
  numericExpected?: number;
  numericTolerance?: number;
}
```

- [x] **Step 5: добавить типы для reviewer queue**:

```ts
export interface ReviewerQueueItem {
  kind: 'attempt' | 'submission';
  id: string;
  tenantId: string;
  learnerId: string;
  testId?: string;
  assignmentId?: string;
  submittedAt: string;
}

export interface ReviewerQueueSnapshot {
  pendingAttempts: ReviewerQueueItem[];
  pendingSubmissions: ReviewerQueueItem[];
}
```

**Acceptance:**

- Файл миграции существует и проходит `migrations.0040.test.ts` (≥4 кейсов).
- `pnpm --filter @cdoprof/backend exec tsc --noEmit` зелёный (types compile).
- `mvp.types.ts` экспортирует расширенный `QuestionType` и `ReviewerQueueItem`/`ReviewerQueueSnapshot`.

---

## Task 2: DTO inventory (все новые DTOs)

**Files:**

- `apps/backend/src/modules/mvp/create-question-bank.dto.ts` (новый)
- `apps/backend/src/modules/mvp/update-question-bank.dto.ts` (новый)
- `apps/backend/src/modules/mvp/answer-option.dto.ts` (новый)
- `apps/backend/src/modules/mvp/create-question.dto.ts` (новый)
- `apps/backend/src/modules/mvp/update-question.dto.ts` (новый)
- `apps/backend/src/modules/mvp/create-test.dto.ts` (новый)
- `apps/backend/src/modules/mvp/update-test.dto.ts` (новый)
- `apps/backend/src/modules/mvp/update-test-rule.dto.ts` (новый)
- `apps/backend/src/modules/mvp/add-test-question.dto.ts` (новый)
- `apps/backend/src/modules/mvp/create-assignment.dto.ts` (новый)
- `apps/backend/src/modules/mvp/update-assignment.dto.ts` (новый)
- `apps/backend/src/modules/mvp/mvp.dto-validation.test.ts` (modify — добавить кейсы)

**Why:** Backend convention CLAUDE.md: каждый endpoint начинает с `assertValidDto(SomeRequestClass, raw)`; никогда `@Body()` напрямую. Без DTOs валидация на границах отсутствует, тесты пишутся первыми.

**Tasks:**

- [x] **Step 1:** написать `CreateQuestionBankRequest` (class-validator: `@IsString @IsNotEmpty title`, `@IsString @IsOptional description`, `@IsString @IsOptional courseId`).

- [x] **Step 2:** написать `UpdateQuestionBankRequest` — все поля optional, semantics PATCH.

- [x] **Step 3:** написать `AnswerOptionInput` — `@IsString text`, `@IsBoolean isCorrect`, `@IsInt @Min(0) sortOrder`.

- [x] **Step 4:** написать `CreateQuestionRequest` с условной валидацией:

  ```ts
  // Псевдокод:
  @IsString questionBankId
  @IsString title
  @IsIn(['single_choice', 'multiple_choice', 'number_input', 'text', 'essay']) type
  @IsNumber @Min(0) score
  @IsString @IsOptional body
  // Conditional (через @ValidateIf):
  @ValidateIf(o => o.type === 'single_choice' || o.type === 'multiple_choice')
  @ArrayMinSize(2) @ValidateNested({ each: true }) @Type(() => AnswerOptionInput)
  answerOptions: AnswerOptionInput[]
  @ValidateIf(o => o.type === 'number_input')
  @IsNumber numericExpected: number
  @ValidateIf(o => o.type === 'number_input')
  @IsNumber @Min(0) @IsOptional numericTolerance?: number
  ```

  Дополнительно — кастомная валидация что среди `answerOptions` есть хотя бы один с `isCorrect: true` (создать `@HasAtLeastOneCorrectOption()` decorator).

- [x] **Step 5:** написать `UpdateQuestionRequest` (PATCH semantics, все поля optional, но если `type` меняется — соответствующие conditional fields требуются).

- [x] **Step 6:** написать `CreateTestRequest`, `UpdateTestRequest`, `UpdateTestRuleRequest`, `AddTestQuestionRequest`, `CreateAssignmentRequest`, `UpdateAssignmentRequest` — все по образцу аналогичных DTOs в Plan C.

- [x] **Step 7:** расширить `mvp.dto-validation.test.ts` минимум 3-5 кейсами на DTO:
  - happy path;
  - missing required;
  - type-conditional rule violation (если применимо);
  - cross-field (например: `number_input` без `numericExpected` должен fail);
  - `whitelist`/`forbidNonWhitelisted` regression.

**Acceptance:**

- `pnpm exec vitest run apps/backend/src/modules/mvp/mvp.dto-validation.test.ts` зелёный.
- Минимум 50 новых dto-validation кейсов (~5 кейсов × ~10 DTO).
- Каждый DTO имеет happy case и хотя бы 1 conditional case.

---

## Task 3: `MvpService` — Question bank + Question + AnswerOption CRUD

**Files:**

- `apps/backend/src/modules/mvp/mvp.service.ts` (modify)
- `apps/backend/src/modules/mvp/mvp.service.test.ts` (modify)
- `apps/backend/src/modules/mvp/infrastructure/mvp-collections.ts` (modify — register `questionBanks`, `questions`, `answerOptions`)

**Why:** Backend ядро Plan A — пользоваться UI'ем нельзя, пока сервис не умеет создавать/читать/изменять/архивировать банки и вопросы. Audit на каждую мутацию — convention CLAUDE.md.

**Tasks:**

- [x] **Step 1:** зарегистрировать новые collections в `mvp-collections.ts`:

```ts
questionBanks: { /* ... */ },
questions: { /* ... */ },
answerOptions: { /* ... */ },
```

(Без этого — collections теряются между HTTP requests; см. CLAUDE.md «Request-scoped state».)

- [x] **Step 2: реализовать методы Question Bank**:
  - `createQuestionBank(tenantId, input, ctx) → QuestionBank` + `audit('assessment.bank_created', ...)`
  - `updateQuestionBank(tenantId, id, patch, ctx) → QuestionBank` + audit
  - `archiveQuestionBank(tenantId, id, ctx) → QuestionBank` (idempotent: повторный archive не падает, но и не пишет audit повторно)
  - `listQuestionBanks(tenantId, filter)` — с `?status` / `?search` / `?courseId` фильтрами + pagination
  - `getQuestionBank(tenantId, id) → QuestionBank | null` — anti-IDOR через tenantId match

- [x] **Step 3: реализовать методы Question**:
  - `createQuestion(tenantId, bankId, input, ctx) → Question` + рекурсивно создаёт `answerOptions` если есть, всё в одной транзакции snapshot.
  - `updateQuestion(tenantId, id, patch, ctx) → Question` + при изменении `answerOptions` — `upsertAnswerOptions` (см. Step 4).
  - `archiveQuestion(tenantId, id, ctx) → Question` — idempotent.
  - `listQuestionsForBank(tenantId, bankId, filter)` — с `?type` / `?tag` / `?search` фильтрами.
  - `getQuestion(tenantId, id) → Question | null` — возвращает с `answerOptions` если есть.

- [x] **Step 4: реализовать `upsertAnswerOptions(tenantId, questionId, options[], ctx)`**:
  - Удаляет старые `answerOptions` с этим `questionId`, вставляет новые, сохраняя `sortOrder`.
  - Пишет `audit('assessment.question_options_updated', ...)`.

- [x] **Step 5: написать unit-тесты в `mvp.service.test.ts`** — на каждый из ~12 методов минимум:
  - happy create + audit entry;
  - update только переданных полей;
  - archive idempotent;
  - anti-IDOR (tenantId mismatch → throw NotFound);
  - list pagination respect;
  - conditional behaviour (question с single/multi → создаёт answerOptions; question с number_input → сохраняет numericExpected);
  - text/essay → answerOptions пуст.

  Минимум 40 новых service-test кейсов.

**Acceptance:**

- `pnpm exec vitest run apps/backend/src/modules/mvp/mvp.service.test.ts` зелёный.
- Все новые collections persist между HTTP requests (косвенно — Task 6 HTTP tests).
- Audit log имеет entries для каждой мутации (проверяется в тестах).

---

## Task 4: `MvpService` — Test + Test Rule + Test Question CRUD

**Files:**

- `apps/backend/src/modules/mvp/mvp.service.ts` (modify)
- `apps/backend/src/modules/mvp/mvp.service.test.ts` (modify)
- `apps/backend/src/modules/mvp/infrastructure/mvp-collections.ts` (modify — register `tests`, `testQuestions`, `testRules`)

**Why:** Test builder UI требует CRUD по тестам, правилам и связке test↔question. Publish workflow — gate перед тем, как Plan B test player сможет открыть тест.

**Tasks:**

- [x] **Step 1:** зарегистрировать `tests`, `testQuestions`, `testRules` collections.

- [x] **Step 2: реализовать методы Test**:
  - `createTest(tenantId, input, ctx) → TestEntity` — также создаёт `testRule` с default'ами (attemptLimit=1, randomize=false, passingScore=1). Audit `assessment.test_created`.
  - `updateTest(tenantId, id, patch, ctx) → TestEntity`
  - `archiveTest(tenantId, id, ctx) → TestEntity`
  - `publishTest(tenantId, id, ctx) → TestEntity` — ставит `status='published'` + `publishedAt`. Gating: тест должен иметь хотя бы 1 `testQuestion`. Audit `assessment.test_published`. Idempotent (повторный publish не падает).
  - `listTests(tenantId, filter)` + `getTest(tenantId, id) → TestEntity | null` (anti-IDOR).

- [x] **Step 3: реализовать `upsertTestRule(tenantId, testId, patch, ctx) → TestRule`**:
  - PATCH семантика на всех полях.
  - Валидация: `attemptLimit >= 1`, `questionCount > 0 || null`, `timeLimitMinutes > 0 || null`, `passingScore >= 0`.
  - Audit `assessment.test_rule_updated`.

- [x] **Step 4: реализовать методы Test Question**:
  - `addTestQuestion(tenantId, testId, questionId, sortOrder?, ctx) → TestQuestion` — гарантирует уникальность `(testId, questionId)`. Если `sortOrder` не передан — кладёт в конец. Audit `assessment.test_question_added`.
  - `removeTestQuestion(tenantId, testId, questionId, ctx) → void` — idempotent. Audit `assessment.test_question_removed`.
  - `reorderTestQuestion(tenantId, testId, questionId, newSortOrder, ctx) → TestQuestion` — пересортирует.

- [x] **Step 5: написать unit-тесты** — минимум 30 новых кейсов:
  - happy create test → default rule создан;
  - publish без вопросов → throws BadRequest `domain_rule_violation` (publish_without_questions);
  - publish idempotent;
  - rule валидация (attemptLimit=0 fails);
  - addTestQuestion дубликат → throws `conflict`;
  - removeTestQuestion non-existent → silent (idempotent).

**Acceptance:**

- `pnpm exec vitest run apps/backend/src/modules/mvp/mvp.service.test.ts` зелёный.
- Publish workflow корректно гейтит пустые тесты.

---

## Task 5: `MvpService` — Assignment CRUD + Reviewer Queue Aggregator

**Files:**

- `apps/backend/src/modules/mvp/mvp.service.ts` (modify)
- `apps/backend/src/modules/mvp/mvp.service.test.ts` (modify)
- `apps/backend/src/modules/mvp/reviewer-queue.service.ts` (новый)
- `apps/backend/src/modules/mvp/reviewer-queue.service.test.ts` (новый)
- `apps/backend/src/modules/mvp/infrastructure/mvp-collections.ts` (modify — register `assignments`)

**Why:** Assignments — четвёртый раздел admin surface, симметричный тестам по UI-шейпу. Reviewer queue — read-only заготовка под Plan C; вынесена в pure-function aggregator для последующего переиспользования в B/C.

**Tasks:**

- [x] **Step 1:** зарегистрировать `assignments` collection.

- [x] **Step 2: реализовать методы Assignment** — симметрично Question Bank (create / update / archive / list / get).

- [x] **Step 3: реализовать `reviewer-queue.service.ts`**:

```ts
export interface ReviewerQueueFilter {
  tenantId: string;
  reviewerId?: string; // если задан — только items, доступные конкретному ревьюеру
}

export function aggregateReviewerQueue(
  snapshot: { testAttempts: TestAttempt[]; assignmentSubmissions: AssignmentSubmission[] },
  filter: ReviewerQueueFilter
): ReviewerQueueSnapshot {
  const pendingAttempts = snapshot.testAttempts
    .filter((a) => a.tenantId === filter.tenantId && a.status === 'submitted')
    .map((a) => ({
      kind: 'attempt',
      id: a.id,
      tenantId: a.tenantId,
      learnerId: a.learnerId,
      testId: a.testId,
      submittedAt: a.submittedAt ?? a.createdAt
    }));
  const pendingSubmissions = snapshot.assignmentSubmissions
    .filter(
      (s) =>
        s.tenantId === filter.tenantId && (s.status === 'submitted' || s.status === 'under_review')
    )
    .map((s) => ({
      kind: 'submission',
      id: s.id,
      tenantId: s.tenantId,
      learnerId: s.learnerId,
      assignmentId: s.assignmentId,
      submittedAt: s.submittedAt ?? s.createdAt
    }));
  return { pendingAttempts, pendingSubmissions };
}
```

- [x] **Step 4: реализовать `MvpService.getReviewerQueue(tenantId, ctx) → ReviewerQueueSnapshot`** — оборачивает aggregator + берёт snapshot из state.

- [x] **Step 5: unit-тесты** для assignments (~12 кейсов) и aggregator (~6 кейсов: empty, pending-only-attempts, pending-only-submissions, both, tenant-isolation, status-filtering).

**Acceptance:**

- `pnpm exec vitest run apps/backend/src/modules/mvp/mvp.service.test.ts apps/backend/src/modules/mvp/reviewer-queue.service.test.ts` зелёный.
- `aggregateReviewerQueue` — pure function (нет state, нет I/O).

---

## Task 6: `MvpController` endpoints + HTTP integration tests

**Files:**

- `apps/backend/src/modules/mvp/mvp.controller.ts` (modify)
- `apps/backend/src/modules/mvp/mvp.domains.http.integration.test.ts` (modify — расширить, не создавать новый файл)

**Why:** Endpoints — это публичный API Plan A. Каждый endpoint защищён через `@RequirePermissions` + `assertValidDto`. HTTP integration — обязательный test для каждого нового endpoint per CLAUDE.md «test trio».

**Tasks:**

- [x] **Step 1: добавить ~25 endpoints** в `mvp.controller.ts`. Группы:

  | Method | Path                                | Permission                        |
  | ------ | ----------------------------------- | --------------------------------- |
  | POST   | `/question-banks`                   | `assessment.question_banks.write` |
  | GET    | `/question-banks`                   | `assessment.question_banks.read`  |
  | GET    | `/question-banks/:id`               | `assessment.question_banks.read`  |
  | PATCH  | `/question-banks/:id`               | `assessment.question_banks.write` |
  | POST   | `/question-banks/:id/archive`       | `assessment.question_banks.write` |
  | POST   | `/question-banks/:bankId/questions` | `assessment.questions.write`      |
  | GET    | `/question-banks/:bankId/questions` | `assessment.questions.read`       |
  | GET    | `/questions/:id`                    | `assessment.questions.read`       |
  | PATCH  | `/questions/:id`                    | `assessment.questions.write`      |
  | POST   | `/questions/:id/archive`            | `assessment.questions.write`      |
  | POST   | `/tests`                            | `assessment.tests.write`          |
  | GET    | `/tests`                            | `assessment.tests.read`           |
  | GET    | `/tests/:id`                        | `assessment.tests.read`           |
  | PATCH  | `/tests/:id`                        | `assessment.tests.write`          |
  | POST   | `/tests/:id/archive`                | `assessment.tests.write`          |
  | POST   | `/tests/:id/publish`                | `assessment.tests.publish`        |
  | PUT    | `/tests/:id/rules`                  | `assessment.tests.write`          |
  | POST   | `/tests/:id/questions`              | `assessment.tests.write`          |
  | DELETE | `/tests/:id/questions/:questionId`  | `assessment.tests.write`          |
  | PATCH  | `/tests/:id/questions/:questionId`  | `assessment.tests.write`          |
  | POST   | `/assignments`                      | `assessment.assignments.write`    |
  | GET    | `/assignments`                      | `assessment.assignments.read`     |
  | GET    | `/assignments/:id`                  | `assessment.assignments.read`     |
  | PATCH  | `/assignments/:id`                  | `assessment.assignments.write`    |
  | POST   | `/assignments/:id/archive`          | `assessment.assignments.write`    |
  | GET    | `/reviewer/queue`                   | `assessment.reviews.review`       |

  Каждый handler — `assertValidDto(...)` для POST/PATCH/PUT, `@CurrentContext() c` для tenantId / actorId.

- [x] **Step 2:** расширить `mvp.domains.http.integration.test.ts` минимум по 3 кейса на endpoint group:
  - `auth_required` (без bearer);
  - `permission_denied` (роль без нужного permission);
  - success (envelope shape `{ data, meta }`).

  Дополнительно — anti-IDOR: `tenant_mismatch` для GET endpoints (запрос с одним tenantId, ресурс другого → 404).

  Минимум 100 новых HTTP integration кейсов (~4 кейсов × ~25 endpoints).

**Acceptance:**

- `pnpm exec vitest run apps/backend/src/modules/mvp/mvp.domains.http.integration.test.ts --no-file-parallelism` зелёный.
- Все 25 endpoints возвращают envelope `{ data, meta: { requestId, correlationId, timestamp } }`.
- `pnpm --filter @cdoprof/backend lint` зелёный на изменённых файлах.

---

## Task 7: Frontend feature folder skeleton (types + api + hooks + format)

**Files:**

- `apps/frontend/src/features/assessment-admin/types.ts` (новый)
- `apps/frontend/src/features/assessment-admin/api.ts` (новый)
- `apps/frontend/src/features/assessment-admin/hooks.ts` (новый)
- `apps/frontend/src/features/assessment-admin/format.ts` (новый)
- `apps/frontend/src/features/assessment-admin/format.test.ts` (новый)

**Why:** Standard feature folder layout (как `features/clients/` в Plan C). Types + API + hooks + format — foundation для всех 4 screens.

**Tasks:**

- [x] **Step 1: `types.ts`** — DTOs (`CreateQuestionBankInput`, `UpdateQuestionBankInput`, …), list items (`QuestionBankListItem`, `QuestionListItem`, `TestListItem`, `AssignmentListItem`, `ReviewerQueueListItem`), form state types (с дискриминацией по `QuestionType`).

- [x] **Step 2: `api.ts`** — REST-клиент:

```ts
export const assessmentAdminApi = {
  questionBanks: { list, get, create, update, archive },
  questions: { listForBank, get, create, update, archive },
  tests: {
    list,
    get,
    create,
    update,
    archive,
    publish,
    upsertRule,
    addQuestion,
    removeQuestion,
    reorderQuestion
  },
  assignments: { list, get, create, update, archive },
  reviewerQueue: { get }
};
```

Каждая функция использует `apiRequest` из `src/lib/api/client.ts` — он автоматически unwraps envelope.

- [x] **Step 3: `hooks.ts`** — React Query queries + `useState` mutations (CLAUDE.md convention):

```ts
export function useQuestionBanksList(filters) { return useQuery({ queryKey, queryFn: ... }); }
export function useQuestionBank(id) { return useQuery(...); }
export function useUpdateQuestionBank() {
  const [state, setState] = useState({ isPending: false, error: null });
  const mutate = async (input) => { /* ... wrap pattern ... */ };
  return { mutate, ...state };
}
// ... аналогично для всех групп
```

- [x] **Step 4: `format.ts`** — pure-function форматтеры:
  - `formatQuestionType(type: QuestionType): string` — RU label
  - `formatTestRule(rule: TestRule): string[]` — массив bullet'ов («Лимит попыток: 3», «Рандомизация: вкл», …)
  - `formatNumericTolerance(expected: number, tolerance?: number): string` — «42 ± 0.1»
  - `formatReviewerQueueItem(item: ReviewerQueueItem): { title, subtitle }`
  - `formatQuestionScore(score: number): string` — «1 балл», «2 балла», «5 баллов» (правила склонения)

- [x] **Step 5: `format.test.ts`** — минимум 20 кейсов по форматтерам (5 типов вопросов, разные tolerance варианты, склонения).

**Acceptance:**

- `pnpm --filter @cdoprof/frontend exec vitest run src/features/assessment-admin/format.test.ts` зелёный.
- TS строгий (`exactOptionalPropertyTypes: true`) — соблюдаются conditional spreads.

---

## Task 8: Frontend `api.contract.test.ts` (envelope unwrap + URL/method/body)

**Files:**

- `apps/frontend/src/features/assessment-admin/api.contract.test.ts` (новый)

**Why:** Contract test — единственный детектор регрессий на стыке frontend↔backend. По 1 кейсу на endpoint × ~25 endpoint = ~25 кейсов.

**Tasks:**

- [x] **Step 1: написать тесты по образцу `features/clients/api.contract.test.ts`**. Структура каждого кейса:

```ts
it('questionBanks.list — GET /question-banks → unwraps envelope', async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: 'qb1' /* ... */ }], meta: {} }), { status: 200 })
    );
  vi.stubGlobal('fetch', fetchMock);
  const result = await assessmentAdminApi.questionBanks.list({});
  expect(result).toEqual([{ id: 'qb1' /* ... */ }]);
  expect(fetchMock).toHaveBeenCalledWith(
    '/api/question-banks',
    expect.objectContaining({ method: 'GET' })
  );
});
```

Минимум 25 кейсов.

**Acceptance:**

- `pnpm --filter @cdoprof/frontend exec vitest run src/features/assessment-admin/api.contract.test.ts` зелёный.

---

## Task 9: Frontend — Question banks UI (list + detail + question editor)

**Files:**

- `apps/frontend/src/features/assessment-admin/question-banks-list-screen.tsx` (новый)
- `apps/frontend/src/features/assessment-admin/question-bank-detail-screen.tsx` (новый)
- `apps/frontend/src/features/assessment-admin/question-bank-edit-drawer.tsx` (новый)
- `apps/frontend/src/features/assessment-admin/question-editor-drawer.tsx` (новый)

**Why:** Первый и самый сложный UI Plan A — type-aware форма вопроса (5 ветвей). Без неё ни test builder, ни остальной surface не имеют смысла.

**Tasks:**

- [x] **Step 1: `QuestionBanksListScreen`** — `PageContainer` + `PageHeader` («Банки вопросов» + кнопка «Создать») + `FilterBar` (search + status) + `DataTable` (название / курс / количество вопросов / статус) + `Pagination`. Использует `useQuestionBanksList`. Кнопка «Создать» открывает `QuestionBankEditDrawer` с пустым `client` prop.

- [x] **Step 2: `QuestionBankEditDrawer`** — единый компонент create/edit через optional `bank?: QuestionBank` prop. Форма: title (required), description (textarea), courseId (`LookupSelect`).

- [x] **Step 3: `QuestionBankDetailScreen`** — header с действиями (Редактировать / Архивировать), две секции:
  - «Параметры» — readonly inspection.
  - «Вопросы» — `DataTable` с вопросами банка (`useQuestionsForBank`), фильтр по `?type` / `?tag` / `?search`, кнопка «Добавить вопрос» → `QuestionEditorDrawer`.

- [x] **Step 4: `QuestionEditorDrawer`** — type-aware форма:
  - Селектор `QuestionType` (`single_choice` / `multiple_choice` / `number_input` / `text` / `essay`).
  - Общие поля: `title`, `body` (текст-описание), `score` (число баллов).
  - **`single_choice` / `multiple_choice`** — динамический список `answerOptions` (минимум 2): для каждой — text + isCorrect checkbox + drag handle (или просто input для sortOrder).
  - **`number_input`** — поля `numericExpected` (required) + `numericTolerance` (optional, default 0).
  - **`text`** — поле «Ожидаемый ответ» (для autograde в Plan B).
  - **`essay`** — нет дополнительных полей; pure manual review.
  - При смене `type` — soft reset формы с сохранением общих полей.
  - Валидация на стороне клиента симметрична DTO; submit вызывает `useCreateQuestion` / `useUpdateQuestion`.

**Acceptance:**

- Routes `/admin/question-banks` + `/admin/question-banks/[id]` рендерятся без runtime ошибок (smoke).
- Все 5 типов вопросов создаются через UI и round-trip'ятся через API.
- `pnpm --filter @cdoprof/frontend lint` зелёный.

---

## Task 10: Frontend — Test builder UI (list + builder + question picker)

**Files:**

- `apps/frontend/src/features/assessment-admin/tests-list-screen.tsx` (новый)
- `apps/frontend/src/features/assessment-admin/test-builder-screen.tsx` (новый)
- `apps/frontend/src/features/assessment-admin/test-question-picker.tsx` (новый)

**Why:** Test builder — второй ключевой UI Plan A; модально подбирает вопросы из банков.

**Tasks:**

- [x] **Step 1: `TestsListScreen`** — list со столбцами (название / курс / правила summary / статус) + кнопка «Создать».

- [x] **Step 2: `TestBuilderScreen`** — три секции:
  - «Параметры» — title, description, courseId, questionBankId (`LookupSelect`).
  - «Правила» — `attemptLimit`, `randomizeQuestions` (checkbox), `questionCount` (input), `timeLimitMinutes` (input), `passingScore` (input), `dailyResetEnabled` (checkbox). Submit вызывает `useUpsertTestRule`.
  - «Вопросы теста» — `DataTable` существующих `testQuestions` с drag-handle (или sortOrder input) + кнопка «Добавить» → `TestQuestionPicker`. Удаление через trash-icon.
  - Header actions: «Опубликовать» (вызов `usePublishTest`, disabled если нет вопросов или test уже published).

- [x] **Step 3: `TestQuestionPicker`** — модальный `Dialog`:
  - Селектор банка (по умолчанию = `test.questionBankId`).
  - Фильтр по `?type` / `?tag` / `?search`.
  - Multi-select checkbox по вопросам банка.
  - Кнопка «Добавить N выбранных» вызывает `addTestQuestion` для каждого по очереди (sequential).

**Acceptance:**

- Route `/admin/tests` + `/admin/tests/[id]` рендерится.
- Publish button корректно disabled на тесте без вопросов.
- `pnpm --filter @cdoprof/frontend lint` зелёный.

---

## Task 11: Frontend — Assignments admin UI (list + detail + edit drawer)

**Files:**

- `apps/frontend/src/features/assessment-admin/assignments-list-screen.tsx` (новый)
- `apps/frontend/src/features/assessment-admin/assignment-detail-screen.tsx` (новый)
- `apps/frontend/src/features/assessment-admin/assignment-edit-drawer.tsx` (новый)

**Why:** Assignments — шаблоны практических работ; UI зеркален Question Bank по форме, проще по логике.

**Tasks:**

- [x] **Step 1: `AssignmentsListScreen`** — list (название / курс / maxScore / isReviewRequired / status).

- [x] **Step 2: `AssignmentEditDrawer`** — create/edit единым компонентом. Поля: title, description, courseId, moduleId (optional), maxScore, isReviewRequired (checkbox).

- [x] **Step 3: `AssignmentDetailScreen`** — readonly inspection + edit/archive actions. Section «Submissions» — заглушка «Будет доступна после Plan C».

**Acceptance:**

- Route `/admin/assignments` + `/admin/assignments/[id]` рендерится.
- `pnpm --filter @cdoprof/frontend lint` зелёный.

---

## Task 12: Frontend — Reviewer queue (read-only skeleton)

**Files:**

- `apps/frontend/src/features/assessment-admin/reviewer-queue-screen.tsx` (новый)

**Why:** Reviewer queue skeleton в Plan A — visual confirmation что queue существует. Реальные действия в Plan C.

**Tasks:**

- [x] **Step 1: `ReviewerQueueScreen`** — `PageContainer` + `PageHeader` («Очередь на проверку») + две секции:
  - «Попытки тестов с эссе-вопросами» — `DataTable` с `pendingAttempts`. Columns: учащийся / тест / отправлено. Если пусто — `SectionEmpty` с текстом «Plans B+C добавят попытки и активные действия».
  - «Практические работы» — `DataTable` с `pendingSubmissions`. Columns: учащийся / задание / отправлено. Если пусто — аналогичный `SectionEmpty`.

  Использует `useReviewerQueue`. Без actions.

**Acceptance:**

- Route `/teacher/review` рендерится.
- Корректно отображает empty state.
- `pnpm --filter @cdoprof/frontend lint` зелёный.

---

## Task 13: Routes, navigation, ProtectedPage wrapping

**Files:**

- `apps/frontend/app/admin/question-banks/page.tsx` (новый)
- `apps/frontend/app/admin/question-banks/[id]/page.tsx` (новый)
- `apps/frontend/app/admin/tests/page.tsx` (новый)
- `apps/frontend/app/admin/tests/[id]/page.tsx` (новый)
- `apps/frontend/app/admin/assignments/page.tsx` (новый)
- `apps/frontend/app/admin/assignments/[id]/page.tsx` (новый)
- `apps/frontend/app/teacher/review/page.tsx` (новый)
- `apps/frontend/src/features/navigation/model.ts` (modify)

**Why:** Без routes — нет URL для пользователя. Без nav entries — пользователь не найдёт раздел.

**Tasks:**

- [x] **Step 1:** для каждого `page.tsx` — тонкая обёртка:

```tsx
import { ProtectedPage } from '@/widgets/shell/protected-page';
import { QuestionBanksListScreen } from '@/features/assessment-admin/question-banks-list-screen';
export default function Page() {
  return (
    <ProtectedPage>
      <QuestionBanksListScreen />
    </ProtectedPage>
  );
}
```

- [x] **Step 2:** в `model.ts` добавить 4 группы записей в `routeMeta` (permission gate) и `navigationModel` (label + navSlot):

```ts
{ path: '/admin/question-banks', requires: 'assessment.question_banks.read', label: 'Банки вопросов', navSlot: 'more' },
{ path: '/admin/tests', requires: 'assessment.tests.read', label: 'Тесты', navSlot: 'more' },
{ path: '/admin/assignments', requires: 'assessment.assignments.read', label: 'Задания', navSlot: 'more' },
{ path: '/teacher/review', requires: 'assessment.reviews.review', label: 'Очередь на проверку', navSlot: 'more' },
```

Плюс детальные routes с динамическим segment'ом.

**Acceptance:**

- Все 7 routes доступны как URL.
- Без `read` permission — `ProtectedPage` показывает unauthorized.
- Nav entries видны учётке с подходящим permission'ом.

---

## Task 14: E2E test — `admin-assessment-surface.e2e.test.ts`

**Files:**

- `apps/frontend/src/e2e/admin-assessment-surface.e2e.test.ts` (новый)

**Why:** E2E в convention CLAUDE.md — это не React Testing Library mount, а permission/routing assertions через `evaluateRouteAccess` + `getVisibleNavigation` + pipeline integration + dynamic-import smoke. Без E2E test'а добавлять admin routes неприемлемо.

**Tasks:**

- [x] **Step 1: написать E2E по образцу `admin-clients-management.e2e.test.ts`** (см. `apps/frontend/src/e2e/`). Минимум секций:
  - **Routing** — для каждой роли (admin / teacher / learner / guest) проверить `evaluateRouteAccess` на 7 новых routes.
  - **Navigation** — `getVisibleNavigation` возвращает 4 новые nav entries для admin/teacher.
  - **Pipeline integration** — pure-function integration: создать снимок `{ questionBanks, questions, tests, assignments, testAttempts, assignmentSubmissions }`, прогнать через `aggregateReviewerQueue` и проверить shape.
  - **Module smoke** — dynamic import всех новых screens, проверить что экспортируются.

  Минимум 15 кейсов.

**Acceptance:**

- `pnpm --filter @cdoprof/frontend exec vitest run src/e2e/admin-assessment-surface.e2e.test.ts` зелёный.

---

## Task 15: Closeout — handoff §5.93 + README sync

**Files:**

- `LMS_AGENT_HANDOFF.md` (modify — append §5.93)
- `README.md` (modify — sync §2 AI Agent State)

**Why:** Per CLAUDE.md «After every engineering session» — handoff entry + README sync обязательны. Без них следующий агент потеряет контекст.

**Tasks:**

- [x] **Step 1: append `### 5.93 Phase 3 — Plan A: admin assessment surface`** с summary, files changed, test status, deviations.

- [x] **Step 2: обновить `README.md` §2**:
  - Current Stage → «Phase 3 — Plan A merged (admin assessment surface). Готов к Plan B (learner test player + autograding)».
  - Last Completed Task → «Phase 3 Plan A …».
  - Current Task → «Phase 3 Plan B — learner test player».
  - Next Task → «Phase 3 Plan B …».
  - Last Updated At → today's date.

- [x] **Step 3:** обновить `MEMORY.md` (если автомемори активна) — пометить Phase 3 Plan A как closed.

- [x] **Step 4:** прогнать полный `pnpm -s ci:check` (или local subset — `frontend test` + `backend isolated tests`) — убедиться, что closeout не сломал ничего.

**Acceptance:**

- Handoff §5.93 содержит: summary, files changed (≥30 файлов), test status (DTO + service + http integration + frontend api.contract + format + e2e), deviations (если есть).
- README §2 синхронизирован.
- `pnpm -s ci:check` зелёный (или local subset).

---

## Deviations (заполнить по ходу реализации)

- [x] D1: …
- [x] D2: …

(Plan C имел 4 deviations — реальные расхождения с планом фиксируются здесь, чтобы handoff §5.93 был исчерпывающим.)

---

## Quality gates (after merge of all 3 impl PRs)

- `pnpm -s ci:check` зелёный.
- Канонический E2E §39 (`business-flows.e2e.test.ts`, `lms-role-flows.e2e.test.ts`, `canonical-e2e-readiness.e2e.test.ts`) — без регрессий.
- Migration `0040` применяется без потери данных в seed-тенанте.
- Round-trip админ flow: создать банк → создать вопрос (каждого из 5 типов) → создать тест → добавить вопросы → опубликовать → создать assignment → открыть reviewer queue (пустой).

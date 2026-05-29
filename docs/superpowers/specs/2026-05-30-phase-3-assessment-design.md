# Phase 3 — Тестирование и оценивание: дизайн

| Поле            | Значение                                                                                                           |
| --------------- | ------------------------------------------------------------------------------------------------------------------ |
| Дата создания   | 2026-05-30                                                                                                         |
| Автор           | Brainstorming session (владелец учебного центра + Claude)                                                          |
| Статус          | Черновик к утверждению                                                                                             |
| Релиз           | V1 (пилотный)                                                                                                      |
| Базовая спека   | [2026-05-21-cdoprof-redesign-design.md](2026-05-21-cdoprof-redesign-design.md) §3.2 «Кабинеты», §13 «Тестирование» |
| Базовый роадмап | [../plans/2026-05-21-cdoprof-v1-roadmap.md](../plans/2026-05-21-cdoprof-v1-roadmap.md) §Phase 3                    |
| Следующий шаг   | План реализации Plan A (writing-plans)                                                                             |

> **Назначение документа.** Зафиксировать решения брейнсторма по Phase 3 V1: разбиение фазы на 3 стэкнутых под-плана (A → B → C), границы между ними, отложенный V1.1 backlog. Документ не дублирует базовую спеку — он опирается на §13 «Тестирование (банк)» и §3.2 кабинеты, и уточняет приоритеты на основании реального состояния кода.

---

## 1. Контекст

### 1.1 Phase 2 закрыта

На момент написания спеки в main замержены:

- Phase 1 (магическая ссылка + кабинет ученика §4.2 + course viewer §4.3)
- Pillar A (регулируемое обучение: commissions / program meta / document sets) — PRs #174-#183
- Phase 2 Plan A (bulk Excel import) — PRs #191-#196
- Phase 2 Plan B (admin учётки учеников list/search/filter/edit) — PRs #197-#200
- Phase 2 Plan C (компании-клиенты + group progress) — PRs #201-#205

Последний коммит main: `1af251a` (Merge PR #205, 2026-05-29). Phase 2 объёмно покрыта на ~95% — остаётся V1.1 polish (см. §6).

### 1.2 Что уже есть для assessment

Phase 3 — **не greenfield**. Большая часть data model уже скаффолжена в Stage 8 (миграция `0009_assessment_extensions.sql`) и закалена в Pillar A hardening (§5.15-5.18 в `LMS_AGENT_HANDOFF.md`):

| Сущность                      | Таблица                             | Тип в [mvp.types.ts](../../../apps/backend/src/modules/mvp/mvp.types.ts)                           | Статус                              |
| ----------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Банк вопросов                 | `assessment.question_banks`         | `QuestionBank`                                                                                     | ✅ есть                             |
| Вопрос                        | `assessment.questions`              | `Question` (тип `single_choice` / `multiple_choice` / `text`)                                      | ⚠ нужно расширить тип до 5 значений |
| Варианты ответа               | `assessment.answer_options`         | `AnswerOption`                                                                                     | ✅ есть                             |
| Тест                          | `assessment.tests`                  | `TestEntity`                                                                                       | ✅ есть                             |
| Правила теста                 | `assessment.test_rules`             | `TestRule` (randomize / time_limit / attempt_limit / question_count / daily_reset / passing_score) | ✅ есть                             |
| Тестовый вопрос (M:N)         | `assessment.test_questions`         | `TestQuestion`                                                                                     | ✅ есть                             |
| Попытка                       | `assessment.test_attempts`          | `TestAttempt`                                                                                      | ✅ есть                             |
| Ответ в попытке               | `assessment.attempt_answers`        | `AttemptAnswer`                                                                                    | ✅ есть                             |
| Итог теста                    | `assessment.exam_results`           | `ExamResult`                                                                                       | ✅ есть                             |
| Задание (практическая работа) | `assessment.assignments`            | `Assignment`                                                                                       | ✅ есть                             |
| Сдача задания                 | `assessment.assignment_submissions` | `AssignmentSubmission`                                                                             | ✅ есть                             |
| Ревью задания                 | `assessment.assignment_reviews`     | `AssignmentReview`                                                                                 | ✅ есть                             |

Permissions уже посеяны миграцией [0010_iam_role_permissions_and_seed.sql](../../../apps/backend/migrations/0010_iam_role_permissions_and_seed.sql):

- `assessment.question_banks.read` / `.write`
- `assessment.questions.read` / `.write`
- `assessment.tests.read` / `.write` / `.publish`
- `assessment.attempts.read` / `.take`
- `assessment.results.read`
- `assessment.assignments.read` / `.write`
- `assessment.submissions.submit`
- `assessment.reviews.review`

Pillar A hardening (миграции 0025/0026, §5.15-5.18) уже закрыло:

- `assessment.read.cross_learner` — staff чтение чужих attempts/submissions
- `learners.act_as` — делегированные мутации
- Domain rule `enrollment ↔ course через group_courses` для `PATCH progress`, `POST submissions`, `POST attempts/start`
- Lifecycle locks на `assignment_reviews` (in_review → completed; запрет re-complete)

### 1.3 Что отсутствует и составляет Phase 3

| Gap                                                                                 | Где                                         | Какой план |
| ----------------------------------------------------------------------------------- | ------------------------------------------- | ---------- |
| `QuestionType` не покрывает `number_input` + `essay`                                | TS union + SQL CHECK                        | Plan A     |
| Числовые поля для grading number_input                                              | `Question.numericExpected/numericTolerance` | Plan A     |
| Admin CRUD UI для банков вопросов                                                   | Frontend                                    | Plan A     |
| Admin CRUD UI для вопросов внутри банка                                             | Frontend                                    | Plan A     |
| Test builder UI (выбор вопросов, редактор правил)                                   | Frontend                                    | Plan A     |
| Admin CRUD UI для шаблонов заданий (`assignments`)                                  | Frontend                                    | Plan A     |
| Reviewer queue skeleton (read-only список pending)                                  | Backend + Frontend                          | Plan A     |
| Backend CRUD endpoints для всех вышеперечисленных                                   | `MvpController` + `MvpService`              | Plan A     |
| Learner test player UI с auto-save                                                  | Frontend                                    | Plan B     |
| Backend attempt lifecycle (start / save answer / submit)                            | `MvpService`                                | Plan B     |
| Autograding single/multi/number                                                     | `MvpService`                                | Plan B     |
| `ExamResult` расчёт + лучшая попытка                                                | `MvpService`                                | Plan B     |
| Learner upload файлов для practical assignment                                      | Frontend + `files` модуль                   | Plan C     |
| Backend submission lifecycle (draft → submitted → under_review → reviewed/returned) | `MvpService`                                | Plan C     |
| Reviewer scoring actions (essay grade, comment, finalize)                           | Backend + Frontend                          | Plan C     |
| Submission cycle (return для доработки)                                             | Backend + Frontend                          | Plan C     |

---

## 2. Архитектурные решения

### 2.1 Расширение `QuestionType` — единым шагом в Plan A

`QuestionType` расширяется до 5 значений сразу в Plan A:

```ts
export type QuestionType =
  | 'single_choice' // один правильный ответ из вариантов
  | 'multiple_choice' // несколько правильных ответов из вариантов
  | 'number_input' // числовой ответ с допуском (Plan A)
  | 'text' // короткий текст (autograde по exact-match strategy в Plan B)
  | 'essay'; // длинный текст, только ручная проверка (Plan C)
```

**Почему сразу в Plan A:** иначе Plan B и Plan C каждый везут отдельную миграцию + lockstep правки `QuestionType` UI/типов. Расширение CHECK constraint в одной миграции — самый дешёвый путь.

**Дополнительные поля на `Question`:**

- `numericExpected: number | null` — ожидаемое значение для `number_input`
- `numericTolerance: number | null` — абсолютный допуск (0 = exact)

Эти поля используются только grader'ом в Plan B; в Plan A они заполняются админом через UI.

### 2.2 Категории вопросов — отложено в V1.1

Роадмап упоминает «банк вопросов с категориями». Текущая модель имеет `Question.tags?: string[]` через `metadata jsonb` — этого достаточно для V1-фильтрации. Полноценная таксономия (per-tenant категории / per-bank категории / глобальные категории) — V1.1 после реальных пилотных запросов.

**Plan A использует tags** для фильтрации в bank detail UI.

### 2.3 Granular partial score vs binary score per question

Phase 3 V1 grading модель:

- `single_choice`: правильно/нет → `score` или `0` (binary).
- `multiple_choice`: все правильные выбраны и ничего лишнего → `score` или `0` (binary).
- `number_input`: `|answer - expected| <= tolerance` → `score` или `0` (binary).
- `text`: exact-match (case/whitespace normalized) против ожидаемого ответа (хранится в `Question.text` — Plan A должен сверить семантику этого поля в коде; если оно занято под что-то другое, добавить `expectedTextAnswer`) → `score` или `0` (binary).
- `essay`: всегда `score = null` в авто-grade; финальный score выставляется ревьюером в Plan C.

**Partial credit (например 50% за 2 из 4 правильных в multi-choice)** — V1.1. Phase 3 V1 = «прошёл/не прошёл по сумме binary scores ≥ `passing_score`».

### 2.4 Reviewer queue в Plan A — read-only

Reviewer queue в Plan A показывает:

- Pending attempts: `TestAttempt where status = 'submitted'` (ждут ручной проверки эссе) — 0 в V1 пока Plan B не отгрузил.
- Pending submissions: `AssignmentSubmission where status in ('submitted', 'under_review')` — 0 в V1 пока Plan C не отгрузил.

В Plan A queue — это просто заготовка маршрута и пустой список. Реальные действия (взять в работу / поставить оценку / вернуть на доработку) — Plan C.

**Почему так:** скоринг до того, как ученик может что-то сдать, бессмыслен; список с нулём элементов даёт админу visual confirmation что фича есть.

### 2.5 Cadence — стэкнутые PR (как Phase 2 Plan C)

Phase 3 Plan A разбивается на 4 PR:

1. **Doc-only**: `feat/2026-05-30-phase-3-plan-a` — этот спек + Plan A doc.
2. **Backend impl**: `feat/2026-05-30-phase-3-plan-a-impl` — миграция + DTOs + service + controller + tests.
3. **Frontend impl**: `feat/2026-05-30-phase-3-plan-a-frontend` — feature folder + screens + routes + nav + e2e.
4. **Closeout**: `feat/2026-05-30-phase-3-plan-a-closeout` — closeout E2E + `LMS_AGENT_HANDOFF.md` §5.93 + README sync.

Plans B и C идут после merge Plan A — каждый со своими 4 PR.

---

## 3. Plan A scope (детальный)

### 3.1 Что входит

| Surface                     | Backend                                                                                                                                                      | Frontend                                                           |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Question types extension    | Миграция 0040: расширить CHECK на `questions.type` + 2 nullable колонки `numeric_expected` / `numeric_tolerance`                                             | Type-specific поля в форме редактора вопроса                       |
| Question banks CRUD         | `POST /question-banks`, `GET /question-banks`, `GET /question-banks/:id`, `PATCH /question-banks/:id`, `POST /question-banks/:id/archive`                    | `/admin/question-banks` list + `/admin/question-banks/[id]` detail |
| Questions CRUD внутри банка | `POST /question-banks/:id/questions`, `GET /question-banks/:id/questions`, `PATCH /questions/:id`, `POST /questions/:id/archive` + операции с `AnswerOption` | Question editor (drawer) внутри bank detail                        |
| Tests CRUD                  | `POST /tests`, `GET /tests`, `GET /tests/:id`, `PATCH /tests/:id`, `POST /tests/:id/archive`, `POST /tests/:id/publish`                                      | `/admin/tests` list + `/admin/tests/[id]` builder                  |
| Test rules upsert           | `PUT /tests/:id/rules`                                                                                                                                       | Встроено в test builder                                            |
| Test questions (M:N)        | `POST /tests/:id/questions`, `DELETE /tests/:id/questions/:questionId`, `PATCH /tests/:id/questions/:questionId` (sortOrder)                                 | Question picker в test builder                                     |
| Assignments CRUD            | `POST /assignments`, `GET /assignments`, `GET /assignments/:id`, `PATCH /assignments/:id`, `POST /assignments/:id/archive`                                   | `/admin/assignments` list + `/admin/assignments/[id]` detail       |
| Reviewer queue (read-only)  | `GET /reviewer/queue` (aggregating pending)                                                                                                                  | `/teacher/review` queue listing                                    |

### 3.2 Что НЕ входит в Plan A

- **Learner test player UI** — Plan B
- **Backend attempt lifecycle** (start / save / submit) — Plan B (текущие stub'ы оставляем; они уже под permission boundary в `mvp.domains.http.integration.test.ts`)
- **Autograding logic** — Plan B
- **Submission lifecycle** (upload / submit / return) — Plan C
- **Reviewer scoring actions** — Plan C
- **Категории вопросов** (отдельная таксономия) — V1.1
- **Partial credit** — V1.1
- **Question import из Excel** (упомянуто в спеке §13 как `/question-import` — частично) — V1.1
- **Прокторинг / запись попытки** — Phase 4

### 3.3 DTO inventory (Plan A)

Новые DTO в [apps/backend/src/modules/mvp/](../../../apps/backend/src/modules/mvp/):

- `create-question-bank.dto.ts`, `update-question-bank.dto.ts`
- `create-question.dto.ts`, `update-question.dto.ts` (с условной валидацией: для single/multi требуются `answerOptions[]` с ≥1 `isCorrect`; для number_input требуется `numericExpected`; для text/essay — `text` поле)
- `answer-option.dto.ts` (nested + standalone PATCH)
- `create-test.dto.ts`, `update-test.dto.ts`
- `update-test-rule.dto.ts`
- `add-test-question.dto.ts`, `update-test-question.dto.ts`
- `create-assignment.dto.ts`, `update-assignment.dto.ts`

### 3.4 Service inventory (Plan A)

Новые методы в [MvpService](../../../apps/backend/src/modules/mvp/mvp.service.ts):

```
createQuestionBank / updateQuestionBank / archiveQuestionBank / listQuestionBanks / getQuestionBank
createQuestion / updateQuestion / archiveQuestion / listQuestionsForBank / getQuestion
upsertAnswerOptions (массовая операция в одной транзакции)
createTest / updateTest / archiveTest / publishTest / listTests / getTest
upsertTestRule
addTestQuestion / removeTestQuestion / reorderTestQuestion
createAssignment / updateAssignment / archiveAssignment / listAssignments / getAssignment
getReviewerQueue (read-only aggregator)
```

Каждый mutation метод пишет в `audit.audit_log` с действиями типа `assessment.bank_created`, `assessment.question_archived`, `assessment.test_published`, и т.д.

### 3.5 Frontend inventory (Plan A)

Новая feature-папка `apps/frontend/src/features/assessment-admin/`:

- `types.ts` — DTOs + form state types
- `api.ts` — REST-клиент (8 endpoint groups)
- `api.contract.test.ts` — envelope unwrap + URL/method/body assertions
- `hooks.ts` — React Query queries + `useState` mutations (CLAUDE.md convention)
- `format.ts` + `format.test.ts` — форматтеры (label по `QuestionType`, summary правил теста, и т.д.)
- `question-banks-list-screen.tsx`
- `question-bank-detail-screen.tsx` (вкладки: общие + вопросы)
- `question-editor-drawer.tsx` (type-aware форма)
- `tests-list-screen.tsx`
- `test-builder-screen.tsx` (детали + правила + question picker)
- `assignments-list-screen.tsx`
- `assignment-detail-screen.tsx`
- `reviewer-queue-screen.tsx`

Routes:

- `app/admin/question-banks/page.tsx`, `app/admin/question-banks/[id]/page.tsx`
- `app/admin/tests/page.tsx`, `app/admin/tests/[id]/page.tsx`
- `app/admin/assignments/page.tsx`, `app/admin/assignments/[id]/page.tsx`
- `app/teacher/review/page.tsx`

Navigation: 4 новые записи в [features/navigation/model.ts](../../../apps/frontend/src/features/navigation/model.ts) под существующими permission'ами.

### 3.6 Testing strategy (Plan A)

Backend:

- `*.dto-validation.test.ts` — расширения для каждого нового DTO (минимум 3-5 кейсов на DTO: happy / missing required / cross-field rule)
- `*.service.test.ts` — расширения `mvp.service.test.ts` для каждого нового метода (создание, update, archive, ant-IDOR через tenantId mismatch, audit emission check)
- `mvp.domains.http.integration.test.ts` — расширения для каждого нового endpoint: `auth_required`, `permission_denied`, `tenant_mismatch`, success (envelope shape)

Frontend:

- `assessment-admin/api.contract.test.ts` — 1 кейс на endpoint = ~20 кейсов
- `assessment-admin/format.test.ts` — форматтеры
- `e2e/admin-assessment-surface.e2e.test.ts` — routing + nav + dynamic-import smoke + pipeline integration (как `admin-clients-management.e2e.test.ts`)

---

## 4. Plan B scope (sketch)

После merge Plan A. Branch: `feat/2026-06-XX-phase-3-plan-b`.

**Backend:**

- `MvpService.startAttempt` — открывает `TestAttempt` (status='in_progress'), генерирует `questionOrder[]` с учётом `randomize`/`questionCount`, считает `expiresAt` по `timeLimitMinutes`.
- `MvpService.saveAttemptAnswer` — upsert `AttemptAnswer` (auto-save). Проверяет `attempt.status === 'in_progress'`, не истёкший `expiresAt`.
- `MvpService.submitAttempt` — пере-status'ит на `submitted`, запускает autograde pipeline для single/multi/number/text, считает `ExamResult` (best attempt across `attemptsCount`), пишет `audit.assessment.attempt_submitted`.
- Autograde pure-function service `assessment-autograde.service.ts` — берёт `{question, answer}` снимок, возвращает `{ score, autoGraded: boolean }`.

**Frontend:**

- `apps/frontend/src/features/test-player/` — feature folder
- `app/learner/tests/[testId]/attempt/[attemptId]/page.tsx` — main player
- Auto-save через debounced `useEffect` (5s после изменения ответа)
- Timer на основе `attempt.expiresAt` с client-side countdown + auto-submit
- Result screen `/learner/tests/[testId]/result` после submit

**Testing:**

- Autograde service unit (table-driven по типу вопроса)
- HTTP integration для start/save/submit
- E2E: routing + dynamic-import smoke

---

## 5. Plan C scope (sketch)

После merge Plan B. Branch: `feat/2026-06-XX-phase-3-plan-c`.

**Backend:**

- `AssignmentSubmission` lifecycle: `draft → submitted → under_review → reviewed | returned | rejected`
- Endpoints: `POST /submissions/:id/upload-file` (через `files` модуль S3), `POST /submissions/:id/submit`, `POST /submissions/:id/return-for-revision`
- Reviewer scoring: `PATCH /reviews/:id/grade-essay` (для эссе-вопросов в attempts), `POST /reviews/:id/complete` (уже есть в Pillar A hardening)
- `MvpService.completeAttemptReview` — финализирует attempt после ручной проверки эссе

**Frontend:**

- `apps/frontend/src/features/practical-submissions/` — learner upload UI
- `apps/frontend/src/features/reviewer-actions/` — scoring + comments UI
- `app/learner/assignments/[id]/submit/page.tsx`
- `/teacher/review` queue с активными действиями (вместо skeleton'а из Plan A)

---

## 6. Открытые вопросы и V1.1 backlog

Решения, отложенные до V1.1 после реальных пилотных запросов:

- **Категории вопросов** — таксономия (per-tenant / per-bank / глобальная). Plan A использует `tags?`.
- **Partial credit** для multi-choice (50% за 2/4 правильных). Plan A grading = binary.
- **Question import из Excel** — был упомянут в TZ §13 `/question-import`. Откладываем до полной реализации Phase 10 «Excel-конструктор».
- **Test versions** — публикация v1 / v2 теста с inactivation старых попыток. Plan A `publishTest` ставит `publishedAt` единожды; versioning — V1.1.
- **Бан / расшарить вопросы между банками** — V1.1.
- **Bulk operations** (archive 10 questions at once) — V1.1.
- **Granular `numericTolerance` modes** — относительный допуск (5%) vs абсолютный. Plan A — только абсолютный.
- **Анти-cheating** (запрет копирования из браузера, fullscreen lock) — V2.

---

## 7. Acceptance gates (Phase 3 Plan A)

- [ ] Миграция `0040_assessment_question_types_extension.sql` применяется без потери данных; `QuestionType` CHECK расширен.
- [ ] Round-trip: создать question-bank → создать question (каждого из 5 типов) → создать test → добавить вопросы → опубликовать → создать assignment.
- [ ] Все 5 новых admin routes доступны по соответствующим permissions (`/admin/question-banks`, `/admin/tests`, `/admin/assignments`, `/teacher/review` + детальные).
- [ ] Reviewer queue возвращает корректные счётчики (≥0; в seed-тенанте = 0).
- [ ] `pnpm -s ci:check` зелёный.
- [ ] Канонический E2E §39 (`business-flows.e2e.test.ts`, `lms-role-flows.e2e.test.ts`, `canonical-e2e-readiness.e2e.test.ts`) — без регрессий.
- [ ] `LMS_AGENT_HANDOFF.md` §5.93 заполнен; `README.md` §2 AI Agent State обновлён.

---

## 8. Что НЕ входит во всю Phase 3

- ЕСИА / прокторинг — Phase 4
- Уведомления о результатах / напоминания о пере-аттестации — Phase 5
- Подписанные результаты тестов как документы — Phase 6
- Оплата за расширенные попытки — Phase 7
- SCORM-импорт тестов из готовых пакетов — Phase 9

---

## 9. Связь с базовой документацией

- [SDOPROF_TZ_FINAL.md](../../../SDOPROF_TZ_FINAL.md) §13 «Тестирование (банк)» — продуктовые требования
- [LMS_AGENT_HANDOFF.md](../../../LMS_AGENT_HANDOFF.md) §5.15-5.18 — Pillar A hardening assessment (cross_learner / act_as / IDOR / lifecycle locks)
- [docs/TZ_MVP_TRACEABILITY.md](../../TZ_MVP_TRACEABILITY.md) — BL → файлы (BL-008 для assessment)
- [README.md](../../../README.md) §1 «Канонический E2E» — что регрессит при изменении assessment

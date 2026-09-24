# Фаза 1 «Слой хранения», срез 4: курсы группы и результаты экзаменов — проекция и чтение через SQL

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. План считается утверждённым по правилам автономии ТЗ перехода с CDOPROF (поручение владельца 23.09.2026). Срез идёт **двумя PR**: 4a (проекция) и 4b (чтение под флагом).

**Goal:** Коллекции `groupCourses` (→ `learning.group_courses`) и `examResults` (→ `assessment.exam_results`) живут в таблицах по-настоящему: сохранение снимка проецирует их (курсы группы после групп, результаты после зачислений и слушателей), а пять чистых GET-ручек — `group-courses`, `group-courses/:id`, `exam-results`, `exam-results/:id`, `exam-results/by-enrollment/:enrollmentId` — читаются из SQL под флагами `groupCourses`/`examResults` с теми же правилами anti-IDOR, что в снимке.

**Architecture:** По разведке (§5.567): удалений этих коллекций в рантайме нет (только `'all'` при присваивании); дубль курса в группе проверяет код (409), результат при пересдаче перезаписывается на месте по `(enrollmentId, testId)` — уникальность таблицы соблюдается по построению, кроме `recalculateExamResult`, чей ключ шире (`learnerId`) — возможная вторая запись уйдёт в `projection_failed` поимённо. На `group_courses` и `exam_results` никто не ссылается — `detach` не нужен. **Обратная проекция не выдумывает полей:** у курса группы `requires*` (`bool(undefined) = false`), `sortOrder` (0) и `status` ('active') помечаются `__synthesized`, у результата `finalized_at` (из `updatedAt`) — скрытая колонка. Не переводить на SQL: `GET attempts/:id/result` (пишет в состояние), `result-view`, `exam-retakes`, `recalculate` и все внутренние сценарии снимка (`computePlannedEndAt`, `listMyEnrollments`, гейты, дашборды, госреестры).

**Tech Stack:** как в срезах 1–3.

**Spec:** [TZ_TRUDSKILL_CDOPROF_MIGRATION.md](../../../TZ_TRUDSKILL_CDOPROF_MIGRATION.md) МГ-A1.1 («groupCourses → learning.group_courses», «examResults → assessment.exam_results»), МГ-A1.2, МГ-A2.1. Планы срезов 1–3 — образец.

## Global Constraints

- Форма ответов не меняется: `rowToEntity('groupCourses')` не возвращает `requiresPreExamAuth/requiresIdentityVerification/requiresProctoring/sortOrder/status`, которых не было в снимке; `rowToEntity('examResults')` не возвращает `finalizedAt`.
- Фильтры `GET group-courses` в SQL: `group_id`, `course_id`, `course_version_id`, `status`; `GET exam-results`: `enrollment_id`, `learner_id`, `test_id`, `status` + anti-IDOR по `learnerIds` (как у зачислений); `q` не применяется, прочие фильтры игнорируются (записать, как 614). Порядок по умолчанию `created_at asc, id asc` (в снимке — порядок массива; `sortOrder` курсов = номер в центре, а не в группе — записать).
- `numeric(8,2)` округлит дробные баллы — записать в журнал; в проекции баллы пишутся как есть.
- SQL: `tenant_id` буквально, `order by …, id asc`, белые списки сортировок.
- ≤30 файлов на PR, зелёный `pnpm ci:check`.

## Review Focus

1. Сдача экзамена (`submitAttempt` → `finalizeExamResult`) создаёт результат, пересдача обновляет ту же строку (`attempts_count`, `best_score`), а не вторую.
2. Курс группы без флагов `requires*` в снимке: в таблице `false`, в ответе из SQL ключей нет.
3. Результат по зачислению, которого нет в таблице (отказ проекции зачисления), — отказ поимённо, снимок сохранён.
4. `GET exam-results` для слушателя без привязки — пусто; для персонала с правом обхода — всё; `by-enrollment` чужого зачисления — 404 как в снимке (сначала 404 по зачислению, затем 403 по слушателю).
5. Присваивание `state.groupCourses = […]` — полный upsert и `deleteAbsent`.

---

## PR 4a — проекция

### Task 1: проекция курсов группы и результатов

**Files:** Modify `in-memory-mvp.state.ts` (`PROJECTED_COLLECTIONS = ['counterparties','learners','groups','groupCourses','enrollments','enrollmentStatusHistory','examResults']`), `postgres-mvp-persistence.backend.ts` (upsert `groupCourses` после групп, `examResults` после истории; удаления `['examResults','enrollmentStatusHistory','enrollments','groupCourses','groups','learners','counterparties']`; комментарий про результаты из бэкфилла обновить), `normalized-projection.ts` (`projectGroupCourse`: `__synthesized` для `requires*`/`sortOrder`/`status` при отсутствии в снимке; `HIDDEN_COLUMNS.examResults = ['finalized_at']`), `normalized-projection.test.ts` (круговой проход обоих), `postgres-mvp-persistence.backend.test.ts` (`isProjectionWrite` += две таблицы; «нетронутая коллекция» → `courses`; тест порядка семи таблиц), `lazy-state.perf.test.ts`.

- [x] Commit `feat(backend): проекция курсов группы и результатов экзаменов при сохранении снимка (Фаза 1, срез 4a)` — a2c32c9.

### Task 2: интеграционный тест

**Files:** Create `postgres-mvp-persistence.group-courses-exam-results.integration.test.ts`: курс группы → строка (флаги `false` в таблице), результат по зачислению → строка; пересдача (та же запись, `attempts_count` 2) → та же строка обновлена; результат по несуществующему зачислению → отказ поимённо; присваивание курсов целиком → лишние удалены.

- [x] Интеграционный тест вошёл в тот же коммит a2c32c9 (отклонение: один коммит вместо двух).

### Task 3: документация 4a

- [x] Сделано (§5.567; попутно починка 616 — коммит 6e836be).

handoff §5.567, трекер, README, план; журнал: `numeric(8,2)` округление, `sortOrder` = номер в центре, `GET attempts/:id/result` пишет на чтении (существующее), `ExamOutcomeService.viewFor` без anti-IDOR (`void access`) — попутная находка разведки, класс «дефект логики», в журнал и владельцу. `pnpm ci:check`, PR.

---

## PR 4b — чтение под флагом

### Task 4: репозитории и сервис

**Files:** Create `repositories/group-courses.repository.ts` (+ `postgres-`, `in-memory-`), `repositories/exam-results.repository.ts` (+ `postgres-`, `in-memory-`; `list(tenantId, query with learnerIds)`, `get`, `byEnrollment`); Modify `mvp-normalized-reads.service.ts` (`listGroupCourses/getGroupCourse`, `listExamResults/getExamResult/getExamResultByEnrollment` с `restrictLearnerIds`/`assertReadAllowedForLearner` как у зачислений; `byEnrollment`: 404 по зачислению через `EnrollmentsRepository.get`), тест; `normalized-collections.ts` (+`groupCourses`, `examResults`) + тест (пример недопустимой → `generatedDocuments`); `mvp.controller.ts` (5 ручек; `by-enrollment` — `@ReadsNormalized('examResults','enrollments')`), `mvp.module.ts`, `mvp.domains.http.integration.test.ts`, `repositories.integration.test.ts`, `.env.example`, документ env.

- [x] Commit `feat(backend): курсы группы и результаты экзаменов читаются из таблиц под флагом` — 30efb0f (отклонение: в том же PR #814, что и 4a — вместе 30 файлов, стек-PR после squash конфликтует).

### Task 5: документация 4b

- [x] Сделано (§5.568).

handoff §5.568, трекер (МГ-A1/A2), план. `pnpm ci:check`, PR.

## Риски (из разведки)

- Разный ключ поиска у `recalculateExamResult` и `finalizeExamResult` может дать вторую запись → отказ проекции поимённо; в журнал.
- Отказ проекции слушателя или зачисления цепочкой роняет результаты (проверенные FK) — журнал сверки называет цепочку.
- `GET attempts/:id/result` меняет `updatedAt` на каждом чтении → сохранение и проекция на каждый GET (существующее поведение, в журнал).
- Документы (срез 5): проекция в домене документов идёт отдельной транзакцией от MVP — документ на зачисление того же запроса может не найти его в таблице; план среза 5 учтёт (контекст из снимка запроса, а не из таблиц).

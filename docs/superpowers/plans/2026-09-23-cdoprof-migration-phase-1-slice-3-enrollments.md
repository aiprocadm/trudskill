# Фаза 1 «Слой хранения», срез 3: зачисления и история статусов — проекция, чтение через SQL, портал заказчика

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. План считается утверждённым по правилам автономии ТЗ перехода с CDOPROF (поручение владельца 23.09.2026). Срез идёт **тремя PR**: 3a (проекция), 3b (чтение зачислений под флагом), 3c (портал заказчика и представитель на SQL, биллинг).

**Goal:** Коллекции `enrollments` и `enrollmentStatusHistory` живут в `learning.enrollments`/`learning.enrollment_status_history` по-настоящему: сохранение снимка проецирует их (после слушателей и групп, история после зачислений), `GET /enrollments`, `/enrollments/:id`, `/enrollments/:id/status-history` читаются из SQL под флагом `LMS_NORMALIZED_COLLECTIONS=enrollments` с теми же правилами anti-IDOR и скоупа заказчика, а портал заказчика (`portal/learners`) и представитель в `/learners` переходят на SQL через `exists` по зачислениям и группам — это снимает РМ37.

**Architecture:** По разведке (§5.564): писателей зачислений мимо `saveFromState` нет (HTTP через интерцептор, воркеры через `MvpTenantRunner`), удалений зачислений в рантайме нет — путь `'all'` теоретический. На зачисления ссылаются `enrollment_status_history` (каскад при удалении — история подчинена зачислению) и `assessment.exam_results` из бэкфилла (отказ удаления — в журнал, результаты проецируются в срезе 4). Дубль пары «группа + слушатель» ловится уникальным индексом, а не `on conflict (id)` → пачка падает, строки идут по одной, дубль в журнал. Обратная проекция должна не выдумывать полей: `enrolled_at ← createdAt` и `completed_at ← updatedAt` подставляются только для базы, `rowToEntity` не должен возвращать `completedAt`, которого не было, а у истории — лишний `createdAt`. Anti-IDOR в SQL: слушатель актора по `learners.user_id` **или** `payload->>'linkedIamUserId'` (обнулён, если нет `iam.users`) — закрыто по умолчанию, как в снимке. Портал: `exists (select 1 from learning.enrollments e join learning.groups g on g.tenant_id = e.tenant_id and g.id = e.group_id where e.tenant_id = $1 and e.learner_id = l.id and g.counterparty_id = $n)` (индексы 0107/0105/0039 есть); декоратор `@ReadsNormalized` становится мультиколлекционным — снимок не грузится, только если ВСЕ названные коллекции включены. Биллинг (`tenant-usage`) после проекции станет честным: центры сверх тарифа получат 409 на создание слушателей и групп — это ожидаемое поведение, но импорт без дат дал бы всплеск в месяц импорта (отсечка по `source_system` на месяц импорта). `/search` из среза вынесен (курсы остаются в снимке, частичный СНИЛС по хэшу невозможен, у ручки нет интерцептора документов — существующий дефект в журнал).

**Tech Stack:** как в срезах 1–2.

**Spec:** [TZ_TRUDSKILL_CDOPROF_MIGRATION.md](../../../TZ_TRUDSKILL_CDOPROF_MIGRATION.md) МГ-A1.1 («enrollments и enrollmentStatusHistory → одноимённые таблицы»), МГ-A1.2, МГ-A2.1 (`GET /enrollments` с `q, status, page, page_size, sort`), МГ-A3.1. Планы срезов 1–2 — образец.

## Global Constraints

- Форма ответов не меняется: `rowToEntity('enrollments')` не добавляет `completedAt`/`enrolledAt`, которых не было в снимке (подстановки — только в колонки); `rowToEntity('enrollmentStatusHistory')` не отдаёт `createdAt`.
- Фильтры `/enrollments` в SQL: `group_id`, `learner_id`, `status`, `created_from/to`, `planned_end_from/to`, `q` (по `id`? — в снимке `q` искал по JSON; для зачислений `q` практически не используется — оставить по `status`/`id`, записать); `enrolled_from/to` и `client_id` — не поддерживались в снимке, в SQL не добавлять (дрейф не «чинить» молча); `course_id`/`type`/… в снимке давали пустой список — в SQL игнорируются (записать в журнал, как 610).
- Anti-IDOR и скоуп — ровно как в снимке: без актора/с правом `assessment.read.cross_learner`/`learners.act_as` — без ограничения; иначе только свои зачисления (по привязке `linkedIamUserId`), закрыто по умолчанию; скоуп заказчика — через группы контрагента.
- SQL: `tenant_id` буквально, белый список сортировок (`enrolledAt, plannedEndAt, completedAt, status, createdAt, updatedAt, id`), `order by …, id asc`.
- Госреестры (`ot`, `rostechnadzor`, `eisot`), `listMyEnrollments`, дашборды, закрытие группы остаются на снимке (6.x).
- ≤30 файлов на PR, зелёный `pnpm ci:check`; k6 в 3c.

## Review Focus

1. Завершение зачисления (`changeEnrollmentStatus` → `completed`) → в таблице `completed_at` и запись истории; отмена → история с `reason`.
2. Создание зачисления в несуществующую группу невозможно через API (409/404 раньше), но в снимке синтетики бывает — отказ поимённо, снимок сохранён.
3. Слушатель без привязки к учётной записи запрашивает `/enrollments` под флагом — пусто (закрыто по умолчанию), как в снимке.
4. Представитель заказчика в `portal/learners` под флагом видит ровно тех, кто зачислен в группы его контрагента, включая `cancelled`; группа с контрагентом, которого нет в таблице (`counterparty_id = null`), — расхождение со снимком, записать (РМ39).
5. `tenant-usage` после проекции: тест на «зачисление, созданное сегодня, увеличивает счётчик» и на отсечку импорта по `source_system` в месяц импорта.

---

## PR 3a — проекция зачислений и истории

### Task 1: проекция

**Files:** Modify `in-memory-mvp.state.ts` (`PROJECTED_COLLECTIONS = ['counterparties','learners','groups','enrollments','enrollmentStatusHistory']`), `postgres-mvp-persistence.backend.ts` (upsert зачислений после групп с `emptyContext()`, затем история; удаления в порядке `history → enrollments → groups → learners → counterparties`, история удаляемых зачислений каскадом `deleteHistoryOfEnrollments` до `deleteRows(enrollments)`; удаления поштучно в точке сохранения), `normalized-upsert.ts` (`deleteHistoryOfEnrollments(client, tenantId, enrollmentIds)`, `deleteRowsOneByOne`), `normalized-projection.ts` (`rowToEntity`: для `enrollments` не возвращать `completedAt`, если `payload.completedAtSynthesized`? — проще: проекция кладёт в `payload` признак `completedAtFromUpdatedAt: true`/`enrolledAtFromCreatedAt: true`, `rowToEntity` по нему убирает поле; для истории — `createdAt` не отдавать), `normalized-projection.test.ts` (круговой проход зачисления без `completedAt` и истории), `postgres-mvp-persistence.backend.test.ts` (`isProjectionWrite` += две таблицы; тест порядка: слушатели/группы раньше зачислений, история после; удаление зачисления → сначала история), `lazy-state.perf.test.ts`.

- [x] Commit `feat(backend): проекция зачислений и истории статусов при сохранении снимка (Фаза 1, срез 3a)`.

### Task 2: интеграционный тест

**Files:** Create `postgres-mvp-persistence.enrollments-projection.integration.test.ts`: создание зачисления → строка + история; смена статуса на `completed` → `completed_at`, вторая запись истории; зачисление в несуществующую группу (в снимке) → отказ поимённо, соседи записаны; дубль пары → отказ поимённо; `'all'` (присваивание) с историей.

- [x] Commit `test(backend): проекция зачислений на живой базе`.

### Task 3: документация 3a

handoff §5.564 (разведка + 3a), трекер, README, план. `pnpm ci:check`, PR.

---

## PR 3b — чтение зачислений под флагом

### Task 4: репозиторий и сервис

**Files:** Create `repositories/enrollments.repository.ts` (`list(tenantId, query, access: { learnerIds: string[] | null; counterpartyId?: string })`, `get(tenantId, id)`, `history(tenantId, enrollmentId)`), `postgres-enrollments.repository.ts` (anti-IDOR: `learner_id = any($n)` при ограничении; скоуп: `exists (select 1 from learning.groups g where g.tenant_id = $1 and g.id = e.group_id and g.counterparty_id = $m)`; фильтры; `rowToEntity`), `in-memory-enrollments.repository.ts`; Modify `registry-list-query.ts` (расширение: `groupId, learnerId, createdFrom/To, plannedEndFrom/To`), `mvp-normalized-reads.service.ts` (`listEnrollments/getEnrollment/listEnrollmentStatusHistory` с `resolveActorLearnerIds` через `LearnersRepository.findByUser`? — нужен метод `learnerIdsByUser(tenantId, userId)` в `LearnersRepository` по `user_id` или `payload->>'linkedIamUserId'` — json-фильтр в `where` требует индекса (`json-filters-indexed`) → индекс по выражению в миграции 0111 или хранить `linked_iam_user_id` отдельной колонкой; выбрать колонку `linked_iam_user_id` (0111) — проекция пишет её всегда, `user_id` остаётся FK-проверенной), `normalized-collections.ts` (+`enrollments`), `mvp.controller.ts` (3 ручки), `mvp.module.ts`, `mvp.domains.http.integration.test.ts`, тесты, `.env.example`, документ env.

- [x] Commit `feat(backend): /enrollments читается из learning.enrollments под флагом — anti-IDOR и скоуп заказчика в SQL`.

### Task 5: документация 3b

handoff §5.565, трекер, журнал (фильтры), план. `pnpm ci:check`, PR.

---

## PR 3c — портал заказчика и представитель на SQL, биллинг, k6

### Task 6: мультиколлекционный декоратор и скоуп слушателей

**Files:** Modify `reads-normalized.decorator.ts` (`ReadsNormalized(...collections)`), `mvp-request-persistence.interceptor.ts` (`every(isNormalizedRead)`) + тест, `learners.repository.ts`/`postgres-learners.repository.ts`/`in-memory-learners.repository.ts` (скоуп `counterpartyId` через `exists` по зачислениям и группам), `mvp-normalized-reads.service.ts` (`listLearners(tenantId, query, actor)` со скоупом вместо «пусто»), `mvp.controller.ts` (`GET learners` — одна ветка по флагу; `portal/learners` — `@ReadsNormalized('learners','enrollments','groups')`, расшифровка до `toPortalLearnerView`), тесты (сервис, интеграционный: представитель видит только своих, включая `cancelled`; группа с `counterparty_id = null` — записать РМ39).

### Task 7: биллинг и k6

**Files:** `tenant-usage.service.ts` (+тест): отсечка `source_system` на месяц импорта — или решение «не отсекать» с записью; `infra/load/k6-cdoprof-volume.js` (+`/enrollments`, `/portal/learners`); `docs/LOAD_TEST_RESULTS.md`.

### Task 8: документация 3c

handoff §5.566, трекер (РМ39, МГ-A2.1/A3.1), журнал расхождений (`/search` без интерцептора документов — дефект; `course_id` на `/enrollments`), план.

## Риски (из разведки)

- Обратное чтение не должно выдумывать `completedAt`/`enrolledAt`/`createdAt` истории — сторож формы ответа: тест кругового прохода.
- Anti-IDOR по `user_id` без учёта `linkedIamUserId` без `iam.users`: колонка `linked_iam_user_id` (0111) решает.
- Каскадные отказы: не легла группа → не лягут зачисления → история; портал теряет сотрудников — журнал сверки показывает цепочку.
- Биллинг становится честным — 409 сверх тарифа: сообщить владельцу в «Что нужно от владельца».
- `LMS_READ_MODEL=shadow` делает каждое сохранение полным upsert — не сочетать с флагом (документ env).

# Фаза 2 «Домен CDOPROF», срез 2: мастер создания группы (МГ-B2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. План считается утверждённым по правилам автономии ТЗ перехода с CDOPROF (поручение владельца 23.09.2026). Срез идёт **двумя PR**: 8.4 (бэкенд: `POST /groups/wizard`, `GET /groups/next-code`, подавление письма, активация зачислений) и 8.5 (фронт: мастер на `/groups/new` из четырёх шагов на `WizardSteps`).

**Goal:** Куратор создаёт группу за один проход в четыре экрана (§6.2 ТЗ): кто учится → что и когда → слушатели → доступы и проверка; результат — группа `recruiting` (или `in_progress`, если начало ≤ сегодня), курсы назначены, слушатели созданы или переиспользованы по СНИЛС/почте с частичным успехом поимённо, зачисления `active`, письма ушли (или отложены), аудит. Одной транзакцией снимка.

**Architecture (по разведке §5.575).** Половины кирпичей нет, поэтому срез делается на существующем и честно откладывает недостающее:

- (РМ48) Шагов **четыре** (ТЗ перехода §6.2; ТЗ редизайна §8.2 говорит «≤3» для `/groups/new`, сторож `page-templates-match-spec` допускает 4) — приоритет у ТЗ перехода как у более позднего по предмету; расхождение записано в журнал. Маршрут остаётся `/groups/new`, заголовок «Новая группа» (сторожа маршрутов и крошек).
- (РМ49) Зачисления мастера — сразу `active` при `enrollmentMode = auto` (значение по умолчанию центра), иначе `pending`; статус группы задаётся при создании (`createGroup` принимает начальный статус): `recruiting`, а если `startDate ≤ сегодня` центра — `in_progress`.
- (РМ50) Доступы: `email` — существующее письмо-приглашение с магической ссылкой (`enrollment_invite`); `later` — приглашение подавляется (новая опция `suppressInvite` у `createBulkEnrollments`/`createEnrollment`); `sheet` («лист доступов», МГ-C4) до Фазы 6 работает как `later` с пометкой в ответе (`access.sheetFileId = null`, `access.deferred = true`). Письмо уходит **после** сохранения снимка — событие приглашения откладывается до конца запроса (сегодня оно летит до коммита — журнал).
- (РМ51) «Новая компания по ИНН» (МГ-D1.2): провайдера ЕГРЮЛ нет — в мастере кнопка «Новая компания» открывает существующую форму контрагента (`POST /counterparties/extended`, ИНН вручную); `GET /counterparties/suggest?inn=` — 🚫 до входа владельца (ключ DaData/ЕГРЮЛ — О11).
- (РМ52) Черновик после шага 1 — существующим `POST /groups` (`status: draft`) + `PUT /groups/:id` по шагам; завершение — `POST /groups/wizard` с `group.draftId` (черновик достраивается) или без него (создание с нуля). Брошенные черновики видны в реестре под статусом «Черновик» и отбором — это честнее скрытого мусора; двойной клик защищён ключом идемпотентности мастера.
- Курсы: дерева направлений у курсов нет (нет `directionId`) — список курсов с флажками и часами версии; срок — `durationDays` курса группы, по умолчанию `groupDefaults.periodDays`. Код предзаполняется через новую `GET /groups/next-code` (тот же генератор, что при создании; ручка ставится **до** `groups/:id` — сторож `route-shadowing`).
- Слушатели: строки «ФИО; должность; СНИЛС; email; телефон» — свой разбор (общий с бэкендом по правилам `parseFullName` и СНИЛС), почта необязательна (в отличие от XLSX-импорта, где она обязательна и остаётся), дубли по СНИЛС/почте → «уже есть — будет зачислен существующий»; «из сотрудников контрагента» — слушатели, зачисленные в группы этого контрагента (единственный источник связи сегодня); XLSX — существующий импорт после создания группы (ссылка со сводки).

**Spec:** [TZ_TRUDSKILL_CDOPROF_MIGRATION.md](../../../TZ_TRUDSKILL_CDOPROF_MIGRATION.md) §6.2 (МГ-B2), §16 (`POST /groups/wizard`, `GET /counterparties/suggest`), §18 «Мастер группы», §II.4 (≤4 шага, черновик).

## Global Constraints

- Права ручки мастера: `groups.write` + `learners.write` + `enrollments.write` (одним декоратором — все три); страница `/groups/new` показывает мастер только тем, у кого есть `groups.write` (остальным — экран «нет прав», а не 403 на последнем шаге).
- Частичный успех: группа создаётся всегда; отказ строки слушателя — поимённо с причиной; ключ идемпотентности мастера — повтор возвращает тот же ответ.
- Сторожа: `bulk-partial-success` (циклы по `request.courses`/`rows`/`existingIds` — в `DECIDED`), `audit-codes-described` (`learning.group_wizard_completed`, `learning.group_course_created`), `error-codes-described`, `route-shadowing`, `permission-coverage`, `page-templates-match-spec` (`const STEPS = [ … ]` без типа, в файле с `<WizardSteps`, ≤4 `id:`, файл ≤2 импорта от `app/groups/new/page.tsx`), `primary-action-budget` (`EXPLAINED`), `page-unsaved-changes` (`useUnsavedForm`), `directory-select-ratchet` (только `DirectorySelect`/`StaffSelect`), `id-input-ban`.
- ≤30 файлов на PR; `pnpm ci:check` на чистом дереве.

## Review Focus

1. Повтор `POST /groups/wizard` с тем же ключом — тот же ответ, вторая группа не создаётся.
2. Строка со СНИЛС существующего слушателя — `reused`, зачислен существующий; строка с плохим СНИЛС — `failed` с причиной, остальные приняты.
3. `access.mode = later` — ни одного письма в `email_deliveries`; `email` — письмо на каждого с почтой, после сохранения снимка.
4. Начало обучения вчера → группа `in_progress`; завтра → `recruiting`; без курсов — 400 `validation_error` «добавьте хотя бы один курс».
5. Черновик из шага 1 достраивается: тот же `id`, статус `draft → recruiting`, аудит `group_wizard_completed`.

---

## PR 8.4 — бэкенд

### Task 1: подавление приглашения и активация

- [x] Сделано (§5.575, PR 8.4).

**Files:** Modify `mvp.service.ts` (`createEnrollment`/`createBulkEnrollments` — опция `{ suppressInvite?: boolean; activate?: boolean }` последним необязательным аргументом; `createGroupCourse` — аудит `learning.group_course_created` при переданном актора), тесты.

- [ ] Commit.

### Task 2: сервис мастера и ручки

- [x] Сделано (§5.575, PR 8.4): HTTP-случаи мастера — в стабе `mvp.http.integration.test.ts` (403/201), полный проход — в `group-wizard.service.test.ts`.

**Files:** Create `mvp/groups/group-wizard.dto.ts`, `mvp/groups/group-wizard.service.ts` (+ тест; оркестрация через `MvpService`: черновик/создание группы со статусом по дате, курсы, слушатели по строкам с разбором ФИО/СНИЛС и дедупом по `findLearnersByEmailOrSnils`, зачисления с активацией, доступы, ключ идемпотентности в коллекции снимка `groupWizardIdempotency` — регистрация в `mvp-collections.ts`), `mvp/groups/group-wizard-rows.ts` (+ тест: разбор строки «ФИО; должность; СНИЛС; email; телефон»); Modify `mvp.controller.ts` (`POST groups/wizard`, `GET groups/next-code`), `mvp.module.ts`, `mvp-collections.ts`, `bulk-partial-success.guard.test.ts` (DECIDED), `mvp.domains.http.integration.test.ts` (мастер: полный проход, повтор ключа, частичный успех, 403 без прав), `features/audit/labels.ts` (фразы), `error-text.ts` (если новые коды).

- [ ] Commit.

### Task 3: документация 8.4

- [x] Сделано (§5.575).

handoff §5.575, трекер (РМ48–РМ52, О11, МГ-B2 🔄), README, CLAUDE, журнал (письмо-приглашение до коммита; §8.2 редизайна «≤3 шагов»; аудит вне транзакции снимка). `pnpm ci:check`, PR.

## PR 8.5 — фронт (план после 8.4)

`features/groups/group-wizard/` (экран с `const STEPS = […]` и `<WizardSteps>`, шаги как компоненты одного уровня, `useUnsavedForm`, `EXPLAINED` для первичных кнопок), `GET /groups/next-code`, `DirectorySelect` контрагента (значение, без мутации группы), `StaffSelect` ответственного, курсы флажками, разбор строк слушателей на клиенте (общие правила), сводка с `OperationOutcome`, страница `/groups/new` переключается на мастер (короткая форма остаётся как запасной путь «Быстро создать» внутри шага 2? — нет: один путь, TXT-002).

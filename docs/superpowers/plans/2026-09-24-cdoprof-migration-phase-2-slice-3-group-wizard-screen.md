# Мастер создания группы — экран (Фаза 2, срез 8.5) — план

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking. План утверждён по поручению владельца (правила автономии ТЗ перехода).

**Goal:** Страница `/groups/new` становится мастером из четырёх шагов (ТЗ перехода §6.2, МГ-B2), который создаёт группу, курсы, слушателей и зачисления одним вызовом `POST /groups/wizard` (срез 8.4), с черновиком на сервере после шага 1 (РМ52) и сводкой частичного успеха.

**Architecture:** Экран `features/groups/group-wizard/group-wizard-screen.tsx` держит состояние всех шагов, `const STEPS = […]` и `<WizardSteps>`; шаги — компоненты одного уровня в `group-wizard-steps.tsx` (уровень 2 от страницы — сторож `page-templates-match-spec`); чистая логика (строки слушателей, сборка запроса, сводка результата) — `group-wizard-model.ts` с юнит-тестами. Клиент API — две функции в `features/mvp/api.ts` (`completeGroupWizard`, `nextGroupCode`) и типы в `types.ts`.

**Tech Stack:** Next.js 15, `@trudskill/ui` (`WizardSteps`, `Form`, `FormActions`, `DirectorySelect` через `ClientSelect`, `LearnerSelect`, `OperationOutcome`, `blockedProps`/`BlockedHint`), `useUnsavedForm`, vitest без React-монтирования.

**Spec:** `TZ_TRUDSKILL_CDOPROF_MIGRATION.md` §6.2; форма — `docs/TZ_UI_REDESIGN_TRUDSKILL.md` §7.4 (`TPL-004`, ≤4 шагов, 720px, `FormErrorSummary`), §13.2 бюджеты; поведение сервера — `docs/superpowers/plans/2026-09-24-cdoprof-migration-phase-2-slice-2-group-wizard.md` (РМ48–РМ52).

## Global Constraints

- Маршрут `/groups/new`, заголовок «Новая группа», строка §8.2 редизайна не меняется (РМ48; журнал 631).
- Один экран = один шаг (§6.2 «каждый ≤ 1 экрана»); одно первичное действие на шаг; кнопки называют результат («Далее: что и когда», «Создать группу», «Открыть группу») — сторож `button-names-result`.
- Никаких `<select>` с `.map(items` в файлах с `use*List` — сторож `directory-select-ratchet`; выбор компании — `ClientSelect`, слушателя — `LearnerSelect`, курсы — флажки.
- `disabled=` только по флагам занятости; недоступное — `blockedProps` + `BlockedHint` (сторож `disabled-explains-itself`).
- Без плейсхолдеров с ID (сторож `id-input-ban`), без `<style jsx>`, без хардкода цветов.
- `useUnsavedForm` на экране мастера (сторож `page-unsaved-changes`), защита снимается после успешного завершения (`saving: busy || Boolean(outcome)`).
- Мобильная проверка 360px: `WizardSteps` сам сворачивается в счётчик, таблицы — `DataTable`.

## Решения (журнал РМ трекера)

- **РМ53.** Способы добавления слушателей на шаге 3: (а) существующие — поиск по одному через `LearnerSelect` в список; (б) вставка списка построчно «ФИО; должность; СНИЛС; email; телефон» (разбор на клиенте только для предпросмотра — валидация на сервере, чтобы правила не разъезжались); (в) XLSX — не дублируется: после создания сводка ведёт на существующий импорт списком (`/admin/bulk-enrollments`, группа предвыбрана); «из сотрудников контрагента» — до МГ-C1.1/D2 (у слушателя нет `counterpartyId`, справочника сотрудников нет).
- **РМ54.** «Ответственный (по умолчанию я)»: выбор сотрудника (`StaffSelect`) требует права `tasks.write` (ручка `GET /tasks/staff`) — в мастере поле не показывается, `responsibleUserId` заполняется текущим пользователем; смена ответственного — в дровере карточки (B4.1), когда появится общий выбор сотрудника.
- **РМ55.** Даты шага 2: окончание и экзамен на клиенте не вычисляются — сервер подставляет `start + periodDays` центра и `exam = end` (`applyGroupDefaults`); экран подсказывает «пусто — по сроку центра». Часы курса и срок по умолчанию — когда появятся у курса (МГ-E1).
- **РМ56.** Черновик: «Далее» с шага 1 делает `POST /groups {status: 'draft'}` один раз; повторные правки шага 1 не шлют `PUT` — они уезжают в завершении мастера вместе с `group.draftId` (сервер достраивает черновик теми же полями). Уход со страницы после черновика — черновик остаётся в реестре под статусом «Черновик» (РМ52); вопрос «уйти без сохранения» задаётся, пока мастер не завершён.
- **РМ57.** Ключ идемпотентности — `crypto.randomUUID()` при открытии экрана; меняется только после ответа 4xx (повтор после сетевого сбоя вернёт прежний результат).

## Review Focus

1. Повторный клик «Создать группу» при медленной сети → второй запрос с тем же ключом возвращает прежний результат, вторая группа не создаётся (проверяется тестом модели: ключ стабилен между вызовами `buildWizardRequest`).
2. Строка слушателя с лишними пробелами/табами вместо «;» → разбор принимает табуляцию как разделитель (тест `parseLearnerLines`).
3. Пустые строки и строка-заголовок «ФИО; Должность; …» в вставке → пустые пропускаются, заголовок уходит на сервер и получает отказ строкой (не ломает пачку) — тест.
4. Переход к шагу 3 без курсов → кнопка объясняет «Выберите хотя бы один курс» (`blockedProps`), не молчит.
5. Сбой `POST /groups/wizard` после успешного черновика → ошибка показывается на шаге 4, черновик остаётся, ключ идемпотентности обновляется только при 4xx (тест модели `nextIdempotencyKey`).

---

## Task 1: клиент API и модель мастера

**Files:**

- Modify: `apps/frontend/src/features/mvp/types.ts` (+ `GroupWizardRequest`, `GroupWizardOutcome`, `GroupWizardOutcomeRow`, `WizardAccessMode`)
- Modify: `apps/frontend/src/features/mvp/api.ts` (+ `completeGroupWizard(session, payload)` → `POST /groups/wizard`; `nextGroupCode(session)` → `GET /groups/next-code` → `{ code }`)
- Modify: `apps/frontend/src/features/mvp/hooks.ts` (+ `completeGroupWizard` в `useDomainMutations` с `silentSuccessToast`; `useNextGroupCode()` через `useMvpQuery`)
- Modify: `apps/frontend/src/features/mvp/api.contract.test.ts` (+2 случая: конверт и тело)
- Create: `apps/frontend/src/features/groups/group-wizard/group-wizard-model.ts` — `parseLearnerLines(text): GroupWizardLearnerRow[]` (номер строки — физический номер в поле ввода, пустые пропускаются, разделитель `;` или таб), `buildWizardRequest(state, key): GroupWizardRequest`, `wizardOutcomeSummary(outcome): BulkOutcome` (`label` = «Строка N» или ФИО существующего, `reason` = `errorMessage`), `canProceed(step, state): { ok: true } | { ok: false; reason: string }`.
- Test: `apps/frontend/src/features/groups/group-wizard/group-wizard-model.test.ts`

**Interfaces:**

- Produces: `WizardState { name, code, counterpartyId, comment, courseIds: string[], startDate, endDate, examDate, studyForm, isDot?, existingLearnerIds: string[], learnerText, accessMode, message, draftId }`.

- [x] Тесты модели (5 случаев из Review Focus + сводка).
- [x] Реализация; `npx eslint … --max-warnings=0`; vitest по папке.
- [x] Commit `feat(frontend): клиент и модель мастера группы` (3679f25).

## Task 2: экран мастера

**Files:**

- Create: `apps/frontend/src/features/groups/group-wizard/group-wizard-screen.tsx` — `GroupWizardScreen`: `const STEPS = [{id:'who',title:'Кто учится'},{id:'what',title:'Что и когда'},{id:'learners',title:'Слушатели'},{id:'access',title:'Доступы и проверка'}]`, `<WizardSteps steps={STEPS} currentId={step} label="Шаги создания группы" onSelect>` (назад — можно, вперёд — нет), `useUnsavedForm(values, { saving: busy || Boolean(outcome) })`, `FormErrorSummary`, черновик (РМ56), завершение через `completeGroupWizard`, после результата — сводка `OperationOutcome` + «Открыть группу» (первичная), «Зачислить списком из файла» (ссылка на импорт), доступы: «Письма отправлены: N» / «Доступы выдадим позже».
- Create: `apps/frontend/src/features/groups/group-wizard/group-wizard-steps.tsx` — `StepWho` (название, код с предзаполнением из `useNextGroupCode` и подсказкой «по шаблону центра», `ClientSelect` с `emptyLabel="— без компании (физлица) —"` и предупреждением, комментарий), `StepWhat` (курсы флажками из `useCoursesList({page_size: 200, q})` с поиском, даты, форма обучения, ДОТ), `StepLearners` (`LearnerSelect` → список выбранных с удалением; `textarea` списка + предпросмотр `DataTable` разобранных строк), `StepAccess` (радио email/sheet/later — `sheet` через `blockedProps` «Лист доступов появится вместе с входом по логину (Фаза 6)», текст сообщения, сводка «что создадим»: название, компания, курсы, даты, слушателей N, кнопка «Создать группу»).
- Modify: `apps/frontend/app/groups/new/page.tsx` — рендерит `GroupWizardScreen`.
- Delete: `apps/frontend/src/features/groups/group-create-screen.tsx` (один путь создания — TXT-002); проверить импорты.
- Modify: `apps/frontend/src/e2e/primary-action-budget.e2e.test.ts` — `EXPLAINED` для `GroupWizardScreen`, если сторож посчитает >1 (кнопки шагов живут в `group-wizard-steps.tsx` без `PageContainer`, поэтому ожидается 1: «Открыть группу»).
- Test: `apps/frontend/src/e2e/group-wizard.e2e.test.ts` — динамический импорт экрана и шагов, маршрут `/groups/new` доступен куратору/менеджеру (`evaluateRouteAccess`), модель мастера в связке (`parseLearnerLines` → `buildWizardRequest` → форма запроса совпадает с DTO бэкенда: `courses[].courseId`, `learners.rows[].rowNumber`, `access.mode`).

- [x] Экран и шаги; `npx eslint`; typecheck.
- [x] Сторожа: `page-templates-match-spec`, `page-unsaved-changes`, `button-names-result`, `disabled-explains-itself`, `directory-select-ratchet`, `primary-action-budget`, `id-input-ban`, `unified-states`, `ia-architecture`, `route-*`; `features/groups`, `features/mvp`.
- [x] Commit `feat(frontend): мастер создания группы на /groups/new (Фаза 2, срез 8.5)`. Отклонения: `saveGroupDraft` (тихая мутация) вместо `PUT` по шагам; `EXPLAINED` не понадобился — в чанке экрана нет первичных кнопок; файл шагов — в `WITHOUT_GUARD` сторожа `page-unsaved-changes` (защита на экране).

## Task 3: документация 8.5

handoff §5.576, трекер (РМ53–РМ57, МГ-B2 ✅ по коду, «Где мы сейчас», очередь, сессия), README, CLAUDE, журнал (если найдено), план — галочки. `pnpm ci:check`, PR, слияние.

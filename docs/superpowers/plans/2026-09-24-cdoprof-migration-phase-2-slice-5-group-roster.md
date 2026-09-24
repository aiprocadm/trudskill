# Состав группы: отчисление с причиной и неявка (МГ-B7.1) — Фаза 2, срез 8.7 — план

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking. План утверждён по поручению владельца (правила автономии ТЗ перехода).

**Goal:** Вкладка «Слушатели» карточки группы становится рабочим составом (ТЗ перехода §6.3 МГ-B7.1): таблица со статусом и результатом, действия «Отчислить» (с причиной), «Приостановить»/«Возобновить», «Отметить неявку»/«Снять неявку» — через существующую ручку статуса и новую ручку результата.

**Architecture:** Бэкенд (8.7a): у зачисления появляется `resultCode` (`passed`/`failed`/`absent`, колонка 0107 `result_code` — проекция в колонку), ручка `PATCH /enrollments/:id/result` под `enrollments.change_status`, аудит `learning.enrollment_result_marked`; ЕИСОТ-реестр и переменные документов `group_learners` видят «не явился». Фронт (8.7b): `DataTable` с `rowActions` (`OverflowMenu`), подтверждение отчисления `useConfirmDialog` с обязательной причиной и `tone: 'danger'`, клиент API с `reason`.

**Tech Stack:** NestJS, class-validator, проекция `normalized-projection.ts`, `@trudskill/ui` (`DataTable`, `rowActions`, `useConfirmDialog`, `StatusChip`), vitest.

**Spec:** `TZ_TRUDSKILL_CDOPROF_MIGRATION.md` §6.3 МГ-B7.1 («отчисление = `PATCH /enrollments/:id/status` (`cancelled`, причина) — нужен экран; неявка — новый статус `absent`»); §4 статусы; миграция `0107_learning_enrollments_extend.sql` (решение: `absent` — код результата, не статус). Форма — ТЗ редизайна `TPL-002` (карточка), `CMP` таблица ≤7 колонок, Э3 (опасное действие называет объект и последствие).

## Global Constraints

- Машина состояний зачислений (`pending → active → completed`, `cancelled` из любого незавершённого) не меняется; контракт `PATCH /enrollments/:id/status` только расширяется (`reason` уже есть, добавляется ограничение длины 1000).
- `absent` НЕ становится статусом (0107, CHECK 0002 и истории статусов не трогаются) — журнал расхождений: ТЗ §4/§6.3 против 0107.
- Права только существующие: `enrollments.change_status` (manager, curator, platform_admin).
- Таблица состава ≤7 колонок; одно первичное действие карточки прежнее («Зачислить слушателя»); опасный диалог — `tone: 'danger'` + сообщение с объектом и последствием (сторож `irreversible-confirms-object`).

## Решения (журнал РМ трекера)

- **РМ61.** «Неявка» — не статус зачисления, а код результата `resultCode = 'absent'` (как решила миграция 0107: статус остаётся `pending/active/suspended/completed/cancelled`, CHECK 0002 не расширяется). Неявившийся остаётся в составе группы (для протокола он «не явился»), в ЕИСОТ-реестр не попадает, в `group_learners` документов идёт с `result = 'не явился'`. Снять неявку — `resultCode = null`. Требование ТЗ «новый статус `absent`» выполнено по смыслу (протокол и ЕИСОТ его видят), по форме — без нового статуса; расхождение записано.
- **РМ62.** Причина отчисления обязательна на экране (ТЗ «отчислить (с причиной)»), на сервере остаётся необязательной (контракт `EnrollmentStatusUpdateRequest` не ломается; переаттестация уже шлёт статус без причины). Причина пишется в историю статусов (`reason`) и в аудит.
- **РМ63.** Перевод в другую группу (P1, «отчисление + зачисление одной операцией») — не в этом срезе: очередь Фазы 2 держит P0; запись в трекере остаётся ⬜ с пометкой P1.
- **РМ64.** Ручка результата — отдельная `PATCH /enrollments/:id/result { resultCode: 'passed'|'failed'|'absent'|null, reason? }`, а не поле в ручке статуса: результат и статус меняются по разным поводам и разными людьми (результат позже проставит экзамен, Фаза 3); право то же — `enrollments.change_status`. Отметить результат нельзя у `cancelled`.

## Review Focus

1. Отчисление уже отчисленного / завершившего → 412 `domain_rule_violation` с русским текстом «Переход … невозможен» (сейчас текст английский — заменить; тест сервиса).
2. Неявка у отчисленного → 412; у `completed` — разрешено? Нет: результат `completed` ставит экзамен; `absent` у `completed` — 412 (тест).
3. Проекция: `resultCode` попадает в колонку `result_code`, а не только в payload; обратное чтение возвращает поле (тест проекции).
4. ЕИСОТ-реестр: `absent` не попадает в реестр, `cancelled` — как раньше (тест сервиса).
5. Фронт: причина пустая → кнопка подтверждения заблокирована (`input.required`), диалог называет ФИО и последствие «не сможет войти в курсы группы» (сторож).

---

## PR 8.7a — бэкенд

### Task 1: результат зачисления

**Files:** Modify `mvp/mvp.types.ts` (`EnrollmentResultCode`, `Enrollment.resultCode?`), `mvp/mvp.dto.ts` (`MarkEnrollmentResultRequest`; `reason` `@MaxLength(1000)` у статуса), `mvp/mvp.service.ts` (`markEnrollmentResult(tenantId, actorId, id, request, ctx)`: 412 для `cancelled` и для `absent` у `completed`; аудит `learning.enrollment_result_marked`; русский текст ошибки перехода статуса + код `enrollment_status_transition_invalid`), `mvp/mvp.controller.ts` (`PATCH enrollments/:id/result`, `enrollments.change_status`), `migration/backfill/normalized/normalized-projection.ts` (колонка `result_code` + ключ `resultCode`), `eisot-testing-registry.service.ts` (`resultCode !== 'absent'`), `documents/pillar-a-variables.ts` (`result`/`result_code` в `GroupLearnerView`), фронт `features/audit/labels.ts` (фраза), `lib/errors/error-text.ts` (статья `enrollment_status_transition_invalid`), `mvp.http.integration.test.ts` (403/200 для `/result`).
**Tests:** `mvp.service.test.ts` (+3), `eisot-testing-registry.service.test.ts` (+1), проекция (+1), HTTP (+2).

- [x] Тесты → код → lint/typecheck → commit (1354bdb). Отклонение: код ошибки перехода остался `domain_rule_violation` (новый код потребовал бы статьи и реестра), текст — русский словами статусов.

### Task 2: документация 8.7a — [x] сделано (§5.578) — handoff §5.578, трекер (РМ61–РМ64, МГ-B7.1 🔄), README, CLAUDE, журнал (ТЗ «статус absent» ↔ 0107), `pnpm ci:check`, PR, слияние.

## PR 8.7b — фронт

### Task 3: состав группы

**Files:** Modify `features/mvp/api.ts` (`updateEnrollmentStatus(session, id, status, reason?)`, `markEnrollmentResult`), `hooks.ts` (мутации), `types.ts` (`Enrollment.resultCode?`), `screen-helpers.tsx` (`ENROLLMENT_RESULT_LABEL`), `groups/group-details-screen.tsx` («Слушатели группы» → `DataTable` колонки: Слушатель (ссылка), Статус (чип), Результат, Зачислен, Прокторинг (select как был, под `learners.write`); `rowActions` под `enrollments.change_status`: «Приостановить»/«Возобновить» (по переходам), «Отметить неявку»/«Снять неявку», «Отчислить» (danger, `useConfirmDialog` с `input.required` и сообщением `${ФИО} не сможет войти в курсы группы …`)), `api.contract.test.ts` (+1 с `reason`), `group-details` e2e/сторожа (`disabled-explains-itself`, `directory-select-ratchet` — select остаётся один, `irreversible-confirms-object`, `button-names-result`).

- [ ] Экран, клиент; сторожа; commit.

### Task 4: документация 8.7b — handoff §5.579, трекер (МГ-B7.1 ✅ по коду кроме перевода P1), README, CLAUDE, `pnpm ci:check`, PR, слияние.

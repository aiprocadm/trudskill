# «Копировать группу» (МГ-B6.1) — Фаза 2, срез 8.6 — план

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking. План утверждён по поручению владельца (правила автономии ТЗ перехода).

**Goal:** В карточке группы появляется действие «Копировать группу»: мастер `/groups/new` открывается с предзаполнением (ТЗ перехода §6.2, §6.3 МГ-B6.1) — те же компания, курсы, настройки и слушатели (по выбору), код новый, даты сдвинуты на разницу «сегодня − начало».

**Architecture:** Копия — это мастер с начальным состоянием, а не новая ручка: страница `/groups/new` читает `searchParams.copyOf` (как страница результата теста читает `attemptId`) и передаёт `copyOf` экрану; экран грузит группу, её курсы и зачисления и один раз строит `WizardState` через чистую `copyStateFrom` (модель мастера). Сервер получает обычный `POST /groups/wizard` с необязательным `copyOfGroupId` — только для аудита (метаданные `learning.group_wizard_completed`), поведение не меняется.

**Tech Stack:** Next.js 15 (async `searchParams`), `@trudskill/ui`, модель мастера `group-wizard-model.ts`, vitest.

**Spec:** `TZ_TRUDSKILL_CDOPROF_MIGRATION.md` §6.2 («при копировании группы мастер открывается с предзаполнением»), §6.3 МГ-B6.1; форма — ТЗ редизайна `TPL-004`/`TPL-002`.

## Global Constraints

- URL/RBAC/контракты только добавляются: новый маршрут не нужен (`/groups/new?copyOf=`), право — `groups.write` (как у создания), поле DTO — необязательное.
- Кнопки называют результат («Копировать группу» в карточке; в мастере остаётся «Создать группу»), бюджеты карточки (`primary-action-budget` EXPLAINED уже есть), `disabled-explains-itself` (без новых `disabled=` по условию).
- Даты считаются на клиенте один раз при предзаполнении (человек их видит и правит), «сегодня» — местная дата браузера.

## Решения (журнал РМ трекера)

- **РМ58.** Копия = мастер с предзаполнением (без отдельной ручки «копировать»): сервер получает тот же `POST /groups/wizard` (черновик после шага 1, частичный успех, идемпотентность) с необязательным `copyOfGroupId` для аудита. Название копии — `«<имя> (копия)»`, код — пустой (новый по шаблону центра), ответственный — я.
- **РМ59.** «Слушатели по выбору»: в копию попадают слушатели с незавершёнными зачислениями исходной группы (не `cancelled`), шаг 3 показывает их списком с «Убрать из группы» по одному и «Убрать всех» — выбор делается вычёркиванием, а не отдельным вопросом. Доступы в копии — «позже» по умолчанию (люди уже в системе; письмо-приглашение им не нужно), можно переключить.
- **РМ60.** Сдвиг дат: `delta = сегодня − начало` исходной группы (в днях); начало, окончание и экзамен сдвигаются на `delta`; если у исходной нет начала — даты пустые (сервер подставит по сроку центра). Прошедшие даты после сдвига невозможны (начало = сегодня).

## Review Focus

1. Копия группы, где начало было 5 недель назад, а окончание — через 2 недели после начала → начало = сегодня, окончание = сегодня + 14 (тест `copyStateFrom`).
2. Исходная группа без дат → даты копии пустые, не `NaN`/`Invalid Date` (тест).
3. Зачисления `cancelled` не копируются; дубли `learnerId` (две записи одного слушателя) — один раз (тест).
4. `copyOf` ведёт на чужую/несуществующую группу → мастер показывает «Группа не найдена» с ссылкой на реестр, а не пустой мастер под чужим именем (экран: `notFound`).
5. Предзаполнение не считается «несохранёнными изменениями»: `useUnsavedForm` с `baselineKey`, меняющимся после загрузки копии.

---

## Task 1: модель копии + DTO-поле аудита

**Files:**

- Modify: `apps/frontend/src/features/groups/group-wizard/group-wizard-model.ts` — `addDaysIso(iso, days)`, `daysBetweenIso(from, to)`, `todayLocalIso()`, `copyStateFrom(source: { group: Group; courseIds: string[]; enrollments: Array<{ learnerId; status }> }, today: string): WizardState`; `WizardState.copyOfGroupId: string | null`; `buildWizardRequest` добавляет `copyOfGroupId`.
- Modify: `apps/frontend/src/features/mvp/types.ts` — `GroupWizardRequest.copyOfGroupId?: string`.
- Modify: `apps/backend/src/modules/mvp/groups/group-wizard.dto.ts` — `@IsOptional() @IsString() copyOfGroupId?: string`; `group-wizard.service.ts` — `newValues.copyOfGroupId` в аудите (+ проверка, что группа-источник принадлежит центру: `mvp.getGroup(tenantId, copyOfGroupId)` → 404 чужой/несуществующей).
- Test: `group-wizard-model.test.ts` (+3 из Review Focus), `group-wizard.service.test.ts` (+1: аудит с `copyOfGroupId`, чужой id → NotFound).

- [x] Тесты → реализация → lint/typecheck → commit (в одном коммите с Task 2: dd44c46).

## Task 2: карточка и мастер

**Files:**

- Modify: `apps/frontend/app/groups/new/page.tsx` — `async` страница с `searchParams: Promise<{ copyOf?: string }>` → `<GroupWizardScreen copyOf={copyOf} />`.
- Modify: `group-wizard-screen.tsx` — проп `copyOf?: string`; `useGroup(copyOf)`, `useGroupCourses(copyOf)`, `useEnrollments({ group_id: copyOf, page_size: 200 })` (хуки с пустым id не дёргать: `enabled` через `copyOf ?? ''` и условный рендер); один раз `setState(copyStateFrom(...))`; `useUnsavedForm(..., { baselineKey })`; подзаголовок «Копия группы «X» — проверьте даты и состав»; `notFound` → `RecordNotFound`.
- Modify: `group-wizard-steps.tsx` — `StepLearners`: «Убрать всех» при ≥2 выбранных; подсказка «Слушатели скопированы из группы — уберите лишних» при `copyOfGroupId`.
- Modify: `group-details-screen.tsx` — `secondaryActions` + «Копировать группу» под `canAssignCourse` → `router.push(`/groups/new?copyOf=${id}`)` (`useRouter` из `next/navigation`).
- Test: `group-wizard.e2e.test.ts` (+ случай: `copyStateFrom` → `buildWizardRequest` несёт `copyOfGroupId`, даты сдвинуты).

- [x] Экран, карточка, страница; сторожа `src/e2e`, `features/groups`; commit. Отклонение: экран разделён на `GroupCopyLoader` + `GroupWizardForm({ initial })` вместо `baselineKey` — форма стартует с готовым состоянием, условных хуков нет.

## Task 3: документация 8.6

- [x] Сделано (§5.577).

handoff §5.577, трекер (РМ58–РМ60, МГ-B6.1 ✅, «Где мы сейчас», очередь, сессия), README, CLAUDE, журнал (если найдено), план — галочки. `pnpm ci:check`, PR, слияние.

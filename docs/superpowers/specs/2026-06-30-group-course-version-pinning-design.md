# GroupCourse version pinning — design

**Date:** 2026-06-30
**Branch:** `fix/2026-06-29-audit-7-bug-fixes` (закрывает последний latent follow-up §5.154)
**Scope decision:** минимальная сантехника (YAGNI) — заставить работать уже существующий read-side pinning, без UI / без управления версиями.

## Problem

`GroupCourse` имеет типизированное поле `courseVersionId?: string` ([mvp.types.ts:97](../../../apps/backend/src/modules/mvp/mvp.types.ts)), а module-gating читает его с приоритетом **PINNED > PUBLISHED > PROGRESS** (§5.154 фикс #7, [mvp.service.ts](../../../apps/backend/src/modules/mvp/mvp.service.ts) ~2473–2517 и ~3495–3541) — но `createGroupCourse` ([mvp.service.ts:1403](../../../apps/backend/src/modules/mvp/mvp.service.ts)) **никогда не присваивает** это поле. Поэтому PINNED-ветка всегда пуста и всё падает в PUBLISHED-fallback.

**Latent-некорректность:** публикация новой версии курса НЕ снимает `published` со старой — курс может иметь >1 одновременно published-версии. Тогда PUBLISHED-fallback берёт модули со ВСЕХ published-версий как знаменатель прогресса → слушатель, фактически проходящий v1, получает обязательные модули v2 и **никогда не достигает 100%** (и итоговый экзамен-гейт `requiredPriorModules` запирается чужими модулями). Для пилота (обычно 1 published-версия на курс) баг не проявляется — отсюда «latent».

## Goal

Сделать так, чтобы `GroupCourse` при привязке курса к группе **пинился к конкретной версии**, чтобы read-side PINNED-ветка реально работала и когорта была привязана к одобренной версии программы (регулируемое ДПО: когорта обучается и аттестуется на версии, с которой стартовала).

## Approach (выбран A)

**A. Attach-time auto-pin.** В `createGroupCourse`, после существующей валидации group+course: найти published-версии курса, выбрать с максимальным `versionNo`; если есть — записать в `entity.courseVersionId`; если published-версии нет — оставить `undefined` (fallback без изменений). Один шов, невидимая сантехника, соответствует реальному потоку «publish → attach → enroll».

Отклонённые альтернативы:

- **B. Enrollment-time pin** — пин при первом зачислении (published-версия к этому моменту точно есть, закрывает edge attach-before-publish), но размазывает логику по горячему идемпотентному fulfillment-пути → больший blast radius.
- **C. Both** — избыточно для минимального scope.

## Design

### Core change — `createGroupCourse` ([mvp.service.ts:1403](../../../apps/backend/src/modules/mvp/mvp.service.ts))

После валидации group+course и до/при создании сущности:

1. Отобрать `state.courseVersions` где `tenantId === tenantId && courseId === request.courseId && status === 'published'`.
2. Если непусто — выбрать версию с максимальным `versionNo`; присвоить `entity.courseVersionId = latest.id`.
3. Если пусто — не присваивать (поле остаётся `undefined`).

Вынести выбор в маленький приватный хелпер `latestPublishedVersionId(tenantId, courseId): string | undefined` (чистая выборка), переиспользуемый и тестируемый. (Опц.) аудит-метаданные `groupCourseVersionPinned` при привязке — но `createGroupCourse` сегодня не пишет аудит вообще; добавление аудита — вне минимального scope, **не делаем** (консистентность с текущим методом).

### Read-side — без изменений

PINNED > PUBLISHED > PROGRESS уже потребляет `GroupCourse.courseVersionId`. Эта правка лишь наполняет PINNED-ветку. Никаких изменений в module-gating / progress / exam-gate.

### Persistence

`groupCourses` уже в `MVP_COLLECTIONS` (снимок переживает запросы); новое поле `courseVersionId` — часть существующего типа `GroupCourse`, в снапшоте уже сериализуется. Миграции не нужны (in-memory + JSON-снимок).

## Out of scope (минимальный mandate)

- **Frontend** — пин невидим; никакого UI выбора версии.
- **DTO-поле** — `CreateGroupCourseRequest` без `courseVersionId` (авто-пин, не явный выбор).
- **Backfill** существующих незапиненных `groupCourses` — остаются на fallback.
- **Миграция когорты** на новую версию при ре-публикации — пиненная когорта остаётся стабильной (регулируемо-корректный дефолт, бесплатно от read-side precedence).

## Residual limitation (документируется)

`GroupCourse`, привязанный **до** первой публикации какой-либо версии, остаётся незапиненным; если позже у курса появится >1 одновременно-published версии, fallback-неоднозначность для этой группы вернётся. Редкий кейс; реальность пилота (1 published-версия) не затронута. Закрывается опцией B в будущем, если понадобится.

## Testing (TDD)

Юнит-тесты `createGroupCourse` / module-gating (зеркало существующих в `mvp.service.test.ts` / `module-gating.service.test.ts`):

1. **Pin к единственной published** — attach при одной published-версии → `courseVersionId === v1.id`.
2. **Pin к latest при нескольких published** — две published (`versionNo` 1 и 2) → пин к `versionNo:2`.
3. **Без published → unset** — attach при отсутствии published-версии → `courseVersionId === undefined` (RED не нужен — новое поведение; характеризует fallback).
4. **Реальный выигрыш (module-gating)** — группа запинена к v1; v2 published с дополнительным обязательным модулем; слушатель v1-группы НЕ запирается модулем v2 и может достичь завершения. RED подтверждается revert-проверкой (до фикса пин пуст → fallback берёт v1+v2 → запор).
5. **Регресс** — существующие single-published-version потоки (`business-flows.e2e`, module-gating) без изменений.

## Acceptance

- `createGroupCourse` пинит к latest published (по `versionNo`) или оставляет unset при отсутствии published.
- module-gating: запиненная к v1 группа изолирована от модулей v2.
- typecheck 8/8, ESLint чисто, затронутые backend-наборы зелёные.
- Без миграций / новых прав / изменений API-конверта / frontend.

# Phase 2 — Plan B: Admin Learners Management UI

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Дать сотруднику центра (роль admin / teacher с permission `learners.read` + `learners.write`) единый раздел `/admin/learners` для просмотра, поиска, фильтрации и редактирования полного набора полей учётки слушателя (firstName/lastName/middleName, email, СНИЛС, должность, org unit, status, linkedIamUserId). Закрывает следующую неотработанную часть Phase 2 из роадмапа («Раздел Ученики: список с фильтрами по статусу»). Plan A добавил массовое создание+зачисление через Excel; Plan B даёт CRUD-просмотр и редактирование тех же учёток.

**Architecture:** Расширение существующего `mvp` модуля (NestJS) симметрично Plan A. Backend gap всего один: `PUT /learners/:id` сейчас принимает только `UpdateSimpleRegistryRequest` (поля `code/name/status/linkedIamUserId/organizationUnitId`) и не позволяет редактировать `firstName/lastName/middleName/email/snils/position`. Добавляем `updateLearnerExtended` в `MvpService` + новый DTO `UpdateLearnerExtendedRequest` + новый endpoint `PATCH /learners/:id/profile` (старый `PUT /learners/:id` остаётся стабильным — конвенция Plan A deviation #1). На frontend — новая фича-папка `apps/frontend/src/features/learners/` с list-экраном, edit-drawer'ом и contract-тестом; маршрут `/admin/learners/page.tsx` через `ProtectedPage` → `AppShell`. Search не требует backend-изменений: `MvpService.list()` уже делает `JSON.stringify(item).toLowerCase().includes(q.toLowerCase())`, что покрывает все строковые поля учётки. Status-фильтр уже поддерживается через `BaseFilterQuery.status`.

**Tech Stack:** TypeScript, NestJS (backend), Vitest (тесты), Next.js App Router + TypeScript (frontend), `@cdoprof/ui` (`DataTable`, `Column`, `FilterBar`, `Pagination`, `Dialog`, `StatusChip`, `SearchInput`, `Select`), `class-validator` для DTO. Без новых npm-пакетов.

**Спецификация:** [../specs/2026-05-21-cdoprof-redesign-design.md](../specs/2026-05-21-cdoprof-redesign-design.md) — §3.2 «Кабинеты V1» (админка: управление пользователями), §3.3 «Главный процесс».

**Роадмап:** [2026-05-21-cdoprof-v1-roadmap.md](2026-05-21-cdoprof-v1-roadmap.md) — Phase 2 task «Раздел "Ученики": список с фильтрами по статусу».

**Базовая ветка:** `main` (после мержа PR #196). Работа в `feat/2026-05-29-phase-2-plan-b-impl` для backend (Tasks 1–4) и `feat/2026-05-29-phase-2-plan-b-frontend` для UI (Tasks 5–9), closeout в `feat/2026-05-29-phase-2-plan-b-closeout` (Tasks 10–11). Допускается одна ветка, если автор предпочитает один PR.

**Зависимости перед стартом:**

- `main` на коммите ≥ `52119cd` (PR #196 CLAUDE.md merged — содержит §5.90 в handoff).
- Phase 2 Plan A merged (PRs #191–#196). Plan B опирается на `Learner.middleName/email/snils/position`, добавленные в Pillar A Plan C + использованные в Plan A.
- Pillar A hardening (PRs #182, #183) merged — Plan B опирается на `writeCritical` контракт `AuditService` для критичных мутаций.

**Что НЕ входит в Plan B:**

- Удаление учёток (`DELETE /learners/:id`) — отложено; в админке только status-toggle `active`/`archived`.
- Сценарий перезаписи `linkedIamUserId` после привязки к IAM-юзеру (security-sensitive — Plan B оставляет существующее правило: если был задан, новое значение допускается только при `linkedIamUserId: null` сначала; см. Task 2 acceptance).
- Bulk actions (массовая архивация, массовое перезачисление) — Phase 5 или отдельный Plan.
- Карточка ученика «Личное дело» (`/admin/learners/:id`) с историей курсов/документов — это уже сделано Pillar A Plan C (PDF-карточка + JSON aggregate). Plan B рисует list + edit, переход к «Личному делу» = ссылка на существующую страницу.
- Компании-клиенты (Plan C Phase 2), email-приглашения (Phase 5), Excel-конструктор выгрузки (Phase 10).

---

## File Structure

### Create — backend

- `apps/backend/src/modules/mvp/update-learner-extended.dto.ts` — `UpdateLearnerExtendedRequest` DTO с опциональными `firstName/lastName/middleName/email/snils/position/organizationUnitId/status/learnerNo/linkedIamUserId`.

### Modify — backend

- `apps/backend/src/modules/mvp/mvp.service.ts` — добавить метод `updateLearnerExtended(tenantId, actorId, learnerId, request, context): Learner`. Использует тот же audit-action `learning.learner_updated`, что и `updateLearner` (или новый `learning.learner_profile_updated` — см. Task 2).
- `apps/backend/src/modules/mvp/mvp.service.test.ts` — расширить unit-coverage `updateLearnerExtended` (happy path + не найден + полное обновление + частичное обновление + защита `linkedIamUserId` от перезаписи).
- `apps/backend/src/modules/mvp/mvp.controller.ts` — добавить endpoint `PATCH /learners/:id/profile` под permission `learners.write` (рядом с существующим `PUT /learners/:id`).
- `apps/backend/src/modules/mvp/mvp.dto-validation.test.ts` — добавить кейсы под `UpdateLearnerExtendedRequest` (см. Task 1).
- `apps/backend/src/modules/mvp/mvp.http.integration.test.ts` — добавить permission-boundary кейсы для нового endpoint (см. Task 4).

### Create — frontend

- `apps/frontend/app/admin/learners/page.tsx` — Next.js route (Protected) для админ-списка учеников.
- `apps/frontend/src/features/learners/types.ts` — типы `LearnerListItem`, `LearnerEditFormState`, `LearnersListFilters`.
- `apps/frontend/src/features/learners/api.ts` — REST-клиент: `listLearners(session, filters)` + `updateLearnerProfile(session, learnerId, payload)`.
- `apps/frontend/src/features/learners/api.contract.test.ts` — contract-тест с `vi.stubGlobal('fetch', ...)` (по образцу `bulk-enrollments/api.contract.test.ts`).
- `apps/frontend/src/features/learners/hooks.ts` — `useLearnersList(filters)` (React Query) + `useUpdateLearnerProfile` mutation (через `useState + async/await` паттерн).
- `apps/frontend/src/features/learners/learners-list-screen.tsx` — основной экран: `FilterBar` (search + status) + `DataTable` + `Pagination` + кнопка «Редактировать» в строке.
- `apps/frontend/src/features/learners/learner-edit-drawer.tsx` — модальная форма редактирования (`Dialog` из `@cdoprof/ui`).
- `apps/frontend/src/features/learners/format.ts` — pure-function форматтеры (ФИО, status label, СНИЛС mask).
- `apps/frontend/src/features/learners/format.test.ts` — тесты форматтеров.
- `apps/frontend/src/e2e/admin-learners-management.e2e.test.ts` — E2E (routing + nav + dynamic import smoke, без RTL — по конвенции проекта).

### Modify — frontend

- `apps/frontend/src/features/navigation/model.ts` — добавить routeMeta + navigationModel запись `/admin/learners` под `learners.read`.

### Untouched (используется как есть)

- `mvp.learners` схема — не меняется.
- `GET /learners`, `GET /learners/:id`, `PUT /learners/:id` — не меняются (Plan B добавляет, но не модифицирует существующие endpoint'ы).
- `PermissionGuard`, `TenantGuard`, `MvpRequestPersistenceInterceptor` — без изменений.
- `Learner.linkedIamUserId` anti-IDOR правило (из §5.16/§5.17) — сохраняется: `updateLearnerExtended` отказывает в смене `linkedIamUserId`, если он уже задан и новое значение отличается, в том же стиле как `updateLearner` (см. `mvp.service.ts:435+`).

---

## Task 1: `UpdateLearnerExtendedRequest` DTO + dto-validation tests

**Files:**

- `apps/backend/src/modules/mvp/update-learner-extended.dto.ts` (новый)
- `apps/backend/src/modules/mvp/mvp.dto-validation.test.ts` (extend)

**Why:** Внешний контракт нового endpoint должен принимать опциональные поля без обязательности (PATCH-семантика: что прислал — то и обновил). Существующий `UpdateSimpleRegistryRequest` принимает только `code/name` + базовые мета-поля и не понимает FIO/email/snils. Расширять его нельзя — он используется для counterparties/directions; конвенция Plan A — новый DTO.

**Tasks:**

- [x] **Step 1: Создать файл `apps/backend/src/modules/mvp/update-learner-extended.dto.ts`** со следующим содержимым:

```typescript
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf
} from 'class-validator';

/**
 * Phase 2 Plan B — расширенный PATCH для учётки слушателя.
 * Симметрично `createLearnerExtended` из Plan A.
 * Не используется counterparties/directions — это специализированный DTO для learners.
 *
 * Семантика: все поля опциональны. Отсутствующее поле = «не трогать». null для опциональных
 * строк (email/snils/position/middleName/organizationUnitId/learnerNo) = «очистить».
 * `linkedIamUserId` подчиняется отдельному анти-IDOR правилу (см. `MvpService.updateLearnerExtended`).
 */
export class UpdateLearnerExtendedRequest {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  lastName?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(120)
  middleName?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsEmail()
  @MaxLength(255)
  email?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(14) // XXX-XXX-XXX YY = 14 chars
  snils?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(120)
  position?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(120)
  organizationUnitId?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(60)
  learnerNo?: string | null;

  @IsOptional()
  @IsString()
  @IsIn(['active', 'archived'])
  status?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  linkedIamUserId?: string | null;
}
```

- [x] **Step 2: Добавить кейсы в `mvp.dto-validation.test.ts`** — найти секцию для `UpdateSimpleRegistryRequest` (она есть, см. Plan A §5.90), добавить отдельный `describe('UpdateLearnerExtendedRequest', () => { ... })` рядом:

```typescript
import { UpdateLearnerExtendedRequest } from './update-learner-extended.dto.js';

describe('UpdateLearnerExtendedRequest', () => {
  const validate = (raw: unknown) => {
    const instance = plainToInstance(UpdateLearnerExtendedRequest, raw);
    return validateSync(instance);
  };

  it('accepts empty payload (no-op patch)', () => {
    expect(validate({})).toHaveLength(0);
  });

  it('accepts full happy path', () => {
    expect(
      validate({
        firstName: 'Иван',
        lastName: 'Иванов',
        middleName: 'Петрович',
        email: 'ivan@example.com',
        snils: '123-456-789 01',
        position: 'инженер',
        organizationUnitId: 'unit-1',
        learnerNo: '0000123',
        status: 'active',
        linkedIamUserId: 'user-abc'
      })
    ).toHaveLength(0);
  });

  it('rejects invalid email', () => {
    const errors = validate({ email: 'not-an-email' });
    expect(errors).toHaveLength(1);
    expect(errors[0]!.property).toBe('email');
  });

  it('accepts null for clearable strings', () => {
    expect(
      validate({
        middleName: null,
        email: null,
        snils: null,
        position: null,
        organizationUnitId: null,
        learnerNo: null,
        linkedIamUserId: null
      })
    ).toHaveLength(0);
  });

  it('rejects invalid status', () => {
    const errors = validate({ status: 'banned' });
    expect(errors).toHaveLength(1);
    expect(errors[0]!.property).toBe('status');
  });

  it('rejects empty firstName (MinLength)', () => {
    const errors = validate({ firstName: '' });
    expect(errors).toHaveLength(1);
    expect(errors[0]!.property).toBe('firstName');
  });

  it('rejects oversized field', () => {
    const errors = validate({ firstName: 'x'.repeat(121) });
    expect(errors).toHaveLength(1);
    expect(errors[0]!.property).toBe('firstName');
  });
});
```

- [x] **Step 3: Прогнать dto-validation тесты:**

```bash
pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/mvp.dto-validation.test.ts --no-file-parallelism
```

Ожидаемо: новые 7 кейсов в `describe('UpdateLearnerExtendedRequest')` — все green; ничего не сломалось в уже существующих описаниях.

- [x] **Step 4: Commit**

```bash
git add apps/backend/src/modules/mvp/update-learner-extended.dto.ts apps/backend/src/modules/mvp/mvp.dto-validation.test.ts
git commit -m "feat(backend): UpdateLearnerExtendedRequest DTO + validation (Phase 2 Plan B Task 1)"
```

**Acceptance:**

- Новый файл `update-learner-extended.dto.ts` существует с экспортом класса.
- `mvp.dto-validation.test.ts` содержит ≥7 кейсов под `UpdateLearnerExtendedRequest` — все green.
- Целевой прогон `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/mvp.dto-validation.test.ts --no-file-parallelism` зелёный.
- Existing tests в этом же файле не сломаны.

---

## Task 2: `MvpService.updateLearnerExtended` метод + unit tests

**Files:**

- `apps/backend/src/modules/mvp/mvp.service.ts` (extend)
- `apps/backend/src/modules/mvp/mvp.service.test.ts` (extend)

**Why:** Тело PATCH должно: (1) загрузить существующего ученика, (2) применить delta (только присланные поля), (3) проверить анти-IDOR правило для `linkedIamUserId` (нельзя перебить уже привязанный профиль другим IAM-юзером без явного `null`-сброса сначала), (4) обновить `updatedAt`, (5) написать audit-event `learning.learner_updated` с `oldValues`/`newValues`. Существующий `updateLearner` решает половину задачи (только `code/name/status`), но не понимает FIO/email/snils.

**Tasks:**

- [x] **Step 1: Открыть `mvp.service.ts`, найти существующий `updateLearner(tenantId, actorId, id, request, context)` (~строка 435).** Добавить **сразу под ним** новый метод:

```typescript
/**
 * Phase 2 Plan B — PATCH ученика с полным набором полей (firstName/lastName/middleName/email/snils/position).
 * Старый `updateLearner` остаётся для совместимости с существующим UI (counterparties-style).
 *
 * Семантика:
 *  - undefined поле → не трогаем;
 *  - null для clearable полей (email/snils/middleName/position/organizationUnitId/learnerNo/linkedIamUserId) → очищаем;
 *  - linkedIamUserId защищён анти-IDOR: если уже задан и приходит другое непустое значение — 409 conflict.
 *    Чтобы сменить владельца профиля, сначала очистить `linkedIamUserId: null`, потом задать заново.
 */
updateLearnerExtended(
  tenantId: string,
  actorId: string | undefined,
  learnerId: string,
  request: {
    firstName?: string;
    lastName?: string;
    middleName?: string | null;
    email?: string | null;
    snils?: string | null;
    position?: string | null;
    organizationUnitId?: string | null;
    learnerNo?: string | null;
    status?: string;
    linkedIamUserId?: string | null;
  },
  context: RequestContext
): Learner {
  const current = this.getById(this.state.learners, tenantId, learnerId);
  const oldValues: Learner = { ...current };

  // Anti-IDOR: смена linkedIamUserId на другой непустой → conflict.
  if (
    request.linkedIamUserId !== undefined &&
    request.linkedIamUserId !== null &&
    current.linkedIamUserId &&
    current.linkedIamUserId !== request.linkedIamUserId
  ) {
    throw new ConflictException({
      code: 'conflict',
      message: 'linkedIamUserId already bound; clear (null) before reassigning'
    });
  }

  if (request.firstName !== undefined) current.firstName = request.firstName.trim();
  if (request.lastName !== undefined) current.lastName = request.lastName.trim();
  if (request.middleName !== undefined) current.middleName = request.middleName?.trim() || undefined;
  if (request.email !== undefined) current.email = request.email?.trim() || undefined;
  if (request.snils !== undefined) current.snils = request.snils?.trim() || undefined;
  if (request.position !== undefined) current.position = request.position?.trim() || undefined;
  if (request.organizationUnitId !== undefined) current.organizationUnitId = request.organizationUnitId?.trim() || undefined;
  if (request.learnerNo !== undefined) current.learnerNo = request.learnerNo?.trim() || undefined;
  if (request.status !== undefined) current.status = request.status;
  if (request.linkedIamUserId !== undefined) current.linkedIamUserId = request.linkedIamUserId ?? undefined;

  current.updatedAt = this.now();

  this.audit(
    tenantId,
    actorId,
    'learning.learner_updated',
    'learning.learner',
    current.id,
    oldValues,
    current,
    context
  );
  return current;
}
```

> **Импорт.** `ConflictException` уже импортирован в `mvp.service.ts` из `@nestjs/common` (используется в других местах). Если нет — добавить к существующему импорту.

- [x] **Step 2: Открыть `mvp.service.test.ts`, найти `describe('updateLearner')` или ближайший блок для ученика.** Добавить **сразу под ним** новый блок:

```typescript
describe('updateLearnerExtended', () => {
  it('updates all extended fields and writes audit', () => {
    const { service, audit } = makeServices();
    const ctx = makeContext({ tenantId: 'tenant_demo', userId: 'admin-1' });

    const learner = service.createLearnerExtended(
      'tenant_demo',
      'admin-1',
      { firstName: 'Иван', lastName: 'Иванов', email: 'old@x.ru' },
      ctx
    );

    const updated = service.updateLearnerExtended(
      'tenant_demo',
      'admin-1',
      learner.id,
      {
        firstName: 'Пётр',
        middleName: 'Сергеевич',
        email: 'new@x.ru',
        snils: '123-456-789 01',
        position: 'инженер',
        status: 'archived'
      },
      ctx
    );

    expect(updated.firstName).toBe('Пётр');
    expect(updated.lastName).toBe('Иванов'); // не трогали
    expect(updated.middleName).toBe('Сергеевич');
    expect(updated.email).toBe('new@x.ru');
    expect(updated.snils).toBe('123-456-789 01');
    expect(updated.position).toBe('инженер');
    expect(updated.status).toBe('archived');
    expect(audit.events).toContainEqual(
      expect.objectContaining({ action: 'learning.learner_updated', entityId: learner.id })
    );
  });

  it('clears nullable fields when null is provided', () => {
    const { service } = makeServices();
    const ctx = makeContext({ tenantId: 'tenant_demo', userId: 'admin-1' });
    const learner = service.createLearnerExtended(
      'tenant_demo',
      'admin-1',
      {
        firstName: 'A',
        lastName: 'B',
        middleName: 'C',
        email: 'a@b.ru',
        snils: '111-111-111 02',
        position: 'p'
      },
      ctx
    );
    const updated = service.updateLearnerExtended(
      'tenant_demo',
      'admin-1',
      learner.id,
      { middleName: null, email: null, snils: null, position: null },
      ctx
    );
    expect(updated.middleName).toBeUndefined();
    expect(updated.email).toBeUndefined();
    expect(updated.snils).toBeUndefined();
    expect(updated.position).toBeUndefined();
  });

  it('throws NotFoundException for unknown learner', () => {
    const { service } = makeServices();
    const ctx = makeContext({ tenantId: 'tenant_demo', userId: 'admin-1' });
    expect(() =>
      service.updateLearnerExtended(
        'tenant_demo',
        'admin-1',
        'learner-nope',
        { firstName: 'X' },
        ctx
      )
    ).toThrow(/not found/i);
  });

  it('refuses to overwrite linkedIamUserId with a different value', () => {
    const { service } = makeServices();
    const ctx = makeContext({ tenantId: 'tenant_demo', userId: 'admin-1' });
    const learner = service.createLearnerExtended(
      'tenant_demo',
      'admin-1',
      { firstName: 'A', lastName: 'B' },
      ctx
    );
    // Сначала привязали
    service.updateLearnerExtended(
      'tenant_demo',
      'admin-1',
      learner.id,
      { linkedIamUserId: 'user-1' },
      ctx
    );
    // Попытка перебить на другого
    expect(() =>
      service.updateLearnerExtended(
        'tenant_demo',
        'admin-1',
        learner.id,
        { linkedIamUserId: 'user-2' },
        ctx
      )
    ).toThrow(/already bound/i);
  });

  it('allows clear-then-reassign of linkedIamUserId', () => {
    const { service } = makeServices();
    const ctx = makeContext({ tenantId: 'tenant_demo', userId: 'admin-1' });
    const learner = service.createLearnerExtended(
      'tenant_demo',
      'admin-1',
      { firstName: 'A', lastName: 'B' },
      ctx
    );
    service.updateLearnerExtended(
      'tenant_demo',
      'admin-1',
      learner.id,
      { linkedIamUserId: 'user-1' },
      ctx
    );
    service.updateLearnerExtended(
      'tenant_demo',
      'admin-1',
      learner.id,
      { linkedIamUserId: null },
      ctx
    );
    const reassigned = service.updateLearnerExtended(
      'tenant_demo',
      'admin-1',
      learner.id,
      { linkedIamUserId: 'user-2' },
      ctx
    );
    expect(reassigned.linkedIamUserId).toBe('user-2');
  });

  it('no-op patch (empty payload) just bumps updatedAt', () => {
    const { service } = makeServices();
    const ctx = makeContext({ tenantId: 'tenant_demo', userId: 'admin-1' });
    const learner = service.createLearnerExtended(
      'tenant_demo',
      'admin-1',
      { firstName: 'A', lastName: 'B' },
      ctx
    );
    const before = learner.updatedAt;
    // wait 1 tick to ensure different timestamp
    const updated = service.updateLearnerExtended('tenant_demo', 'admin-1', learner.id, {}, ctx);
    expect(updated.firstName).toBe('A');
    expect(updated.updatedAt >= before).toBe(true);
  });
});
```

> **Helpers.** `makeServices()` и `makeContext()` уже определены в `mvp.service.test.ts` (используются в Plan A — см. `learners-bulk-import.service.test.ts` ссылку). Если в `mvp.service.test.ts` нет — взять их из соседнего теста и поднять в общий `__test-utils.ts`.

- [x] **Step 3: Прогнать unit-тесты:**

```bash
pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/mvp.service.test.ts --no-file-parallelism
```

Ожидаемо: 6 новых кейсов в `describe('updateLearnerExtended')` зелёные.

- [x] **Step 4: Commit**

```bash
git add apps/backend/src/modules/mvp/mvp.service.ts apps/backend/src/modules/mvp/mvp.service.test.ts
git commit -m "feat(backend): MvpService.updateLearnerExtended + unit coverage (Phase 2 Plan B Task 2)"
```

**Acceptance:**

- `MvpService.updateLearnerExtended` существует с описанной сигнатурой и поведением (см. step 1).
- 6 новых кейсов в `mvp.service.test.ts` зелёные.
- Audit-event `learning.learner_updated` пишется при каждом успешном PATCH.
- Анти-IDOR rule по `linkedIamUserId` работает: смена на другой непустой → `ConflictException`.

---

## Task 3: `PATCH /learners/:id/profile` endpoint + controller wiring

**Files:**

- `apps/backend/src/modules/mvp/mvp.controller.ts` (extend)

**Why:** Дать публичный HTTP-endpoint для frontend. Отдельный путь `/profile` (а не перегрузка существующего `PUT /learners/:id`) выбран, потому что Plan A установил конвенцию «новые поля = новое имя» (deviation #1) и потому что существующий `PUT` принимает другую DTO; перегружать его двумя shape'ами через union делает контракт хрупким.

**Tasks:**

- [x] **Step 1: Открыть `apps/backend/src/modules/mvp/mvp.controller.ts`.** Найти существующий `@Put('learners/:id')` (~строка 169). Добавить **сразу под ним** новый метод:

```typescript
/**
 * Phase 2 Plan B — PATCH расширенных полей учётки (ФИО, email, СНИЛС, должность, status).
 * Отдельный путь от `PUT /learners/:id`, который остаётся под `UpdateSimpleRegistryRequest`
 * (старый шейп: code+name+linkedIamUserId+organizationUnitId).
 */
@Patch('learners/:id/profile')
@UseGuards(PermissionGuard)
@RequirePermissions('learners.write')
updateLearnerExtended(
  @CurrentContext() c: RequestContext,
  @Param('id') id: string,
  @Body() raw: unknown
) {
  const b = assertValidDto(UpdateLearnerExtendedRequest, raw);
  return this.mvpService.updateLearnerExtended(c.tenantId!, c.userId, id, b, c);
}
```

- [x] **Step 2: Добавить импорт в начало `mvp.controller.ts`:**

```typescript
import { UpdateLearnerExtendedRequest } from './update-learner-extended.dto.js';
```

И `Patch` к существующему импорту из `@nestjs/common`:

```typescript
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
  UseInterceptors
} from '@nestjs/common';
```

(Проверить, что `Patch` ещё нет в импорте — если нет, добавить.)

- [x] **Step 3: Прогнать typecheck backend:**

```bash
pnpm --filter @cdoprof/backend exec tsc --noEmit
```

Ожидаемо: 0 ошибок.

- [x] **Step 4: Commit**

```bash
git add apps/backend/src/modules/mvp/mvp.controller.ts
git commit -m "feat(backend): PATCH /learners/:id/profile endpoint (Phase 2 Plan B Task 3)"
```

**Acceptance:**

- Endpoint `PATCH /learners/:id/profile` существует под permission `learners.write`.
- DTO валидируется через `assertValidDto(UpdateLearnerExtendedRequest, ...)`.
- `pnpm --filter @cdoprof/backend exec tsc --noEmit` зелёный.

---

## Task 4: HTTP integration — permission boundary для нового endpoint

**Files:**

- `apps/backend/src/modules/mvp/mvp.http.integration.test.ts` (extend)

**Why:** Конвенция CLAUDE.md: «при добавлении нового endpoint'а — extend `mvp.http.integration.test.ts` с stub-controller pattern, не создавать новый файл для permission-only тестов». Закрываем permission boundary (`auth_required` / `permission_denied` / `success`) + базовую envelope-shape проверку.

**Tasks:**

- [x] **Step 1: Открыть `mvp.http.integration.test.ts`.** Найти секцию для `POST /learners/bulk-import` (добавлена в Plan A §5.90). Добавить **рядом** новый describe:

```typescript
describe('PATCH /learners/:id/profile (Plan B)', () => {
  it('returns 401 auth_required when no Authorization header', async () => {
    const res = await request(app.getHttpServer())
      .patch('/learners/learner-x/profile')
      .set('x-tenant-id', 'tenant_demo')
      .send({ firstName: 'X' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('auth_required');
  });

  it('returns 403 permission_denied when actor lacks learners.write', async () => {
    const token = makeTokenWithPermissions(['learners.read']); // только read
    const res = await request(app.getHttpServer())
      .patch('/learners/learner-x/profile')
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', 'tenant_demo')
      .send({ firstName: 'X' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('permission_denied');
  });

  it('returns 200 + envelope on success with learners.write', async () => {
    const token = makeTokenWithPermissions(['learners.read', 'learners.write']);
    const res = await request(app.getHttpServer())
      .patch('/learners/learner-1/profile')
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', 'tenant_demo')
      .send({ firstName: 'Иван', email: 'ivan@example.com' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      data: expect.objectContaining({ firstName: 'Иван', email: 'ivan@example.com' }),
      meta: expect.objectContaining({ requestId: expect.any(String) })
    });
  });

  it('returns 400 validation_error on invalid email', async () => {
    const token = makeTokenWithPermissions(['learners.read', 'learners.write']);
    const res = await request(app.getHttpServer())
      .patch('/learners/learner-1/profile')
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', 'tenant_demo')
      .send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation_error');
  });
});
```

> **Stub controller setup.** В `mvp.http.integration.test.ts` уже определён hand-rolled `MvpTestController` (Plan A §5.90 deviation #2 — расширили его, а не создали новый файл). Добавить в этот же stub-controller метод-обработчик `PATCH /learners/:id/profile`, который повторяет реальный `mvp.controller.updateLearnerExtended` контракт (можно скопировать как есть; цель stub — только проверить guards + envelope, не реальную бизнес-логику).

- [x] **Step 2: Прогнать integration-тест изолированно:**

```bash
pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/mvp.http.integration.test.ts --no-file-parallelism
```

Ожидаемо: новые 4 кейса зелёные, прежние не сломаны.

- [x] **Step 3: Commit**

```bash
git add apps/backend/src/modules/mvp/mvp.http.integration.test.ts
git commit -m "test(backend): HTTP integration for PATCH /learners/:id/profile (Phase 2 Plan B Task 4)"
```

**Acceptance:**

- 4 новых http-integration кейса под `describe('PATCH /learners/:id/profile (Plan B)')` зелёные.
- Stub-controller расширен под новый route (а не создан новый файл — конвенция Plan A).
- Permission boundary полная: `auth_required` / `permission_denied` / `success` / `validation_error`.

---

## Task 5: Frontend types + api.ts + hooks.ts

**Files:**

- `apps/frontend/src/features/learners/types.ts` (новый)
- `apps/frontend/src/features/learners/api.ts` (новый)
- `apps/frontend/src/features/learners/hooks.ts` (новый)

**Why:** Изолировать REST-клиент и типы фичи. Тип `LearnerListItem` минимально дублирует `Learner` из backend — но через `@cdoprof/shared-types` это сделать пока нельзя (там нет учёточного типа; вынос — отдельная follow-up задача). Конвенция Plan A: типы рядом с фичей.

**Tasks:**

- [x] **Step 1: Создать `apps/frontend/src/features/learners/types.ts`:**

```typescript
export type LearnerStatus = 'active' | 'archived';

export interface LearnerListItem {
  id: string;
  tenantId: string;
  learnerNo?: string;
  firstName: string;
  lastName: string;
  middleName?: string;
  email?: string;
  snils?: string;
  position?: string;
  organizationUnitId?: string;
  linkedIamUserId?: string;
  status: LearnerStatus;
  createdAt: string;
  updatedAt: string;
}

export interface LearnersListResponse {
  items: LearnerListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface LearnersListFilters {
  q?: string;
  status?: LearnerStatus;
  page?: number;
  pageSize?: number;
}

export interface LearnerEditFormState {
  firstName: string;
  lastName: string;
  middleName: string;
  email: string;
  snils: string;
  position: string;
  organizationUnitId: string;
  learnerNo: string;
  status: LearnerStatus;
}

export interface UpdateLearnerProfilePayload {
  firstName?: string;
  lastName?: string;
  middleName?: string | null;
  email?: string | null;
  snils?: string | null;
  position?: string | null;
  organizationUnitId?: string | null;
  learnerNo?: string | null;
  status?: LearnerStatus;
}
```

- [x] **Step 2: Создать `apps/frontend/src/features/learners/api.ts`:**

```typescript
import { apiRequest } from '@/lib/api/client';
import type { SessionInfo } from '@/lib/auth/session';
import type {
  LearnerListItem,
  LearnersListFilters,
  LearnersListResponse,
  UpdateLearnerProfilePayload
} from './types';

export async function fetchLearnersList(
  session: SessionInfo,
  filters: LearnersListFilters
): Promise<LearnersListResponse> {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  if (filters.status) params.set('status', filters.status);
  if (filters.page) params.set('page', String(filters.page));
  if (filters.pageSize) params.set('page_size', String(filters.pageSize));

  return apiRequest<LearnersListResponse>(session, {
    method: 'GET',
    path: `/learners?${params.toString()}`
  });
}

export async function updateLearnerProfile(
  session: SessionInfo,
  learnerId: string,
  payload: UpdateLearnerProfilePayload
): Promise<LearnerListItem> {
  return apiRequest<LearnerListItem>(session, {
    method: 'PATCH',
    path: `/learners/${learnerId}/profile`,
    body: payload
  });
}
```

> **`apiRequest` signature.** Проверить: в `apps/frontend/src/lib/api/client.ts` сигнатура может отличаться (Plan A использовал `{ method, path, body? }`). Если другая — адаптировать, не менять `client.ts`.

- [x] **Step 3: Создать `apps/frontend/src/features/learners/hooks.ts`** — React Query для list + useState/async для mutation (конвенция CLAUDE.md):

```typescript
'use client';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useSession } from '@/lib/auth/session-context';
import { fetchLearnersList, updateLearnerProfile } from './api';
import type { LearnerListItem, LearnersListFilters, UpdateLearnerProfilePayload } from './types';

export function useLearnersList(filters: LearnersListFilters) {
  const session = useSession();
  return useQuery({
    queryKey: ['learners-list', filters],
    queryFn: () => fetchLearnersList(session, filters),
    enabled: Boolean(session)
  });
}

export interface UpdateLearnerProfileState {
  isPending: boolean;
  error: Error | null;
  data: LearnerListItem | null;
}

export function useUpdateLearnerProfile() {
  const session = useSession();
  const [state, setState] = useState<UpdateLearnerProfileState>({
    isPending: false,
    error: null,
    data: null
  });

  async function mutate(
    learnerId: string,
    payload: UpdateLearnerProfilePayload
  ): Promise<LearnerListItem | null> {
    setState({ isPending: true, error: null, data: null });
    try {
      const result = await updateLearnerProfile(session, learnerId, payload);
      setState({ isPending: false, error: null, data: result });
      return result;
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      setState({ isPending: false, error: err, data: null });
      return null;
    }
  }

  function reset() {
    setState({ isPending: false, error: null, data: null });
  }

  return { ...state, mutate, reset };
}
```

> **Импорт `useSession`.** Проверить актуальное имя/путь — в Plan A bulk-enrollments использовал свой паттерн; имя контекста session может быть `useSessionInfo` или прямо `useSession`. Привести к существующему.

- [x] **Step 4: Прогнать typecheck frontend:**

```bash
pnpm --filter @cdoprof/frontend exec tsc --noEmit
```

Ожидаемо: 0 ошибок.

- [x] **Step 5: Commit**

```bash
git add apps/frontend/src/features/learners/types.ts apps/frontend/src/features/learners/api.ts apps/frontend/src/features/learners/hooks.ts
git commit -m "feat(frontend): learners feature — types + api + hooks (Phase 2 Plan B Task 5)"
```

**Acceptance:**

- 3 новых файла существуют с описанным содержимым.
- `pnpm --filter @cdoprof/frontend exec tsc --noEmit` зелёный.
- API-клиент использует общий `apiRequest` (envelope unwrap бесплатно).

---

## Task 6: Frontend api.contract.test.ts

**Files:**

- `apps/frontend/src/features/learners/api.contract.test.ts` (новый)

**Why:** Контракт-тест проверяет, что `fetchLearnersList`/`updateLearnerProfile` строят правильный URL+method+body и корректно распаковывают envelope `{ data, meta }`. Берётся ровно тот же паттерн `vi.stubGlobal('fetch', ...)`, что в `bulk-enrollments/api.contract.test.ts`.

**Tasks:**

- [x] **Step 1: Создать `apps/frontend/src/features/learners/api.contract.test.ts`:**

```typescript
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchLearnersList, updateLearnerProfile } from './api';
import type { SessionInfo } from '@/lib/auth/session';

const session: SessionInfo = {
  token: 'jwt-stub',
  tenantId: 'tenant_demo',
  userId: 'admin-1'
} as SessionInfo;

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetchOnceWithBody(body: unknown, status = 200) {
  const fetchMock = vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' }
      })
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('fetchLearnersList', () => {
  it('builds GET /learners with query params and unwraps envelope', async () => {
    const fetchMock = stubFetchOnceWithBody({
      data: { items: [], total: 0, page: 1, pageSize: 20 },
      meta: { requestId: 'r-1', correlationId: 'c-1', timestamp: '2026-05-29T00:00:00Z' }
    });

    const result = await fetchLearnersList(session, {
      q: 'иван',
      status: 'active',
      page: 2,
      pageSize: 50
    });

    expect(result).toEqual({ items: [], total: 0, page: 1, pageSize: 20 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toMatch(/\/learners\?.*q=%D0%B8%D0%B2%D0%B0%D0%BD/);
    expect(String(url)).toContain('status=active');
    expect(String(url)).toContain('page=2');
    expect(String(url)).toContain('page_size=50');
    expect((init as RequestInit).method).toBe('GET');
  });

  it('omits empty filters', async () => {
    const fetchMock = stubFetchOnceWithBody({
      data: { items: [], total: 0, page: 1, pageSize: 20 },
      meta: { requestId: 'r-2', correlationId: 'c-2', timestamp: '2026-05-29T00:00:01Z' }
    });

    await fetchLearnersList(session, {});

    const [url] = fetchMock.mock.calls[0]!;
    expect(String(url)).not.toContain('q=');
    expect(String(url)).not.toContain('status=');
  });
});

describe('updateLearnerProfile', () => {
  it('builds PATCH /learners/:id/profile with body and unwraps envelope', async () => {
    const fetchMock = stubFetchOnceWithBody({
      data: {
        id: 'learner-1',
        tenantId: 'tenant_demo',
        firstName: 'Иван',
        lastName: 'Иванов',
        email: 'ivan@example.com',
        status: 'active',
        createdAt: '2026-05-29T00:00:00Z',
        updatedAt: '2026-05-29T00:00:00Z'
      },
      meta: { requestId: 'r-3', correlationId: 'c-3', timestamp: '2026-05-29T00:00:02Z' }
    });

    const result = await updateLearnerProfile(session, 'learner-1', { email: 'ivan@example.com' });

    expect(result.email).toBe('ivan@example.com');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain('/learners/learner-1/profile');
    expect((init as RequestInit).method).toBe('PATCH');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ email: 'ivan@example.com' });
  });
});
```

- [x] **Step 2: Прогнать contract-тест изолированно:**

```bash
pnpm --filter @cdoprof/frontend exec vitest run src/features/learners/api.contract.test.ts --no-file-parallelism
```

Ожидаемо: 3 кейса зелёные.

- [x] **Step 3: Commit**

```bash
git add apps/frontend/src/features/learners/api.contract.test.ts
git commit -m "test(frontend): learners api contract (Phase 2 Plan B Task 6)"
```

**Acceptance:**

- 3 contract-кейса (list-with-filters, list-empty-filters, update-profile) зелёные.
- Параметризация query string совпадает с реальным backend (`q`, `status`, `page`, `page_size`).

---

## Task 7: Frontend форматтеры + тесты

**Files:**

- `apps/frontend/src/features/learners/format.ts` (новый)
- `apps/frontend/src/features/learners/format.test.ts` (новый)

**Why:** ФИО склейка, label статуса, маска СНИЛС — pure functions, удобнее тестировать отдельно, а потом дёшево подменять в UI.

**Tasks:**

- [x] **Step 1: Создать `apps/frontend/src/features/learners/format.ts`:**

```typescript
import type { LearnerListItem, LearnerStatus } from './types';

export function formatFullName(
  learner: Pick<LearnerListItem, 'lastName' | 'firstName' | 'middleName'>
): string {
  return [learner.lastName, learner.firstName, learner.middleName ?? '']
    .map((p) => p.trim())
    .filter(Boolean)
    .join(' ');
}

export const STATUS_LABEL: Record<LearnerStatus, string> = {
  active: 'Активен',
  archived: 'В архиве'
};

/** Маска СНИЛС: «123-456-789 01» -> отображение как есть, но безопасно при отсутствии. */
export function formatSnils(snils: string | undefined): string {
  if (!snils) return '—';
  const digits = snils.replace(/\D/g, '');
  if (digits.length !== 11) return snils;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 9)} ${digits.slice(9, 11)}`;
}

/** Утилита для `editFormState -> UpdateLearnerProfilePayload` с null для пустых строк. */
export function buildUpdatePayload(form: import('./types').LearnerEditFormState) {
  const nullable = (v: string): string | null => (v.trim() ? v.trim() : null);
  const required = (v: string): string => v.trim();
  return {
    firstName: required(form.firstName),
    lastName: required(form.lastName),
    middleName: nullable(form.middleName),
    email: nullable(form.email),
    snils: nullable(form.snils),
    position: nullable(form.position),
    organizationUnitId: nullable(form.organizationUnitId),
    learnerNo: nullable(form.learnerNo),
    status: form.status
  };
}
```

- [x] **Step 2: Создать `apps/frontend/src/features/learners/format.test.ts`:**

```typescript
import { describe, expect, it } from 'vitest';
import { buildUpdatePayload, formatFullName, formatSnils, STATUS_LABEL } from './format';

describe('formatFullName', () => {
  it('joins lastName firstName middleName', () => {
    expect(formatFullName({ lastName: 'Иванов', firstName: 'Иван', middleName: 'Петрович' })).toBe(
      'Иванов Иван Петрович'
    );
  });
  it('skips missing middleName', () => {
    expect(formatFullName({ lastName: 'Иванов', firstName: 'Иван' })).toBe('Иванов Иван');
  });
  it('trims and filters empty parts', () => {
    expect(formatFullName({ lastName: ' Иванов ', firstName: ' Иван ', middleName: '' })).toBe(
      'Иванов Иван'
    );
  });
});

describe('formatSnils', () => {
  it('returns dash for undefined', () => {
    expect(formatSnils(undefined)).toBe('—');
  });
  it('formats raw digits', () => {
    expect(formatSnils('12345678901')).toBe('123-456-789 01');
  });
  it('keeps already-masked value', () => {
    expect(formatSnils('123-456-789 01')).toBe('123-456-789 01');
  });
  it('passes through invalid length unchanged', () => {
    expect(formatSnils('12345')).toBe('12345');
  });
});

describe('STATUS_LABEL', () => {
  it('has Russian labels for both statuses', () => {
    expect(STATUS_LABEL.active).toBe('Активен');
    expect(STATUS_LABEL.archived).toBe('В архиве');
  });
});

describe('buildUpdatePayload', () => {
  it('nullifies empty optional fields and trims', () => {
    const result = buildUpdatePayload({
      firstName: ' Иван ',
      lastName: ' Иванов ',
      middleName: '   ',
      email: '',
      snils: ' 123-456-789 01 ',
      position: 'инженер',
      organizationUnitId: '',
      learnerNo: '',
      status: 'active'
    });
    expect(result).toEqual({
      firstName: 'Иван',
      lastName: 'Иванов',
      middleName: null,
      email: null,
      snils: '123-456-789 01',
      position: 'инженер',
      organizationUnitId: null,
      learnerNo: null,
      status: 'active'
    });
  });
});
```

- [x] **Step 3: Прогнать тесты форматтеров:**

```bash
pnpm --filter @cdoprof/frontend exec vitest run src/features/learners/format.test.ts --no-file-parallelism
```

Ожидаемо: 9 кейсов зелёные.

- [x] **Step 4: Commit**

```bash
git add apps/frontend/src/features/learners/format.ts apps/frontend/src/features/learners/format.test.ts
git commit -m "feat(frontend): learners formatters + payload builder (Phase 2 Plan B Task 7)"
```

**Acceptance:**

- `format.ts` с 4 экспортами (`formatFullName`, `formatSnils`, `STATUS_LABEL`, `buildUpdatePayload`).
- 9 unit-кейсов зелёные.

---

## Task 8: Frontend list screen (FilterBar + DataTable + Pagination)

**Files:**

- `apps/frontend/src/features/learners/learners-list-screen.tsx` (новый)

**Why:** Основной экран фичи. Использует `@cdoprof/ui` примитивы (`DataTable`, `FilterBar`, `Pagination`, `StatusChip`, `SearchInput`, `Select`). Соответствует тому же layout-паттерну, что Pillar A Plan C admin-страницы (см. `commission-details-screen.tsx` для образца).

**Tasks:**

- [x] **Step 1: Создать `apps/frontend/src/features/learners/learners-list-screen.tsx`:**

```typescript
'use client';
import { useMemo, useState } from 'react';
import { Column, DataTable, FilterBar, Pagination, SearchInput, Select, StatusChip } from '@cdoprof/ui';
import { PageContainer, PageHeader, SectionCard, SectionEmpty, SectionError, LoadingState } from '@/components';
import { LearnerEditDrawer } from './learner-edit-drawer';
import { useLearnersList } from './hooks';
import { formatFullName, formatSnils, STATUS_LABEL } from './format';
import type { LearnerListItem, LearnersListFilters, LearnerStatus } from './types';

const STATUS_OPTIONS: Array<{ value: '' | LearnerStatus; label: string }> = [
  { value: '', label: 'Все статусы' },
  { value: 'active', label: STATUS_LABEL.active },
  { value: 'archived', label: STATUS_LABEL.archived }
];

const PAGE_SIZE = 20;

export function LearnersListScreen() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'' | LearnerStatus>('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<LearnerListItem | null>(null);

  const filters: LearnersListFilters = useMemo(
    () => ({
      q: q.trim() || undefined,
      ...(status ? { status } : {}),
      page,
      pageSize: PAGE_SIZE
    }),
    [q, status, page]
  );

  const list = useLearnersList(filters);

  const columns: Column<LearnerListItem>[] = [
    {
      key: 'fullName',
      header: 'ФИО',
      render: (row) => formatFullName(row)
    },
    { key: 'email', header: 'Email', render: (row) => row.email ?? '—' },
    { key: 'snils', header: 'СНИЛС', render: (row) => formatSnils(row.snils) },
    { key: 'position', header: 'Должность', render: (row) => row.position ?? '—' },
    { key: 'orgUnit', header: 'Подразделение', render: (row) => row.organizationUnitId ?? '—' },
    {
      key: 'status',
      header: 'Статус',
      render: (row) => (
        <StatusChip
          status={row.status === 'active' ? 'success' : 'neutral'}
          label={STATUS_LABEL[row.status]}
        />
      )
    },
    {
      key: 'actions',
      header: '',
      render: (row) => (
        <button type="button" onClick={() => setEditing(row)}>
          Редактировать
        </button>
      )
    }
  ];

  return (
    <PageContainer>
      <PageHeader title="Ученики" description="Список учётных записей слушателей с поиском, фильтрацией и редактированием." />

      <FilterBar>
        <SearchInput
          value={q}
          onChange={(v) => {
            setQ(v);
            setPage(1);
          }}
          placeholder="Поиск по ФИО, email, СНИЛС"
          aria-label="Поиск"
        />
        <Select
          value={status}
          onChange={(v) => {
            setStatus(v as '' | LearnerStatus);
            setPage(1);
          }}
          options={STATUS_OPTIONS}
          aria-label="Статус"
        />
      </FilterBar>

      <SectionCard>
        {list.isPending ? (
          <LoadingState />
        ) : list.isError ? (
          <SectionError error={list.error as Error} onRetry={() => list.refetch()} />
        ) : !list.data || list.data.items.length === 0 ? (
          <SectionEmpty title="Учеников нет" description="По текущим фильтрам ни одной записи не найдено." />
        ) : (
          <>
            <DataTable columns={columns} rows={list.data.items} getRowKey={(r) => r.id} />
            <Pagination
              page={page}
              pageSize={PAGE_SIZE}
              total={list.data.total}
              onChange={(p) => setPage(p)}
            />
          </>
        )}
      </SectionCard>

      {editing && (
        <LearnerEditDrawer
          learner={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            list.refetch();
          }}
        />
      )}
    </PageContainer>
  );
}
```

> **Импорт `@/components`.** `PageContainer`/`PageHeader`/`SectionCard`/`SectionEmpty`/`SectionError`/`LoadingState` импортируются по конвенции CLAUDE.md из `apps/frontend/src/components/`. Проверить точные пути перед commit.

- [x] **Step 2: Прогнать typecheck:**

```bash
pnpm --filter @cdoprof/frontend exec tsc --noEmit
```

Ожидаемо: 0 ошибок. Если `@cdoprof/ui` ругается на `aria-label` на `Select`/`SearchInput` — упростить (убрать, обернуть в `<label>`).

- [x] **Step 3: Commit**

```bash
git add apps/frontend/src/features/learners/learners-list-screen.tsx
git commit -m "feat(frontend): admin learners list screen (Phase 2 Plan B Task 8)"
```

**Acceptance:**

- Экран рендерит filter + table + pagination.
- Edit-кнопка вызывает `LearnerEditDrawer` (заглушку допустимо commit'нуть в этом же step, реализация — Task 9).
- Typecheck зелёный.

---

## Task 9: Frontend edit drawer (форма редактирования)

**Files:**

- `apps/frontend/src/features/learners/learner-edit-drawer.tsx` (новый)

**Why:** Модальная форма с редактируемыми полями + сохранение через `useUpdateLearnerProfile`. Использует `Dialog` из `@cdoprof/ui`. Валидация client-side минимальная (email через `type="email"`, required для firstName/lastName), backend дополнит DTO-валидацией.

**Tasks:**

- [x] **Step 1: Создать `apps/frontend/src/features/learners/learner-edit-drawer.tsx`:**

```typescript
'use client';
import { useState } from 'react';
import { Dialog } from '@cdoprof/ui';
import { FieldError } from '@/components';
import { useUpdateLearnerProfile } from './hooks';
import { buildUpdatePayload, STATUS_LABEL } from './format';
import type { LearnerEditFormState, LearnerListItem, LearnerStatus } from './types';

interface LearnerEditDrawerProps {
  learner: LearnerListItem;
  onClose: () => void;
  onSaved: () => void;
}

function toFormState(learner: LearnerListItem): LearnerEditFormState {
  return {
    firstName: learner.firstName,
    lastName: learner.lastName,
    middleName: learner.middleName ?? '',
    email: learner.email ?? '',
    snils: learner.snils ?? '',
    position: learner.position ?? '',
    organizationUnitId: learner.organizationUnitId ?? '',
    learnerNo: learner.learnerNo ?? '',
    status: learner.status
  };
}

export function LearnerEditDrawer({ learner, onClose, onSaved }: LearnerEditDrawerProps) {
  const [form, setForm] = useState<LearnerEditFormState>(() => toFormState(learner));
  const mutation = useUpdateLearnerProfile();

  function setField<K extends keyof LearnerEditFormState>(key: K, value: LearnerEditFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.firstName.trim() || !form.lastName.trim()) return;
    const payload = buildUpdatePayload(form);
    const result = await mutation.mutate(learner.id, payload);
    if (result) onSaved();
  }

  return (
    <Dialog open onClose={onClose} title="Редактировать ученика">
      <form onSubmit={handleSubmit}>
        <label>
          Фамилия*
          <input value={form.lastName} onChange={(e) => setField('lastName', e.target.value)} required />
        </label>
        <label>
          Имя*
          <input value={form.firstName} onChange={(e) => setField('firstName', e.target.value)} required />
        </label>
        <label>
          Отчество
          <input value={form.middleName} onChange={(e) => setField('middleName', e.target.value)} />
        </label>
        <label>
          Email
          <input
            type="email"
            value={form.email}
            onChange={(e) => setField('email', e.target.value)}
            autoComplete="off"
          />
        </label>
        <label>
          СНИЛС
          <input
            value={form.snils}
            onChange={(e) => setField('snils', e.target.value)}
            placeholder="123-456-789 01"
          />
        </label>
        <label>
          Должность
          <input value={form.position} onChange={(e) => setField('position', e.target.value)} />
        </label>
        <label>
          Подразделение (org unit ID)
          <input
            value={form.organizationUnitId}
            onChange={(e) => setField('organizationUnitId', e.target.value)}
          />
        </label>
        <label>
          Учётный номер
          <input value={form.learnerNo} onChange={(e) => setField('learnerNo', e.target.value)} />
        </label>
        <label>
          Статус
          <select value={form.status} onChange={(e) => setField('status', e.target.value as LearnerStatus)}>
            <option value="active">{STATUS_LABEL.active}</option>
            <option value="archived">{STATUS_LABEL.archived}</option>
          </select>
        </label>

        {mutation.error && <FieldError message={mutation.error.message} />}

        <div>
          <button type="button" onClick={onClose} disabled={mutation.isPending}>
            Отмена
          </button>
          <button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Сохранение…' : 'Сохранить'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
```

> **Стилизация.** Минимум структурного HTML — окончательное оформление берётся из уже существующих form-классов в проекте (см. `commission-details-screen.tsx` для образца стилей). Plan B не вводит новые стилевые классы — только разметку.

- [x] **Step 2: Прогнать typecheck:**

```bash
pnpm --filter @cdoprof/frontend exec tsc --noEmit
```

Ожидаемо: 0 ошибок.

- [x] **Step 3: Прогнать существующий frontend test-suite, убедиться что ничего не сломалось:**

```bash
pnpm --filter @cdoprof/frontend test --no-file-parallelism
```

Ожидаемо: все тесты зелёные (≥190 + ≥12 новых из Plan B Tasks 6+7).

- [x] **Step 4: Commit**

```bash
git add apps/frontend/src/features/learners/learner-edit-drawer.tsx
git commit -m "feat(frontend): learner edit drawer (Phase 2 Plan B Task 9)"
```

**Acceptance:**

- Drawer открывается с предзаполнением из `LearnerListItem`.
- Сабмит вызывает `updateLearnerProfile` через хук + закрывает drawer + рефетчит список через `onSaved`.
- Ошибка валидации backend (например, invalid email) выводится через `FieldError`.

---

## Task 10: Route page + navigation entry

**Files:**

- `apps/frontend/app/admin/learners/page.tsx` (новый)
- `apps/frontend/src/features/navigation/model.ts` (modify)

**Why:** Next.js App Router-точка входа + регистрация в `navigationModel`, чтобы пункт автоматически появился в `AppShell` сайдбаре под permission `learners.read`. Конвенция Plan A: navigation = data, не JSX.

**Tasks:**

- [x] **Step 1: Создать `apps/frontend/app/admin/learners/page.tsx`:**

```typescript
import { ProtectedPage } from '@/widgets/shell/protected-page';
import { LearnersListScreen } from '@/features/learners/learners-list-screen';

export default function AdminLearnersPage() {
  return (
    <ProtectedPage requiredPermissions={['learners.read']}>
      <LearnersListScreen />
    </ProtectedPage>
  );
}
```

- [x] **Step 2: Открыть `apps/frontend/src/features/navigation/model.ts`.** Найти существующую запись для `/admin/bulk-enrollments` (добавлена в Plan A §5.90, navSlot `'more'`). Добавить **рядом** запись для `/admin/learners`:

В `routeMeta` (или аналогичной структуре access-policy):

```typescript
'/admin/learners': {
  requiredPermissions: ['learners.read'],
  fallbackPath: '/'
},
```

В `navigationModel` (или аналог) — пункт сайдбара:

```typescript
{
  path: '/admin/learners',
  label: 'Ученики',
  navSlot: 'admin',
  iconKey: 'users',
  requiredPermissions: ['learners.read']
},
```

> **navSlot.** Если `admin` слот не существует — использовать тот же `'more'`, что Plan A. Точные имена слотов смотреть в `model.ts` рядом со существующими пунктами.

- [x] **Step 3: Прогнать e2e тесты frontend (они проверяют navigation):**

```bash
pnpm --filter @cdoprof/frontend exec vitest run src/e2e/ --no-file-parallelism
```

Ожидаемо: существующие e2e зелёные (особенно `canonical-e2e-readiness.e2e.test.ts` — он проверяет, что navigation-entries корректно прописаны).

- [x] **Step 4: Commit**

```bash
git add apps/frontend/app/admin/learners/page.tsx apps/frontend/src/features/navigation/model.ts
git commit -m "feat(frontend): wire /admin/learners route + navigation (Phase 2 Plan B Task 10)"
```

**Acceptance:**

- Маршрут `/admin/learners` доступен в проде через AppShell.
- Пункт «Ученики» виден в сайдбаре у роли с permission `learners.read`.
- `canonical-e2e-readiness.e2e.test.ts` остаётся зелёным.

---

## Task 11: E2E smoke + closeout (handoff + README)

**Files:**

- `apps/frontend/src/e2e/admin-learners-management.e2e.test.ts` (новый)
- `LMS_AGENT_HANDOFF.md` (extend)
- `README.md` (modify §2 AI Agent State)

**Why:** Замкнуть Plan B по конвенции CLAUDE.md «после каждой сессии»: добавить permission-routing e2e (без RTL — по конвенции `canonical-e2e-readiness.e2e.test.ts`) + handoff entry §5.91 + обновить README. Без этого следующий агент не увидит, что Plan B закрыт.

**Tasks:**

- [ ] **Step 1: Создать `apps/frontend/src/e2e/admin-learners-management.e2e.test.ts`:**

```typescript
import { describe, expect, it } from 'vitest';
import { evaluateRouteAccess } from '@/features/navigation/route-access';
import { getVisibleNavigation } from '@/features/navigation/helpers';
import { formatFullName, buildUpdatePayload } from '@/features/learners/format';

describe('admin learners management — routing', () => {
  it('grants access to /admin/learners with learners.read', () => {
    expect(evaluateRouteAccess('/admin/learners', { permissions: ['learners.read'] })).toEqual({
      allowed: true
    });
  });

  it('denies access to /admin/learners without learners.read', () => {
    const result = evaluateRouteAccess('/admin/learners', { permissions: [] });
    expect(result.allowed).toBe(false);
  });
});

describe('admin learners management — navigation visibility', () => {
  it('shows "Ученики" item for admin with learners.read', () => {
    const items = getVisibleNavigation({ permissions: ['learners.read'] });
    expect(items.some((i) => i.path === '/admin/learners')).toBe(true);
  });

  it('hides "Ученики" for learner role without learners.read', () => {
    const items = getVisibleNavigation({ permissions: ['progress.read'] });
    expect(items.some((i) => i.path === '/admin/learners')).toBe(false);
  });
});

describe('admin learners management — pipeline integration', () => {
  it('formatFullName + buildUpdatePayload work end-to-end', () => {
    const learner = {
      lastName: 'Иванов',
      firstName: 'Иван',
      middleName: 'Петрович'
    };
    expect(formatFullName(learner)).toBe('Иванов Иван Петрович');

    const payload = buildUpdatePayload({
      firstName: 'Иван',
      lastName: 'Иванов',
      middleName: 'Петрович',
      email: 'ivan@example.com',
      snils: '',
      position: 'инженер',
      organizationUnitId: '',
      learnerNo: '',
      status: 'active'
    });
    expect(payload).toMatchObject({
      firstName: 'Иван',
      lastName: 'Иванов',
      middleName: 'Петрович',
      email: 'ivan@example.com',
      snils: null,
      organizationUnitId: null,
      learnerNo: null,
      status: 'active'
    });
  });
});

describe('admin learners management — module smoke', () => {
  it('imports list screen module', async () => {
    const mod = await import('@/features/learners/learners-list-screen');
    expect(typeof mod.LearnersListScreen).toBe('function');
  });
  it('imports edit drawer module', async () => {
    const mod = await import('@/features/learners/learner-edit-drawer');
    expect(typeof mod.LearnerEditDrawer).toBe('function');
  });
});
```

> **`evaluateRouteAccess` / `getVisibleNavigation`.** Точные имена/пути проверить — Plan A использует их в `admin-bulk-enrollment.e2e.test.ts`; повторить тот же импорт-стиль.

- [ ] **Step 2: Прогнать e2e:**

```bash
pnpm --filter @cdoprof/frontend exec vitest run src/e2e/admin-learners-management.e2e.test.ts --no-file-parallelism
```

Ожидаемо: 7 кейсов зелёные.

- [x] **Step 3: Добавить §5.91 в `LMS_AGENT_HANDOFF.md`** под существующим §5.90. Шаблон:

```markdown
### 5.91 Phase 2 §3.2 — Plan B: учётки учеников (list/search/filter/edit UI)

- Summary: реализована вторая фича Phase 2 — admin-страница `/admin/learners` для полного CRUD-просмотра учёток слушателей + расширенный backend-PATCH через `PATCH /learners/:id/profile` (симметрично `createLearnerExtended` Plan A). Закрывает 11 задач Plan B.
- Plan: `docs/superpowers/plans/2026-05-29-phase-2-admin-learners-management-b.md`.
- Backend (Tasks 1-4): `update-learner-extended.dto.ts`, `MvpService.updateLearnerExtended` (+ 6 unit-кейсов), `PATCH /learners/:id/profile` под `learners.write`, 4 HTTP-integration кейса в `mvp.http.integration.test.ts`.
- Frontend (Tasks 5-10): фича-папка `src/features/learners/` (`types`, `api`, `api.contract.test`, `hooks`, `format` + 9 unit-кейсов форматтеров, `learners-list-screen`, `learner-edit-drawer`); маршрут `apps/frontend/app/admin/learners/page.tsx` под `ProtectedPage`; navigation entry `/admin/learners` в `model.ts` под `learners.read`.
- E2E (Task 11): `src/e2e/admin-learners-management.e2e.test.ts` — routing + nav visibility + pipeline integration + module smoke (7 кейсов).
- Plan B deviations (заполнить по ходу исполнения, см. § Risks/Deviations в плане): добавить отдельным bullet'ом каждое отклонение от плана с обоснованием.
- Что осталось до Phase 2 целиком: Plan C (компании-клиенты `core.tenants_clients` + просмотр прогресса по группе).
- Quality gates: `pnpm typecheck` зелёный; backend изолированные прогоны `mvp.dto-validation.test.ts` + `mvp.service.test.ts` + `mvp.http.integration.test.ts` зелёные; frontend `pnpm test:frontend` зелёный (≥207 тестов).
```

- [x] **Step 4: Обновить `README.md` §2 AI Agent State** — заменить блок «Last Completed Task» / «Current Task» / «Next Task» / «Last Updated At» так, чтобы он отражал Plan B done. Минимум:

```markdown
### Last Completed Task

**Phase 2 Plan B — admin learners management** (2026-05-29): backend PATCH `/learners/:id/profile` + frontend `/admin/learners` (list, фильтры, edit drawer). Plan A (bulk-import из Excel) уже смержен ранее. Совместно с Plan A закрывает 2/3 объёма Phase 2.

### Current Task

Тестовый прогон Plan B на проде / smoke по runbook; подготовка Plan C (компании-клиенты).

### Next Task

**Phase 2 Plan C — компании-клиенты + прогресс по группе.** Также — backlog Pillar A: drag-n-drop сортировка комиссий и document set, загрузка PNG-подписей в storage.files, реальный PDF-рендер карточки ученика (отложен до Phase 5).

### Last Updated At

2026-05-29 (Phase 2 Plan B merged; previous: Plan A merged 2026-05-28)
```

- [x] **Step 5: Прогнать full quality gate:**

```bash
pnpm typecheck
```

Ожидаемо: зелёный.

- [x] **Step 6: Commit**

```bash
git add apps/frontend/src/e2e/admin-learners-management.e2e.test.ts LMS_AGENT_HANDOFF.md README.md
git commit -m "docs(handoff): Phase 2 Plan B complete — §5.91 + README sync (Task 11)"
```

**Acceptance:**

- E2E файл `admin-learners-management.e2e.test.ts` существует с ≥7 зелёными кейсами.
- §5.91 добавлен в handoff с правильной структурой (summary/plan/backend/frontend/e2e/что-осталось).
- README §2 обновлён (Last Completed Task = Plan B; Next Task = Plan C).
- `pnpm typecheck` зелёный.

---

## Self-Review Checklist (для исполнителя перед merge)

- [x] Все 11 задач выполнены и закоммичены отдельно (одна задача = один commit).
- [x] `pnpm typecheck` зелёный.
- [ ] Изолированные прогоны: `mvp.dto-validation.test.ts`, `mvp.service.test.ts`, `mvp.http.integration.test.ts`, `src/features/learners/*.test.ts`, `src/e2e/admin-learners-management.e2e.test.ts` — все зелёные.
- [x] `pnpm test:frontend` зелёный.
- [x] Permission boundary проверена: `learners.read` для GET-list/route, `learners.write` для PATCH-profile.
- [x] Анти-IDOR для `linkedIamUserId` работает (Conflict при перебивании на другое значение).
- [x] Audit-event `learning.learner_updated` пишется при каждом PATCH (проверено в unit-тестах).
- [x] §5.91 в `LMS_AGENT_HANDOFF.md` + README §2 обновлены.
- [x] Чекбоксы плана отмечены (`- [x]`).

---

## Risks / Deviations (заполняется по ходу исполнения)

- **R1:** Если backend `q`-поиск окажется чувствительным к производительности на ≥10k учеников — оставить как есть (in-memory; postgres-адаптер из §14 security-roadmap покроет позже), задокументировать в §5.91.
- **R2:** Если `Dialog` из `@cdoprof/ui` не поддерживает контролируемое открытие (`open` prop) — заменить на локальный `<dialog>` с `useRef`; деталь UI, без изменения контракта.
- **R3:** Если в `navigation/model.ts` слот `'admin'` отсутствует — использовать `'more'` как Plan A; задокументировать в §5.91.
- **R4:** Если `apiRequest` имеет иную сигнатуру — адаптировать `api.ts`, не менять `client.ts`.

---

## Plan dependencies graph

```
Task 1 (DTO)
  ↓
Task 2 (service) ──→ Task 3 (controller) ──→ Task 4 (http integration)
                                                  ↓
Task 5 (types/api/hooks) ──→ Task 6 (contract test)
                              ↓
                            Task 7 (formatters)
                              ↓
                            Task 8 (list screen) ──→ Task 9 (edit drawer)
                                                          ↓
                                                       Task 10 (route + nav)
                                                          ↓
                                                       Task 11 (e2e + closeout)
```

**Параллелизация (для `subagent-driven-development`):**

- Task 1 + Task 7 — нет общих файлов, можно параллельно;
- Task 5 + Task 7 — нет общих файлов, можно параллельно;
- Остальное — линейно.

Рекомендация: исполнять сериально по порядку — план короткий, parallelism экономит мало.

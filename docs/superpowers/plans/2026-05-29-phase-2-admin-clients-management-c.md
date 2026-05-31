# Phase 2 — Plan C: Admin Clients Management + Group Progress View

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Дать сотруднику центра (роль admin / teacher с permissions `counterparties.read` + `counterparties.write`) раздел `/admin/clients` для управления компаниями-заказчиками: список / поиск / фильтр / создание / редактирование расширенных полей (ИНН/КПП/контакты/адрес/заметка) + связь группы с компанией + просмотр сводного прогресса по группе и по компании. Закрывает последнюю крупную часть Phase 2 «Раздел Компании: список + карточка компании» + «Просмотр прогресса по группе/курсу» из roadmap. После Plan C Phase 2 объёмно покрыта на ~95% (остаётся фоновый worker bulk-enrollment — но Plan A показал, что для V1-пилота он не нужен).

**Architecture:** Backend — расширение существующего `Counterparty` (Plan A+B pattern: `createCounterpartyExtended` / `updateCounterpartyExtended` + новые поля через миграцию, старые CRUD остаются стабильными для counterparties как «справочник») + nullable FK `learning.groups.counterparty_id` (back-compat: существующие группы не привязаны) + новый агрегационный endpoint `GET /groups/:id/progress-summary` (использует уже посчитанный `completionRate` per-enrollment) + `GET /counterparties/:id/progress-summary` (агрегация по группам клиента). Frontend — новая фича-папка `apps/frontend/src/features/clients/` с list-экраном, detail-страницей `/admin/clients/:id` (включает linked groups + progress summary) и edit drawer'ом. Group details screen расширяется опцией «привязать к клиенту».

**Tech Stack:** TypeScript, NestJS (backend), Vitest (тесты), Next.js App Router + TypeScript (frontend), `@cdoprof/ui` (`DataTable`, `Column`, `FilterBar`, `Pagination`, `Dialog`, `StatusChip`, `SearchInput`, `SectionCard`, `SectionEmpty`, `LookupSelect`), `class-validator` для DTO. SQL миграция новой нумерации (следующая после `0038`). Без новых npm-пакетов.

**Спецификация:** [../specs/2026-05-21-cdoprof-redesign-design.md](../specs/2026-05-21-cdoprof-redesign-design.md) — §3.2 «Кабинеты V1: Админка центра» (управление компаниями), §3.3 «Главный процесс» (компания шлёт Excel — связь шага в data model'е).

**Роадмап:** [2026-05-21-cdoprof-v1-roadmap.md](2026-05-21-cdoprof-v1-roadmap.md) — Phase 2 tasks «Раздел Компании: список + карточка компании» + «Просмотр прогресса по группе/курсу».

**Базовая ветка:** `main` (после мержа Plan B PRs #197–#200). Работа в трёх PR'ах симметрично Plan B:

- `feat/2026-05-30-phase-2-plan-c-impl` — backend (Tasks 1–6).
- `feat/2026-05-30-phase-2-plan-c-frontend` — frontend (Tasks 7–13).
- `feat/2026-05-30-phase-2-plan-c-closeout` — closeout (Task 14).

**Зависимости перед стартом:**

- `main` на коммите ≥ HEAD на момент merge Plan B PRs #197–#200 (handoff должен содержать §5.91).
- Plan A + Plan B merged — Plan C использует `createLearnerExtended` (Plan A) + `Learner.snils/middleName/position` (Pillar A Plan C) для UI «список членов группы внутри прогресса». Если ничего из этого нет — собрать всё равно соберётся, но прогресс будет скуднее.
- Pillar A merged (PRs #174–#183) — Plan C UI прогресса опционально показывает выданные документы по enrollment'у; это уже работает.

**Что НЕ входит в Plan C:**

- **HR-портал компании** (отдельный кабинет руководителя клиента) — V2, см. спека §3.2 «отложен на V2».
- **Bulk import компаний из Excel** (аналог Plan A для counterparties) — V2 или Phase 10 (Excel-конструктор может работать в обе стороны).
- **Email-рассылка отчётов клиенту** (например, «прогресс за месяц» автоматом) — Phase 5 notifications.
- **Сделки/оплаты по клиенту** (`crm.deals` stub есть, но интеграция — Phase 7 «Оплаты»).
- **Детальная аналитика drill-down** (completion / pass rate / время / heatmap) — Phase 9 «SCORM-импорт + аналитика».
- **Удаление компании** (`DELETE /counterparties/:id`) — отложено; в админке только status-toggle `active`/`archived`.
- **Smart-merge при дубликатах по ИНН** — V2 (плюс пилот вряд ли упрётся в дубли первые месяцы).

---

## File Structure

### Create — backend

- `apps/backend/migrations/0039_counterparty_extended_fields_and_group_link.sql` — миграция: добавить `inn`/`kpp`/`contact_email`/`contact_phone`/`legal_address`/`note` на `mvp.counterparties`, добавить nullable FK `counterparty_id` на `learning.groups`, partial index `(tenant_id, counterparty_id) WHERE counterparty_id IS NOT NULL` для агрегаций.
- `apps/backend/src/modules/mvp/update-counterparty-extended.dto.ts` — `UpdateCounterpartyExtendedRequest` DTO с опциональными новыми полями (PATCH-семантика).
- `apps/backend/src/modules/mvp/create-counterparty-extended.dto.ts` — `CreateCounterpartyExtendedRequest` DTO (POST с расширенными полями).
- `apps/backend/src/modules/mvp/group-progress-summary.service.ts` — pure-function агрегатор: `summarizeGroupProgress(groupId, snapshot)` + `summarizeCounterpartyProgress(counterpartyId, snapshot)`. Берёт `enrollments` + `progress` + `groupCourses` snapshot, возвращает `{ totalLearners, completed, inProgress, avgCompletionRate, perCourse: [{ courseId, total, completed }] }`.
- `apps/backend/src/modules/mvp/group-progress-summary.service.test.ts` — unit-тесты pure-function агрегатора.

### Modify — backend

- `apps/backend/src/modules/mvp/mvp.types.ts` — расширить `Counterparty` (`inn?`, `kpp?`, `contactEmail?`, `contactPhone?`, `legalAddress?`, `note?`); расширить `GroupEntity` (`counterpartyId?`).
- `apps/backend/src/modules/mvp/mvp.service.ts` — `createCounterpartyExtended` / `updateCounterpartyExtended` (симметрично `createLearnerExtended`/`updateLearnerExtended`), `getGroupProgressSummary(tenantId, groupId)` + `getCounterpartyProgressSummary(tenantId, counterpartyId)`. Также — расширить существующий `updateGroup` чтобы принимал опциональный `counterpartyId` (либо новый метод `setGroupCounterparty` — выбор: новый метод, чтобы не трогать существующее API).
- `apps/backend/src/modules/mvp/mvp.service.test.ts` — расширить unit-coverage `createCounterpartyExtended` / `updateCounterpartyExtended` / `setGroupCounterparty` / `getGroupProgressSummary` / `getCounterpartyProgressSummary`.
- `apps/backend/src/modules/mvp/mvp.controller.ts` — добавить endpoints: `POST /counterparties/extended` (или решение: оставить `POST /counterparties` существующим, и добавить `PATCH /counterparties/:id/profile` симметрично Plan B), `PATCH /counterparties/:id/profile`, `PATCH /groups/:id/counterparty`, `GET /groups/:id/progress-summary`, `GET /counterparties/:id/progress-summary`.
- `apps/backend/src/modules/mvp/mvp.dto-validation.test.ts` — кейсы под новые DTOs.
- `apps/backend/src/modules/mvp/mvp.http.integration.test.ts` — permission-boundary кейсы для новых endpoints.

### Create — frontend

- `apps/frontend/app/admin/clients/page.tsx` — Next.js route (Protected) для list-экрана.
- `apps/frontend/app/admin/clients/[id]/page.tsx` — Next.js route (Protected) для detail-страницы.
- `apps/frontend/src/features/clients/types.ts` — `ClientListItem`, `ClientEditFormState`, `ClientsListFilters`, `GroupProgressSummary`, `ClientProgressSummary`.
- `apps/frontend/src/features/clients/api.ts` — REST-клиент: `clientsApi.list`, `clientsApi.get`, `clientsApi.create`, `clientsApi.updateProfile`, `clientsApi.getProgressSummary`, `clientsApi.setGroupCounterparty`.
- `apps/frontend/src/features/clients/api.contract.test.ts` — contract-тест с `vi.stubGlobal('fetch', ...)`.
- `apps/frontend/src/features/clients/hooks.ts` — `useClientsList(filters)` (React Query), `useClient(id)` (React Query), `useClientProgress(id)` (React Query), `useUpdateClientProfile()` / `useCreateClient()` (useState + async — конвенция CLAUDE.md).
- `apps/frontend/src/features/clients/format.ts` — pure-function форматтеры (ИНН-маска, телефон-маска, derived `progressLabel`).
- `apps/frontend/src/features/clients/format.test.ts` — тесты форматтеров.
- `apps/frontend/src/features/clients/clients-list-screen.tsx` — list-экран (FilterBar + DataTable + Pagination + кнопка «Создать»).
- `apps/frontend/src/features/clients/client-edit-drawer.tsx` — модальная форма create/edit (`Dialog`).
- `apps/frontend/src/features/clients/client-detail-screen.tsx` — detail-страница (основные поля + linked groups + progress summary).
- `apps/frontend/src/features/clients/group-progress-section.tsx` — секция «Прогресс по группам» с per-group мини-карточками + per-course breakdown.
- `apps/frontend/src/features/groups/group-counterparty-picker.tsx` — новый компонент для назначения компании на группу из `GroupDetailsScreen`. (Если `groups` фича-папка уже использует чужой стиль — расширить там, не создавать новую папку для одного компонента.)
- `apps/frontend/src/e2e/admin-clients-management.e2e.test.ts` — E2E (routing + nav + dynamic import smoke + pipeline integration для форматтеров).

### Modify — frontend

- `apps/frontend/src/features/navigation/model.ts` — добавить routeMeta + navigationModel запись `/admin/clients` под permission `counterparties.read`.
- `apps/frontend/src/features/mvp/screens.tsx` (или соответствующая screen для группы) — встроить `GroupCounterpartyPicker` + ссылку «Прогресс по группе» (открывающую существующую страницу `/admin/clients/:counterpartyId#group-{groupId}` или новый раздел detail-страницы).

### Untouched (используется как есть)

- `mvp.counterparties` существующие поля (`code`, `name`, `legalName`) — не меняются. Только добавляются новые.
- `GET /counterparties`, `GET /counterparties/:id`, `GET /counterparties/lookup`, существующий `POST /counterparties`, `PUT /counterparties/:id` — не меняются. Plan C добавляет `PATCH /counterparties/:id/profile` симметрично Plan B.
- `learning.groups` существующая структура — только колонка `counterparty_id` добавляется.
- Existing IAM permissions `counterparties.read`/`counterparties.write` — переиспользуются. Никаких новых permissions Plan C не вводит.

---

## Task 1: Migration `0039_counterparty_extended_fields_and_group_link.sql`

**Files:**

- `apps/backend/migrations/0039_counterparty_extended_fields_and_group_link.sql` (новый)

**Why:** Backend gap: текущая структура `Counterparty` слишком бедная для роли «компания-заказчик» (нужны ИНН, контакты, адрес). Также группа должна знать о клиенте — это позволит агрегировать прогресс на уровне клиента в Task 6. Партиал-индекс ускоряет агрегацию.

**Tasks:**

- [x] **Step 1: Создать файл `apps/backend/migrations/0039_counterparty_extended_fields_and_group_link.sql`** со следующим содержимым:

```sql
-- Phase 2 Plan C: расширение Counterparty + связь group ↔ counterparty.
-- Дата: 2026-05-29. Назначение: дать админке центра управлять компаниями-клиентами
-- с полным набором B2B-полей (ИНН/КПП/контакты/адрес/заметка), и связывать
-- учебные группы с конкретной компанией для агрегации прогресса.

BEGIN;

-- 1. Расширенные поля компании. Все nullable: существующие записи остаются валидными.
ALTER TABLE mvp.counterparties
  ADD COLUMN IF NOT EXISTS inn TEXT NULL,
  ADD COLUMN IF NOT EXISTS kpp TEXT NULL,
  ADD COLUMN IF NOT EXISTS contact_email TEXT NULL,
  ADD COLUMN IF NOT EXISTS contact_phone TEXT NULL,
  ADD COLUMN IF NOT EXISTS legal_address TEXT NULL,
  ADD COLUMN IF NOT EXISTS note TEXT NULL;

-- CHECK на формат ИНН (10 или 12 цифр) — мягкая проверка; полная валидация
-- (контрольный разряд по алгоритму ФНС) — в DTO Task 3.
ALTER TABLE mvp.counterparties
  ADD CONSTRAINT counterparties_inn_format_check
  CHECK (inn IS NULL OR inn ~ '^[0-9]{10}$' OR inn ~ '^[0-9]{12}$');

-- 2. Связь группа ↔ компания. Nullable: существующие группы остаются без компании.
ALTER TABLE learning.groups
  ADD COLUMN IF NOT EXISTS counterparty_id TEXT NULL;

-- FK с soft-delete семантикой через ON DELETE SET NULL: удаление компании
-- (даже soft, через смену status) не должно ронять группу.
ALTER TABLE learning.groups
  ADD CONSTRAINT groups_counterparty_fk
  FOREIGN KEY (tenant_id, counterparty_id)
  REFERENCES mvp.counterparties(tenant_id, id)
  ON DELETE SET NULL
  DEFERRABLE INITIALLY DEFERRED;

-- Partial index ускоряет агрегацию прогресса по клиенту (Task 6 GET endpoint).
CREATE INDEX IF NOT EXISTS groups_counterparty_id_idx
  ON learning.groups (tenant_id, counterparty_id)
  WHERE counterparty_id IS NOT NULL;

COMMIT;
```

- [x] **Step 2: Если в репозитории есть migration tests (`apps/backend/src/modules/mvp/migrations.test.ts` или аналогичный), добавить regex-проверку:** проверить что миграция содержит `ADD COLUMN IF NOT EXISTS inn`, `ADD COLUMN IF NOT EXISTS counterparty_id`, `groups_counterparty_fk`. Если такого файла нет — пропустить step, не вводить новый тест-файл (миграция проверится через `pnpm test:migrations` при наличии).

- [x] **Step 3: Прогнать pnpm test:migrations (если настроено) или хотя бы typecheck:**

```bash
pnpm test:migrations 2>&1 | tail -20
```

или

```bash
pnpm typecheck
```

Ожидаемо: зелёный.

- [x] **Step 4: Commit:**

```bash
git add apps/backend/migrations/0039_counterparty_extended_fields_and_group_link.sql
git commit -m "feat(backend): migration 0039 — counterparty extended fields + group→counterparty FK (Phase 2 Plan C Task 1)"
```

**Acceptance:**

- Файл миграции существует с указанной нумерацией.
- 6 новых колонок на `mvp.counterparties`, все nullable.
- CHECK constraint на формат ИНН (10/12 цифр или NULL).
- Nullable FK `learning.groups.counterparty_id` с `ON DELETE SET NULL`.
- Partial index `groups_counterparty_id_idx`.
- Не модифицированы исторические миграции (CLAUDE.md «Do Not Touch»).

---

## Task 2: Types extension (`Counterparty` + `GroupEntity`)

**Files:**

- `apps/backend/src/modules/mvp/mvp.types.ts` (extend)

**Why:** TypeScript должен знать о новых полях, иначе сервис не сможет их читать/писать. Все новые поля опциональны — back-compat для существующих in-memory snapshot'ов.

**Tasks:**

- [x] **Step 1: Открыть `apps/backend/src/modules/mvp/mvp.types.ts`, найти `interface Counterparty`** (~строка 11). Расширить:

```typescript
export interface Counterparty extends BaseEntity {
  code: string;
  name: string;
  legalName?: string;
  /** Phase 2 Plan C — ИНН (10 или 12 цифр, валидируется DTO). */
  inn?: string;
  /** Phase 2 Plan C — КПП (9 знаков, валидируется DTO). */
  kpp?: string;
  /** Phase 2 Plan C — основной контактный email клиента. */
  contactEmail?: string;
  /** Phase 2 Plan C — основной контактный телефон. */
  contactPhone?: string;
  /** Phase 2 Plan C — юридический адрес. */
  legalAddress?: string;
  /** Phase 2 Plan C — заметка для админа (не показывается клиенту). */
  note?: string;
}
```

- [x] **Step 2: Найти `interface GroupEntity`** (~строка 69). Расширить:

```typescript
export interface GroupEntity extends BaseEntity {
  code: string;
  name: string;
  /** Phase 2 Plan C — опциональная привязка группы к компании-заказчику. */
  counterpartyId?: string;
}
```

- [x] **Step 3: Прогнать typecheck backend:**

```bash
pnpm --filter @cdoprof/backend exec tsc --noEmit
```

Ожидаемо: 0 ошибок (всё опционально — никаких сломанных вызовов).

- [x] **Step 4: Commit:**

```bash
git add apps/backend/src/modules/mvp/mvp.types.ts
git commit -m "feat(backend): extend Counterparty + GroupEntity types (Phase 2 Plan C Task 2)"
```

**Acceptance:**

- `Counterparty` имеет 6 новых опциональных полей.
- `GroupEntity.counterpartyId?: string` добавлен.
- Typecheck зелёный.

---

## Task 3: DTOs — `CreateCounterpartyExtendedRequest` + `UpdateCounterpartyExtendedRequest` + dto-validation

**Files:**

- `apps/backend/src/modules/mvp/create-counterparty-extended.dto.ts` (новый)
- `apps/backend/src/modules/mvp/update-counterparty-extended.dto.ts` (новый)
- `apps/backend/src/modules/mvp/mvp.dto-validation.test.ts` (extend)

**Why:** Phase 2 Plan B установил конвенцию: новые поля → новый DTO + новый endpoint, старый стабильный. Расширять `CreateSimpleRegistryRequest` нельзя — он используется counterparties/directions/learners как общий справочник.

**Tasks:**

- [x] **Step 1: Создать `apps/backend/src/modules/mvp/create-counterparty-extended.dto.ts`:**

```typescript
import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  Matches,
  MinLength,
  ValidateIf
} from 'class-validator';

/**
 * Phase 2 Plan C — POST расширенной компании-заказчика.
 * Симметрично createLearnerExtended из Plan A. Старый POST /counterparties
 * остаётся под CreateSimpleRegistryRequest (code + name).
 */
export class CreateCounterpartyExtendedRequest {
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  code!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  legalName?: string;

  @IsOptional()
  @Matches(/^[0-9]{10}$|^[0-9]{12}$/, { message: 'inn must be 10 or 12 digits' })
  inn?: string;

  @IsOptional()
  @Matches(/^[0-9]{9}$/, { message: 'kpp must be 9 digits' })
  kpp?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  contactEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  contactPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  legalAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  @IsOptional()
  @IsString()
  status?: string;
}
```

- [x] **Step 2: Создать `apps/frontend/...` — нет, это backend. Создать `apps/backend/src/modules/mvp/update-counterparty-extended.dto.ts`:**

```typescript
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  Matches,
  MinLength,
  ValidateIf
} from 'class-validator';

/**
 * Phase 2 Plan C — PATCH расширенной компании.
 * Семантика: undefined = не трогать, null = очистить (для clearable полей).
 */
export class UpdateCounterpartyExtendedRequest {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  code?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(255)
  legalName?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Matches(/^[0-9]{10}$|^[0-9]{12}$/, { message: 'inn must be 10 or 12 digits' })
  inn?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Matches(/^[0-9]{9}$/, { message: 'kpp must be 9 digits' })
  kpp?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsEmail()
  @MaxLength(255)
  contactEmail?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(50)
  contactPhone?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(500)
  legalAddress?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(2000)
  note?: string | null;

  @IsOptional()
  @IsString()
  @IsIn(['active', 'archived'])
  status?: string;
}
```

- [x] **Step 3: Расширить `mvp.dto-validation.test.ts`** — добавить два новых `describe` блока:

```typescript
import { CreateCounterpartyExtendedRequest } from './create-counterparty-extended.dto.js';
import { UpdateCounterpartyExtendedRequest } from './update-counterparty-extended.dto.js';

describe('CreateCounterpartyExtendedRequest', () => {
  const validate = (raw: unknown) => {
    const inst = plainToInstance(CreateCounterpartyExtendedRequest, raw);
    return validateSync(inst, { whitelist: true, forbidNonWhitelisted: true });
  };

  it('accepts minimal happy path (code + name only)', () => {
    expect(validate({ code: 'OOO-IVANOV', name: 'ООО Иванов' })).toHaveLength(0);
  });

  it('accepts full happy path with all extended fields', () => {
    expect(
      validate({
        code: 'OOO-IVANOV',
        name: 'ООО Иванов',
        legalName: 'Общество с ограниченной ответственностью «Иванов»',
        inn: '7707083893',
        kpp: '770701001',
        contactEmail: 'hr@ivanov.ru',
        contactPhone: '+7 (495) 123-45-67',
        legalAddress: 'Москва, ул. Тверская, 1',
        note: 'Постоянный клиент с 2024 года.'
      })
    ).toHaveLength(0);
  });

  it('accepts 12-digit ИНН (ИП)', () => {
    expect(validate({ code: 'IP-1', name: 'ИП Иванов', inn: '770708389365' })).toHaveLength(0);
  });

  it('rejects 11-digit ИНН (invalid length)', () => {
    const errs = validate({ code: 'X', name: 'X', inn: '12345678901' });
    expect(errs).toHaveLength(1);
    expect(errs[0]!.property).toBe('inn');
  });

  it('rejects non-digit ИНН', () => {
    const errs = validate({ code: 'X', name: 'X', inn: '770A083893' });
    expect(errs).toHaveLength(1);
  });

  it('rejects KPP wrong length', () => {
    const errs = validate({ code: 'X', name: 'X', kpp: '12345678' });
    expect(errs).toHaveLength(1);
    expect(errs[0]!.property).toBe('kpp');
  });

  it('rejects invalid email', () => {
    const errs = validate({ code: 'X', name: 'X', contactEmail: 'not-an-email' });
    expect(errs).toHaveLength(1);
  });

  it('rejects empty code', () => {
    const errs = validate({ code: '', name: 'X' });
    expect(errs).toHaveLength(1);
    expect(errs[0]!.property).toBe('code');
  });

  it('rejects oversized note', () => {
    const errs = validate({ code: 'X', name: 'X', note: 'x'.repeat(2001) });
    expect(errs).toHaveLength(1);
    expect(errs[0]!.property).toBe('note');
  });
});

describe('UpdateCounterpartyExtendedRequest', () => {
  const validate = (raw: unknown) => {
    const inst = plainToInstance(UpdateCounterpartyExtendedRequest, raw);
    return validateSync(inst, { whitelist: true, forbidNonWhitelisted: true });
  };

  it('accepts empty payload (no-op patch)', () => {
    expect(validate({})).toHaveLength(0);
  });

  it('accepts null for clearable fields', () => {
    expect(
      validate({
        legalName: null,
        inn: null,
        kpp: null,
        contactEmail: null,
        contactPhone: null,
        legalAddress: null,
        note: null
      })
    ).toHaveLength(0);
  });

  it('rejects invalid status', () => {
    const errs = validate({ status: 'banned' });
    expect(errs).toHaveLength(1);
    expect(errs[0]!.property).toBe('status');
  });

  it('accepts both archived and active status', () => {
    expect(validate({ status: 'archived' })).toHaveLength(0);
    expect(validate({ status: 'active' })).toHaveLength(0);
  });

  it('rejects invalid ИНН format on patch', () => {
    const errs = validate({ inn: '123' });
    expect(errs).toHaveLength(1);
    expect(errs[0]!.property).toBe('inn');
  });
});
```

- [x] **Step 4: Прогнать тесты:**

```bash
pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/mvp.dto-validation.test.ts --no-file-parallelism
```

Ожидаемо: 14 новых кейсов (9 create + 5 update) зелёные.

- [x] **Step 5: Commit:**

```bash
git add apps/backend/src/modules/mvp/create-counterparty-extended.dto.ts apps/backend/src/modules/mvp/update-counterparty-extended.dto.ts apps/backend/src/modules/mvp/mvp.dto-validation.test.ts
git commit -m "feat(backend): CounterpartyExtended DTOs + dto-validation (Phase 2 Plan C Task 3)"
```

**Acceptance:**

- Два новых DTO файла существуют.
- 14 dto-validation кейсов зелёные.
- ИНН валидация принимает 10 или 12 цифр, КПП — ровно 9.
- Email-проверка через `@IsEmail`.

---

## Task 4: Service methods — `createCounterpartyExtended` + `updateCounterpartyExtended` + `setGroupCounterparty`

**Files:**

- `apps/backend/src/modules/mvp/mvp.service.ts` (extend)
- `apps/backend/src/modules/mvp/mvp.service.test.ts` (extend)

**Why:** Бизнес-логика трёх операций: создание/обновление компании с расширенными полями + назначение компании на группу. `setGroupCounterparty` отдельный метод (а не extension `updateGroup`), чтобы не трогать существующий контракт обновления группы — конвенция Plan B.

**Tasks:**

- [x] **Step 1: Открыть `mvp.service.ts`, найти существующий `createCounterparty` / `updateCounterparty`.** Добавить рядом:

```typescript
/**
 * Phase 2 Plan C — POST расширенной компании-заказчика (ИНН, КПП, контакты, адрес, заметка).
 * Старый createCounterparty остаётся для counterparties-as-справочник use case.
 */
createCounterpartyExtended(
  tenantId: string,
  actorId: string | undefined,
  request: {
    code: string;
    name: string;
    legalName?: string;
    inn?: string;
    kpp?: string;
    contactEmail?: string;
    contactPhone?: string;
    legalAddress?: string;
    note?: string;
    status?: string;
  },
  context: RequestContext
): Counterparty {
  const entity: Counterparty = {
    id: this.id('counterparty'),
    tenantId,
    code: request.code.trim(),
    name: request.name.trim(),
    legalName: request.legalName?.trim() || undefined,
    inn: request.inn?.trim() || undefined,
    kpp: request.kpp?.trim() || undefined,
    contactEmail: request.contactEmail?.trim() || undefined,
    contactPhone: request.contactPhone?.trim() || undefined,
    legalAddress: request.legalAddress?.trim() || undefined,
    note: request.note?.trim() || undefined,
    status: request.status ?? 'active',
    createdAt: this.now(),
    updatedAt: this.now()
  };
  this.state.counterparties.push(entity);
  this.audit(
    tenantId,
    actorId,
    'crm.counterparty_created',
    'crm.counterparty',
    entity.id,
    undefined,
    entity,
    context
  );
  return entity;
}

/**
 * Phase 2 Plan C — PATCH расширенной компании.
 * Семантика: undefined → не трогать, null → очистить (для clearable полей).
 */
updateCounterpartyExtended(
  tenantId: string,
  actorId: string | undefined,
  counterpartyId: string,
  request: {
    code?: string;
    name?: string;
    legalName?: string | null;
    inn?: string | null;
    kpp?: string | null;
    contactEmail?: string | null;
    contactPhone?: string | null;
    legalAddress?: string | null;
    note?: string | null;
    status?: string;
  },
  context: RequestContext
): Counterparty {
  const current = this.getById(this.state.counterparties, tenantId, counterpartyId);
  const oldValues: Counterparty = { ...current };

  if (request.code !== undefined) current.code = request.code.trim();
  if (request.name !== undefined) current.name = request.name.trim();
  if (request.legalName !== undefined) current.legalName = request.legalName?.trim() || undefined;
  if (request.inn !== undefined) current.inn = request.inn?.trim() || undefined;
  if (request.kpp !== undefined) current.kpp = request.kpp?.trim() || undefined;
  if (request.contactEmail !== undefined) current.contactEmail = request.contactEmail?.trim() || undefined;
  if (request.contactPhone !== undefined) current.contactPhone = request.contactPhone?.trim() || undefined;
  if (request.legalAddress !== undefined) current.legalAddress = request.legalAddress?.trim() || undefined;
  if (request.note !== undefined) current.note = request.note?.trim() || undefined;
  if (request.status !== undefined) current.status = request.status;

  current.updatedAt = this.now();

  this.audit(
    tenantId,
    actorId,
    'crm.counterparty_updated',
    'crm.counterparty',
    current.id,
    oldValues,
    current,
    context
  );
  return current;
}

/**
 * Phase 2 Plan C — назначить (или снять) компанию-заказчика для группы.
 * counterpartyId === null → снять привязку. Не валидирует существование группы повторно
 * сверх getById (анти-DRY).
 */
setGroupCounterparty(
  tenantId: string,
  actorId: string | undefined,
  groupId: string,
  counterpartyId: string | null,
  context: RequestContext
): GroupEntity {
  const current = this.getById(this.state.groups, tenantId, groupId);
  const oldValues: GroupEntity = { ...current };

  if (counterpartyId !== null) {
    // Проверка, что компания существует в том же tenant.
    this.getById(this.state.counterparties, tenantId, counterpartyId);
  }

  current.counterpartyId = counterpartyId ?? undefined;
  current.updatedAt = this.now();

  this.audit(
    tenantId,
    actorId,
    counterpartyId ? 'learning.group_counterparty_linked' : 'learning.group_counterparty_unlinked',
    'learning.group',
    current.id,
    oldValues,
    current,
    context
  );
  return current;
}
```

- [x] **Step 2: Расширить `mvp.service.test.ts`** новым `describe('createCounterpartyExtended + updateCounterpartyExtended + setGroupCounterparty')` блоком с ≥8 кейсами:

```typescript
describe('Counterparty extended + group linking (Phase 2 Plan C)', () => {
  function setup() {
    // Используйте actual helper pattern из этого файла (см. Plan B Task 2 deviation
    // — там adapt'или к реальному pattern файла).
    // Возвращайте { service, audit, ctx, tenantId }.
  }

  it('createCounterpartyExtended persists all extended fields + audits', () => {
    const { service, audit, ctx } = setup();
    const cp = service.createCounterpartyExtended(
      'tenant_demo',
      'admin-1',
      {
        code: 'OOO-X',
        name: 'ООО Х',
        legalName: 'OOO Икс',
        inn: '7707083893',
        kpp: '770701001',
        contactEmail: 'a@x.ru',
        contactPhone: '+7-495-000',
        legalAddress: 'Москва',
        note: 'Заметка'
      },
      ctx
    );
    expect(cp.inn).toBe('7707083893');
    expect(cp.contactEmail).toBe('a@x.ru');
    expect(
      audit
        .list('tenant_demo')
        .some((e) => e.action === 'crm.counterparty_created' && e.entityId === cp.id)
    ).toBe(true);
  });

  it('updateCounterpartyExtended applies delta and clears nulls', () => {
    const { service, ctx } = setup();
    const cp = service.createCounterpartyExtended(
      'tenant_demo',
      'admin-1',
      { code: 'C', name: 'N', inn: '7707083893', contactEmail: 'a@x.ru' },
      ctx
    );
    const updated = service.updateCounterpartyExtended(
      'tenant_demo',
      'admin-1',
      cp.id,
      { contactEmail: null, contactPhone: '+7-499-111' },
      ctx
    );
    expect(updated.contactEmail).toBeUndefined();
    expect(updated.contactPhone).toBe('+7-499-111');
    expect(updated.inn).toBe('7707083893'); // не трогали
  });

  it('updateCounterpartyExtended throws NotFound for unknown id', () => {
    const { service, ctx } = setup();
    expect(() =>
      service.updateCounterpartyExtended('tenant_demo', 'admin-1', 'cp-nope', { name: 'X' }, ctx)
    ).toThrow(/not found/i);
  });

  it('setGroupCounterparty links group to existing counterparty', () => {
    const { service, audit, ctx } = setup();
    // Создать группу через существующий API (см. test helpers в файле).
    // const group = service.createGroup(...);
    // const cp = service.createCounterpartyExtended(...);
    // const linked = service.setGroupCounterparty('tenant_demo', 'admin-1', group.id, cp.id, ctx);
    // expect(linked.counterpartyId).toBe(cp.id);
    // expect(audit.list('tenant_demo').some(e => e.action === 'learning.group_counterparty_linked')).toBe(true);
  });

  it('setGroupCounterparty(null) unlinks the group', () => {
    // ...
  });

  it('setGroupCounterparty throws if counterparty does not exist', () => {
    // ...
  });

  it('setGroupCounterparty throws if group does not exist', () => {
    // ...
  });

  it('createCounterpartyExtended preserves status default "active"', () => {
    const { service, ctx } = setup();
    const cp = service.createCounterpartyExtended(
      'tenant_demo',
      'admin-1',
      { code: 'C', name: 'N' },
      ctx
    );
    expect(cp.status).toBe('active');
  });
});
```

> **Test helpers.** Не вводить новый helper `setup()`/`makeServices()` если в `mvp.service.test.ts` уже используется другой pattern. Plan B Task 2 показал, что файл использует inline `new MvpService(...)` per test — повторите его. Заполните placeholder-строки реальными вызовами.

- [x] **Step 3: Прогнать тесты:**

```bash
pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/mvp.service.test.ts --no-file-parallelism
```

Ожидаемо: ≥8 новых кейсов зелёные, существующие тесты не сломались.

- [x] **Step 4: Commit:**

```bash
git add apps/backend/src/modules/mvp/mvp.service.ts apps/backend/src/modules/mvp/mvp.service.test.ts
git commit -m "feat(backend): counterparty extended CRUD + group-counterparty link (Phase 2 Plan C Task 4)"
```

**Acceptance:**

- 3 новых метода: `createCounterpartyExtended`, `updateCounterpartyExtended`, `setGroupCounterparty`.
- ≥8 unit-кейсов зелёные.
- Audit пишется на каждую мутацию (`crm.counterparty_created/updated`, `learning.group_counterparty_linked/unlinked`).

---

## Task 5: Pure-function `GroupProgressSummary` aggregator

**Files:**

- `apps/backend/src/modules/mvp/group-progress-summary.service.ts` (новый)
- `apps/backend/src/modules/mvp/group-progress-summary.service.test.ts` (новый)

**Why:** Отдельный файл с pure-function агрегацией — легче тестировать, переиспользуется и для `GET /groups/:id/progress-summary`, и для `GET /counterparties/:id/progress-summary`. Уже посчитанный `completionRate` per-enrollment в `mvp.service.ts:1020` — не дублируем логику, переиспользуем.

**Tasks:**

- [x] **Step 1: Создать `apps/backend/src/modules/mvp/group-progress-summary.service.ts`:**

```typescript
import type { Enrollment, Learner, GroupCourse } from './mvp.types.js';

/** Per-group или per-counterparty прогресс summary. */
export interface GroupProgressSummary {
  groupId?: string;
  counterpartyId?: string;
  totalLearners: number;
  enrollments: {
    total: number;
    completed: number;
    inProgress: number;
    notStarted: number;
  };
  /** 0..1; среднее по completionRate всех enrollments. */
  avgCompletionRate: number;
  perCourse: Array<{ courseId: string; total: number; completed: number }>;
}

interface AggregateInput {
  enrollments: Pick<
    Enrollment,
    'id' | 'tenantId' | 'groupId' | 'learnerId' | 'courseId' | 'courseVersionId' | 'status'
  >[];
  /** Map enrollment.id -> completionRate (0..1). Передаётся из `MvpService.kpiSnapshot`. */
  completionRateByEnrollment: Map<string, number>;
}

/**
 * Phase 2 Plan C — pure-function агрегация прогресса по группе.
 * Не лезет в state — caller передаёт snapshot. Каждый enrollment учитывается один раз;
 * если enrollment.completionRate === 1 → completed; > 0 → inProgress; === 0 → notStarted.
 */
export function summarizeGroupProgress(
  groupId: string,
  input: AggregateInput
): GroupProgressSummary {
  const groupEnrollments = input.enrollments.filter((e) => e.groupId === groupId);
  return summarize({ groupId }, groupEnrollments, input.completionRateByEnrollment);
}

/**
 * Phase 2 Plan C — pure-function агрегация прогресса по всем группам компании-клиента.
 * Caller должен предварительно отфильтровать enrollments по groupIds, относящимся к counterparty.
 */
export function summarizeCounterpartyProgress(
  counterpartyId: string,
  input: AggregateInput
): GroupProgressSummary {
  return summarize({ counterpartyId }, input.enrollments, input.completionRateByEnrollment);
}

function summarize(
  context: { groupId?: string; counterpartyId?: string },
  enrollments: AggregateInput['enrollments'],
  completionRates: Map<string, number>
): GroupProgressSummary {
  let completed = 0;
  let inProgress = 0;
  let notStarted = 0;
  let sumRates = 0;
  const learnerIds = new Set<string>();
  const perCourseMap = new Map<string, { total: number; completed: number }>();

  for (const e of enrollments) {
    const rate = completionRates.get(e.id) ?? 0;
    if (rate >= 1) completed += 1;
    else if (rate > 0) inProgress += 1;
    else notStarted += 1;
    sumRates += rate;
    learnerIds.add(e.learnerId);

    const courseId = e.courseId;
    const courseAgg = perCourseMap.get(courseId) ?? { total: 0, completed: 0 };
    courseAgg.total += 1;
    if (rate >= 1) courseAgg.completed += 1;
    perCourseMap.set(courseId, courseAgg);
  }

  const total = enrollments.length;
  return {
    ...(context.groupId !== undefined ? { groupId: context.groupId } : {}),
    ...(context.counterpartyId !== undefined ? { counterpartyId: context.counterpartyId } : {}),
    totalLearners: learnerIds.size,
    enrollments: { total, completed, inProgress, notStarted },
    avgCompletionRate: total === 0 ? 0 : sumRates / total,
    perCourse: Array.from(perCourseMap.entries()).map(([courseId, { total, completed }]) => ({
      courseId,
      total,
      completed
    }))
  };
}
```

> **`exactOptionalPropertyTypes: true`.** Условный spread `{ ...(x !== undefined ? { groupId: x } : {}) }` нужен потому что `GroupProgressSummary.groupId?: string` не принимает `undefined` explicit.

- [x] **Step 2: Создать `apps/backend/src/modules/mvp/group-progress-summary.service.test.ts`** с ≥8 кейсами:

```typescript
import { describe, expect, it } from 'vitest';
import {
  summarizeGroupProgress,
  summarizeCounterpartyProgress
} from './group-progress-summary.service.js';

const ENROLLMENT_BASE = {
  tenantId: 'tenant_demo',
  groupId: 'g-1',
  status: 'active' as const
};

describe('summarizeGroupProgress', () => {
  it('returns empty summary for group with no enrollments', () => {
    const r = summarizeGroupProgress('g-1', {
      enrollments: [],
      completionRateByEnrollment: new Map()
    });
    expect(r.groupId).toBe('g-1');
    expect(r.totalLearners).toBe(0);
    expect(r.enrollments).toEqual({ total: 0, completed: 0, inProgress: 0, notStarted: 0 });
    expect(r.avgCompletionRate).toBe(0);
    expect(r.perCourse).toEqual([]);
  });

  it('classifies completion buckets correctly', () => {
    const r = summarizeGroupProgress('g-1', {
      enrollments: [
        { ...ENROLLMENT_BASE, id: 'e1', learnerId: 'l1', courseId: 'c1', courseVersionId: 'cv1' },
        { ...ENROLLMENT_BASE, id: 'e2', learnerId: 'l2', courseId: 'c1', courseVersionId: 'cv1' },
        { ...ENROLLMENT_BASE, id: 'e3', learnerId: 'l3', courseId: 'c2', courseVersionId: 'cv2' }
      ],
      completionRateByEnrollment: new Map([
        ['e1', 1],
        ['e2', 0.5],
        ['e3', 0]
      ])
    });
    expect(r.enrollments.completed).toBe(1);
    expect(r.enrollments.inProgress).toBe(1);
    expect(r.enrollments.notStarted).toBe(1);
  });

  it('counts unique learners across multiple enrollments', () => {
    const r = summarizeGroupProgress('g-1', {
      enrollments: [
        { ...ENROLLMENT_BASE, id: 'e1', learnerId: 'l1', courseId: 'c1', courseVersionId: 'cv1' },
        { ...ENROLLMENT_BASE, id: 'e2', learnerId: 'l1', courseId: 'c2', courseVersionId: 'cv2' } // same learner
      ],
      completionRateByEnrollment: new Map([
        ['e1', 1],
        ['e2', 0]
      ])
    });
    expect(r.totalLearners).toBe(1);
    expect(r.enrollments.total).toBe(2);
  });

  it('computes avgCompletionRate as average of rates', () => {
    const r = summarizeGroupProgress('g-1', {
      enrollments: [
        { ...ENROLLMENT_BASE, id: 'e1', learnerId: 'l1', courseId: 'c1', courseVersionId: 'cv1' },
        { ...ENROLLMENT_BASE, id: 'e2', learnerId: 'l2', courseId: 'c1', courseVersionId: 'cv1' }
      ],
      completionRateByEnrollment: new Map([
        ['e1', 1],
        ['e2', 0.5]
      ])
    });
    expect(r.avgCompletionRate).toBeCloseTo(0.75, 5);
  });

  it('groups perCourse aggregation correctly', () => {
    const r = summarizeGroupProgress('g-1', {
      enrollments: [
        { ...ENROLLMENT_BASE, id: 'e1', learnerId: 'l1', courseId: 'c1', courseVersionId: 'cv1' },
        { ...ENROLLMENT_BASE, id: 'e2', learnerId: 'l2', courseId: 'c1', courseVersionId: 'cv1' },
        { ...ENROLLMENT_BASE, id: 'e3', learnerId: 'l3', courseId: 'c2', courseVersionId: 'cv2' }
      ],
      completionRateByEnrollment: new Map([
        ['e1', 1],
        ['e2', 1],
        ['e3', 0.3]
      ])
    });
    const c1 = r.perCourse.find((p) => p.courseId === 'c1');
    const c2 = r.perCourse.find((p) => p.courseId === 'c2');
    expect(c1).toEqual({ courseId: 'c1', total: 2, completed: 2 });
    expect(c2).toEqual({ courseId: 'c2', total: 1, completed: 0 });
  });

  it('filters out enrollments of other groups', () => {
    const r = summarizeGroupProgress('g-1', {
      enrollments: [
        { ...ENROLLMENT_BASE, id: 'e1', learnerId: 'l1', courseId: 'c1', courseVersionId: 'cv1' },
        {
          ...ENROLLMENT_BASE,
          groupId: 'g-other',
          id: 'e2',
          learnerId: 'l2',
          courseId: 'c1',
          courseVersionId: 'cv1'
        }
      ],
      completionRateByEnrollment: new Map([
        ['e1', 1],
        ['e2', 1]
      ])
    });
    expect(r.enrollments.total).toBe(1);
  });

  it('treats missing completionRate as 0', () => {
    const r = summarizeGroupProgress('g-1', {
      enrollments: [
        {
          ...ENROLLMENT_BASE,
          id: 'e-no-rate',
          learnerId: 'l1',
          courseId: 'c1',
          courseVersionId: 'cv1'
        }
      ],
      completionRateByEnrollment: new Map()
    });
    expect(r.enrollments.notStarted).toBe(1);
    expect(r.avgCompletionRate).toBe(0);
  });
});

describe('summarizeCounterpartyProgress', () => {
  it('aggregates across multiple groups (caller filters)', () => {
    const r = summarizeCounterpartyProgress('cp-1', {
      enrollments: [
        {
          ...ENROLLMENT_BASE,
          groupId: 'g-1',
          id: 'e1',
          learnerId: 'l1',
          courseId: 'c1',
          courseVersionId: 'cv1'
        },
        {
          ...ENROLLMENT_BASE,
          groupId: 'g-2',
          id: 'e2',
          learnerId: 'l2',
          courseId: 'c1',
          courseVersionId: 'cv1'
        }
      ],
      completionRateByEnrollment: new Map([
        ['e1', 1],
        ['e2', 0.5]
      ])
    });
    expect(r.counterpartyId).toBe('cp-1');
    expect(r.enrollments.total).toBe(2);
    expect(r.enrollments.completed).toBe(1);
    expect(r.avgCompletionRate).toBeCloseTo(0.75, 5);
  });
});
```

- [x] **Step 3: Прогнать тесты:**

```bash
pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/group-progress-summary.service.test.ts --no-file-parallelism
```

Ожидаемо: 8 кейсов зелёные.

- [x] **Step 4: Commit:**

```bash
git add apps/backend/src/modules/mvp/group-progress-summary.service.ts apps/backend/src/modules/mvp/group-progress-summary.service.test.ts
git commit -m "feat(backend): GroupProgressSummary pure-function aggregator (Phase 2 Plan C Task 5)"
```

**Acceptance:**

- Pure-function модуль создан, 0 side effects.
- 8 unit-кейсов зелёные.
- Покрывает edge cases: пустая группа, mixed completion buckets, дубль learner, фильтр по groupId, missing rate.

---

## Task 6: Service wiring + new endpoints — `GET /groups/:id/progress-summary` + `GET /counterparties/:id/progress-summary` + controller endpoints для Task 4 методов

**Files:**

- `apps/backend/src/modules/mvp/mvp.service.ts` (extend)
- `apps/backend/src/modules/mvp/mvp.controller.ts` (extend)

**Why:** Подключить pure-function summarize к реальному state через `MvpService`. Добавить endpoint'ы:

- `POST /counterparties/extended` — Task 4 `createCounterpartyExtended` (или альтернатива: использовать существующий `POST /counterparties` через DTO sniffing — но по Plan B convention новый путь чище).
- `PATCH /counterparties/:id/profile` — Task 4 `updateCounterpartyExtended` (симметрично `/learners/:id/profile`).
- `PATCH /groups/:id/counterparty` — Task 4 `setGroupCounterparty`. Body: `{ counterpartyId: string | null }`.
- `GET /groups/:id/progress-summary` — агрегатор Task 5.
- `GET /counterparties/:id/progress-summary` — агрегатор Task 5.

**Tasks:**

- [x] **Step 1: В `mvp.service.ts` добавить wiring-методы:**

```typescript
/**
 * Phase 2 Plan C — собирает прогресс по группе через pure-function summarizer.
 * Берёт enrollments этого tenant + completionRate из kpiSnapshot.
 */
getGroupProgressSummary(tenantId: string, groupId: string): GroupProgressSummary {
  // Подтверждаем что группа существует и в этом tenant (анти-IDOR через tenant boundary).
  this.getById(this.state.groups, tenantId, groupId);

  const enrollments = this.state.enrollments.filter((e) => e.tenantId === tenantId);
  const rates = this.computeCompletionRatesByEnrollment(tenantId);
  return summarizeGroupProgress(groupId, { enrollments, completionRateByEnrollment: rates });
}

/**
 * Phase 2 Plan C — собирает прогресс по компании-клиенту = сумма по всем её группам.
 */
getCounterpartyProgressSummary(tenantId: string, counterpartyId: string): GroupProgressSummary {
  this.getById(this.state.counterparties, tenantId, counterpartyId);

  const groupIds = new Set(
    this.state.groups
      .filter((g) => g.tenantId === tenantId && g.counterpartyId === counterpartyId)
      .map((g) => g.id)
  );
  const enrollments = this.state.enrollments.filter(
    (e) => e.tenantId === tenantId && groupIds.has(e.groupId)
  );
  const rates = this.computeCompletionRatesByEnrollment(tenantId);
  return summarizeCounterpartyProgress(counterpartyId, { enrollments, completionRateByEnrollment: rates });
}

/**
 * Helper: возвращает Map enrollmentId → completionRate (0..1).
 * Использует тот же расчёт, что и существующий KPI snapshot (см. ~строка 1020) —
 * вынесено в helper для переиспользования, без изменения старого pipeline.
 */
private computeCompletionRatesByEnrollment(tenantId: string): Map<string, number> {
  // ... делегирование к существующему private helper'у в mvp.service.ts.
  // Если в service.ts нет такого helper'а — извлечь логику из KPI snapshot блока
  // (~line 1020 use `completionRate = completed / total`) в private метод,
  // используемый и старым и новым кодом. DRY.
}
```

> **DRY warning.** Если в `mvp.service.ts` уже есть похожий расчёт в KPI snapshot — **выделить его в private helper** и переиспользовать, а не копировать. Если выделение требует серьёзного рефактора — оставить как DEVIATION в Task 14 closeout и вызвать существующий KPI helper напрямую.

- [x] **Step 2: Импорт в `mvp.service.ts`:**

```typescript
import {
  summarizeGroupProgress,
  summarizeCounterpartyProgress
} from './group-progress-summary.service.js';
import type { GroupProgressSummary } from './group-progress-summary.service.js';
```

- [x] **Step 3: В `mvp.controller.ts` добавить 5 новых endpoint'ов рядом с существующими counterparties:**

```typescript
// Импорты в начале файла:
import { CreateCounterpartyExtendedRequest } from './create-counterparty-extended.dto.js';
import { UpdateCounterpartyExtendedRequest } from './update-counterparty-extended.dto.js';
import { IsString, ValidateIf } from 'class-validator';

// Inline mini-DTO для setGroupCounterparty body (alternatively — отдельный файл).
class SetGroupCounterpartyRequest {
  @ValidateIf((_, v) => v !== null)
  @IsString()
  counterpartyId!: string | null;
}

// Endpoints (рядом с существующими counterparties):

@Post('counterparties/extended')
@UseGuards(PermissionGuard)
@RequirePermissions('counterparties.write')
createCounterpartyExtended(@CurrentContext() c: RequestContext, @Body() raw: unknown) {
  const b = assertValidDto(CreateCounterpartyExtendedRequest, raw);
  return this.mvpService.createCounterpartyExtended(c.tenantId!, c.userId, b, c);
}

@Patch('counterparties/:id/profile')
@UseGuards(PermissionGuard)
@RequirePermissions('counterparties.write')
updateCounterpartyExtended(
  @CurrentContext() c: RequestContext,
  @Param('id') id: string,
  @Body() raw: unknown
) {
  const b = assertValidDto(UpdateCounterpartyExtendedRequest, raw);
  return this.mvpService.updateCounterpartyExtended(c.tenantId!, c.userId, id, b, c);
}

@Get('counterparties/:id/progress-summary')
@UseGuards(PermissionGuard)
@RequirePermissions('counterparties.read', 'enrollments.read')
getCounterpartyProgressSummary(@CurrentContext() c: RequestContext, @Param('id') id: string) {
  return this.mvpService.getCounterpartyProgressSummary(c.tenantId!, id);
}

@Patch('groups/:id/counterparty')
@UseGuards(PermissionGuard)
@RequirePermissions('counterparties.write')
setGroupCounterparty(
  @CurrentContext() c: RequestContext,
  @Param('id') id: string,
  @Body() raw: unknown
) {
  const b = assertValidDto(SetGroupCounterpartyRequest, raw);
  return this.mvpService.setGroupCounterparty(c.tenantId!, c.userId, id, b.counterpartyId, c);
}

@Get('groups/:id/progress-summary')
@UseGuards(PermissionGuard)
@RequirePermissions('enrollments.read')
getGroupProgressSummary(@CurrentContext() c: RequestContext, @Param('id') id: string) {
  return this.mvpService.getGroupProgressSummary(c.tenantId!, id);
}
```

> **Permission combinations:** `progress-summary` endpoints требуют `enrollments.read` (поток данных — enrollment progress). Counterparty endpoint требует ОБА — потому что показывает данные через клиент-абстракцию. `setGroupCounterparty` требует `counterparties.write` потому что меняет связь компании.

- [x] **Step 4: Прогнать typecheck:**

```bash
pnpm --filter @cdoprof/backend exec tsc --noEmit
```

Ожидаемо: 0 ошибок.

- [x] **Step 5: Добавить ≥5 HTTP integration кейсов в `mvp.http.integration.test.ts`** (по Plan A/B stub-controller pattern):

```typescript
describe('Counterparty extended + group progress (Plan C)', () => {
  it('PATCH /counterparties/:id/profile — 401 auth_required', async () => {
    /* ... */
  });
  it('PATCH /counterparties/:id/profile — 403 permission_denied without counterparties.write', async () => {
    /* ... */
  });
  it('PATCH /counterparties/:id/profile — 200 success', async () => {
    /* ... */
  });
  it('GET /groups/:id/progress-summary — 403 without enrollments.read', async () => {
    /* ... */
  });
  it('GET /counterparties/:id/progress-summary — 403 without combined perms', async () => {
    /* ... */
  });
});
```

- [x] **Step 6: Прогнать integration tests:**

```bash
pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/mvp.http.integration.test.ts --no-file-parallelism
```

Ожидаемо: 5 новых кейсов зелёные, прежние не сломаны.

- [x] **Step 7: Commit:**

```bash
git add apps/backend/src/modules/mvp/mvp.service.ts apps/backend/src/modules/mvp/mvp.controller.ts apps/backend/src/modules/mvp/mvp.http.integration.test.ts
git commit -m "feat(backend): counterparty extended endpoints + group/counterparty progress summary (Phase 2 Plan C Task 6)"
```

**Acceptance:**

- 5 новых endpoints доступны и защищены правильными permissions.
- HTTP integration ≥5 кейсов зелёные.
- DRY: `computeCompletionRatesByEnrollment` переиспользует существующий KPI расчёт.

---

## Task 7: Frontend types + api + hooks для clients feature

**Files:**

- `apps/frontend/src/features/clients/types.ts` (новый)
- `apps/frontend/src/features/clients/api.ts` (новый)
- `apps/frontend/src/features/clients/hooks.ts` (новый)

**Why:** Изолировать REST-клиент и типы новой фичи. Pattern Plan B (`learnersApi.list/updateProfile`) симметрично переносится на clients.

**Tasks:**

- [x] **Step 1: Создать `apps/frontend/src/features/clients/types.ts`:**

```typescript
export type ClientStatus = 'active' | 'archived';

export interface ClientListItem {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  legalName?: string;
  inn?: string;
  kpp?: string;
  contactEmail?: string;
  contactPhone?: string;
  legalAddress?: string;
  note?: string;
  status: ClientStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ClientsListResponse {
  items: ClientListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ClientsListFilters {
  q?: string;
  status?: ClientStatus;
  page?: number;
  pageSize?: number;
}

export interface CreateClientPayload {
  code: string;
  name: string;
  legalName?: string;
  inn?: string;
  kpp?: string;
  contactEmail?: string;
  contactPhone?: string;
  legalAddress?: string;
  note?: string;
}

export interface UpdateClientPayload {
  code?: string;
  name?: string;
  legalName?: string | null;
  inn?: string | null;
  kpp?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  legalAddress?: string | null;
  note?: string | null;
  status?: ClientStatus;
}

export interface ClientProgressSummary {
  counterpartyId: string;
  totalLearners: number;
  enrollments: { total: number; completed: number; inProgress: number; notStarted: number };
  avgCompletionRate: number;
  perCourse: Array<{ courseId: string; total: number; completed: number }>;
}

export interface GroupProgressSummary {
  groupId: string;
  totalLearners: number;
  enrollments: { total: number; completed: number; inProgress: number; notStarted: number };
  avgCompletionRate: number;
  perCourse: Array<{ courseId: string; total: number; completed: number }>;
}

export interface ClientEditFormState {
  code: string;
  name: string;
  legalName: string;
  inn: string;
  kpp: string;
  contactEmail: string;
  contactPhone: string;
  legalAddress: string;
  note: string;
  status: ClientStatus;
}
```

- [x] **Step 2: Создать `apps/frontend/src/features/clients/api.ts`:**

Mirror Plan B `learnersApi` pattern. Read `apps/frontend/src/features/learners/api.ts` first as the ground truth.

```typescript
import { apiRequest } from '../../lib/api/client';
import type { UserSession } from '../../entities/session/model';
import type {
  ClientListItem,
  ClientProgressSummary,
  ClientsListFilters,
  ClientsListResponse,
  CreateClientPayload,
  UpdateClientPayload
} from './types';

const withAuth = (session: UserSession) => ({
  auth: {
    userId: session.user.id,
    tenantId: session.user.tenantId,
    accessToken: session.tokens.accessToken
  }
});

export const clientsApi = {
  list: (session: UserSession, filters: ClientsListFilters): Promise<ClientsListResponse> => {
    const params = new URLSearchParams();
    if (filters.q) params.set('q', filters.q);
    if (filters.status) params.set('status', filters.status);
    if (filters.page !== undefined) params.set('page', String(filters.page));
    if (filters.pageSize !== undefined) params.set('page_size', String(filters.pageSize));
    const qs = params.toString();
    return apiRequest<ClientsListResponse>(qs ? `/counterparties?${qs}` : '/counterparties', {
      method: 'GET',
      ...withAuth(session)
    });
  },

  get: (session: UserSession, id: string): Promise<ClientListItem> =>
    apiRequest<ClientListItem>(`/counterparties/${id}`, { method: 'GET', ...withAuth(session) }),

  create: (session: UserSession, payload: CreateClientPayload): Promise<ClientListItem> =>
    apiRequest<ClientListItem>('/counterparties/extended', {
      method: 'POST',
      body: payload,
      ...withAuth(session)
    }),

  updateProfile: (
    session: UserSession,
    id: string,
    payload: UpdateClientPayload
  ): Promise<ClientListItem> =>
    apiRequest<ClientListItem>(`/counterparties/${id}/profile`, {
      method: 'PATCH',
      body: payload,
      ...withAuth(session)
    }),

  getProgressSummary: (session: UserSession, id: string): Promise<ClientProgressSummary> =>
    apiRequest<ClientProgressSummary>(`/counterparties/${id}/progress-summary`, {
      method: 'GET',
      ...withAuth(session)
    }),

  setGroupCounterparty: (
    session: UserSession,
    groupId: string,
    counterpartyId: string | null
  ): Promise<void> =>
    apiRequest<void>(`/groups/${groupId}/counterparty`, {
      method: 'PATCH',
      body: { counterpartyId },
      ...withAuth(session)
    }),

  getGroupProgressSummary: (session: UserSession, groupId: string) =>
    apiRequest<GroupProgressSummary>(`/groups/${groupId}/progress-summary`, {
      method: 'GET',
      ...withAuth(session)
    })
};
```

- [x] **Step 3: Создать `apps/frontend/src/features/clients/hooks.ts`:**

```typescript
'use client';
import { useQuery } from '../../lib/query/react-query-shim';
import { useState } from 'react';
import { useAuth } from '../auth/context';
import { clientsApi } from './api';
import type {
  ClientListItem,
  ClientsListFilters,
  CreateClientPayload,
  UpdateClientPayload
} from './types';

export function useClientsList(filters: ClientsListFilters) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['clients-list', filters],
    queryFn: () => clientsApi.list(session!, filters),
    enabled: Boolean(session)
  });
}

export function useClient(id: string | null) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['client-detail', id],
    queryFn: () => clientsApi.get(session!, id!),
    enabled: Boolean(session) && Boolean(id)
  });
}

export function useClientProgress(id: string | null) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['client-progress', id],
    queryFn: () => clientsApi.getProgressSummary(session!, id!),
    enabled: Boolean(session) && Boolean(id)
  });
}

export function useGroupProgress(groupId: string | null) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['group-progress', groupId],
    queryFn: () => clientsApi.getGroupProgressSummary(session!, groupId!),
    enabled: Boolean(session) && Boolean(groupId)
  });
}

export function useCreateClient() {
  const { session } = useAuth();
  const [state, setState] = useState<{
    isPending: boolean;
    error: string | null;
    data: ClientListItem | null;
  }>({
    isPending: false,
    error: null,
    data: null
  });
  async function mutate(payload: CreateClientPayload) {
    setState({ isPending: true, error: null, data: null });
    try {
      const data = await clientsApi.create(session!, payload);
      setState({ isPending: false, error: null, data });
      return data;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setState({ isPending: false, error: message, data: null });
      return null;
    }
  }
  return { ...state, mutate, reset: () => setState({ isPending: false, error: null, data: null }) };
}

export function useUpdateClientProfile() {
  const { session } = useAuth();
  const [state, setState] = useState<{
    isPending: boolean;
    error: string | null;
    data: ClientListItem | null;
  }>({
    isPending: false,
    error: null,
    data: null
  });
  async function mutate(id: string, payload: UpdateClientPayload) {
    setState({ isPending: true, error: null, data: null });
    try {
      const data = await clientsApi.updateProfile(session!, id, payload);
      setState({ isPending: false, error: null, data });
      return data;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setState({ isPending: false, error: message, data: null });
      return null;
    }
  }
  return { ...state, mutate, reset: () => setState({ isPending: false, error: null, data: null }) };
}

export function useSetGroupCounterparty() {
  const { session } = useAuth();
  const [state, setState] = useState<{ isPending: boolean; error: string | null }>({
    isPending: false,
    error: null
  });
  async function mutate(groupId: string, counterpartyId: string | null) {
    setState({ isPending: true, error: null });
    try {
      await clientsApi.setGroupCounterparty(session!, groupId, counterpartyId);
      setState({ isPending: false, error: null });
      return true;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setState({ isPending: false, error: message });
      return false;
    }
  }
  return { ...state, mutate, reset: () => setState({ isPending: false, error: null }) };
}
```

> **`useAuth` + `react-query-shim`.** Plan B Task 5 deviation #2-#3 показал реальные пути. Используйте те же.

- [x] **Step 4: Прогнать typecheck:**

```bash
pnpm --filter @cdoprof/frontend exec tsc --noEmit
```

Ожидаемо: 0 ошибок.

- [x] **Step 5: Commit:**

```bash
git add apps/frontend/src/features/clients/types.ts apps/frontend/src/features/clients/api.ts apps/frontend/src/features/clients/hooks.ts
git commit -m "feat(frontend): clients feature — types + api + hooks (Phase 2 Plan C Task 7)"
```

**Acceptance:**

- 3 новых файла существуют.
- Typecheck зелёный.
- API endpoint paths корректны: `/counterparties`, `/counterparties/:id`, `/counterparties/extended`, `/counterparties/:id/profile`, `/counterparties/:id/progress-summary`, `/groups/:id/counterparty`, `/groups/:id/progress-summary`.

---

## Task 8: Frontend api.contract.test.ts

**Files:**

- `apps/frontend/src/features/clients/api.contract.test.ts` (новый)

**Why:** Contract-тесты гарантируют, что URL/method/body совпадают с backend. Pattern: `vi.stubGlobal('fetch', ...)`, ровно по Plan B reference.

**Tasks:**

- [x] **Step 1: Read** `apps/frontend/src/features/learners/api.contract.test.ts` для exact pattern.

- [x] **Step 2: Создать `apps/frontend/src/features/clients/api.contract.test.ts`** с ≥6 кейсами:

1. `clientsApi.list` with filters → URL with `q`/`status`/`page`/`page_size`.
2. `clientsApi.list` with empty filters → clean `/counterparties` URL.
3. `clientsApi.get` → `/counterparties/:id` GET.
4. `clientsApi.create` → `/counterparties/extended` POST with body.
5. `clientsApi.updateProfile` → `/counterparties/:id/profile` PATCH with body.
6. `clientsApi.getProgressSummary` → `/counterparties/:id/progress-summary` GET.
7. `clientsApi.setGroupCounterparty(groupId, cpId)` → `/groups/:id/counterparty` PATCH with `{ counterpartyId }`.
8. `clientsApi.setGroupCounterparty(groupId, null)` → same PATCH with `{ counterpartyId: null }` (unlink).
9. `clientsApi.getGroupProgressSummary` → `/groups/:id/progress-summary` GET.

Используйте тот же `stubFetchOnceWithBody(body, status)` helper, что Plan B.

- [x] **Step 3: Прогнать:**

```bash
pnpm --filter @cdoprof/frontend exec vitest run src/features/clients/api.contract.test.ts --no-file-parallelism
```

Ожидаемо: 9 кейсов зелёные.

- [x] **Step 4: Commit:**

```bash
git add apps/frontend/src/features/clients/api.contract.test.ts
git commit -m "test(frontend): clients api contract (Phase 2 Plan C Task 8)"
```

**Acceptance:**

- 9 contract-кейсов зелёные.
- URL paths matched backend Task 6 endpoints exactly.

---

## Task 9: Frontend formatters

**Files:**

- `apps/frontend/src/features/clients/format.ts` (новый)
- `apps/frontend/src/features/clients/format.test.ts` (новый)

**Why:** ИНН-маска (4-2-4-3 группировка плохо смотрится; стандарт — без пробелов), КПП-mask, телефон-нормализация, progress label, `buildUpdatePayload` для drawer'а.

**Tasks:**

- [x] **Step 1: Создать `apps/frontend/src/features/clients/format.ts`:**

```typescript
import type {
  ClientListItem,
  ClientStatus,
  ClientEditFormState,
  UpdateClientPayload
} from './types';

export const CLIENT_STATUS_LABEL: Record<ClientStatus, string> = {
  active: 'Активна',
  archived: 'В архиве'
};

export function formatInn(inn: string | undefined): string {
  if (!inn) return '—';
  const digits = inn.replace(/\D/g, '');
  if (digits.length === 10 || digits.length === 12) return digits;
  return inn;
}

/** Телефон: оставляет ввод как есть, если уже маска; иначе нормализует к +7 (XXX) XXX-XX-XX. */
export function formatPhone(phone: string | undefined): string {
  if (!phone) return '—';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11 && (digits.startsWith('7') || digits.startsWith('8'))) {
    return `+7 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9, 11)}`;
  }
  return phone;
}

/** 0..1 → «X из Y (Z%)». */
export function formatProgressLabel(completed: number, total: number): string {
  if (total === 0) return '0 из 0';
  const percent = Math.round((completed / total) * 100);
  return `${completed} из ${total} (${percent}%)`;
}

export function buildClientUpdatePayload(form: ClientEditFormState): UpdateClientPayload {
  const nullable = (v: string): string | null => (v.trim() ? v.trim() : null);
  const required = (v: string): string => v.trim();
  return {
    code: required(form.code),
    name: required(form.name),
    legalName: nullable(form.legalName),
    inn: nullable(form.inn),
    kpp: nullable(form.kpp),
    contactEmail: nullable(form.contactEmail),
    contactPhone: nullable(form.contactPhone),
    legalAddress: nullable(form.legalAddress),
    note: nullable(form.note),
    status: form.status
  };
}

export function buildClientCreatePayload(form: ClientEditFormState) {
  return {
    code: form.code.trim(),
    name: form.name.trim(),
    ...(form.legalName.trim() ? { legalName: form.legalName.trim() } : {}),
    ...(form.inn.trim() ? { inn: form.inn.trim() } : {}),
    ...(form.kpp.trim() ? { kpp: form.kpp.trim() } : {}),
    ...(form.contactEmail.trim() ? { contactEmail: form.contactEmail.trim() } : {}),
    ...(form.contactPhone.trim() ? { contactPhone: form.contactPhone.trim() } : {}),
    ...(form.legalAddress.trim() ? { legalAddress: form.legalAddress.trim() } : {}),
    ...(form.note.trim() ? { note: form.note.trim() } : {})
  };
}

export function emptyClientForm(): ClientEditFormState {
  return {
    code: '',
    name: '',
    legalName: '',
    inn: '',
    kpp: '',
    contactEmail: '',
    contactPhone: '',
    legalAddress: '',
    note: '',
    status: 'active'
  };
}

export function toEditFormState(client: ClientListItem): ClientEditFormState {
  return {
    code: client.code,
    name: client.name,
    legalName: client.legalName ?? '',
    inn: client.inn ?? '',
    kpp: client.kpp ?? '',
    contactEmail: client.contactEmail ?? '',
    contactPhone: client.contactPhone ?? '',
    legalAddress: client.legalAddress ?? '',
    note: client.note ?? '',
    status: client.status
  };
}
```

- [x] **Step 2: Создать `apps/frontend/src/features/clients/format.test.ts`** с ≥10 кейсами (по 1-3 на каждую функцию: формат ИНН 10/12/invalid, телефон валидный/невалидный/без формата, progress label с edge cases 0/0 и 100%, buildClientUpdatePayload с nulls, buildClientCreatePayload без empty fields, emptyClientForm, toEditFormState, CLIENT_STATUS_LABEL).

- [x] **Step 3: Прогнать:**

```bash
pnpm --filter @cdoprof/frontend exec vitest run src/features/clients/format.test.ts --no-file-parallelism
```

Ожидаемо: ≥10 кейсов зелёные.

- [x] **Step 4: Commit:**

```bash
git add apps/frontend/src/features/clients/format.ts apps/frontend/src/features/clients/format.test.ts
git commit -m "feat(frontend): clients formatters (Phase 2 Plan C Task 9)"
```

**Acceptance:**

- 6 exports + 1 helper = 7 формат-функций.
- ≥10 unit-кейсов зелёные.

---

## Task 10: Clients list screen

**Files:**

- `apps/frontend/src/features/clients/clients-list-screen.tsx` (новый)

**Why:** Главный экран фичи — список компаний с фильтром, поиском, пагинацией, кнопкой создания. По образцу `learners-list-screen.tsx` (Plan B Task 8).

**Tasks:**

- [x] **Step 1: Read** `apps/frontend/src/features/learners/learners-list-screen.tsx` для shape реальных `@cdoprof/ui` сигнатур (Plan B adapted: `Column.title`, `Pagination.totalPages`, native `<select>`, `StatusChip` raw, etc.).

- [x] **Step 2: Создать `apps/frontend/src/features/clients/clients-list-screen.tsx`:**

```typescript
'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Column, DataTable, FilterBar, Pagination, SearchInput, StatusChip } from '@cdoprof/ui';
import { LoadingState, PageContainer, PageHeader, SectionCard, SectionEmpty, SectionError } from '@/components';
import { useClientsList } from './hooks';
import { CLIENT_STATUS_LABEL, formatInn } from './format';
import { ClientEditDrawer } from './client-edit-drawer';
import type { ClientListItem, ClientStatus, ClientsListFilters } from './types';

const STATUS_OPTIONS: Array<{ value: '' | ClientStatus; label: string }> = [
  { value: '', label: 'Все статусы' },
  { value: 'active', label: CLIENT_STATUS_LABEL.active },
  { value: 'archived', label: CLIENT_STATUS_LABEL.archived }
];

const PAGE_SIZE = 20;

export function ClientsListScreen() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'' | ClientStatus>('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);

  const filters: ClientsListFilters = useMemo(
    () => ({
      ...(q.trim() ? { q: q.trim() } : {}),
      ...(status ? { status } : {}),
      page,
      pageSize: PAGE_SIZE
    }),
    [q, status, page]
  );

  const list = useClientsList(filters);
  const totalPages = list.data ? Math.max(1, Math.ceil(list.data.total / PAGE_SIZE)) : 1;

  const columns: Column<ClientListItem>[] = [
    { key: 'code', title: 'Код', render: (row) => row.code },
    {
      key: 'name',
      title: 'Название',
      render: (row) => <Link href={`/admin/clients/${row.id}`}>{row.name}</Link>
    },
    { key: 'inn', title: 'ИНН', render: (row) => formatInn(row.inn) },
    { key: 'contactEmail', title: 'Email', render: (row) => row.contactEmail ?? '—' },
    { key: 'contactPhone', title: 'Телефон', render: (row) => row.contactPhone ?? '—' },
    { key: 'status', title: 'Статус', render: (row) => <StatusChip status={CLIENT_STATUS_LABEL[row.status]} /> }
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Компании"
        description="Список компаний-заказчиков. Создавайте новые, редактируйте контакты, привязывайте группы."
        actions={
          <button type="button" onClick={() => setCreating(true)}>
            Добавить компанию
          </button>
        }
      />

      <FilterBar>
        <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} />
        <select
          className="ui-select"
          value={status}
          onChange={(e) => { setStatus(e.target.value as '' | ClientStatus); setPage(1); }}
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </FilterBar>

      <SectionCard title="Список компаний">
        {list.isLoading ? (
          <LoadingState />
        ) : list.error ? (
          <SectionError message={(list.error as Error).message} />
        ) : !list.data || list.data.items.length === 0 ? (
          <SectionEmpty title="Компаний нет" description="По текущим фильтрам ничего не найдено." />
        ) : (
          <>
            <DataTable columns={columns} rows={list.data.items} getRowKey={(r) => r.id} />
            <Pagination totalPages={totalPages} currentPage={page} onPageChange={setPage} />
          </>
        )}
      </SectionCard>

      {creating && (
        <ClientEditDrawer mode="create" onClose={() => setCreating(false)} onSaved={() => { setCreating(false); list.refetch(); }} />
      )}
    </PageContainer>
  );
}
```

- [x] **Step 3: Прогнать typecheck:**

```bash
pnpm --filter @cdoprof/frontend exec tsc --noEmit
```

Ожидаемо: 0 ошибок (после Task 11 drawer создан; если Task 11 идёт после — пометить как DONE_WITH_CONCERNS до Task 11).

- [x] **Step 4: Commit (если typecheck зелёный):**

```bash
git add apps/frontend/src/features/clients/clients-list-screen.tsx
git commit -m "feat(frontend): clients list screen (Phase 2 Plan C Task 10)"
```

**Acceptance:**

- Экран рендерит filter+table+pagination+create button.
- «Имя» — link на `/admin/clients/:id`.

---

## Task 11: Client edit drawer (create + edit modes)

**Files:**

- `apps/frontend/src/features/clients/client-edit-drawer.tsx` (новый)

**Why:** Один компонент для двух режимов — create (без id) и edit (с pre-fill из `ClientListItem`). По Plan B drawer pattern.

**Tasks:**

- [x] **Step 1: Создать `apps/frontend/src/features/clients/client-edit-drawer.tsx`:**

```typescript
'use client';
import { useState } from 'react';
import { Dialog } from '@cdoprof/ui';
import { useCreateClient, useUpdateClientProfile } from './hooks';
import {
  buildClientCreatePayload,
  buildClientUpdatePayload,
  CLIENT_STATUS_LABEL,
  emptyClientForm,
  toEditFormState
} from './format';
import type { ClientEditFormState, ClientListItem, ClientStatus } from './types';

interface ClientEditDrawerProps {
  mode: 'create' | 'edit';
  client?: ClientListItem; // required when mode === 'edit'
  onClose: () => void;
  onSaved: () => void;
}

export function ClientEditDrawer({ mode, client, onClose, onSaved }: ClientEditDrawerProps) {
  const [form, setForm] = useState<ClientEditFormState>(() =>
    mode === 'edit' && client ? toEditFormState(client) : emptyClientForm()
  );
  const createMut = useCreateClient();
  const updateMut = useUpdateClientProfile();
  const mutation = mode === 'edit' ? updateMut : createMut;

  function setField<K extends keyof ClientEditFormState>(key: K, value: ClientEditFormState[K]) {
    setForm((p) => ({ ...p, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.code.trim() || !form.name.trim()) return;
    if (mode === 'create') {
      const result = await createMut.mutate(buildClientCreatePayload(form));
      if (result) onSaved();
    } else if (client) {
      const result = await updateMut.mutate(client.id, buildClientUpdatePayload(form));
      if (result) onSaved();
    }
  }

  const title = mode === 'create' ? 'Добавить компанию' : `Редактировать «${client?.name ?? ''}»`;

  return (
    <Dialog open title={title} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <label>Код*<input value={form.code} onChange={(e) => setField('code', e.target.value)} required /></label>
        <label>Название*<input value={form.name} onChange={(e) => setField('name', e.target.value)} required /></label>
        <label>Юр. название<input value={form.legalName} onChange={(e) => setField('legalName', e.target.value)} /></label>
        <label>ИНН<input value={form.inn} onChange={(e) => setField('inn', e.target.value)} placeholder="10 или 12 цифр" /></label>
        <label>КПП<input value={form.kpp} onChange={(e) => setField('kpp', e.target.value)} placeholder="9 цифр" /></label>
        <label>Email<input type="email" value={form.contactEmail} onChange={(e) => setField('contactEmail', e.target.value)} /></label>
        <label>Телефон<input value={form.contactPhone} onChange={(e) => setField('contactPhone', e.target.value)} /></label>
        <label>Юр. адрес<input value={form.legalAddress} onChange={(e) => setField('legalAddress', e.target.value)} /></label>
        <label>Заметка<textarea value={form.note} onChange={(e) => setField('note', e.target.value)} /></label>
        {mode === 'edit' && (
          <label>Статус
            <select value={form.status} onChange={(e) => setField('status', e.target.value as ClientStatus)}>
              <option value="active">{CLIENT_STATUS_LABEL.active}</option>
              <option value="archived">{CLIENT_STATUS_LABEL.archived}</option>
            </select>
          </label>
        )}

        {mutation.error && <div role="alert">{mutation.error}</div>}

        <div>
          <button type="button" onClick={onClose} disabled={mutation.isPending}>Отмена</button>
          <button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Сохранение…' : 'Сохранить'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
```

- [x] **Step 2: Прогнать typecheck + frontend test suite:**

```bash
pnpm --filter @cdoprof/frontend exec tsc --noEmit
pnpm --filter @cdoprof/frontend test --no-file-parallelism
```

Ожидаемо: typecheck зелёный, all tests pass.

- [x] **Step 3: Commit:**

```bash
git add apps/frontend/src/features/clients/client-edit-drawer.tsx
git commit -m "feat(frontend): client edit drawer create+edit (Phase 2 Plan C Task 11)"
```

**Acceptance:**

- Drawer обслуживает оба режима (create / edit).
- В create нет поля «Статус» (новая компания всегда `active`).
- Submit отключён во время mutation, error выводится.

---

## Task 12: Client detail screen + group progress section

**Files:**

- `apps/frontend/src/features/clients/client-detail-screen.tsx` (новый)
- `apps/frontend/src/features/clients/group-progress-section.tsx` (новый)

**Why:** Карточка клиента: основные поля + linked groups + сводный прогресс. Pattern — расширенная версия Pillar A `LearnerDetailsScreen`.

**Tasks:**

- [x] **Step 1: Создать `apps/frontend/src/features/clients/group-progress-section.tsx`** (компонент для отображения `ClientProgressSummary`):

```typescript
'use client';
import { SectionCard, SectionEmpty, LoadingState } from '@/components';
import { useClientProgress } from './hooks';
import { formatProgressLabel } from './format';

interface GroupProgressSectionProps {
  clientId: string;
}

export function GroupProgressSection({ clientId }: GroupProgressSectionProps) {
  const progress = useClientProgress(clientId);

  if (progress.isLoading) return <LoadingState />;
  if (progress.error) return <div role="alert">Не удалось загрузить прогресс: {(progress.error as Error).message}</div>;
  if (!progress.data) return <SectionEmpty title="Нет прогресса" description="У компании нет зачислений." />;

  const s = progress.data;
  return (
    <SectionCard title="Прогресс обучения">
      <div>
        <p><strong>Учеников:</strong> {s.totalLearners}</p>
        <p><strong>Зачислений:</strong> {s.enrollments.total} (завершено: {s.enrollments.completed}, в процессе: {s.enrollments.inProgress}, не начато: {s.enrollments.notStarted})</p>
        <p><strong>Средний прогресс:</strong> {Math.round(s.avgCompletionRate * 100)}%</p>
      </div>
      {s.perCourse.length > 0 && (
        <div>
          <h4>По курсам</h4>
          <ul>
            {s.perCourse.map((c) => (
              <li key={c.courseId}>
                {c.courseId}: {formatProgressLabel(c.completed, c.total)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </SectionCard>
  );
}
```

> **TODO для follow-up:** заменить `c.courseId` на реальное название курса через `useCourses()` или подобный хук. План отмечает: это V1-приемлемо (показать id), V1.1 — name lookup.

- [x] **Step 2: Создать `apps/frontend/src/features/clients/client-detail-screen.tsx`:**

```typescript
'use client';
import { useState } from 'react';
import Link from 'next/link';
import { LoadingState, PageContainer, PageHeader, SectionCard, SectionEmpty, SectionError } from '@/components';
import { useClient } from './hooks';
import { CLIENT_STATUS_LABEL, formatInn, formatPhone } from './format';
import { ClientEditDrawer } from './client-edit-drawer';
import { GroupProgressSection } from './group-progress-section';

interface ClientDetailScreenProps {
  clientId: string;
}

export function ClientDetailScreen({ clientId }: ClientDetailScreenProps) {
  const client = useClient(clientId);
  const [editing, setEditing] = useState(false);

  if (client.isLoading) return <LoadingState />;
  if (client.error) return <SectionError message={(client.error as Error).message} />;
  if (!client.data) return <SectionEmpty title="Компания не найдена" description="" />;

  const c = client.data;

  return (
    <PageContainer>
      <PageHeader
        title={c.name}
        description={c.legalName ?? '—'}
        actions={
          <button type="button" onClick={() => setEditing(true)}>Редактировать</button>
        }
      />

      <SectionCard title="Основные данные">
        <dl>
          <dt>Код:</dt><dd>{c.code}</dd>
          <dt>ИНН:</dt><dd>{formatInn(c.inn)}</dd>
          <dt>КПП:</dt><dd>{c.kpp ?? '—'}</dd>
          <dt>Email:</dt><dd>{c.contactEmail ?? '—'}</dd>
          <dt>Телефон:</dt><dd>{formatPhone(c.contactPhone)}</dd>
          <dt>Юр. адрес:</dt><dd>{c.legalAddress ?? '—'}</dd>
          <dt>Заметка:</dt><dd>{c.note ?? '—'}</dd>
          <dt>Статус:</dt><dd>{CLIENT_STATUS_LABEL[c.status]}</dd>
        </dl>
      </SectionCard>

      <GroupProgressSection clientId={c.id} />

      <SectionCard title="Связанные группы">
        <p><Link href={`/admin/groups?counterpartyId=${c.id}`}>Перейти к списку групп клиента →</Link></p>
        <p className="muted">
          Для привязки новой группы — откройте детали группы и выберите эту компанию.
        </p>
      </SectionCard>

      {editing && (
        <ClientEditDrawer mode="edit" client={c} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); client.refetch(); }} />
      )}
    </PageContainer>
  );
}
```

> **`/admin/groups?counterpartyId=...`.** Этот фильтр на existing groups list, возможно ещё не поддерживается — TODO в follow-up. Сейчас просто ведёт на голый список (без фильтра); пользователь руками отфильтровывает. V1.1 добавит `counterpartyId` в `BaseFilterQuery`.

- [x] **Step 3: Прогнать typecheck + tests:**

```bash
pnpm --filter @cdoprof/frontend exec tsc --noEmit
pnpm --filter @cdoprof/frontend test --no-file-parallelism
```

- [x] **Step 4: Commit:**

```bash
git add apps/frontend/src/features/clients/client-detail-screen.tsx apps/frontend/src/features/clients/group-progress-section.tsx
git commit -m "feat(frontend): client detail screen + progress section (Phase 2 Plan C Task 12)"
```

**Acceptance:**

- Detail screen рендерит карточку клиента + GroupProgressSection + ссылку на связанные группы.
- `GroupProgressSection` показывает summary + per-course breakdown.

---

## Task 13: Route + navigation + group counterparty picker

**Files:**

- `apps/frontend/app/admin/clients/page.tsx` (новый)
- `apps/frontend/app/admin/clients/[id]/page.tsx` (новый)
- `apps/frontend/src/features/navigation/model.ts` (modify)
- Existing group details screen (Plan A/Pillar A) — extend with `GroupCounterpartyPicker` или ссылкой на existing counterparty (TBD: см. step 4).

**Tasks:**

- [x] **Step 1: Создать `apps/frontend/app/admin/clients/page.tsx`:**

```typescript
import { ProtectedPage } from '@/widgets/shell/protected-page';
import { ClientsListScreen } from '../../../src/features/clients/clients-list-screen';

export default function AdminClientsPage() {
  return (
    <ProtectedPage>
      <ClientsListScreen />
    </ProtectedPage>
  );
}
```

- [x] **Step 2: Создать `apps/frontend/app/admin/clients/[id]/page.tsx`:**

```typescript
import { ProtectedPage } from '@/widgets/shell/protected-page';
import { ClientDetailScreen } from '../../../../src/features/clients/client-detail-screen';

interface PageProps {
  params: { id: string };
}

export default function AdminClientDetailPage({ params }: PageProps) {
  return (
    <ProtectedPage>
      <ClientDetailScreen clientId={params.id} />
    </ProtectedPage>
  );
}
```

- [x] **Step 3: Расширить `apps/frontend/src/features/navigation/model.ts`** — добавить (по Plan B Task 10 deviation, реальный shape `routeMeta`/`navigationModel`):

```typescript
// В routeMeta entries:
{ pattern: '/admin/clients', meta: { public: false, requiredPermissions: ['counterparties.read'] } },
{ pattern: '/admin/clients/:id', meta: { public: false, requiredPermissions: ['counterparties.read'] } },

// В navigationModel entries (append после bulk-enrollments и learners):
{ href: '/admin/clients', label: 'Компании', requiredPermissions: ['counterparties.read'], navSlot: 'more' },
```

- [x] **Step 4: Расширить group details screen** (искать `apps/frontend/src/features/mvp/screens.tsx` для `GroupDetailsScreen` или аналог) — добавить мини-форму «Компания-заказчик»:

```typescript
// Внутри GroupDetailsScreen, в подходящей секции:
import { useSetGroupCounterparty, useClientsList } from '@/features/clients/hooks';
// ...

const cpMut = useSetGroupCounterparty();
const cpList = useClientsList({ pageSize: 1000 });  // upper-bound для UI dropdown

// JSX в render:
<SectionCard title="Компания-заказчик">
  <select
    className="ui-select"
    value={group.counterpartyId ?? ''}
    onChange={async (e) => {
      const next = e.target.value || null;
      await cpMut.mutate(group.id, next);
      refetchGroup();
    }}
    disabled={cpMut.isPending}
  >
    <option value="">— не привязана —</option>
    {cpList.data?.items.map((c) => (
      <option key={c.id} value={c.id}>{c.name}</option>
    ))}
  </select>
  {cpMut.error && <div role="alert">{cpMut.error}</div>}
</SectionCard>
```

Если `GroupDetailsScreen` находится в `mvp/screens.tsx` и слишком сложен для inline-вставки — создать отдельный `apps/frontend/src/features/clients/group-counterparty-picker.tsx` и импортировать его. Решение: предпочесть **компонент-extraction**, чтобы переиспользовать.

> **Если `GroupDetailsScreen` ещё не существует** (никакая фича не нарисовала её до Plan C) — пропустить step 4 и пометить как DEVIATION для Task 14. Picker всё равно тестабелен в изоляции через api.contract.

- [x] **Step 5: Прогнать e2e:**

```bash
pnpm --filter @cdoprof/frontend exec vitest run src/e2e/ --no-file-parallelism
```

- [x] **Step 6: Commit:**

```bash
git add apps/frontend/app/admin/clients apps/frontend/src/features/navigation/model.ts apps/frontend/src/features/mvp/screens.tsx apps/frontend/src/features/clients/group-counterparty-picker.tsx
git commit -m "feat(frontend): wire /admin/clients routes + navigation + group counterparty picker (Phase 2 Plan C Task 13)"
```

**Acceptance:**

- Маршруты `/admin/clients` и `/admin/clients/:id` доступны через ProtectedPage.
- Пункт «Компании» виден в сайдбаре для роли с `counterparties.read`.
- Group details screen позволяет привязать компанию через select.
- Все существующие e2e зелёные.

---

## Task 14: E2E smoke + closeout (handoff §5.92 + README sync)

**Files:**

- `apps/frontend/src/e2e/admin-clients-management.e2e.test.ts` (новый)
- `LMS_AGENT_HANDOFF.md` (extend §5.92)
- `README.md` (modify §2)

**Why:** Закрыть Plan C по convention CLAUDE.md. E2E без RTL: routing + nav visibility + pure-function pipeline (форматтеры) + module smoke.

**Tasks:**

- [x] **Step 1: Read** `apps/frontend/src/e2e/admin-learners-management.e2e.test.ts` (Plan B Task 11) для exact pattern.

- [x] **Step 2: Создать `apps/frontend/src/e2e/admin-clients-management.e2e.test.ts`** с ≥9 кейсами:

```typescript
import { describe, expect, it } from 'vitest';
import {
  buildClientCreatePayload,
  buildClientUpdatePayload,
  formatInn,
  formatPhone,
  formatProgressLabel
} from '../features/clients/format';
import { evaluateRouteAccess, getVisibleNavigation } from '../features/navigation/helpers';
import type { UserSession } from '../entities/session/model';

const sessionAdmin: UserSession = {
  user: {
    id: 'u1',
    tenantId: 'tenant_demo',
    login: 'admin',
    email: null,
    status: 'active',
    displayName: 'A'
  },
  tokens: { accessToken: 'a', sessionId: 's', expiresIn: 1000 },
  roles: ['tenant_admin'],
  permissions: ['counterparties.read']
};
const sessionWithout: UserSession = { ...sessionAdmin, permissions: ['progress.read'] };

describe('admin clients management — routing', () => {
  it('grants /admin/clients with counterparties.read', () => {
    expect(evaluateRouteAccess('/admin/clients', sessionAdmin)).toEqual({ kind: 'ok' });
  });
  it('denies /admin/clients without counterparties.read', () => {
    expect(evaluateRouteAccess('/admin/clients', sessionWithout)).toEqual({ kind: 'forbidden' });
  });
  it('grants /admin/clients/:id with counterparties.read', () => {
    expect(evaluateRouteAccess('/admin/clients/cp-1', sessionAdmin)).toEqual({ kind: 'ok' });
  });
  it('redirects-login without session', () => {
    expect(evaluateRouteAccess('/admin/clients', null)).toEqual({ kind: 'redirect-login' });
  });
});

describe('admin clients management — navigation', () => {
  it('shows «Компании» for admin with counterparties.read', () => {
    expect(getVisibleNavigation(sessionAdmin).map((i) => i.href)).toContain('/admin/clients');
  });
  it('hides «Компании» without counterparties.read', () => {
    expect(getVisibleNavigation(sessionWithout).map((i) => i.href)).not.toContain('/admin/clients');
  });
});

describe('admin clients management — pipeline integration', () => {
  it('format pipeline works end-to-end', () => {
    expect(formatInn('7707083893')).toBe('7707083893');
    expect(formatPhone('74951234567')).toBe('+7 (495) 123-45-67');
    expect(formatProgressLabel(3, 4)).toBe('3 из 4 (75%)');
    const payload = buildClientUpdatePayload({
      code: 'X',
      name: 'X',
      legalName: '',
      inn: '7707083893',
      kpp: '',
      contactEmail: 'a@x.ru',
      contactPhone: '',
      legalAddress: '',
      note: '',
      status: 'archived'
    });
    expect(payload.inn).toBe('7707083893');
    expect(payload.legalName).toBeNull();
    expect(payload.status).toBe('archived');
    const create = buildClientCreatePayload({
      code: 'C',
      name: 'N',
      legalName: '',
      inn: '',
      kpp: '',
      contactEmail: '',
      contactPhone: '',
      legalAddress: '',
      note: '',
      status: 'active'
    });
    expect(create).toEqual({ code: 'C', name: 'N' });
  });
});

describe('admin clients management — module smoke', () => {
  it('imports list screen', async () => {
    const mod = await import('../features/clients/clients-list-screen');
    expect(typeof mod.ClientsListScreen).toBe('function');
  });
  it('imports detail screen', async () => {
    const mod = await import('../features/clients/client-detail-screen');
    expect(typeof mod.ClientDetailScreen).toBe('function');
  });
  it('imports drawer', async () => {
    const mod = await import('../features/clients/client-edit-drawer');
    expect(typeof mod.ClientEditDrawer).toBe('function');
  });
});
```

- [x] **Step 3: Прогнать e2e:**

```bash
pnpm --filter @cdoprof/frontend exec vitest run src/e2e/admin-clients-management.e2e.test.ts --no-file-parallelism
```

Ожидаемо: ≥10 кейсов зелёные.

- [x] **Step 4: Append §5.92 to `LMS_AGENT_HANDOFF.md`** — формат как §5.91 (см. Plan B Task 11 для точного шаблона):

```markdown
### 5.92 Phase 2 §3.2 — Plan C: компании-клиенты + прогресс по группе

- Summary: реализована заключительная фича Phase 2 — admin-страница `/admin/clients` (list + detail + create/edit drawer) + связь группа↔компания + агрегатный прогресс по группе и по компании. Закрывает 14 задач Plan C в трёх PR'ах.
- Plan: `docs/superpowers/plans/2026-05-29-phase-2-admin-clients-management-c.md`.
- Backend (PR #ZZZ, Tasks 1-6): миграция 0039 (counterparty extended fields + group.counterparty_id FK + partial index), `createCounterpartyExtended` / `updateCounterpartyExtended` / `setGroupCounterparty` методы, `summarizeGroupProgress` / `summarizeCounterpartyProgress` pure-function aggregator (8 unit-кейсов), 5 новых endpoints (`POST /counterparties/extended`, `PATCH /counterparties/:id/profile`, `PATCH /groups/:id/counterparty`, `GET /groups/:id/progress-summary`, `GET /counterparties/:id/progress-summary`), 5 HTTP integration кейсов.
- Frontend (PR #ZZZ, Tasks 7-13): фича-папка `src/features/clients/` (types/api/api.contract/hooks/format + 10 unit-кейсов/list-screen/edit-drawer/detail-screen/group-progress-section), маршруты `app/admin/clients/page.tsx` + `[id]/page.tsx`, navigation entry под `counterparties.read`, group counterparty picker в `GroupDetailsScreen`.
- Closeout (этот PR, Task 14): `src/e2e/admin-clients-management.e2e.test.ts` (≥10 кейсов), handoff §5.92, README §2 sync.
- Plan C deviations (адаптации к реальному коду, заполнить по факту): TBD.
- Что осталось до Phase 2 целиком: ничего критичного. Опциональные V1.1: фильтр `BaseFilterQuery.counterpartyId` для `GET /groups`, замена `c.courseId` на real course name в progress section, BL-003 worker callback path для bulk-enrollment (sync path сейчас работает для V1).
- Quality gates: `pnpm typecheck` зелёный (8 packages); backend изолированные прогоны зелёные; frontend ≥227 тестов зелёные.
```

- [x] **Step 5: Обновить `README.md` §2 AI Agent State:**

```markdown
### Last Completed Task

**Phase 2 Plan C — admin clients management + group progress** (2026-05-30): backend extended Counterparty + group↔counterparty link + aggregator endpoints + frontend `/admin/clients` (list/detail/drawer) + group progress section. Совместно с Plan A (#191-#196) и Plan B (#197-#200) полностью закрывает Phase 2 «Админка центра + массовые операции».

### Current Task

Smoke / приёмка Phase 2 целиком; подготовка к Phase 3 (тестирование и оценивание).

### Next Task

**Phase 3 — тестирование и оценивание** (см. roadmap): банк вопросов, конструктор тестов, плеер теста для ученика, автогрейдинг single/multi/number, UI ручной проверки эссе, загрузка практических работ. Параллельно — Pillar A polish backlog (drag-n-drop сортировки, PNG-подписи, реальный PDF render — отложен до Phase 5).

### Last Updated At

2026-05-30 (Phase 2 Plan C implemented; previous: Plan B 2026-05-29; Plan A 2026-05-28)
```

- [x] **Step 6: Прогнать full quality gate:**

```bash
pnpm typecheck
```

- [x] **Step 7: Commit:**

```bash
git add apps/frontend/src/e2e/admin-clients-management.e2e.test.ts LMS_AGENT_HANDOFF.md README.md
git commit -m "docs(handoff): Phase 2 Plan C complete — §5.92 + README sync (Task 14)"
```

**Acceptance:**

- E2E файл с ≥10 зелёными кейсами.
- §5.92 в handoff с полной структурой.
- README §2 обновлён.
- `pnpm typecheck` зелёный.

---

## Self-Review Checklist (для исполнителя перед merge)

- [x] Все 14 задач выполнены и закоммичены отдельно.
- [x] `pnpm typecheck` зелёный.
- [x] Изолированные прогоны: dto-validation, service, group-progress-summary.service, http.integration, clients/api.contract, clients/format, e2e/admin-clients-management — все зелёные.
- [x] `pnpm test:frontend` зелёный.
- [x] Permission boundary: `counterparties.read` для list/detail/route, `counterparties.write` для create/edit/setGroupCounterparty, `enrollments.read` для progress-summary endpoints.
- [x] Анти-IDOR через tenant boundary: `getById(state.counterparties, tenantId, ...)` везде в new методах.
- [x] Migration 0039 не модифицирует исторические миграции.
- [x] §5.92 в handoff + README §2 обновлены.
- [x] Plan C deviations заполнены в §5.92 (по факту исполнения).

---

## Risks / Deviations (заполняется по ходу исполнения)

- **R1:** Если `computeCompletionRatesByEnrollment` помешает текущему KPI snapshot контракту — оставить duplicate расчёт inline в `getGroupProgressSummary` / `getCounterpartyProgressSummary`, задокументировать в §5.92. DRY refactor — V1.1.
- **R2:** Если `GroupDetailsScreen` не существует — пропустить Task 13 step 4 (group counterparty picker), задокументировать. Picker будет жить как standalone компонент до появления экрана группы.
- **R3:** Если миграции тестируются через regex (Plan A pattern) — добавить regex-кейсы для 0039 в `migrations.test.ts`. Если их нет — пропустить step 2 Task 1.
- **R4:** Если `@cdoprof/ui` сигнатуры опять отличаются от плана (по Plan B deviations) — адаптировать в-точку, не выдумывать; ссылаться на `learners/learners-list-screen.tsx` как ground truth.
- **R5:** `progress-summary` endpoints используют `enrollments` + `groupCourses` snapshot — если объём растёт >>1000 enrollments на tenant, in-memory агрегация замедлится. V1.1 — Postgres-агрегация через SQL.
- **R6:** Если `setGroupCounterparty` требует синхронизации с уже существующим bulk enrollment flow Plan A (например, валидация что enrollments группы остаются в той же компании) — это V1.1 правило, для V1-пилота пропустить.

---

## Plan dependencies graph

```
Task 1 (migration) ──→ Task 2 (types)
                          ↓
                       Task 3 (DTOs)
                          ↓
                       Task 4 (service methods)
                          ↓
                       Task 5 (pure-function aggregator)
                          ↓
                       Task 6 (controller + wiring + http integration)
                          ↓
                       Task 7 (frontend types/api/hooks) ──→ Task 8 (contract test)
                                                              ↓
                                                           Task 9 (formatters)
                                                              ↓
                                                           Task 10 (list screen) ──→ Task 11 (edit drawer)
                                                                                          ↓
                                                                                       Task 12 (detail + progress section)
                                                                                          ↓
                                                                                       Task 13 (routes + nav + picker)
                                                                                          ↓
                                                                                       Task 14 (e2e + closeout)
```

**Параллелизация:**

- Task 5 (pure-function aggregator) можно делать **параллельно с Tasks 2-4** — нет общих файлов.
- Task 9 (formatters) можно делать **параллельно с Task 7-8** — нет общих файлов.

Остальное — линейно.

**Estimated effort:** ~14 tasks × средне 25 минут на subagent dispatch = ~6 часов работы. Backend (Tasks 1-6) ~2.5ч, frontend (Tasks 7-13) ~3ч, closeout (Task 14) ~30 мин.

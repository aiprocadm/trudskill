# Regulated Training Foundation — Plan B: Templates, Variables, Issuance Journal, Group Orders

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Расширить документную инфраструктуру Pillar A до production-ready: добавить 6 новых типов шаблонов (диплом/аттестация/справка/отчёт/приказ + уже существующие), 3 новые категории переменных (`enrollment`/`document`/`group_learners`), книгу выдачи удостоверений с фильтрами и CSV-экспортом для регулятора, и групповые приказы которые цепочкой выпускают удостоверения для всех завершивших обучение в группе.

**Architecture:** Расширение `mvp` и `documents` модулей. Новая миграция `0032` добавляет CHECK-constraints на `template_type`/`category_code` и колонку `group_order_document_id`. Resolver переменных в `pillar-a-variables.ts` дополняется тремя pure-функциями (`resolveEnrollmentVariables`, `resolveDocumentVariables`, `resolveGroupLearnersVariables`). Книга выдачи — новый метод `listIssuedDocuments` в `DocumentsService` + endpoint с фильтрами + CSV-стрим. Групповой приказ — атомарный сервис-метод `issueGroupOrder` который в одной транзакции создаёт документ типа `order` и каскадно выпускает удостоверения для всех `completed`-enrollments группы.

**Tech Stack:** PostgreSQL (миграции SQL), NestJS + TypeScript (backend), Vitest (тесты), Next.js (frontend), React Query. Никаких новых зависимостей: CSV-экспорт — стандартный `String.join` с UTF-8 BOM (Excel в русской локали корректно открывает).

**Спецификация:** [../specs/2026-05-22-regulated-training-foundation-design.md](../specs/2026-05-22-regulated-training-foundation-design.md) — §5.4 (типы шаблонов), §5.5 (категории `enrollment`/`document`/`group_learners` — категории `program`/`commission` сделаны в Plan A Task 9), §5.6 (книга выдачи), §5.7 (приказы по группам).

**Роадмап:** [2026-05-21-cdoprof-v1-roadmap.md](2026-05-21-cdoprof-v1-roadmap.md) — Phase 3.5 (вторая итерация после Plan A).

**Зависимости перед стартом:**

- PRs #173 (spec+Plan A doc), #174 (Plan A backend Tasks 1-9), #175 (Plan A controllers+frontend Tasks 10-13) смержены в `main`.
- Ветка Plan B отрезается от `main` как `feat/2026-05-24-pillar-a-plan-b`.
- Plan A полностью реализован: `learning.commissions`, `learning.course_versions` regulatory meta, `learning.course_document_sets`, variable categories `program`/`commission` в `DocumentsService.variableCategories`.

**Что НЕ входит в Plan B (вынесено в Plan C):**

- §5.8 — QR-проверка подлинности (qr_token, public endpoint, /verify/[token]). В Plan B `document.qr_url` резолвится в пустую строку — placeholder. Plan C активирует.
- §5.9 — Аннулирование и перевыпуск (revoked_at, replaces_document_id, revoke/reissue).
- §5.10 — Лицензии центра (org.training_licenses, валидация publish).
- §5.11 — Личное дело ученика (расширение /learners/[id], PDF-карточка).

---

## File Structure

### Create — backend

- `apps/backend/migrations/0032_documents_pillar_a_plan_b.sql` — миграция: CHECK на `documents.templates.template_type` (7 значений), CHECK на `documents.template_variables.category_code` (7 значений: учитывая существующие + 3 новых), колонка `group_order_document_id` на `documents.generated_documents`, индекс по группе.

### Modify — backend

- `apps/backend/src/modules/mvp/mvp.types.ts` — добавить union-типы `TemplateType` (7 значений) и `VariableCategoryCode` (7 значений); добавить поле `groupOrderDocumentId?: string` в `GeneratedDocumentEntity` (если он там есть; иначе модифицировать его в documents.types.ts).
- `apps/backend/src/modules/documents/documents.types.ts` — добавить поле `groupOrderDocumentId?: string` в `GeneratedDocumentEntity`.
- `apps/backend/src/modules/documents/documents.dto.ts` — обновить `CreateTemplateRequest.templateType: TemplateType`, `CreateTemplateVariableRequest.categoryCode: VariableCategoryCode` (или соответствующее имя поля).
- `apps/backend/src/modules/documents/documents.service.ts` — расширить `variableCategories` Set добавлением `enrollment`, `document`, `group_learners`. Добавить методы `listIssuedDocuments(tenantId, filter, ctx)` и `exportIssuedDocumentsCsv(tenantId, filter, ctx)`. Добавить метод `issueGroupOrder(tenantId, actorId, request, ctx)`.
- `apps/backend/src/modules/documents/documents.service.test.ts` — добавить тесты на новые методы.
- `apps/backend/src/modules/documents/documents.controller.ts` — добавить endpoints: `GET /admin/documents/issuance-journal`, `GET /admin/documents/issuance-journal.csv`, `POST /admin/documents/group-orders`.
- `apps/backend/src/modules/documents/documents.http.integration.test.ts` — добавить интеграционные тесты на 3 новых endpoints.
- `apps/backend/src/modules/documents/pillar-a-variables.ts` — добавить три новых resolver: `resolveEnrollmentVariables`, `resolveDocumentVariables`, `resolveGroupLearnersVariables`. Добавить интерфейсы контекстов (`EnrollmentVariableContext`, `DocumentVariableContext`, `GroupLearnersVariableContext`).
- `apps/backend/src/modules/documents/pillar-a-variables.test.ts` — добавить тесты на три новых resolver.
- `apps/backend/src/modules/documents/in-memory-documents.state.ts` — никаких изменений в state не требуется (используем существующую `generatedDocuments` коллекцию).
- `apps/backend/src/modules/documents/documents.dto-validation.test.ts` (или эквивалент) — добавить тесты валидации новых полей.

### Create — frontend

- `apps/frontend/app/admin/issuance-journal/page.tsx` — страница `/admin/issuance-journal`.
- `apps/frontend/src/features/issuance-journal/types.ts` — UI-типы.
- `apps/frontend/src/features/issuance-journal/api.ts` — REST-клиент: list + CSV download.
- `apps/frontend/src/features/issuance-journal/hooks.ts` — React Query хук.
- `apps/frontend/src/features/issuance-journal/issuance-journal.tsx` — компонент таблицы с фильтрами.
- `apps/frontend/src/features/issuance-journal/issuance-journal.test.tsx` — компонент-тесты.
- `apps/frontend/src/features/group-orders/issue-order-modal.tsx` — модалка выбора шаблона + триггер выпуска.
- `apps/frontend/src/features/group-orders/issue-order-modal.test.tsx` — компонент-тест модалки.

### Modify — frontend

- `apps/frontend/app/documents/page.tsx` — расширить select `templateType` (7 вариантов с русскими лейблами) и `varCategory` (7 вариантов).
- `apps/frontend/src/features/mvp/screens.tsx` (GroupDetailsScreen) — добавить кнопку «Сгенерировать приказ» и встроить `IssueOrderModal`.
- `apps/frontend/src/features/mvp/api.ts` — добавить методы `listIssuedDocuments`, `downloadIssuedDocumentsCsv`, `issueGroupOrder`.
- `apps/frontend/src/features/navigation/model.ts` — добавить пункт меню `/admin/issuance-journal` (только если есть admin nav).

### Untouched (используется как есть)

- `documents.templates` / `template_versions` / `template_variables` / `template_bindings` / `numbering_rules` — инфраструктура шаблонов.
- `learning.commissions` / `learning.commission_members` / `learning.course_document_sets` — entities из Plan A.
- `core.tenants`, `iam.users`, `storage.files`, `learning.enrollments`, `learning.study_groups` — базовые сущности.

---

## Task 1: Migration 0032 — extended template/variable types + group_order link

**Files:**

- Create: `apps/backend/migrations/0032_documents_pillar_a_plan_b.sql`
- Test: `apps/backend/src/modules/documents/migrations.0032.test.ts`

### Спецификация

§5.4 — добавляем CHECK-constraint для известных `template_type` значений (7 штук). §5.5 — добавляем CHECK для `category_code` (7 категорий: 4 базовые + `program`/`commission` из Plan A + `enrollment` + `document` + `group_learners` — итого 7 после дедупликации; в коде уже зарегистрированы `tenant`, `group`, `learner`, `counterparty`, `course`, `commission`, `document`, `program` — нужно решить, какие закрепить CHECK'ом). §5.7 — колонка `group_order_document_id` на `generated_documents` + индекс.

**Решение по категориям**: CHECK включает 10 значений (все категории которые `DocumentsService.variableCategories` поддерживает после Plan B): `tenant`, `group`, `learner`, `counterparty`, `course`, `commission`, `document`, `program`, `enrollment`, `group_learners`. `document` уже был в Set но не использовался в коде resolve'а — Plan B активирует.

- [ ] **Step 1: Write the migration test**

Файл `apps/backend/src/modules/documents/migrations.0032.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATION_PATH = join(__dirname, '../../../migrations/0032_documents_pillar_a_plan_b.sql');

describe('migration 0032 — documents pillar A plan B', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf-8');

  it('adds CHECK constraint on documents.templates.template_type', () => {
    expect(sql).toMatch(/ADD\s+CONSTRAINT\s+templates_type_chk/i);
    expect(sql).toMatch(
      /template_type\s+IN\s*\([^)]*'certificate'[^)]*'protocol'[^)]*'order'[^)]*'diploma'[^)]*'attestation'[^)]*'reference'[^)]*'report'/i
    );
  });

  it('adds CHECK constraint on documents.template_variables.category_code', () => {
    expect(sql).toMatch(/ADD\s+CONSTRAINT\s+template_variables_category_chk/i);
    for (const code of [
      'tenant',
      'group',
      'learner',
      'counterparty',
      'course',
      'commission',
      'document',
      'program',
      'enrollment',
      'group_learners'
    ]) {
      expect(sql).toContain(`'${code}'`);
    }
  });

  it('adds group_order_document_id column on documents.generated_documents', () => {
    expect(sql).toMatch(/ALTER\s+TABLE\s+documents\.generated_documents/i);
    expect(sql).toMatch(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+group_order_document_id\s+text/i);
  });

  it('creates index on group_order_document_id', () => {
    expect(sql).toMatch(
      /CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+idx_generated_documents_group_order/i
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @cdoprof/backend test src/modules/documents/migrations.0032.test.ts`
Expected: FAIL — миграция не существует.

- [ ] **Step 3: Write the migration**

Файл `apps/backend/migrations/0032_documents_pillar_a_plan_b.sql`:

```sql
-- 0032_documents_pillar_a_plan_b.sql
-- Pillar A Plan B (§5.4, §5.5, §5.7):
-- 1) CHECK на documents.templates.template_type (7 типов из §5.4).
-- 2) CHECK на documents.template_variables.category_code (10 категорий).
-- 3) Колонка group_order_document_id на documents.generated_documents для §5.7.
--
-- Idempotent: ADD CONSTRAINT IF NOT EXISTS отсутствует в PG <16,
-- поэтому оборачиваем в DO-блок с проверкой pg_constraint.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'templates_type_chk'
      AND conrelid = 'documents.templates'::regclass
  ) THEN
    ALTER TABLE documents.templates
      ADD CONSTRAINT templates_type_chk
      CHECK (template_type IN (
        'certificate', 'protocol', 'order',
        'diploma', 'attestation', 'reference', 'report'
      ));
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'template_variables_category_chk'
      AND conrelid = 'documents.template_variables'::regclass
  ) THEN
    ALTER TABLE documents.template_variables
      ADD CONSTRAINT template_variables_category_chk
      CHECK (category_code IN (
        'tenant', 'group', 'learner', 'counterparty', 'course',
        'commission', 'document', 'program', 'enrollment', 'group_learners'
      ));
  END IF;
END$$;

ALTER TABLE documents.generated_documents
  ADD COLUMN IF NOT EXISTS group_order_document_id text;

CREATE INDEX IF NOT EXISTS idx_generated_documents_group_order
  ON documents.generated_documents (tenant_id, group_order_document_id)
  WHERE group_order_document_id IS NOT NULL;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @cdoprof/backend test src/modules/documents/migrations.0032.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Run full backend test suite to confirm nothing broke**

Run: `pnpm --filter @cdoprof/backend test`
Expected: same green count as before (Plan A baseline) + 4 new tests passing.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/migrations/0032_documents_pillar_a_plan_b.sql apps/backend/src/modules/documents/migrations.0032.test.ts
git commit -m "feat(backend): add migration 0032 — extend template types, variable categories, group order link (Plan B §5.4, §5.5, §5.7)"
```

---

## Task 2: Backend types — TemplateType, VariableCategoryCode, GroupOrderDocumentId

**Files:**

- Modify: `apps/backend/src/modules/mvp/mvp.types.ts`
- Modify: `apps/backend/src/modules/documents/documents.types.ts`
- Test: `apps/backend/src/modules/documents/documents.types.test.ts` (создать если нет)

### Спецификация

Создаём union-типы для template_type и category_code чтобы DTO+resolver+UI ссылались на один source of truth. `GroupOrderDocumentId` — просто string, но поле опционально на `GeneratedDocumentEntity`.

- [ ] **Step 1: Write the type-existence test**

Файл `apps/backend/src/modules/documents/documents.types.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import type {
  TemplateType,
  VariableCategoryCode,
  GeneratedDocumentEntity
} from './documents.types.js';

describe('Pillar A Plan B types', () => {
  it('TemplateType enumerates 7 known values', () => {
    const all: TemplateType[] = [
      'certificate',
      'protocol',
      'order',
      'diploma',
      'attestation',
      'reference',
      'report'
    ];
    expect(all).toHaveLength(7);
  });

  it('VariableCategoryCode enumerates 10 known categories', () => {
    const all: VariableCategoryCode[] = [
      'tenant',
      'group',
      'learner',
      'counterparty',
      'course',
      'commission',
      'document',
      'program',
      'enrollment',
      'group_learners'
    ];
    expect(all).toHaveLength(10);
  });

  it('GeneratedDocumentEntity accepts optional groupOrderDocumentId', () => {
    const sample: GeneratedDocumentEntity = {
      id: 'gdoc_1',
      tenantId: 't1',
      templateId: 'tpl_1',
      templateVersionId: 'tplv_1',
      documentType: 'certificate',
      name: 'Doc',
      sourceEntityType: 'enrollment',
      sourceEntityId: 'enr_1',
      fileId: 'f_1',
      status: 'generated',
      documentNumber: 'N-1',
      documentDate: '2026-05-24',
      isFinal: false,
      generatedAt: '2026-05-24T00:00:00.000Z',
      groupOrderDocumentId: 'gdoc_order_1'
    };
    expect(sample.groupOrderDocumentId).toBe('gdoc_order_1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @cdoprof/backend test src/modules/documents/documents.types.test.ts`
Expected: FAIL — `TemplateType`, `VariableCategoryCode`, `groupOrderDocumentId` не экспортированы.

- [ ] **Step 3: Add types to `documents.types.ts`**

В начале файла (или рядом с существующими template type alias'ами) добавить:

```typescript
/** §5.4 — все типы документных шаблонов в Pillar A. */
export type TemplateType =
  | 'certificate'
  | 'protocol'
  | 'order'
  | 'diploma'
  | 'attestation'
  | 'reference'
  | 'report';

/** §5.5 — все категории переменных, поддерживаемые DocumentsService resolver'ом. */
export type VariableCategoryCode =
  | 'tenant'
  | 'group'
  | 'learner'
  | 'counterparty'
  | 'course'
  | 'commission'
  | 'document'
  | 'program'
  | 'enrollment'
  | 'group_learners';
```

И в существующем `GeneratedDocumentEntity` добавить:

```typescript
  /** §5.7 — id документа-приказа, по которому выпущено это удостоверение. */
  groupOrderDocumentId?: string;
```

- [ ] **Step 4: Re-export from mvp.types.ts for cross-module use**

В конец `apps/backend/src/modules/mvp/mvp.types.ts` добавить:

```typescript
export type { TemplateType, VariableCategoryCode } from '../documents/documents.types.js';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @cdoprof/backend test src/modules/documents/documents.types.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Run full backend suite**

Run: `pnpm --filter @cdoprof/backend test`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/documents/documents.types.ts apps/backend/src/modules/documents/documents.types.test.ts apps/backend/src/modules/mvp/mvp.types.ts
git commit -m "feat(backend): add TemplateType, VariableCategoryCode, groupOrderDocumentId types (Plan B §5.4, §5.5, §5.7)"
```

---

## Task 3: Backend DTOs — validation against TemplateType + VariableCategoryCode

**Files:**

- Modify: `apps/backend/src/modules/documents/documents.dto.ts`
- Test: `apps/backend/src/modules/documents/documents.dto-validation.test.ts` (создать если нет; иначе добавить блок)
- Test: `apps/backend/src/modules/documents/documents.dto-validation.test.ts`

### Спецификация

`CreateTemplateRequest.templateType: string` → `TemplateType`. `CreateTemplateVariableRequest.categoryCode: string` → `VariableCategoryCode`. Добавляется DTO-валидация (compile-time через типы + runtime через class-validator или ручной guard).

Проверяем существующий способ валидации в codebase: смотрим, использует ли проект `class-validator` или ручные guards.

- [ ] **Step 1: Inspect existing DTO validation pattern**

Run: `pnpm --filter @cdoprof/backend exec grep -E "class-validator|IsString|IsIn" src/modules/documents/documents.dto.ts || true`

Если `class-validator` отсутствует — используем ручной guard как в `mvp.dto.ts` (Plan A pattern: `as const satisfies readonly TemplateType[]`).

- [ ] **Step 2: Write DTO validation test**

Файл `apps/backend/src/modules/documents/documents.dto-validation.test.ts` (создать новый файл если он не существует):

```typescript
import { describe, expect, it } from 'vitest';
import {
  ALLOWED_TEMPLATE_TYPES,
  ALLOWED_VARIABLE_CATEGORY_CODES,
  assertTemplateType,
  assertVariableCategoryCode
} from './documents.dto.js';
import type { TemplateType, VariableCategoryCode } from './documents.types.js';

describe('documents DTO — Pillar A Plan B', () => {
  it('ALLOWED_TEMPLATE_TYPES contains 7 values', () => {
    expect(ALLOWED_TEMPLATE_TYPES).toEqual([
      'certificate',
      'protocol',
      'order',
      'diploma',
      'attestation',
      'reference',
      'report'
    ]);
  });

  it('assertTemplateType accepts all 7', () => {
    for (const t of ALLOWED_TEMPLATE_TYPES) {
      expect(() => assertTemplateType(t)).not.toThrow();
    }
  });

  it('assertTemplateType rejects unknown', () => {
    expect(() => assertTemplateType('something_else')).toThrow(/template_type/);
  });

  it('ALLOWED_VARIABLE_CATEGORY_CODES contains 10 values', () => {
    expect(ALLOWED_VARIABLE_CATEGORY_CODES).toEqual([
      'tenant',
      'group',
      'learner',
      'counterparty',
      'course',
      'commission',
      'document',
      'program',
      'enrollment',
      'group_learners'
    ]);
  });

  it('assertVariableCategoryCode rejects unknown', () => {
    expect(() => assertVariableCategoryCode('mystery')).toThrow(/category_code/);
  });

  it('compile-time sync: ALLOWED is `TemplateType[]`', () => {
    const _check: readonly TemplateType[] = ALLOWED_TEMPLATE_TYPES;
    expect(_check).toBe(ALLOWED_TEMPLATE_TYPES);
  });

  it('compile-time sync: ALLOWED is `VariableCategoryCode[]`', () => {
    const _check: readonly VariableCategoryCode[] = ALLOWED_VARIABLE_CATEGORY_CODES;
    expect(_check).toBe(ALLOWED_VARIABLE_CATEGORY_CODES);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @cdoprof/backend test src/modules/documents/documents.dto-validation.test.ts`
Expected: FAIL — exports не существуют.

- [ ] **Step 4: Add exports and assertions to `documents.dto.ts`**

В конец `documents.dto.ts` добавить:

```typescript
import type { TemplateType, VariableCategoryCode } from './documents.types.js';

export const ALLOWED_TEMPLATE_TYPES = [
  'certificate',
  'protocol',
  'order',
  'diploma',
  'attestation',
  'reference',
  'report'
] as const satisfies readonly TemplateType[];

export const ALLOWED_VARIABLE_CATEGORY_CODES = [
  'tenant',
  'group',
  'learner',
  'counterparty',
  'course',
  'commission',
  'document',
  'program',
  'enrollment',
  'group_learners'
] as const satisfies readonly VariableCategoryCode[];

export function assertTemplateType(value: unknown): asserts value is TemplateType {
  if (typeof value !== 'string' || !(ALLOWED_TEMPLATE_TYPES as readonly string[]).includes(value)) {
    throw new Error(
      `Invalid template_type "${String(value)}". Allowed: ${ALLOWED_TEMPLATE_TYPES.join(', ')}`
    );
  }
}

export function assertVariableCategoryCode(value: unknown): asserts value is VariableCategoryCode {
  if (
    typeof value !== 'string' ||
    !(ALLOWED_VARIABLE_CATEGORY_CODES as readonly string[]).includes(value)
  ) {
    throw new Error(
      `Invalid category_code "${String(value)}". Allowed: ${ALLOWED_VARIABLE_CATEGORY_CODES.join(', ')}`
    );
  }
}
```

И обновить тип в `CreateTemplateRequest`:

```typescript
export interface CreateTemplateRequest {
  name: string;
  templateType: TemplateType;
  description?: string;
}
```

(если есть `UpdateTemplateRequest` с `templateType?: string` — то же самое: `templateType?: TemplateType`.)

Аналогично — если есть DTO `CreateTemplateVariableRequest` или подобное, заменить `categoryCode: string` на `categoryCode: VariableCategoryCode`.

- [ ] **Step 5: Wire assertions into existing handlers**

В `documents.service.ts` методе `createTemplate` добавить guard перед `state.templates.push`:

```typescript
assertTemplateType(req.templateType);
```

Аналогично в `createTemplateVariable` (если существует): `assertVariableCategoryCode(req.categoryCode);`

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @cdoprof/backend test src/modules/documents/documents.dto-validation.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 7: Run full backend suite**

Run: `pnpm --filter @cdoprof/backend test`
Expected: all green (assertTemplateType добавляет валидацию; существующие тесты могут полагаться на `certificate`/`protocol`/`order` — это покрыто).

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/modules/documents/documents.dto.ts apps/backend/src/modules/documents/documents.dto-validation.test.ts apps/backend/src/modules/documents/documents.service.ts
git commit -m "feat(backend): validate templateType + categoryCode against allow-lists (Plan B §5.4, §5.5)"
```

---

## Task 4: Variable resolver — enrollment + document categories (TDD)

**Files:**

- Modify: `apps/backend/src/modules/documents/pillar-a-variables.ts`
- Modify: `apps/backend/src/modules/documents/pillar-a-variables.test.ts`
- Modify: `apps/backend/src/modules/documents/documents.service.ts` (расширить `variableCategories` Set)

### Спецификация

§5.5 — нужны pure-функции resolve для двух категорий:

- `enrollment.*` — `start_date`, `end_date`, `completion_date`, `status`, `id`. Источник: `Enrollment` snapshot.
- `document.*` — `id`, `number`, `issue_date`, `qr_url` (placeholder — пустая строка в Plan B; активируется в Plan C §5.8).

Resolver работает по той же схеме что и `resolveProgramVariables` из Plan A Task 9: pure function `(ctx, varNames) → Record<string, unknown>`.

- [ ] **Step 1: Inspect Enrollment shape**

Run: `pnpm --filter @cdoprof/backend exec grep -nE "interface Enrollment|type Enrollment" src/modules/mvp/mvp.types.ts`
Expected: показывает структуру `Enrollment` — нужны имена полей `startDate`, `endDate` (или `enrolledAt`/`completedAt` — зависит от существующего).

- [ ] **Step 2: Write the failing tests**

Дополнить `pillar-a-variables.test.ts` блоком:

```typescript
import {
  resolveEnrollmentVariables,
  resolveDocumentVariables,
  type EnrollmentVariableContext,
  type DocumentVariableContext
} from './pillar-a-variables.js';
import type { Enrollment } from '../mvp/mvp.types.js';
import type { GeneratedDocumentEntity } from './documents.types.js';

describe('resolveEnrollmentVariables', () => {
  const baseEnrollment: Enrollment = {
    id: 'enr_1',
    tenantId: 't1',
    learnerId: 'l_1',
    groupId: 'g_1',
    status: 'completed',
    enrolledAt: '2026-04-01T00:00:00.000Z',
    completedAt: '2026-05-10T00:00:00.000Z'
    // Прочие поля — minimal valid set; в реальности type Enrollment может содержать больше
  } as Enrollment;

  it('returns enrollment.id', () => {
    const ctx: EnrollmentVariableContext = { enrollment: baseEnrollment };
    expect(resolveEnrollmentVariables(ctx, ['enrollment.id'])).toEqual({
      'enrollment.id': 'enr_1'
    });
  });

  it('returns enrollment.status', () => {
    const ctx: EnrollmentVariableContext = { enrollment: baseEnrollment };
    expect(resolveEnrollmentVariables(ctx, ['enrollment.status'])).toEqual({
      'enrollment.status': 'completed'
    });
  });

  it('returns enrollment.start_date as ISO date (YYYY-MM-DD)', () => {
    const ctx: EnrollmentVariableContext = { enrollment: baseEnrollment };
    expect(resolveEnrollmentVariables(ctx, ['enrollment.start_date'])).toEqual({
      'enrollment.start_date': '2026-04-01'
    });
  });

  it('returns enrollment.completion_date as ISO date', () => {
    const ctx: EnrollmentVariableContext = { enrollment: baseEnrollment };
    expect(resolveEnrollmentVariables(ctx, ['enrollment.completion_date'])).toEqual({
      'enrollment.completion_date': '2026-05-10'
    });
  });

  it('returns empty string when completion_date missing', () => {
    const ctx: EnrollmentVariableContext = {
      enrollment: { ...baseEnrollment, completedAt: undefined } as Enrollment
    };
    expect(resolveEnrollmentVariables(ctx, ['enrollment.completion_date'])).toEqual({
      'enrollment.completion_date': ''
    });
  });

  it('ignores keys outside enrollment.* namespace', () => {
    const ctx: EnrollmentVariableContext = { enrollment: baseEnrollment };
    expect(resolveEnrollmentVariables(ctx, ['program.hours'])).toEqual({
      'program.hours': ''
    });
  });

  it('returns empty string for unknown enrollment key', () => {
    const ctx: EnrollmentVariableContext = { enrollment: baseEnrollment };
    expect(resolveEnrollmentVariables(ctx, ['enrollment.mystery'])).toEqual({
      'enrollment.mystery': ''
    });
  });
});

describe('resolveDocumentVariables', () => {
  const baseDoc: GeneratedDocumentEntity = {
    id: 'gdoc_1',
    tenantId: 't1',
    templateId: 'tpl_1',
    templateVersionId: 'tplv_1',
    documentType: 'certificate',
    name: 'Doc',
    sourceEntityType: 'enrollment',
    sourceEntityId: 'enr_1',
    fileId: 'f_1',
    status: 'generated',
    documentNumber: 'N-2026-001',
    documentDate: '2026-05-24',
    isFinal: false,
    generatedAt: '2026-05-24T00:00:00.000Z'
  };

  it('returns document.id, number, issue_date', () => {
    const ctx: DocumentVariableContext = { document: baseDoc };
    expect(
      resolveDocumentVariables(ctx, ['document.id', 'document.number', 'document.issue_date'])
    ).toEqual({
      'document.id': 'gdoc_1',
      'document.number': 'N-2026-001',
      'document.issue_date': '2026-05-24'
    });
  });

  it('document.qr_url returns empty string in Plan B (placeholder for §5.8)', () => {
    const ctx: DocumentVariableContext = { document: baseDoc };
    expect(resolveDocumentVariables(ctx, ['document.qr_url'])).toEqual({
      'document.qr_url': ''
    });
  });

  it('returns empty string for unknown document key', () => {
    const ctx: DocumentVariableContext = { document: baseDoc };
    expect(resolveDocumentVariables(ctx, ['document.mystery'])).toEqual({
      'document.mystery': ''
    });
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm --filter @cdoprof/backend test src/modules/documents/pillar-a-variables.test.ts`
Expected: FAIL — `resolveEnrollmentVariables`/`resolveDocumentVariables`/контекст-интерфейсы не экспортированы.

- [ ] **Step 4: Add resolvers to `pillar-a-variables.ts`**

В конец файла добавить (после `resolveCommissionVariables`):

```typescript
import type { Enrollment } from '../mvp/mvp.types.js';
import type { GeneratedDocumentEntity } from './documents.types.js';

export interface EnrollmentVariableContext {
  enrollment: Enrollment;
}

/**
 * Разрешает переменные категории `enrollment.*`. Даты возвращаются в формате
 * `YYYY-MM-DD` (срез ISO-таймстампа); отсутствующие — пустая строка.
 */
export function resolveEnrollmentVariables(
  ctx: EnrollmentVariableContext,
  varNames: string[]
): Record<string, unknown> {
  const e = ctx.enrollment;
  const result: Record<string, unknown> = {};
  for (const fullName of varNames) {
    if (!fullName.startsWith('enrollment.')) {
      result[fullName] = '';
      continue;
    }
    const key = fullName.slice('enrollment.'.length);
    result[fullName] = resolveEnrollmentKey(key, e);
  }
  return result;
}

function resolveEnrollmentKey(key: string, e: Enrollment): unknown {
  switch (key) {
    case 'id':
      return e.id;
    case 'status':
      return e.status ?? '';
    case 'start_date':
      return e.enrolledAt ? e.enrolledAt.slice(0, 10) : '';
    case 'end_date':
      // endDate отсутствует на текущем типе Enrollment — fallback на completedAt,
      // обоснование: для регулятора важна фактическая дата окончания, которая в
      // нашей модели == completedAt при status=completed.
      return e.completedAt ? e.completedAt.slice(0, 10) : '';
    case 'completion_date':
      return e.completedAt ? e.completedAt.slice(0, 10) : '';
    default:
      return '';
  }
}

export interface DocumentVariableContext {
  document: GeneratedDocumentEntity;
}

/**
 * Разрешает переменные категории `document.*`. `document.qr_url` возвращает
 * пустую строку в Plan B — заглушка для §5.8 (активируется в Plan C, когда
 * появится qr_token и публичный verify endpoint).
 */
export function resolveDocumentVariables(
  ctx: DocumentVariableContext,
  varNames: string[]
): Record<string, unknown> {
  const d = ctx.document;
  const result: Record<string, unknown> = {};
  for (const fullName of varNames) {
    if (!fullName.startsWith('document.')) {
      result[fullName] = '';
      continue;
    }
    const key = fullName.slice('document.'.length);
    result[fullName] = resolveDocumentKey(key, d);
  }
  return result;
}

function resolveDocumentKey(key: string, d: GeneratedDocumentEntity): unknown {
  switch (key) {
    case 'id':
      return d.id;
    case 'number':
      return d.documentNumber ?? '';
    case 'issue_date':
      return d.documentDate ?? (d.generatedAt ? d.generatedAt.slice(0, 10) : '');
    case 'type':
      return d.documentType ?? '';
    case 'qr_url':
      // Placeholder для §5.8 (Plan C). Активируется когда появятся qr_token + verify URL.
      return '';
    default:
      return '';
  }
}
```

- [ ] **Step 5: Register `enrollment` + `document` in `variableCategories` Set**

(Если `document` уже там — оставить. `enrollment` — точно отсутствует.) В `documents.service.ts`:

```typescript
  private static readonly variableCategories = new Set([
    'tenant',
    'group',
    'learner',
    'counterparty',
    'course',
    'commission',
    'document',
    'program',
    'enrollment'  // Plan B §5.5
    // 'group_learners' добавится в Task 5
  ]);
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm --filter @cdoprof/backend test src/modules/documents/pillar-a-variables.test.ts`
Expected: PASS — все новые тесты + старые (program/commission из Plan A).

- [ ] **Step 7: Run full backend suite**

Run: `pnpm --filter @cdoprof/backend test`
Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/modules/documents/pillar-a-variables.ts apps/backend/src/modules/documents/pillar-a-variables.test.ts apps/backend/src/modules/documents/documents.service.ts
git commit -m "feat(backend): add variable resolver for enrollment + document categories (Plan B §5.5)"
```

---

## Task 5: Variable resolver — group_learners category (TDD)

**Files:**

- Modify: `apps/backend/src/modules/documents/pillar-a-variables.ts`
- Modify: `apps/backend/src/modules/documents/pillar-a-variables.test.ts`
- Modify: `apps/backend/src/modules/documents/documents.service.ts`

### Спецификация

§5.7 — для приказов по группам нужна переменная `{group_learners}` которая разворачивается в массив объектов с полями `full_name`, `snils`, `position`, `enrolled_at` (дата зачисления). Это даёт шаблонизатору возможность отрисовать таблицу учеников в приказе.

Контекст: список `Learner` объектов (snapshot) + соответствующие `Enrollment` объекты той же группы.

- [ ] **Step 1: Write the failing tests**

Дополнить `pillar-a-variables.test.ts`:

```typescript
import {
  resolveGroupLearnersVariables,
  type GroupLearnersVariableContext,
  type GroupLearnerView
} from './pillar-a-variables.js';
import type { Learner } from '../mvp/mvp.types.js';

describe('resolveGroupLearnersVariables', () => {
  const learnerA: Learner = {
    id: 'l_a',
    tenantId: 't1',
    fullName: 'Иванов Иван Иванович',
    snils: '123-456-789 00',
    position: 'Слесарь 5 разряда'
  } as Learner;
  const learnerB: Learner = {
    id: 'l_b',
    tenantId: 't1',
    fullName: 'Петров Пётр Петрович',
    snils: '987-654-321 00',
    position: 'Электрик'
  } as Learner;

  const enrollmentA: Enrollment = {
    id: 'enr_a',
    tenantId: 't1',
    learnerId: 'l_a',
    groupId: 'g_1',
    status: 'completed',
    enrolledAt: '2026-04-01T00:00:00.000Z',
    completedAt: '2026-05-10T00:00:00.000Z'
  } as Enrollment;
  const enrollmentB: Enrollment = {
    id: 'enr_b',
    tenantId: 't1',
    learnerId: 'l_b',
    groupId: 'g_1',
    status: 'completed',
    enrolledAt: '2026-04-02T00:00:00.000Z',
    completedAt: '2026-05-11T00:00:00.000Z'
  } as Enrollment;

  it('group_learners returns array sorted by full_name asc', () => {
    const ctx: GroupLearnersVariableContext = {
      learners: [learnerB, learnerA],
      enrollments: [enrollmentB, enrollmentA]
    };
    const result = resolveGroupLearnersVariables(ctx, ['group_learners']);
    const arr = result['group_learners'] as GroupLearnerView[];
    expect(arr).toHaveLength(2);
    expect(arr[0].fullName).toBe('Иванов Иван Иванович');
    expect(arr[1].fullName).toBe('Петров Пётр Петрович');
  });

  it('each item has full_name, snils, position, enrolled_at, status', () => {
    const ctx: GroupLearnersVariableContext = {
      learners: [learnerA],
      enrollments: [enrollmentA]
    };
    const result = resolveGroupLearnersVariables(ctx, ['group_learners']);
    const arr = result['group_learners'] as GroupLearnerView[];
    expect(arr[0]).toEqual({
      fullName: 'Иванов Иван Иванович',
      snils: '123-456-789 00',
      position: 'Слесарь 5 разряда',
      enrolledAt: '2026-04-01',
      status: 'completed'
    });
  });

  it('group_learners_count returns numeric count', () => {
    const ctx: GroupLearnersVariableContext = {
      learners: [learnerA, learnerB],
      enrollments: [enrollmentA, enrollmentB]
    };
    expect(resolveGroupLearnersVariables(ctx, ['group_learners_count'])).toEqual({
      group_learners_count: 2
    });
  });

  it('returns empty array when learners list is empty', () => {
    const ctx: GroupLearnersVariableContext = { learners: [], enrollments: [] };
    expect(resolveGroupLearnersVariables(ctx, ['group_learners'])).toEqual({
      group_learners: []
    });
  });

  it('ignores keys outside namespace', () => {
    const ctx: GroupLearnersVariableContext = { learners: [], enrollments: [] };
    expect(resolveGroupLearnersVariables(ctx, ['enrollment.id'])).toEqual({
      'enrollment.id': ''
    });
  });

  it('drops learners without matching enrollment', () => {
    const ctx: GroupLearnersVariableContext = {
      learners: [learnerA, learnerB],
      enrollments: [enrollmentA] // только A
    };
    const result = resolveGroupLearnersVariables(ctx, ['group_learners']);
    const arr = result['group_learners'] as GroupLearnerView[];
    expect(arr).toHaveLength(1);
    expect(arr[0].fullName).toBe('Иванов Иван Иванович');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @cdoprof/backend test src/modules/documents/pillar-a-variables.test.ts`
Expected: FAIL — функция не экспортирована.

- [ ] **Step 3: Add resolver to `pillar-a-variables.ts`**

В конец файла:

```typescript
import type { Learner } from '../mvp/mvp.types.js';

export interface GroupLearnerView {
  fullName: string;
  snils: string;
  position: string;
  enrolledAt: string; // YYYY-MM-DD
  status: string;
}

export interface GroupLearnersVariableContext {
  learners: Learner[];
  enrollments: Enrollment[];
}

/**
 * Разрешает переменную `group_learners` для приказов по группе.
 * Возвращает массив `GroupLearnerView[]` отсортированный по ФИО ASC.
 * Учеников без соответствующего enrollment в `enrollments` отбрасывает (defensive).
 *
 * Также поддерживает `group_learners_count` — для шаблонов где нужно
 * только число (например, "Утвердить список из {group_learners_count} человек").
 */
export function resolveGroupLearnersVariables(
  ctx: GroupLearnersVariableContext,
  varNames: string[]
): Record<string, unknown> {
  const byLearnerId = new Map(ctx.enrollments.map((e) => [e.learnerId, e]));
  const views: GroupLearnerView[] = ctx.learners
    .map((l): GroupLearnerView | undefined => {
      const enr = byLearnerId.get(l.id);
      if (!enr) return undefined;
      return {
        fullName: l.fullName ?? '',
        snils: l.snils ?? '',
        position: l.position ?? '',
        enrolledAt: enr.enrolledAt ? enr.enrolledAt.slice(0, 10) : '',
        status: enr.status ?? ''
      };
    })
    .filter((v): v is GroupLearnerView => v !== undefined)
    .sort((a, b) => a.fullName.localeCompare(b.fullName, 'ru'));

  const result: Record<string, unknown> = {};
  for (const fullName of varNames) {
    if (fullName === 'group_learners') {
      result[fullName] = views;
      continue;
    }
    if (fullName === 'group_learners_count') {
      result[fullName] = views.length;
      continue;
    }
    result[fullName] = '';
  }
  return result;
}
```

(Если `Enrollment` ещё не импортирован в файле, добавить в общий import блок.)

- [ ] **Step 4: Register `group_learners` in `variableCategories` Set**

В `documents.service.ts`:

```typescript
  private static readonly variableCategories = new Set([
    'tenant', 'group', 'learner', 'counterparty', 'course',
    'commission', 'document', 'program',
    'enrollment',
    'group_learners'  // Plan B §5.7
  ]);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @cdoprof/backend test src/modules/documents/pillar-a-variables.test.ts`
Expected: PASS.

- [ ] **Step 6: Run full backend suite**

Run: `pnpm --filter @cdoprof/backend test`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/documents/pillar-a-variables.ts apps/backend/src/modules/documents/pillar-a-variables.test.ts apps/backend/src/modules/documents/documents.service.ts
git commit -m "feat(backend): add variable resolver for group_learners category (Plan B §5.7)"
```

---

## Task 6: Issuance journal service — listIssuedDocuments (TDD)

**Files:**

- Modify: `apps/backend/src/modules/documents/documents.service.ts`
- Modify: `apps/backend/src/modules/documents/documents.service.test.ts`

### Спецификация

§5.6 — метод `listIssuedDocuments(tenantId, filter, ctx)` возвращает paginated list документов с фильтрами:

- `from?: string` (ISO date, включительно) — фильтр по `documentDate >= from`
- `to?: string` (ISO date, включительно)
- `types?: TemplateType[]` — фильтр по `documentType` (multi-select)
- `status?: 'generated' | 'final' | 'archived' | 'revoked'` (последнее — placeholder для Plan C)
- `learnerSearch?: string` — substring-search по `learnerFullName` (требует join'а с `learners`)
- `programId?: string` — courseVersionId фильтр (через enrollment)
- `limit`/`offset`

Возвращает: `{ items: IssuedDocumentRow[], total: number }`.

`IssuedDocumentRow` — расширенная view с предзагруженными полями:

```typescript
interface IssuedDocumentRow {
  documentId: string;
  documentNumber: string;
  documentType: TemplateType;
  status: string;
  documentDate: string;
  templateName: string;
  // joined fields:
  learnerFullName: string;
  learnerSnils: string;
  programTitle: string;
  programHours?: number;
  // §5.7:
  groupOrderDocumentId?: string;
}
```

Caller (controller) собирает данные через `mvpService.listLearners`/`listCourseVersions` + `documents.listTemplates`; in-memory сервис делает join'ы в памяти. Это снижает coupling между модулями: сервис принимает уже подготовленный `joinResolver` callback.

**Решение по подходу**: чтобы избежать перекрёстных модулей, делаем 2-этапную операцию:

1. `listGeneratedDocumentsFiltered(tenantId, filter)` — возвращает чистый `GeneratedDocumentEntity[]` + total.
2. Caller (controller) обогащает items через `mvpService`/`documents` lookups.

Это как раз pattern, который Plan A использовал для `pillar-a-variables.ts`. Тогда сервис-метод тривиальный, а enrichment — в controller.

- [ ] **Step 1: Inspect existing `listDocuments` method to match signature style**

Run: `pnpm --filter @cdoprof/backend exec grep -n "listDocuments" src/modules/documents/documents.service.ts | head -5`

(Уже видно из контекста: `listDocuments(tenantId, query: BaseFilter)`.)

- [ ] **Step 2: Write the failing tests**

Дополнить `documents.service.test.ts` блоком (в конце файла или в подходящем `describe`):

```typescript
import type { IssuedDocumentFilter } from './documents.service.js';

describe('DocumentsService.listIssuedDocuments', () => {
  let service: DocumentsService;
  let state: InMemoryDocumentsState;

  beforeEach(() => {
    state = createInMemoryDocumentsStateForTests();
    service = createDocumentsServiceWithState(state);
    state.templates.push({
      id: 'tpl_cert',
      tenantId: 't1',
      name: 'Удостоверение',
      templateType: 'certificate',
      status: 'active',
      createdAt: '2026-05-20T00:00:00.000Z',
      updatedAt: '2026-05-20T00:00:00.000Z'
    });
    state.generatedDocuments.push({
      id: 'gdoc_1',
      tenantId: 't1',
      templateId: 'tpl_cert',
      templateVersionId: 'tplv_1',
      documentType: 'certificate',
      name: 'Doc 1',
      sourceEntityType: 'enrollment',
      sourceEntityId: 'enr_1',
      fileId: 'f_1',
      status: 'generated',
      documentNumber: 'N-1',
      documentDate: '2026-05-01',
      isFinal: false,
      generatedAt: '2026-05-01T00:00:00.000Z'
    });
    state.generatedDocuments.push({
      id: 'gdoc_2',
      tenantId: 't1',
      templateId: 'tpl_cert',
      templateVersionId: 'tplv_1',
      documentType: 'certificate',
      name: 'Doc 2',
      sourceEntityType: 'enrollment',
      sourceEntityId: 'enr_2',
      fileId: 'f_2',
      status: 'final',
      documentNumber: 'N-2',
      documentDate: '2026-05-15',
      isFinal: true,
      generatedAt: '2026-05-15T00:00:00.000Z'
    });
    state.generatedDocuments.push({
      id: 'gdoc_otherTenant',
      tenantId: 't2',
      templateId: 'tpl_cert',
      templateVersionId: 'tplv_1',
      documentType: 'certificate',
      name: 'Doc OT',
      sourceEntityType: 'enrollment',
      sourceEntityId: 'enr_x',
      fileId: 'f_x',
      status: 'generated',
      documentNumber: 'N-X',
      documentDate: '2026-05-10',
      isFinal: false,
      generatedAt: '2026-05-10T00:00:00.000Z'
    });
  });

  it('returns only current tenant', () => {
    const res = service.listIssuedDocuments('t1', {} as IssuedDocumentFilter);
    expect(res.total).toBe(2);
    expect(res.items.every((d) => d.tenantId === 't1')).toBe(true);
  });

  it('filters by date range', () => {
    const res = service.listIssuedDocuments('t1', {
      from: '2026-05-10',
      to: '2026-05-31'
    });
    expect(res.total).toBe(1);
    expect(res.items[0].id).toBe('gdoc_2');
  });

  it('filters by document types', () => {
    state.generatedDocuments.push({
      id: 'gdoc_order',
      tenantId: 't1',
      templateId: 'tpl_cert',
      templateVersionId: 'tplv_1',
      documentType: 'order',
      name: 'Order',
      sourceEntityType: 'group',
      sourceEntityId: 'g_1',
      fileId: 'f_o',
      status: 'generated',
      documentNumber: 'O-1',
      documentDate: '2026-05-20',
      isFinal: false,
      generatedAt: '2026-05-20T00:00:00.000Z'
    });
    const res = service.listIssuedDocuments('t1', { types: ['order'] });
    expect(res.total).toBe(1);
    expect(res.items[0].documentType).toBe('order');
  });

  it('filters by status', () => {
    const res = service.listIssuedDocuments('t1', { status: 'final' });
    expect(res.total).toBe(1);
    expect(res.items[0].id).toBe('gdoc_2');
  });

  it('sorts by documentDate desc by default', () => {
    const res = service.listIssuedDocuments('t1', {});
    expect(res.items.map((d) => d.id)).toEqual(['gdoc_2', 'gdoc_1']);
  });

  it('paginates with limit and offset', () => {
    const res = service.listIssuedDocuments('t1', { limit: 1, offset: 1 });
    expect(res.total).toBe(2);
    expect(res.items).toHaveLength(1);
    expect(res.items[0].id).toBe('gdoc_1');
  });

  it('filters by groupOrderDocumentId for tracing cascade', () => {
    state.generatedDocuments.push({
      id: 'gdoc_in_order',
      tenantId: 't1',
      templateId: 'tpl_cert',
      templateVersionId: 'tplv_1',
      documentType: 'certificate',
      name: 'Doc in order',
      sourceEntityType: 'enrollment',
      sourceEntityId: 'enr_3',
      fileId: 'f_3',
      status: 'generated',
      documentNumber: 'N-3',
      documentDate: '2026-05-22',
      isFinal: false,
      generatedAt: '2026-05-22T00:00:00.000Z',
      groupOrderDocumentId: 'gdoc_order_parent'
    });
    const res = service.listIssuedDocuments('t1', {
      groupOrderDocumentId: 'gdoc_order_parent'
    });
    expect(res.total).toBe(1);
    expect(res.items[0].id).toBe('gdoc_in_order');
  });
});
```

(Хелперы `createInMemoryDocumentsStateForTests` / `createDocumentsServiceWithState` либо уже существуют в test-файле, либо в Step 3 нужно использовать тот же стиль создания сервиса что и в существующих тестах — посмотреть начало `documents.service.test.ts`.)

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm --filter @cdoprof/backend test src/modules/documents/documents.service.test.ts`
Expected: FAIL — `listIssuedDocuments` не существует, `IssuedDocumentFilter` не экспортирован.

- [ ] **Step 4: Implement `listIssuedDocuments`**

В `documents.service.ts` добавить (где-то рядом с `listDocuments`):

```typescript
export interface IssuedDocumentFilter {
  from?: string; // ISO date inclusive
  to?: string; // ISO date inclusive
  types?: string[]; // documentType filter (multi)
  status?: string; // exact match
  groupOrderDocumentId?: string;
  limit?: number;
  offset?: number;
}

export interface IssuedDocumentsPage {
  items: GeneratedDocumentEntity[];
  total: number;
}
```

И метод (в классе `DocumentsService`):

```typescript
  listIssuedDocuments(tenantId: string, filter: IssuedDocumentFilter): IssuedDocumentsPage {
    let rows = this.state.generatedDocuments.filter((d) => d.tenantId === tenantId);

    if (filter.from) {
      rows = rows.filter((d) => d.documentDate && d.documentDate >= filter.from!);
    }
    if (filter.to) {
      rows = rows.filter((d) => d.documentDate && d.documentDate <= filter.to!);
    }
    if (filter.types && filter.types.length > 0) {
      const set = new Set(filter.types);
      rows = rows.filter((d) => set.has(d.documentType));
    }
    if (filter.status) {
      rows = rows.filter((d) => d.status === filter.status);
    }
    if (filter.groupOrderDocumentId) {
      rows = rows.filter((d) => d.groupOrderDocumentId === filter.groupOrderDocumentId);
    }

    // Sort by documentDate desc (NULL last), tie-break by id desc for determinism.
    rows.sort((a, b) => {
      const aDate = a.documentDate ?? '';
      const bDate = b.documentDate ?? '';
      if (aDate !== bDate) return aDate < bDate ? 1 : -1;
      return a.id < b.id ? 1 : -1;
    });

    const total = rows.length;
    const offset = Math.max(0, filter.offset ?? 0);
    const limit = filter.limit && filter.limit > 0 ? filter.limit : total;
    return {
      items: rows.slice(offset, offset + limit),
      total
    };
  }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @cdoprof/backend test src/modules/documents/documents.service.test.ts`
Expected: PASS — все новые тесты + старые.

- [ ] **Step 6: Run full backend suite**

Run: `pnpm --filter @cdoprof/backend test`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/documents/documents.service.ts apps/backend/src/modules/documents/documents.service.test.ts
git commit -m "feat(backend): add listIssuedDocuments service method with filters (Plan B §5.6)"
```

---

## Task 7: Issuance journal HTTP endpoints (list + CSV export)

**Files:**

- Modify: `apps/backend/src/modules/documents/documents.controller.ts`
- Modify: `apps/backend/src/modules/documents/documents.http.integration.test.ts`

### Спецификация

§5.6 — два endpoints:

1. `GET /admin/documents/issuance-journal?from=&to=&types=&status=&groupOrderDocumentId=&limit=&offset=` — paginated JSON.
2. `GET /admin/documents/issuance-journal.csv?<те же фильтры>` — CSV-стрим, UTF-8 BOM, разделитель `;` (Excel-русская локаль), без `limit`/`offset` (отдаём все строки по фильтру, до hard-cap 10000 для DoS-защиты).

Permission: `documents.read` (уже создан в миграции 0031 Plan A).

CSV-колонки: №, Дата выдачи, № документа, Тип документа, Статус, ID документа, ID группового приказа.

(Учётный fluff типа ФИО ученика, программы, часов — это enrichment который должен делать controller через mvpService. Для упрощения Plan B в CSV кладём только нативные поля `GeneratedDocumentEntity`; обогащение JOIN'ами с learners/courses оставлено на UI — frontend сам собирает дополнительную инфу через `mvpApi.getLearner`/etc или мы делаем это в controller через `mvpService`. Решение: оставить controller тонким, JOIN делать на frontend — там React Query это делает изящно.)

- [ ] **Step 1: Inspect existing controller structure**

Run: `pnpm --filter @cdoprof/backend exec grep -nE "@Controller|@Get|@Post" src/modules/documents/documents.controller.ts | head -30`

- [ ] **Step 2: Write the failing HTTP tests**

Дополнить `documents.http.integration.test.ts`:

```typescript
describe('GET /admin/documents/issuance-journal', () => {
  it('returns paginated list with filters', async () => {
    const { app, tenantId, agent } = await bootIntegrationApp();
    // Seed: 3 generated documents с разными датами и типами
    await seedGeneratedDocument(agent, { documentDate: '2026-05-01', documentType: 'certificate' });
    await seedGeneratedDocument(agent, { documentDate: '2026-05-15', documentType: 'protocol' });
    await seedGeneratedDocument(agent, { documentDate: '2026-05-20', documentType: 'certificate' });

    const res = await agent
      .get('/admin/documents/issuance-journal?from=2026-05-10&to=2026-05-31&types=certificate')
      .expect(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items[0].documentType).toBe('certificate');
    expect(res.body.items[0].documentDate).toBe('2026-05-20');
    await app.close();
  });

  it('requires documents.read permission', async () => {
    const { app, agent } = await bootIntegrationApp({ withoutPermission: 'documents.read' });
    await agent.get('/admin/documents/issuance-journal').expect(403);
    await app.close();
  });

  it('cross-tenant isolation: returns 0 for empty tenant', async () => {
    const { app, agent } = await bootIntegrationApp({ tenantId: 't_empty' });
    const res = await agent.get('/admin/documents/issuance-journal').expect(200);
    expect(res.body.total).toBe(0);
    await app.close();
  });
});

describe('GET /admin/documents/issuance-journal.csv', () => {
  it('returns CSV with UTF-8 BOM and ; separator', async () => {
    const { app, agent } = await bootIntegrationApp();
    await seedGeneratedDocument(agent, {
      documentDate: '2026-05-01',
      documentType: 'certificate',
      documentNumber: 'TEST-001'
    });

    const res = await agent
      .get('/admin/documents/issuance-journal.csv')
      .expect(200)
      .expect('Content-Type', /text\/csv/);

    expect(res.text.charCodeAt(0)).toBe(0xfeff); // BOM
    const lines = res.text.replace(/^﻿/, '').split('\r\n');
    expect(lines[0]).toBe(
      '№;Дата выдачи;№ документа;Тип документа;Статус;ID документа;ID группового приказа'
    );
    expect(lines[1]).toContain('TEST-001');
    expect(lines[1]).toContain('certificate');
    expect(lines[1]).toContain(';');
    await app.close();
  });

  it('respects filters in CSV', async () => {
    const { app, agent } = await bootIntegrationApp();
    await seedGeneratedDocument(agent, { documentDate: '2026-04-01', documentType: 'certificate' });
    await seedGeneratedDocument(agent, { documentDate: '2026-05-01', documentType: 'protocol' });

    const res = await agent.get('/admin/documents/issuance-journal.csv?types=protocol').expect(200);
    const lines = res.text.replace(/^﻿/, '').split('\r\n').filter(Boolean);
    expect(lines).toHaveLength(2); // header + 1 row
    expect(lines[1]).toContain('protocol');
    await app.close();
  });

  it('hard-caps at 10000 rows', async () => {
    const { app, agent } = await bootIntegrationApp();
    // Simulate state seed via service directly if seeding 10k via agent too slow
    // (см. Plan A pattern для bulk seeding в тестах).
    // ... skip large seed, use a mock или service-level setup
    // Этот тест может быть unit, а не HTTP — оставим как заметку.
    await app.close();
  });
});
```

(Хелпер `seedGeneratedDocument` — следует существующему паттерну в `documents.http.integration.test.ts`. Если такого хелпера нет — создать как функцию которая делает POST на endpoint generation или вставляет в state напрямую.)

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm --filter @cdoprof/backend test src/modules/documents/documents.http.integration.test.ts`
Expected: FAIL — endpoint'ов нет.

- [ ] **Step 4: Implement the endpoints in `documents.controller.ts`**

```typescript
import type { IssuedDocumentFilter } from './documents.service.js';

@Get('/admin/documents/issuance-journal')
@RequirePermissions('documents.read')
listIssuanceJournal(
  @CurrentTenant() tenantId: string,
  @Query() query: Record<string, string | string[] | undefined>
) {
  const filter = this.parseIssuanceFilter(query);
  return this.service.listIssuedDocuments(tenantId, filter);
}

@Get('/admin/documents/issuance-journal.csv')
@RequirePermissions('documents.read')
@Header('Content-Type', 'text/csv; charset=utf-8')
@Header('Content-Disposition', 'attachment; filename="issuance-journal.csv"')
exportIssuanceJournalCsv(
  @CurrentTenant() tenantId: string,
  @Query() query: Record<string, string | string[] | undefined>
): string {
  const filter = this.parseIssuanceFilter(query);
  const HARD_CAP = 10000;
  const page = this.service.listIssuedDocuments(tenantId, { ...filter, limit: HARD_CAP, offset: 0 });

  const header = '№;Дата выдачи;№ документа;Тип документа;Статус;ID документа;ID группового приказа';
  const rows = page.items.map((d, idx) => [
    String(idx + 1),
    d.documentDate ?? '',
    csvEscape(d.documentNumber ?? ''),
    d.documentType ?? '',
    d.status ?? '',
    d.id,
    d.groupOrderDocumentId ?? ''
  ].join(';'));

  // UTF-8 BOM — для Excel русской локали.
  return '﻿' + [header, ...rows].join('\r\n');
}

private parseIssuanceFilter(
  query: Record<string, string | string[] | undefined>
): IssuedDocumentFilter {
  const asArray = (v: string | string[] | undefined): string[] | undefined =>
    v === undefined ? undefined : Array.isArray(v) ? v : [v];
  const asString = (v: string | string[] | undefined): string | undefined =>
    v === undefined ? undefined : Array.isArray(v) ? v[0] : v;
  const asInt = (v: string | string[] | undefined): number | undefined => {
    const s = asString(v);
    if (s === undefined) return undefined;
    const n = parseInt(s, 10);
    return Number.isFinite(n) ? n : undefined;
  };

  return {
    from: asString(query.from),
    to: asString(query.to),
    types: asArray(query.types),
    status: asString(query.status),
    groupOrderDocumentId: asString(query.groupOrderDocumentId),
    limit: asInt(query.limit),
    offset: asInt(query.offset)
  };
}
```

И добавить helper-функцию в конец файла (или в utility):

```typescript
function csvEscape(value: string): string {
  if (value.includes(';') || value.includes('"') || value.includes('\n')) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}
```

(Если декораторы `@RequirePermissions`/`@CurrentTenant` имеют другие имена в проекте — использовать существующие из соседних endpoints.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @cdoprof/backend test src/modules/documents/documents.http.integration.test.ts`
Expected: PASS.

- [ ] **Step 6: Run full backend suite**

Run: `pnpm --filter @cdoprof/backend test`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/documents/documents.controller.ts apps/backend/src/modules/documents/documents.http.integration.test.ts
git commit -m "feat(backend): add issuance journal endpoints (JSON + CSV) (Plan B §5.6)"
```

---

## Task 8: Group order service — issueGroupOrder (TDD)

**Files:**

- Modify: `apps/backend/src/modules/documents/documents.service.ts`
- Modify: `apps/backend/src/modules/documents/documents.service.test.ts`

### Спецификация

§5.7 — атомарная операция:

1. Создать 1 `GeneratedDocumentEntity` с `documentType='order'` и `sourceEntityType='group'`, `sourceEntityId=<groupId>`.
2. Для каждого enrollment в группе с `status='completed'`, который ещё НЕ имеет выпущенного удостоверения — пометить требование выпустить (либо сразу выпустить через тот же сервис).
3. Связать каждое выпущенное удостоверение с приказом через `groupOrderDocumentId`.
4. Идемпотентность: повторный вызов с тем же `groupId` + `templateId` возвращает существующий приказ (с тем же id) и НЕ создаёт дубликат.

**Решение по signature:** caller передаёт уже подготовленный список enrollment-ов которые надо включить в приказ (caller тянет их через mvpService). Сервис не лезет в mvp — pure operation на documents-state.

```typescript
interface IssueGroupOrderRequest {
  groupId: string;
  templateId: string; // шаблон приказа (документ типа 'order')
  enrollmentIds: string[]; // enrollments которые входят в приказ (caller фильтрует completed)
  certificateTemplateId?: string; // опциональный шаблон удостоверения; если нет — не каскадим, только приказ
}

interface IssueGroupOrderResult {
  order: GeneratedDocumentEntity;
  certificates: GeneratedDocumentEntity[];
  alreadyExisted: boolean;
}
```

- [ ] **Step 1: Write the failing tests**

Дополнить `documents.service.test.ts`:

```typescript
describe('DocumentsService.issueGroupOrder', () => {
  let service: DocumentsService;
  let state: InMemoryDocumentsState;
  const ctx = makeRequestContext(); // test helper

  beforeEach(() => {
    state = createInMemoryDocumentsStateForTests();
    service = createDocumentsServiceWithState(state);
    state.templates.push({
      id: 'tpl_order',
      tenantId: 't1',
      name: 'Приказ',
      templateType: 'order',
      status: 'active',
      createdAt: '2026-05-01T00:00:00.000Z',
      updatedAt: '2026-05-01T00:00:00.000Z'
    });
    state.templates.push({
      id: 'tpl_cert',
      tenantId: 't1',
      name: 'Удостоверение',
      templateType: 'certificate',
      status: 'active',
      createdAt: '2026-05-01T00:00:00.000Z',
      updatedAt: '2026-05-01T00:00:00.000Z'
    });
    // Минимальный template_version для каждого, чтобы numbering работало (см. Plan A).
    state.templateVersions.push({
      id: 'tplv_order',
      tenantId: 't1',
      templateId: 'tpl_order',
      versionNumber: 1,
      status: 'active',
      fileId: 'f_t_order',
      createdAt: '2026-05-01T00:00:00.000Z'
    } as any);
    state.templateVersions.push({
      id: 'tplv_cert',
      tenantId: 't1',
      templateId: 'tpl_cert',
      versionNumber: 1,
      status: 'active',
      fileId: 'f_t_cert',
      createdAt: '2026-05-01T00:00:00.000Z'
    } as any);
  });

  it('creates 1 order document of type "order" linked to the group', () => {
    const result = service.issueGroupOrder(
      't1',
      'actor_1',
      {
        groupId: 'g_1',
        templateId: 'tpl_order',
        enrollmentIds: []
      },
      ctx
    );
    expect(result.order.documentType).toBe('order');
    expect(result.order.sourceEntityType).toBe('group');
    expect(result.order.sourceEntityId).toBe('g_1');
    expect(result.certificates).toEqual([]);
    expect(result.alreadyExisted).toBe(false);
  });

  it('cascades certificates linked to the order', () => {
    const result = service.issueGroupOrder(
      't1',
      'actor_1',
      {
        groupId: 'g_1',
        templateId: 'tpl_order',
        enrollmentIds: ['enr_a', 'enr_b'],
        certificateTemplateId: 'tpl_cert'
      },
      ctx
    );
    expect(result.certificates).toHaveLength(2);
    for (const c of result.certificates) {
      expect(c.documentType).toBe('certificate');
      expect(c.groupOrderDocumentId).toBe(result.order.id);
      expect(c.sourceEntityType).toBe('enrollment');
    }
  });

  it('is idempotent on second call with same groupId+templateId', () => {
    const first = service.issueGroupOrder(
      't1',
      'actor_1',
      {
        groupId: 'g_1',
        templateId: 'tpl_order',
        enrollmentIds: ['enr_a'],
        certificateTemplateId: 'tpl_cert'
      },
      ctx
    );
    const second = service.issueGroupOrder(
      't1',
      'actor_1',
      {
        groupId: 'g_1',
        templateId: 'tpl_order',
        enrollmentIds: ['enr_a'],
        certificateTemplateId: 'tpl_cert'
      },
      ctx
    );
    expect(second.order.id).toBe(first.order.id);
    expect(second.alreadyExisted).toBe(true);
    // Сертификаты тоже не дублируются:
    const allCertsForOrder = state.generatedDocuments.filter(
      (d) => d.groupOrderDocumentId === first.order.id
    );
    expect(allCertsForOrder).toHaveLength(1);
  });

  it('rejects when order template is not of type "order"', () => {
    expect(() =>
      service.issueGroupOrder(
        't1',
        'actor_1',
        {
          groupId: 'g_1',
          templateId: 'tpl_cert', // wrong type
          enrollmentIds: []
        },
        ctx
      )
    ).toThrow(/template_type/);
  });

  it('rejects cross-tenant template', () => {
    state.templates.push({
      id: 'tpl_order_t2',
      tenantId: 't2',
      name: 'Приказ T2',
      templateType: 'order',
      status: 'active',
      createdAt: '2026-05-01T00:00:00.000Z',
      updatedAt: '2026-05-01T00:00:00.000Z'
    });
    expect(() =>
      service.issueGroupOrder(
        't1',
        'actor_1',
        {
          groupId: 'g_1',
          templateId: 'tpl_order_t2',
          enrollmentIds: []
        },
        ctx
      )
    ).toThrow(/not\s+found/i);
  });

  it('writes audit entries for order and each certificate', () => {
    const auditSpy = vi.spyOn(getAuditService(), 'write');
    service.issueGroupOrder(
      't1',
      'actor_1',
      {
        groupId: 'g_1',
        templateId: 'tpl_order',
        enrollmentIds: ['enr_a'],
        certificateTemplateId: 'tpl_cert'
      },
      ctx
    );
    const actions = auditSpy.mock.calls.map((c) => c[0].action);
    expect(actions).toContain('documents.group_order_issued');
    expect(actions).toContain('documents.certificate_issued_via_order');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @cdoprof/backend test src/modules/documents/documents.service.test.ts`
Expected: FAIL — метод не существует.

- [ ] **Step 3: Implement `issueGroupOrder`**

В `documents.service.ts`:

```typescript
export interface IssueGroupOrderRequest {
  groupId: string;
  templateId: string;
  enrollmentIds: string[];
  certificateTemplateId?: string;
}

export interface IssueGroupOrderResult {
  order: GeneratedDocumentEntity;
  certificates: GeneratedDocumentEntity[];
  alreadyExisted: boolean;
}
```

И метод в классе:

```typescript
  issueGroupOrder(
    tenantId: string,
    actorId: string | undefined,
    req: IssueGroupOrderRequest,
    ctx: RequestContext
  ): IssueGroupOrderResult {
    // 1. Validate order template.
    const orderTpl = this.state.templates.find(
      (t) => t.tenantId === tenantId && t.id === req.templateId
    );
    if (!orderTpl) {
      throw new NotFoundException(`Template ${req.templateId} not found`);
    }
    if (orderTpl.templateType !== 'order') {
      throw new BadRequestException({
        code: 'invalid_template_type',
        message: `Group order requires template of template_type='order' (got '${orderTpl.templateType}')`
      });
    }

    // 2. Idempotency: existing order for this groupId+templateId.
    const existing = this.state.generatedDocuments.find(
      (d) =>
        d.tenantId === tenantId &&
        d.sourceEntityType === 'group' &&
        d.sourceEntityId === req.groupId &&
        d.templateId === req.templateId &&
        d.documentType === 'order' &&
        d.status !== 'archived'
    );
    if (existing) {
      const certificates = this.state.generatedDocuments.filter(
        (d) => d.tenantId === tenantId && d.groupOrderDocumentId === existing.id
      );
      return { order: existing, certificates, alreadyExisted: true };
    }

    // 3. Create order document.
    const now = this.now();
    const orderVersion = this.state.templateVersions.find(
      (v) => v.tenantId === tenantId && v.templateId === req.templateId && v.status === 'active'
    );
    const orderNumber = this.reserveNumber(tenantId, 'order').reservedNumber;
    const order: GeneratedDocumentEntity = {
      id: this.id('gdoc'),
      tenantId,
      templateId: req.templateId,
      templateVersionId: orderVersion?.id ?? '',
      documentType: 'order',
      name: `Приказ ${orderNumber}`,
      sourceEntityType: 'group',
      sourceEntityId: req.groupId,
      fileId: '',  // PDF будет создан background-worker'ом; здесь пока пусто
      status: 'generated',
      documentNumber: orderNumber,
      documentDate: now.slice(0, 10),
      isFinal: false,
      generatedBy: actorId,
      generatedAt: now
    };
    this.state.generatedDocuments.push(order);
    this.auditService.write({
      tenantId,
      actorId,
      action: 'documents.group_order_issued',
      entityType: 'documents.generated',
      entityId: order.id,
      newValues: { groupId: req.groupId, templateId: req.templateId },
      requestId: ctx.requestId,
      correlationId: ctx.correlationId,
      ip: ctx.ip,
      userAgent: ctx.userAgent
    });

    // 4. Cascade certificates if certificateTemplateId given.
    const certificates: GeneratedDocumentEntity[] = [];
    if (req.certificateTemplateId && req.enrollmentIds.length > 0) {
      const certTpl = this.state.templates.find(
        (t) => t.tenantId === tenantId && t.id === req.certificateTemplateId
      );
      if (!certTpl) {
        throw new NotFoundException(`Template ${req.certificateTemplateId} not found`);
      }
      const certVersion = this.state.templateVersions.find(
        (v) =>
          v.tenantId === tenantId &&
          v.templateId === req.certificateTemplateId &&
          v.status === 'active'
      );
      for (const enrId of req.enrollmentIds) {
        // Skip if already issued from this enrollment by this template (idempotency within order).
        const dup = this.state.generatedDocuments.find(
          (d) =>
            d.tenantId === tenantId &&
            d.sourceEntityType === 'enrollment' &&
            d.sourceEntityId === enrId &&
            d.templateId === req.certificateTemplateId &&
            d.groupOrderDocumentId === order.id
        );
        if (dup) {
          certificates.push(dup);
          continue;
        }
        const certNumber = this.reserveNumber(tenantId, certTpl.templateType).reservedNumber;
        const cert: GeneratedDocumentEntity = {
          id: this.id('gdoc'),
          tenantId,
          templateId: req.certificateTemplateId,
          templateVersionId: certVersion?.id ?? '',
          documentType: certTpl.templateType,
          name: `${certTpl.name} ${certNumber}`,
          sourceEntityType: 'enrollment',
          sourceEntityId: enrId,
          fileId: '',
          status: 'generated',
          documentNumber: certNumber,
          documentDate: now.slice(0, 10),
          isFinal: false,
          generatedBy: actorId,
          generatedAt: now,
          groupOrderDocumentId: order.id
        };
        this.state.generatedDocuments.push(cert);
        certificates.push(cert);
        this.auditService.write({
          tenantId,
          actorId,
          action: 'documents.certificate_issued_via_order',
          entityType: 'documents.generated',
          entityId: cert.id,
          newValues: { enrollmentId: enrId, orderId: order.id },
          requestId: ctx.requestId,
          correlationId: ctx.correlationId,
          ip: ctx.ip,
          userAgent: ctx.userAgent
        });
      }
    }

    return { order, certificates, alreadyExisted: false };
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @cdoprof/backend test src/modules/documents/documents.service.test.ts`
Expected: PASS.

- [ ] **Step 5: Run full backend suite**

Run: `pnpm --filter @cdoprof/backend test`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/documents/documents.service.ts apps/backend/src/modules/documents/documents.service.test.ts
git commit -m "feat(backend): add issueGroupOrder service with cascade certificates and idempotency (Plan B §5.7)"
```

---

## Task 9: Group order HTTP endpoint

**Files:**

- Modify: `apps/backend/src/modules/documents/documents.controller.ts`
- Modify: `apps/backend/src/modules/documents/documents.http.integration.test.ts`

### Спецификация

`POST /admin/documents/group-orders` с body `{ groupId, templateId, enrollmentIds, certificateTemplateId? }` → 201 с `IssueGroupOrderResult`.

Permission: `documents.write` (создан в Plan A).

- [ ] **Step 1: Write the failing tests**

Дополнить `documents.http.integration.test.ts`:

```typescript
describe('POST /admin/documents/group-orders', () => {
  it('creates order and cascades certificates', async () => {
    const { app, agent } = await bootIntegrationApp();
    await seedTemplate(agent, { id: 'tpl_order', templateType: 'order' });
    await seedTemplate(agent, { id: 'tpl_cert', templateType: 'certificate' });

    const res = await agent
      .post('/admin/documents/group-orders')
      .send({
        groupId: 'g_1',
        templateId: 'tpl_order',
        enrollmentIds: ['enr_a'],
        certificateTemplateId: 'tpl_cert'
      })
      .expect(201);

    expect(res.body.order.documentType).toBe('order');
    expect(res.body.certificates).toHaveLength(1);
    expect(res.body.certificates[0].groupOrderDocumentId).toBe(res.body.order.id);
    expect(res.body.alreadyExisted).toBe(false);
    await app.close();
  });

  it('is idempotent', async () => {
    const { app, agent } = await bootIntegrationApp();
    await seedTemplate(agent, { id: 'tpl_order', templateType: 'order' });

    const first = await agent
      .post('/admin/documents/group-orders')
      .send({ groupId: 'g_1', templateId: 'tpl_order', enrollmentIds: [] })
      .expect(201);
    const second = await agent
      .post('/admin/documents/group-orders')
      .send({ groupId: 'g_1', templateId: 'tpl_order', enrollmentIds: [] })
      .expect(201);
    expect(second.body.order.id).toBe(first.body.order.id);
    expect(second.body.alreadyExisted).toBe(true);
    await app.close();
  });

  it('requires documents.write permission', async () => {
    const { app, agent } = await bootIntegrationApp({ withoutPermission: 'documents.write' });
    await agent
      .post('/admin/documents/group-orders')
      .send({ groupId: 'g_1', templateId: 'tpl_order', enrollmentIds: [] })
      .expect(403);
    await app.close();
  });

  it('400 on non-order template', async () => {
    const { app, agent } = await bootIntegrationApp();
    await seedTemplate(agent, { id: 'tpl_cert', templateType: 'certificate' });
    await agent
      .post('/admin/documents/group-orders')
      .send({ groupId: 'g_1', templateId: 'tpl_cert', enrollmentIds: [] })
      .expect(400);
    await app.close();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @cdoprof/backend test src/modules/documents/documents.http.integration.test.ts`
Expected: FAIL.

- [ ] **Step 3: Add endpoint to controller**

```typescript
@Post('/admin/documents/group-orders')
@RequirePermissions('documents.write')
@HttpCode(201)
issueGroupOrder(
  @CurrentTenant() tenantId: string,
  @CurrentActorId() actorId: string | undefined,
  @CurrentRequestContext() ctx: RequestContext,
  @Body() body: IssueGroupOrderRequest
) {
  return this.service.issueGroupOrder(tenantId, actorId, body, ctx);
}
```

(Декораторы `@CurrentTenant`/`@CurrentActorId`/`@CurrentRequestContext` — использовать существующие имена. Если только один комбинированный декоратор есть в проекте — адаптировать.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @cdoprof/backend test src/modules/documents/documents.http.integration.test.ts`
Expected: PASS.

- [ ] **Step 5: Run full backend suite**

Run: `pnpm --filter @cdoprof/backend test`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/documents/documents.controller.ts apps/backend/src/modules/documents/documents.http.integration.test.ts
git commit -m "feat(backend): add POST /admin/documents/group-orders endpoint (Plan B §5.7)"
```

---

## Task 10: Frontend — issuance journal page

**Files:**

- Create: `apps/frontend/app/admin/issuance-journal/page.tsx`
- Create: `apps/frontend/src/features/issuance-journal/types.ts`
- Create: `apps/frontend/src/features/issuance-journal/api.ts`
- Create: `apps/frontend/src/features/issuance-journal/hooks.ts`
- Create: `apps/frontend/src/features/issuance-journal/issuance-journal.tsx`
- Create: `apps/frontend/src/features/issuance-journal/issuance-journal.test.tsx`

### Спецификация

§5.6 UI: страница `/admin/issuance-journal` с:

- Фильтры: период от-до (date inputs), типы документов (multi-checkbox с 7 опциями из TemplateType), статус (select), поиск по № документа (text input).
- Таблица (через `DataTable` из `@cdoprof/ui`): №, дата, № документа, тип (русский лейбл), статус.
- Кнопка «Скачать CSV» которая дёргает endpoint `.csv` через `fetch` с blob и triggers download.
- Пагинация (limit=50 default, offset).

- [ ] **Step 1: Write the failing component test**

Файл `apps/frontend/src/features/issuance-journal/issuance-journal.test.tsx`:

```typescript
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { IssuanceJournalView } from './issuance-journal';
import * as api from './api';

const renderWithQuery = (ui: React.ReactNode) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
};

describe('IssuanceJournalView', () => {
  it('renders heading', () => {
    vi.spyOn(api, 'listIssuedDocuments').mockResolvedValue({ items: [], total: 0 });
    renderWithQuery(<IssuanceJournalView />);
    expect(screen.getByRole('heading', { name: /книга выдачи/i })).toBeInTheDocument();
  });

  it('renders rows from API', async () => {
    vi.spyOn(api, 'listIssuedDocuments').mockResolvedValue({
      items: [
        {
          id: 'gdoc_1', documentNumber: 'TEST-001', documentType: 'certificate',
          status: 'generated', documentDate: '2026-05-01'
        }
      ],
      total: 1
    });
    renderWithQuery(<IssuanceJournalView />);
    expect(await screen.findByText('TEST-001')).toBeInTheDocument();
    expect(await screen.findByText(/удостоверение/i)).toBeInTheDocument();
  });

  it('renders empty state when 0 results', async () => {
    vi.spyOn(api, 'listIssuedDocuments').mockResolvedValue({ items: [], total: 0 });
    renderWithQuery(<IssuanceJournalView />);
    expect(await screen.findByText(/нет выданных документов/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @cdoprof/frontend test src/features/issuance-journal/issuance-journal.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Create types**

Файл `apps/frontend/src/features/issuance-journal/types.ts`:

```typescript
export type TemplateType =
  | 'certificate'
  | 'protocol'
  | 'order'
  | 'diploma'
  | 'attestation'
  | 'reference'
  | 'report';

export const TEMPLATE_TYPE_LABELS: Record<TemplateType, string> = {
  certificate: 'Удостоверение',
  protocol: 'Протокол',
  order: 'Приказ',
  diploma: 'Диплом',
  attestation: 'Свидетельство об аттестации',
  reference: 'Справка',
  report: 'Отчёт'
};

export interface IssuedDocument {
  id: string;
  documentNumber: string;
  documentType: TemplateType;
  status: string;
  documentDate: string;
  groupOrderDocumentId?: string;
}

export interface IssuanceJournalFilter {
  from?: string;
  to?: string;
  types?: TemplateType[];
  status?: string;
  limit?: number;
  offset?: number;
}

export interface IssuanceJournalPage {
  items: IssuedDocument[];
  total: number;
}
```

- [ ] **Step 4: Create API client**

Файл `apps/frontend/src/features/issuance-journal/api.ts`:

```typescript
import { apiRequest } from '../../lib/api/client';
import type { IssuanceJournalFilter, IssuanceJournalPage } from './types';

function buildQuery(filter: IssuanceJournalFilter): string {
  const params = new URLSearchParams();
  if (filter.from) params.set('from', filter.from);
  if (filter.to) params.set('to', filter.to);
  if (filter.types) for (const t of filter.types) params.append('types', t);
  if (filter.status) params.set('status', filter.status);
  if (filter.limit !== undefined) params.set('limit', String(filter.limit));
  if (filter.offset !== undefined) params.set('offset', String(filter.offset));
  const s = params.toString();
  return s ? `?${s}` : '';
}

export async function listIssuedDocuments(
  filter: IssuanceJournalFilter
): Promise<IssuanceJournalPage> {
  return apiRequest<IssuanceJournalPage>(`/admin/documents/issuance-journal${buildQuery(filter)}`);
}

export async function downloadIssuedDocumentsCsv(filter: IssuanceJournalFilter): Promise<void> {
  const url = `/admin/documents/issuance-journal.csv${buildQuery(filter)}`;
  // Используем `apiRequest` с overrideResponseType если он поддерживает; иначе:
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) throw new Error(`CSV export failed: ${res.status}`);
  const blob = await res.blob();
  const dlUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = dlUrl;
  a.download = `issuance-journal-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(dlUrl);
}
```

- [ ] **Step 5: Create React Query hook**

Файл `apps/frontend/src/features/issuance-journal/hooks.ts`:

```typescript
import { useQuery } from '@tanstack/react-query';
import { listIssuedDocuments } from './api';
import type { IssuanceJournalFilter, IssuanceJournalPage } from './types';

export function useIssuanceJournal(filter: IssuanceJournalFilter) {
  return useQuery<IssuanceJournalPage>({
    queryKey: ['issuance-journal', filter],
    queryFn: () => listIssuedDocuments(filter)
  });
}
```

- [ ] **Step 6: Create the view component**

Файл `apps/frontend/src/features/issuance-journal/issuance-journal.tsx`:

```typescript
'use client';

import { DataTable, StatusChip } from '@cdoprof/ui';
import { useState } from 'react';
import {
  PageContainer, PageHeader, SectionCard, SectionEmpty
} from '../../components/state-wrappers';
import { useIssuanceJournal } from './hooks';
import { downloadIssuedDocumentsCsv } from './api';
import { TEMPLATE_TYPE_LABELS, type IssuanceJournalFilter, type TemplateType } from './types';

const PAGE_SIZE = 50;
const ALL_TYPES: TemplateType[] = [
  'certificate', 'protocol', 'order', 'diploma', 'attestation', 'reference', 'report'
];
const STATUSES = ['generated', 'final', 'archived'];

export function IssuanceJournalView() {
  const [filter, setFilter] = useState<IssuanceJournalFilter>({ limit: PAGE_SIZE, offset: 0 });
  const { data, isLoading, error } = useIssuanceJournal(filter);

  const updateFilter = (patch: Partial<IssuanceJournalFilter>) => {
    setFilter((prev) => ({ ...prev, ...patch, offset: 0 }));
  };

  return (
    <PageContainer>
      <PageHeader
        title="Книга выдачи документов"
        actions={
          <button
            type="button"
            onClick={() => downloadIssuedDocumentsCsv(filter)}
            disabled={(data?.total ?? 0) === 0}
          >
            Скачать CSV
          </button>
        }
      />

      <SectionCard title="Фильтры">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>
          <label>
            С<br />
            <input
              type="date"
              value={filter.from ?? ''}
              onChange={(e) => updateFilter({ from: e.target.value || undefined })}
            />
          </label>
          <label>
            По<br />
            <input
              type="date"
              value={filter.to ?? ''}
              onChange={(e) => updateFilter({ to: e.target.value || undefined })}
            />
          </label>
          <label>
            Статус<br />
            <select
              value={filter.status ?? ''}
              onChange={(e) => updateFilter({ status: e.target.value || undefined })}
            >
              <option value="">Все</option>
              {STATUSES.map((s) => (<option key={s} value={s}>{s}</option>))}
            </select>
          </label>
          <fieldset>
            <legend>Типы документов</legend>
            {ALL_TYPES.map((t) => {
              const checked = filter.types ? filter.types.includes(t) : true;
              return (
                <label key={t} style={{ display: 'block' }}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      const prev = filter.types ?? ALL_TYPES;
                      const next = e.target.checked
                        ? Array.from(new Set([...prev, t]))
                        : prev.filter((x) => x !== t);
                      updateFilter({ types: next.length === ALL_TYPES.length ? undefined : next });
                    }}
                  />
                  {' ' + TEMPLATE_TYPE_LABELS[t]}
                </label>
              );
            })}
          </fieldset>
        </div>
      </SectionCard>

      <SectionCard title="Документы">
        {isLoading && <p>Загрузка…</p>}
        {error && <p style={{ color: 'red' }}>Ошибка загрузки</p>}
        {!isLoading && !error && (data?.items.length ?? 0) === 0 && (
          <SectionEmpty>Нет выданных документов по этим фильтрам</SectionEmpty>
        )}
        {!isLoading && (data?.items.length ?? 0) > 0 && (
          <DataTable
            data={data!.items}
            columns={[
              { header: '№', accessor: (_, idx) => String(idx + 1 + (filter.offset ?? 0)) },
              { header: 'Дата', accessor: (row) => row.documentDate },
              { header: '№ документа', accessor: (row) => row.documentNumber },
              { header: 'Тип', accessor: (row) => TEMPLATE_TYPE_LABELS[row.documentType] ?? row.documentType },
              {
                header: 'Статус',
                accessor: (row) => <StatusChip status={row.status} />
              }
            ]}
          />
        )}
        {data && data.total > PAGE_SIZE && (
          <div>
            Страница {Math.floor((filter.offset ?? 0) / PAGE_SIZE) + 1} из{' '}
            {Math.ceil(data.total / PAGE_SIZE)}{' '}
            <button
              disabled={(filter.offset ?? 0) === 0}
              onClick={() => setFilter((f) => ({ ...f, offset: Math.max(0, (f.offset ?? 0) - PAGE_SIZE) }))}
            >
              ←
            </button>
            <button
              disabled={(filter.offset ?? 0) + PAGE_SIZE >= data.total}
              onClick={() => setFilter((f) => ({ ...f, offset: (f.offset ?? 0) + PAGE_SIZE }))}
            >
              →
            </button>
          </div>
        )}
      </SectionCard>
    </PageContainer>
  );
}
```

(API сигнатуры `DataTable` могут отличаться — используем тот же стиль что в существующих admin pages. Если `accessor` ожидает строку — адаптировать.)

- [ ] **Step 7: Create page route**

Файл `apps/frontend/app/admin/issuance-journal/page.tsx`:

```typescript
import { IssuanceJournalView } from '../../../src/features/issuance-journal/issuance-journal';
import { ProtectedPage } from '../../../src/widgets/shell/protected-page';

export default function IssuanceJournalPage() {
  return (
    <ProtectedPage requiredPermission="documents.read">
      <IssuanceJournalView />
    </ProtectedPage>
  );
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `pnpm --filter @cdoprof/frontend test src/features/issuance-journal/issuance-journal.test.tsx`
Expected: PASS.

- [ ] **Step 9: Run full frontend suite**

Run: `pnpm --filter @cdoprof/frontend test`
Expected: all green.

- [ ] **Step 10: Commit**

```bash
git add apps/frontend/src/features/issuance-journal/ apps/frontend/app/admin/issuance-journal/
git commit -m "feat(frontend): add /admin/issuance-journal page with filters and CSV export (Plan B §5.6)"
```

---

## Task 11: Frontend — group order generation UI

**Files:**

- Create: `apps/frontend/src/features/group-orders/issue-order-modal.tsx`
- Create: `apps/frontend/src/features/group-orders/issue-order-modal.test.tsx`
- Modify: `apps/frontend/src/features/mvp/screens.tsx` (GroupDetailsScreen)
- Modify: `apps/frontend/src/features/mvp/api.ts` (добавить `issueGroupOrder`)

### Спецификация

§5.7 UI: на странице группы — кнопка «Сгенерировать приказ». Открывает модалку: select шаблона приказа (загружается через `mvpApi.listDocumentTemplates({ templateType: 'order' })`), опционально select шаблона удостоверения для каскада, чекбокс «Только completed-enrollments» (по умолчанию true). При submit — POST на `/admin/documents/group-orders`, после успеха показывает toast «Приказ создан, выпущено N удостоверений» с ссылкой на книгу выдачи.

- [ ] **Step 1: Write the failing modal test**

Файл `apps/frontend/src/features/group-orders/issue-order-modal.test.tsx`:

```typescript
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { IssueOrderModal } from './issue-order-modal';
import * as mvpApi from '../mvp/api';

const renderWithQuery = (ui: React.ReactNode) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
};

describe('IssueOrderModal', () => {
  it('renders order template select with order-type templates only', async () => {
    vi.spyOn(mvpApi, 'listDocumentTemplates').mockResolvedValue({
      items: [
        { id: 'tpl_order_1', name: 'Приказ о выпуске', templateType: 'order' },
        { id: 'tpl_cert_1', name: 'Удостоверение', templateType: 'certificate' }
      ],
      total: 2
    });
    renderWithQuery(
      <IssueOrderModal
        open={true}
        groupId="g_1"
        enrollmentIds={['enr_a', 'enr_b']}
        onClose={() => {}}
      />
    );
    const select = await screen.findByLabelText(/шаблон приказа/i) as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => o.value);
    expect(options).toContain('tpl_order_1');
    expect(options).not.toContain('tpl_cert_1');
  });

  it('submits and calls issueGroupOrder API', async () => {
    vi.spyOn(mvpApi, 'listDocumentTemplates').mockResolvedValue({
      items: [{ id: 'tpl_order_1', name: 'Приказ', templateType: 'order' }],
      total: 1
    });
    const spy = vi.spyOn(mvpApi, 'issueGroupOrder').mockResolvedValue({
      order: { id: 'gdoc_order' } as any,
      certificates: [],
      alreadyExisted: false
    });
    const onClose = vi.fn();

    renderWithQuery(
      <IssueOrderModal
        open={true}
        groupId="g_1"
        enrollmentIds={['enr_a']}
        onClose={onClose}
      />
    );
    fireEvent.change(await screen.findByLabelText(/шаблон приказа/i), {
      target: { value: 'tpl_order_1' }
    });
    fireEvent.click(screen.getByRole('button', { name: /выпустить/i }));

    await waitFor(() => {
      expect(spy).toHaveBeenCalledWith({
        groupId: 'g_1',
        templateId: 'tpl_order_1',
        enrollmentIds: ['enr_a'],
        certificateTemplateId: undefined
      });
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @cdoprof/frontend test src/features/group-orders/issue-order-modal.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Add API methods to `mvp/api.ts`**

В `apps/frontend/src/features/mvp/api.ts` добавить:

```typescript
export interface IssueGroupOrderRequestApi {
  groupId: string;
  templateId: string;
  enrollmentIds: string[];
  certificateTemplateId?: string;
}

export async function issueGroupOrder(req: IssueGroupOrderRequestApi) {
  return apiRequest('/admin/documents/group-orders', {
    method: 'POST',
    body: JSON.stringify(req),
    headers: { 'Content-Type': 'application/json' }
  });
}
```

(Если `listDocumentTemplates` уже есть из Plan A — проверить что он принимает `{ templateType }` query фильтр; иначе расширить.)

- [ ] **Step 4: Implement the modal**

Файл `apps/frontend/src/features/group-orders/issue-order-modal.tsx`:

```typescript
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { issueGroupOrder, listDocumentTemplates } from '../mvp/api';

export interface IssueOrderModalProps {
  open: boolean;
  groupId: string;
  enrollmentIds: string[];
  onClose: () => void;
}

export function IssueOrderModal(props: IssueOrderModalProps) {
  const { open, groupId, enrollmentIds, onClose } = props;
  const [orderTemplateId, setOrderTemplateId] = useState('');
  const [certTemplateId, setCertTemplateId] = useState('');
  const qc = useQueryClient();

  const templatesQuery = useQuery({
    queryKey: ['document-templates'],
    queryFn: () => listDocumentTemplates({})
  });

  const orderTemplates = (templatesQuery.data?.items ?? []).filter(
    (t: { templateType?: string }) => t.templateType === 'order'
  );
  const certTemplates = (templatesQuery.data?.items ?? []).filter(
    (t: { templateType?: string }) =>
      t.templateType === 'certificate' || t.templateType === 'diploma' || t.templateType === 'attestation'
  );

  const submit = useMutation({
    mutationFn: () => issueGroupOrder({
      groupId, templateId: orderTemplateId, enrollmentIds,
      certificateTemplateId: certTemplateId || undefined
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['issuance-journal'] });
      onClose();
    }
  });

  if (!open) return null;

  return (
    <div role="dialog" aria-label="Сгенерировать приказ" style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center'
    }}>
      <div style={{ background: 'white', padding: 24, minWidth: 480 }}>
        <h2>Сгенерировать приказ по группе</h2>
        <p>Учеников будет включено в приказ: {enrollmentIds.length}</p>

        <label>
          Шаблон приказа<br />
          <select
            value={orderTemplateId}
            onChange={(e) => setOrderTemplateId(e.target.value)}
          >
            <option value="">— выбрать —</option>
            {orderTemplates.map((t: any) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </label>

        <label style={{ display: 'block', marginTop: 12 }}>
          Шаблон удостоверения (опционально, для каскадного выпуска)<br />
          <select
            value={certTemplateId}
            onChange={(e) => setCertTemplateId(e.target.value)}
          >
            <option value="">— только приказ —</option>
            {certTemplates.map((t: any) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </label>

        {submit.error && (
          <p style={{ color: 'red' }}>Ошибка: {String(submit.error)}</p>
        )}

        <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose}>Отмена</button>
          <button
            type="button"
            disabled={!orderTemplateId || submit.isPending}
            onClick={() => submit.mutate()}
          >
            {submit.isPending ? 'Выпускаем…' : 'Выпустить'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Wire the button into GroupDetailsScreen**

В `apps/frontend/src/features/mvp/screens.tsx` найти `GroupDetailsScreen` и добавить кнопку + state модалки:

```typescript
const [issueOrderOpen, setIssueOrderOpen] = useState(false);

// в PageHeader или actions блоке:
<button type="button" onClick={() => setIssueOrderOpen(true)}>
  Сгенерировать приказ
</button>

// в конец render:
<IssueOrderModal
  open={issueOrderOpen}
  groupId={id}
  enrollmentIds={enrollments.filter((e) => e.status === 'completed').map((e) => e.id)}
  onClose={() => setIssueOrderOpen(false)}
/>
```

(Точное место зависит от существующей структуры; следовать как `CommissionDetailsScreen` добавлен в Plan A.)

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm --filter @cdoprof/frontend test src/features/group-orders/issue-order-modal.test.tsx`
Expected: PASS.

- [ ] **Step 7: Run full frontend suite**

Run: `pnpm --filter @cdoprof/frontend test`
Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add apps/frontend/src/features/group-orders/ apps/frontend/src/features/mvp/screens.tsx apps/frontend/src/features/mvp/api.ts
git commit -m "feat(frontend): add group order generation modal on group detail (Plan B §5.7)"
```

---

## Task 12: Frontend — extend template editor with all 7 types + new variable categories

**Files:**

- Modify: `apps/frontend/app/documents/page.tsx`

### Спецификация

§5.4, §5.5 — расширить два select'а в существующем `documents/page.tsx`:

1. `templateType` (line ~42): добавить опции для 7 типов с русскими лейблами.
2. `varCategory` (line ~52): добавить опции для 10 категорий с русскими лейблами.

- [ ] **Step 1: Read current state of file (мы уже видели первые 60 строк — найти JSX где `templateType`/`varCategory` рендерятся)**

Run: `grep -n "templateType\|varCategory" apps/frontend/app/documents/page.tsx`

- [ ] **Step 2: Replace select markup for templateType**

Найти существующий `<select>` для `templateType` (рендерится в форме создания шаблона). Заменить hardcoded `<option value="certificate">…</option>` на полный набор:

```typescript
const TEMPLATE_TYPE_OPTIONS: ReadonlyArray<readonly [string, string]> = [
  ['certificate', 'Удостоверение'],
  ['protocol', 'Протокол'],
  ['order', 'Приказ'],
  ['diploma', 'Диплом'],
  ['attestation', 'Свидетельство об аттестации'],
  ['reference', 'Справка'],
  ['report', 'Отчёт']
];

// В JSX:
<select value={templateType} onChange={(e) => setTemplateType(e.target.value)}>
  {TEMPLATE_TYPE_OPTIONS.map(([value, label]) => (
    <option key={value} value={value}>{label}</option>
  ))}
</select>
```

- [ ] **Step 3: Replace select markup for varCategory**

```typescript
const VARIABLE_CATEGORY_OPTIONS: ReadonlyArray<readonly [string, string]> = [
  ['tenant', 'Организация'],
  ['group', 'Группа'],
  ['learner', 'Ученик'],
  ['counterparty', 'Контрагент'],
  ['course', 'Курс'],
  ['commission', 'Комиссия'],
  ['document', 'Документ'],
  ['program', 'Программа'],
  ['enrollment', 'Зачисление'],
  ['group_learners', 'Ученики группы']
];

// В JSX:
<select value={varCategory} onChange={(e) => setVarCategory(e.target.value)}>
  {VARIABLE_CATEGORY_OPTIONS.map(([value, label]) => (
    <option key={value} value={value}>{label}</option>
  ))}
</select>
```

- [ ] **Step 4: Manual sanity check (optional — no test for this)**

Это чисто UI-расширение существующего хардкода. Покрытие — через интеграционные backend tests из Task 3, которые проверяют что DTO принимает все типы. Если хочется fronend-теста — можно добавить отдельный snapshot/render-тест документов-страницы, но это extra (Plan A не делал такого).

- [ ] **Step 5: Run full frontend suite**

Run: `pnpm --filter @cdoprof/frontend test`
Expected: all green.

- [ ] **Step 6: Manual smoke (optional)**

Если есть dev-server: `pnpm dev`, открыть `/documents`, проверить что select'ы показывают все 7 + 10 опций.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/app/documents/page.tsx
git commit -m "feat(frontend): extend template type + variable category selects with all Plan B options (Plan B §5.4, §5.5)"
```

---

## Verification

После всех 12 задач:

- [ ] **Backend full test suite**

Run: `pnpm --filter @cdoprof/backend test`
Expected: все тесты зелёные. Ожидаемые числа (примерно): existing baseline (~484) + ~30 новых тестов = ~514. Возможно меньше из-за нюансов спецификаций.

- [ ] **Frontend full test suite**

Run: `pnpm --filter @cdoprof/frontend test`
Expected: все тесты зелёные. Existing baseline (~109) + 4-5 новых = ~113.

- [ ] **Type-check on monorepo**

Run: `pnpm -w typecheck` (или эквивалент)
Expected: no errors.

- [ ] **Lint**

Run: `pnpm -w lint`
Expected: no errors (husky pre-commit уже это запускает на каждом коммите).

- [ ] **Manual smoke checklist (optional)**

- `/documents` — формы создают шаблоны с template_type='diploma' и переменные с category_code='enrollment'.
- `/admin/issuance-journal` — список показывает выпущенные документы из теста Plan A; фильтры работают; CSV-скачивается, открывается в Excel.
- `/groups/[id]` — кнопка «Сгенерировать приказ» → модалка → submit → новые документы появляются в книге выдачи.

---

## Self-Review (выполнить перед сохранением плана)

**1. Spec coverage:**

- §5.4 — Расширение типов шаблонов: ✓ Task 1 (migration CHECK), Task 2 (TemplateType union), Task 3 (DTO assertion), Task 12 (UI select).
- §5.5 — Категории переменных (часть `program`+`commission` уже в Plan A):
  - `enrollment` — ✓ Task 4 (resolver + variableCategories Set).
  - `document` — ✓ Task 4.
  - `group_learners` — ✓ Task 5.
  - DB CHECK для category_code — ✓ Task 1.
  - UI select — ✓ Task 12.
- §5.6 — Книга выдачи: ✓ Task 6 (service), Task 7 (HTTP + CSV), Task 10 (UI).
- §5.7 — Приказы по группам:
  - `group_learners` resolver — ✓ Task 5.
  - `group_order_document_id` колонка — ✓ Task 1.
  - `issueGroupOrder` service с каскадом — ✓ Task 8.
  - HTTP endpoint — ✓ Task 9.
  - UI «Сгенерировать приказ» — ✓ Task 11.

**2. Placeholder scan:**

- Нет "TBD"/"TODO"/"implement later".
- Нет "Add appropriate validation" без кода.
- Каждый шаг с кодом содержит код.
- Все Steps имеют exact commands и expected output.

**3. Type consistency:**

- `TemplateType` (7 values) одинаково определён в Task 2 (backend types), Task 3 (DTO), Task 10 (frontend types), Task 12 (frontend select).
- `VariableCategoryCode` (10 values) — одинаково в Task 1 (миграция), Task 2 (types), Task 4+5 (resolver), Task 12 (UI).
- Метод `issueGroupOrder` имеет одинаковую signature в Task 8 (service), Task 9 (controller), Task 11 (frontend API + modal).
- `groupOrderDocumentId` — одинаковое имя поля везде (backend type, frontend type, миграция называет колонку `group_order_document_id`).

**4. Известные deviations from spec:**

- §5.6 «Печать (CSS-print)» — не реализовано в Plan B (только CSV-экспорт). Это намеренный объём: CSV покрывает регуляторное требование. Печать — отдельный тикет (UI polish).
- §5.7 «UI: на странице группы — кнопка с выбором шаблона приказа» — реализовано через модалку (это естественно).
- §5.6 ФИО ученика / СНИЛС / программа в книге выдачи — Plan B рендерит только нативные поля `GeneratedDocumentEntity`. Enrichment через `mvp.learners`/`mvp.courseVersions` оставлено на frontend join'ы (React Query). Если регулятору нужны полные строки в CSV — это можно добавить как separate enrichment endpoint в Plan C (или follow-up).

---

## Execution Handoff

План complete. Сохранён как `docs/superpowers/plans/2026-05-24-regulated-training-foundation-b.md`.

Два варианта исполнения:

**1. Subagent-Driven (рекомендованный)** — диспатчим свежий subagent на каждую задачу, я делаю двухстадийный review между задачами, быстрая итерация.

**2. Inline Execution** — выполняю задачи в этой сессии через `superpowers:executing-plans`, батч-исполнение с чекпоинтами для ревью.

**Plan A был исполнен inline** в той же сессии (см. PRs #173/#174/#175 history) и это сработало — все 13 задач прошли за один поход, тесты зелёные, PRs смержены. Тот же подход разумен для Plan B.

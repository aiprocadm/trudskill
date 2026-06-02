# ФИС ФРДО Registry Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate a provisional ФИС ФРДО (Рособрнадзор) Excel export of issued education documents (удостоверения ПК + дипломы ПП) for manual upload to the ФРДО личный кабинет.

**Architecture:** A durable, request-scoped MVP-module `frdo-registry/` that mirrors the existing `ot-registry/` exporter (deviation D1 precedent). It sources rows from issued documents via `DocumentsService.listIssuedDocuments` (one row per document), joins learner/course data through `MvpService` getters, preflight-validates, generates `.xlsx` via a single-swap-point `COLUMNS` writer, and persists a durable batch + per-record set in `MVP_STATE`. No XML, no round-trip (ФРДО assigns no numbers). The empty `FrdoAdapter` in `integrations/` is left untouched.

**Tech Stack:** NestJS (request-scoped service), ExcelJS, class-validator DTO, Postgres migration, Next.js 15 + React Query (reads) + useState/async (mutations), Vitest.

**Spec:** [2026-06-03-frdo-registry-export-design.md](../specs/2026-06-03-frdo-registry-export-design.md)

**Provisional swap points (2):** (1) `lookup.frdo_document_kinds` seed in migration `0046`; (2) `COLUMNS` in `frdo-registry-xlsx.writer.ts`. Both marked `PROVISIONAL` in code; swap = one const each.

---

## File Structure

**Backend — new module `apps/backend/src/modules/mvp/frdo-registry/`:**

- `frdo-registry-rows.ts` — pure `buildFrdoRows(bundles)` → `FrdoRegistryRow[]` (one row per document).
- `frdo-registry-preflight.ts` — pure `validateFrdoRow(row)` → `FrdoRegistryRowError[]`.
- `frdo-registry-xlsx.writer.ts` — `FrdoRegistryXlsxWriter` with `COLUMNS` (swap-2).
- `frdo-registry.service.ts` — `FrdoRegistryService` (Scope.REQUEST) orchestrator.
- `frdo-registry.controller.ts` — `@Controller('frdo-registry')`, 4 endpoints.
- `*.test.ts` for rows / preflight / writer / service.

**Backend — modified:**

- `migrations/0046_frdo_registry_export.sql` — create.
- `mvp.types.ts` — add `Frdo*` types + `Learner.dateOfBirth?`.
- `infrastructure/in-memory-mvp.state.ts` — add 2 arrays.
- `infrastructure/mvp-collections.ts` — register 2 collections.
- `mvp.service.ts` — `FRDO_DOCUMENT_KINDS_SEED` + `listFrdoDocumentKinds()`; thread `dateOfBirth` through `createLearnerExtended`/`updateLearnerExtended`.
- `update-learner-extended.dto.ts` — add `dateOfBirth?`.
- `mvp.module.ts` — register writer/service/controller.
- `frdo-registry-export.dto.ts` — create (new DTO file in `mvp/`).
- `mvp.http.integration.test.ts` — add ФРДО permission-boundary describe block.
- the learner Postgres row mapper — map `date_of_birth ↔ dateOfBirth` (mirror `snils`).
- `learners-bulk-import.service.ts` — recognize a «Дата рождения» column.

**Frontend — modified `apps/frontend/src/features/gov-export/`:**

- `types.ts` — add `Frdo*` mirrors.
- `api.ts` — add `createFrdoRegistryExport`, `listFrdoBatches`, `getFrdoBatchFileUrl`.
- `hooks.ts` — add `useFrdoRegistryBatches`.
- `api.contract.test.ts` — add ФРДО contract test.
- `app/gov-export/page.tsx` — add «ФИС ФРДО (Рособрнадзор)» section.

---

## Known deviations from spec (by design)

Intentional simplifications of [the spec](../specs/2026-06-03-frdo-registry-export-design.md), recorded so spec↔plan don't read as contradictory:

1. **Org details are upload-account context, not row columns.** Spec §3 lists «Образовательная организация (УЦ)» (наименование/ИНН/ОГРН) as required. The provisional `.xlsx` is uploaded **into the УЦ's own ФРДО личный кабинет**, so org identity is the account, not per-row data. The `frdo`-credential `settingsJsonb` org config is **deferred** until the real ФРДО template is supplied. No org columns in `COLUMNS` / `buildFrdoRows` for now.
2. **Preflight has no separate «warnings» channel.** Spec §9 described warnings for missing СНИЛС/дата рождения/часы. The provisional implementation emits **blank cells** for missing optionals (no `warnings` field on `FrdoRegistryExportOutcome`); only **hard** errors exclude a row. СНИЛС, **if present**, is checksum-validated.
3. **Document status filter = `generated`+`final` (exclude archived/revoked), not `final` only** (spec §1.2/§7) — issued certs may sit in `'generated'`, so `final`-only risks silently exporting nothing.
4. **Audit action names follow the ОТ convention** (`regulatory.frdo_exported`) rather than spec §11's `frdo.export_generated`, for consistency with `regulatory.ot_registry_exported`.

---

## Task 1: Migration 0046 — frdo_document_kinds + learners.date_of_birth

**Files:**

- Create: `apps/backend/migrations/0046_frdo_registry_export.sql`

- [ ] **Step 1: Write the migration** (mirrors `0045_ot_registry_export.sql`)

```sql
-- migration 0046: ФИС ФРДО — классификатор видов документов (lookup), дата рождения слушателя.
-- Права переиспользуются из 0045 (regulatory.export.read/write) — новых прав нет.

-- 1. Провизорный классификатор видов документов об образовании (ДПО) для ФРДО.
--    PROVISIONAL — frdo_kind/exact_name сверить с офиц. шаблоном/перечнем ФРДО (Рособрнадзор) перед боевой отправкой.
CREATE TABLE IF NOT EXISTS lookup.frdo_document_kinds (
  code            text PRIMARY KEY,
  template_type   text NOT NULL,
  frdo_kind       text NOT NULL,
  education_level text NOT NULL,
  exact_name      text NOT NULL,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT frdo_kinds_template_type_chk CHECK (template_type IN ('certificate','diploma')),
  CONSTRAINT frdo_kinds_template_type_uniq UNIQUE (template_type)
);

INSERT INTO lookup.frdo_document_kinds (code, template_type, frdo_kind, education_level, exact_name) VALUES
  ('PK', 'certificate', 'Удостоверение о повышении квалификации',    'ДПО', 'Удостоверение о повышении квалификации'),
  ('PP', 'diploma',     'Диплом о профессиональной переподготовке',  'ДПО', 'Диплом о профессиональной переподготовке')
ON CONFLICT (code) DO NOTHING;

COMMENT ON TABLE lookup.frdo_document_kinds IS
  'PROVISIONAL классификатор видов документов ДПО для ФИС ФРДО (Рособрнадзор). Сверить с офиц. перечнем/шаблоном перед боевой отправкой.';

-- 2. Дата рождения слушателя — нужна ФРДО для идентификации лица (опционально, без backfill).
ALTER TABLE learning.learners
  ADD COLUMN IF NOT EXISTS date_of_birth date;
```

- [ ] **Step 2: Apply migrations**

Run: `pnpm test:migrations`
Expected: PASS (all migrations apply, incl. 0046).

- [ ] **Step 3: Commit**

```bash
git add apps/backend/migrations/0046_frdo_registry_export.sql
git commit -m "feat(backend): migration 0046 — ФРДО document-kind classifier + learner date_of_birth"
```

---

## Task 2: Types — Frdo\* + Learner.dateOfBirth + state + collections

**Files:**

- Modify: `apps/backend/src/modules/mvp/mvp.types.ts` (after the `OtRegistry*` block, ~line 632; and `Learner` at ~line 29)
- Modify: `apps/backend/src/modules/mvp/infrastructure/in-memory-mvp.state.ts:77-78`
- Modify: `apps/backend/src/modules/mvp/infrastructure/mvp-collections.ts:34-35`

- [ ] **Step 1: Add `dateOfBirth` to `Learner`** (mvp.types.ts, inside `export interface Learner`, after `position?`)

```typescript
  /** Wave 2 ФРДО — дата рождения слушателя (ISO YYYY-MM-DD); нужна для выгрузки в ФИС ФРДО. */
  dateOfBirth?: string;
```

- [ ] **Step 2: Add the `Frdo*` types** (mvp.types.ts, append after the `OtRegistry*` section, before `CourseDocumentSetEntry`)

```typescript
// === ФИС ФРДО (Рособрнадзор) — выгрузка по выданным документам ===

export interface FrdoDocumentKind {
  code: string; // 'PK' | 'PP'
  templateType: 'certificate' | 'diploma';
  frdoKind: string;
  educationLevel: string; // 'ДПО'
  exactName: string;
  isActive: boolean;
}

export interface FrdoRegistryRow {
  documentId: string;
  enrollmentId: string;
  learnerId: string;
  documentKindCode: string; // 'PK' | 'PP'
  documentKind: string; // exactName
  registrationNumber: string; // = GeneratedDocument.documentNumber
  issueDate: string; // ДД.ММ.ГГГГ
  lastName: string;
  firstName: string;
  middleName: string;
  fullName: string; // для метки ошибок
  snils: string;
  dateOfBirth: string; // ДД.ММ.ГГГГ | ''
  programName: string;
  academicHours: string; // число строкой | ''
  qualification: string; // '' (provisional)
}

export interface FrdoRegistryRowError {
  documentId: string;
  learnerId: string;
  fullName: string;
  field: string;
  message: string;
}

export type FrdoRegistryBatchStatus = 'generated' | 'partial' | 'failed';

export interface FrdoRegistryBatch extends BaseEntity {
  sourceFilterJson: Record<string, unknown>;
  fileId?: string;
  totalCandidates: number;
  exportedRows: number;
  failedRows: number;
  batchStatus: FrdoRegistryBatchStatus;
  generatedBy: string;
}

export interface FrdoRegistryRecord extends BaseEntity {
  batchId: string;
  documentId: string;
  enrollmentId: string;
  learnerId: string;
  documentKindCode: string;
  registrationNumber: string;
  snils: string;
}

export interface FrdoRegistryExportOutcome {
  batchId: string;
  fileId?: string;
  total: number;
  exported: number;
  failed: number;
  rows: FrdoRegistryRow[];
  errors: FrdoRegistryRowError[];
}
```

- [ ] **Step 3: Add state arrays** (in-memory-mvp.state.ts, after `otRegistryRecords` at line 78)

```typescript
  frdoRegistryBatches: FrdoRegistryBatch[] = [];
  frdoRegistryRecords: FrdoRegistryRecord[] = [];
```

Add the import at the top of the file (extend the existing `mvp.types.js` import list with `FrdoRegistryBatch, FrdoRegistryRecord`).

- [ ] **Step 4: Register collections** (mvp-collections.ts — extend the `as const` array after `'otRegistryRecords'`)

```typescript
  'otRegistryRecords',
  'frdoRegistryBatches',
  'frdoRegistryRecords'
] as const;
```

(Replace the existing closing `'otRegistryRecords'\n] as const;` with the three-line version above.)

- [ ] **Step 5: Verify types compile**

Run: `pnpm --filter @cdoprof/backend exec tsc --noEmit`
Expected: PASS (no type errors).

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/mvp/mvp.types.ts apps/backend/src/modules/mvp/infrastructure/in-memory-mvp.state.ts apps/backend/src/modules/mvp/infrastructure/mvp-collections.ts
git commit -m "feat(backend): ФРДО types + state collections + Learner.dateOfBirth field"
```

---

## Task 3: Wire `dateOfBirth` through learner create/update + DTO

**Files:**

- Modify: `apps/backend/src/modules/mvp/mvp.service.ts` (`createLearnerExtended` ~571, `updateLearnerExtended`)
- Modify: `apps/backend/src/modules/mvp/update-learner-extended.dto.ts`
- Modify: the learner Postgres row mapper (locate via `grep -rl "snils" apps/backend/src/modules/mvp/infrastructure | grep -i persist`)
- Test: `apps/backend/src/modules/mvp/mvp.service.test.ts`

- [ ] **Step 1: Write the failing test** (mvp.service.test.ts — add inside the `updateLearnerExtended` describe block, ~line 2458)

```typescript
it('persists dateOfBirth on create and update (ФРДО)', () => {
  const audit = new AuditService();
  const service = new MvpService(
    new InMemoryMvpState(),
    new TenantScopedRepository(),
    audit,
    {
      listDocuments: () => ({ items: [], page: 1, pageSize: 50, total: 0 })
    } as unknown as DocumentsService,
    { ensureMaterialLink: async () => undefined } as unknown as FilesService,
    new EventEmitter2()
  );
  const created = service.createLearnerExtended(
    'tenant_demo',
    'admin-1',
    { firstName: 'Иван', lastName: 'Иванов', dateOfBirth: '1990-05-01' },
    ctx
  );
  expect(created.dateOfBirth).toBe('1990-05-01');

  const updated = service.updateLearnerExtended(
    'tenant_demo',
    'admin-1',
    created.id,
    { dateOfBirth: '1991-06-02' },
    ctx
  );
  expect(updated.dateOfBirth).toBe('1991-06-02');
});
```

(Reuse the file's existing `ctx`, imports for `MvpService`, `InMemoryMvpState`, `TenantScopedRepository`, `AuditService`, `EventEmitter2`, `DocumentsService`, `FilesService` — already present in this test file.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/mvp.service.test.ts -t "persists dateOfBirth" --no-file-parallelism`
Expected: FAIL (`dateOfBirth` is `undefined`).

- [ ] **Step 3: Add `dateOfBirth` to the create request type + persisted object** (mvp.service.ts `createLearnerExtended`)

In the `request:` param object type (after `middleName?: string;`) add:

```typescript
      dateOfBirth?: string;
```

In the object pushed to `state.learners`, add a conditional spread next to where `snils`/`position` are set:

```typescript
      ...(request.dateOfBirth ? { dateOfBirth: request.dateOfBirth } : {}),
```

- [ ] **Step 4: Add `dateOfBirth` to `updateLearnerExtended`**

In the `updateLearnerExtended` request type add `dateOfBirth?: string;`, and where it applies extended fields to the existing learner (next to `snils`/`position`), add:

```typescript
      ...(request.dateOfBirth !== undefined ? { dateOfBirth: request.dateOfBirth } : {}),
```

- [ ] **Step 5: Add DTO validation** (update-learner-extended.dto.ts — mirror the `snils`/`position` fields)

```typescript
  @IsOptional()
  @IsString()
  dateOfBirth?: string;
```

- [ ] **Step 6: Map the Postgres column** (learner row mapper)

Locate the learner persistence mapper (the file that maps `snils ↔ snils`/`position ↔ position` for learners) and add the same round-trip for `date_of_birth ↔ dateOfBirth` (read: `row.date_of_birth ?? undefined`; write: `learner.dateOfBirth ?? null`). Mirror the exact `snils` mapping lines.

- [ ] **Step 7: Run test to verify it passes**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/mvp.service.test.ts -t "persists dateOfBirth" --no-file-parallelism`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/modules/mvp/mvp.service.ts apps/backend/src/modules/mvp/update-learner-extended.dto.ts apps/backend/src/modules/mvp/infrastructure apps/backend/src/modules/mvp/mvp.service.test.ts
git commit -m "feat(backend): thread learner dateOfBirth through create/update/DTO/persistence"
```

---

## Task 4: ФРДО document-kind classifier reader

**Files:**

- Modify: `apps/backend/src/modules/mvp/mvp.service.ts` (near `OT_TRAINING_PROGRAMS_SEED` + `listOtTrainingPrograms` ~4492)
- Test: `apps/backend/src/modules/mvp/mvp.service.test.ts`

- [ ] **Step 1: Write the failing test** (mvp.service.test.ts — new describe block)

```typescript
describe('MvpService.listFrdoDocumentKinds (ФРДО)', () => {
  it('returns 2 active ДПО kinds keyed by template type', () => {
    const service = new MvpService(
      new InMemoryMvpState(),
      new TenantScopedRepository(),
      new AuditService(),
      {
        listDocuments: () => ({ items: [], page: 1, pageSize: 50, total: 0 })
      } as unknown as DocumentsService,
      { ensureMaterialLink: async () => undefined } as unknown as FilesService,
      new EventEmitter2()
    );
    const kinds = service.listFrdoDocumentKinds();
    expect(kinds.map((k) => k.templateType).sort()).toEqual(['certificate', 'diploma']);
    expect(kinds.every((k) => k.educationLevel === 'ДПО')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/mvp.service.test.ts -t "listFrdoDocumentKinds" --no-file-parallelism`
Expected: FAIL (`listFrdoDocumentKinds is not a function`).

- [ ] **Step 3: Add the seed const + reader** (mvp.service.ts — near `OT_TRAINING_PROGRAMS_SEED`; add `FrdoDocumentKind` to the `mvp.types.js` import)

```typescript
// PROVISIONAL — сверить frdoKind/exactName с офиц. перечнем/шаблоном ФРДО (Рособрнадзор) перед боевой отправкой.
const FRDO_DOCUMENT_KINDS_SEED: FrdoDocumentKind[] = [
  {
    code: 'PK',
    templateType: 'certificate',
    frdoKind: 'Удостоверение о повышении квалификации',
    educationLevel: 'ДПО',
    exactName: 'Удостоверение о повышении квалификации',
    isActive: true
  },
  {
    code: 'PP',
    templateType: 'diploma',
    frdoKind: 'Диплом о профессиональной переподготовке',
    educationLevel: 'ДПО',
    exactName: 'Диплом о профессиональной переподготовке',
    isActive: true
  }
];
```

Add the method (next to `listOtTrainingPrograms`):

```typescript
  listFrdoDocumentKinds(): FrdoDocumentKind[] {
    return FRDO_DOCUMENT_KINDS_SEED.filter((k) => k.isActive);
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/mvp.service.test.ts -t "listFrdoDocumentKinds" --no-file-parallelism`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/mvp/mvp.service.ts apps/backend/src/modules/mvp/mvp.service.test.ts
git commit -m "feat(backend): ФРДО document-kind classifier reader (provisional seed)"
```

---

## Task 5: `buildFrdoRows` pure row builder

**Files:**

- Create: `apps/backend/src/modules/mvp/frdo-registry/frdo-registry-rows.ts`
- Test: `apps/backend/src/modules/mvp/frdo-registry/frdo-registry-rows.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from 'vitest';

import { buildFrdoRows } from './frdo-registry-rows.js';

import type { FrdoDocumentBundle } from './frdo-registry-rows.js';

const bundle: FrdoDocumentBundle = {
  document: {
    id: 'doc_1',
    documentNumber: 'УД-000123',
    documentDate: '2026-03-10',
    documentType: 'certificate'
  },
  enrollment: { id: 'enr_1', learnerId: 'lrn_1' } as FrdoDocumentBundle['enrollment'],
  learner: {
    id: 'lrn_1',
    firstName: 'Иван',
    lastName: 'Иванов',
    middleName: 'Иванович',
    snils: '112-233-445 95',
    dateOfBirth: '1990-05-01'
  } as FrdoDocumentBundle['learner'],
  kind: {
    code: 'PK',
    templateType: 'certificate',
    frdoKind: 'Удостоверение о повышении квалификации',
    educationLevel: 'ДПО',
    exactName: 'Удостоверение о повышении квалификации',
    isActive: true
  },
  programName: 'Охрана труда (40 ч)',
  academicHours: 40
};

describe('buildFrdoRows', () => {
  it('maps one issued document to one row with formatted dates', () => {
    const [row] = buildFrdoRows([bundle]);
    expect(row!.documentId).toBe('doc_1');
    expect(row!.registrationNumber).toBe('УД-000123');
    expect(row!.issueDate).toBe('10.03.2026');
    expect(row!.dateOfBirth).toBe('01.05.1990');
    expect(row!.lastName).toBe('Иванов');
    expect(row!.documentKindCode).toBe('PK');
    expect(row!.programName).toBe('Охрана труда (40 ч)');
    expect(row!.academicHours).toBe('40');
    expect(row!.fullName).toBe('Иванов Иван Иванович');
  });

  it('emits empty strings for missing optional fields', () => {
    const [row] = buildFrdoRows([
      {
        ...bundle,
        academicHours: undefined,
        learner: {
          ...bundle.learner,
          snils: undefined,
          dateOfBirth: undefined
        } as FrdoDocumentBundle['learner']
      }
    ]);
    expect(row!.snils).toBe('');
    expect(row!.dateOfBirth).toBe('');
    expect(row!.academicHours).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/frdo-registry/frdo-registry-rows.test.ts --no-file-parallelism`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement** (frdo-registry-rows.ts — mirrors `ot-registry-rows.ts`)

```typescript
import type { GeneratedDocumentEntity } from '../../documents/documents.types.js';
import type { Enrollment, FrdoDocumentKind, FrdoRegistryRow, Learner } from '../mvp.types.js';

export interface FrdoDocumentBundle {
  document: Pick<
    GeneratedDocumentEntity,
    'id' | 'documentNumber' | 'documentDate' | 'documentType'
  >;
  enrollment: Enrollment;
  learner: Learner;
  kind: FrdoDocumentKind;
  programName: string;
  academicHours?: number;
}

const fmtDate = (iso: string): string => {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return d && m && y ? `${d}.${m}.${y}` : '';
};

const fullName = (l: Learner): string =>
  [l.lastName, l.firstName, l.middleName].filter(Boolean).join(' ').trim();

export function buildFrdoRows(bundles: FrdoDocumentBundle[]): FrdoRegistryRow[] {
  return bundles.map((b) => ({
    documentId: b.document.id,
    enrollmentId: b.enrollment.id,
    learnerId: b.learner.id,
    documentKindCode: b.kind.code,
    documentKind: b.kind.exactName,
    registrationNumber: b.document.documentNumber ?? '',
    issueDate: fmtDate(b.document.documentDate ?? ''),
    lastName: b.learner.lastName ?? '',
    firstName: b.learner.firstName ?? '',
    middleName: b.learner.middleName ?? '',
    fullName: fullName(b.learner),
    snils: b.learner.snils ?? '',
    dateOfBirth: b.learner.dateOfBirth ? fmtDate(b.learner.dateOfBirth) : '',
    programName: b.programName ?? '',
    academicHours: b.academicHours !== undefined ? String(b.academicHours) : '',
    qualification: ''
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/frdo-registry/frdo-registry-rows.test.ts --no-file-parallelism`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/mvp/frdo-registry/frdo-registry-rows.ts apps/backend/src/modules/mvp/frdo-registry/frdo-registry-rows.test.ts
git commit -m "feat(backend): ФРДО buildFrdoRows (one row per issued document)"
```

---

## Task 6: `validateFrdoRow` preflight

**Files:**

- Create: `apps/backend/src/modules/mvp/frdo-registry/frdo-registry-preflight.ts`
- Test: `apps/backend/src/modules/mvp/frdo-registry/frdo-registry-preflight.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from 'vitest';

import { validateFrdoRow } from './frdo-registry-preflight.js';

import type { FrdoRegistryRow } from '../mvp.types.js';

const valid: FrdoRegistryRow = {
  documentId: 'doc_1',
  enrollmentId: 'enr_1',
  learnerId: 'lrn_1',
  documentKindCode: 'PK',
  documentKind: 'Удостоверение о повышении квалификации',
  registrationNumber: 'УД-000123',
  issueDate: '10.03.2026',
  lastName: 'Иванов',
  firstName: 'Иван',
  middleName: 'Иванович',
  fullName: 'Иванов Иван Иванович',
  snils: '112-233-445 95',
  dateOfBirth: '01.05.1990',
  programName: 'Охрана труда',
  academicHours: '40',
  qualification: ''
};

describe('validateFrdoRow', () => {
  it('accepts a complete row', () => {
    expect(validateFrdoRow(valid)).toHaveLength(0);
  });

  it('accepts a row with no СНИЛС and no birth date (optional)', () => {
    expect(validateFrdoRow({ ...valid, snils: '', dateOfBirth: '' })).toHaveLength(0);
  });

  it('rejects missing number / bad date / missing name / kind, and a malformed СНИЛС', () => {
    expect(
      validateFrdoRow({ ...valid, registrationNumber: '' }).some(
        (e) => e.field === 'registrationNumber'
      )
    ).toBe(true);
    expect(
      validateFrdoRow({ ...valid, issueDate: '2026-03-10' }).some((e) => e.field === 'issueDate')
    ).toBe(true);
    expect(
      validateFrdoRow({ ...valid, lastName: '', firstName: '' }).some((e) => e.field === 'fullName')
    ).toBe(true);
    expect(
      validateFrdoRow({ ...valid, documentKindCode: '' }).some((e) => e.field === 'documentKind')
    ).toBe(true);
    expect(
      validateFrdoRow({ ...valid, programName: '' }).some((e) => e.field === 'programName')
    ).toBe(true);
    expect(validateFrdoRow({ ...valid, snils: '123' }).some((e) => e.field === 'snils')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/frdo-registry/frdo-registry-preflight.test.ts --no-file-parallelism`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement** (frdo-registry-preflight.ts — СНИЛС helpers reused from `learners-bulk-import.service.ts`)

```typescript
import { isValidSnilsChecksum, normalizeSnils } from '../learners-bulk-import.service.js';

import type { FrdoRegistryRow, FrdoRegistryRowError } from '../mvp.types.js';

const DATE_RE = /^[0-3][0-9]\.[0-1][0-9]\.[0-9]{4}$/;

export function validateFrdoRow(row: FrdoRegistryRow): FrdoRegistryRowError[] {
  const errs: FrdoRegistryRowError[] = [];
  const push = (field: string, message: string) =>
    errs.push({
      documentId: row.documentId,
      learnerId: row.learnerId,
      fullName: row.fullName,
      field,
      message
    });

  if (!row.registrationNumber?.trim())
    push('registrationNumber', 'Регистрационный номер документа отсутствует');
  if (!DATE_RE.test(row.issueDate ?? ''))
    push('issueDate', 'Дата выдачи должна быть в формате ДД.ММ.ГГГГ');
  if (!row.fullName?.trim() || !row.lastName?.trim() || !row.firstName?.trim())
    push('fullName', 'ФИО отсутствует (нужны фамилия и имя)');
  if (!row.documentKindCode?.trim())
    push('documentKind', 'Вид документа не сопоставлен классификатору ФРДО');
  if (!row.programName?.trim()) push('programName', 'Наименование программы отсутствует');

  // СНИЛС опционален; но если указан — должен быть валиден (ловим опечатки ввода).
  if (row.snils?.trim()) {
    const snils = normalizeSnils(row.snils);
    if (snils.length !== 11 || !isValidSnilsChecksum(snils)) push('snils', 'Некорректный СНИЛС');
  }
  return errs;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/frdo-registry/frdo-registry-preflight.test.ts --no-file-parallelism`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/mvp/frdo-registry/frdo-registry-preflight.ts apps/backend/src/modules/mvp/frdo-registry/frdo-registry-preflight.test.ts
git commit -m "feat(backend): ФРДО preflight validation (hard fields + optional СНИЛС)"
```

---

## Task 7: `FrdoRegistryXlsxWriter` + golden-file test

**Files:**

- Create: `apps/backend/src/modules/mvp/frdo-registry/frdo-registry-xlsx.writer.ts`
- Test: `apps/backend/src/modules/mvp/frdo-registry/frdo-registry-xlsx.writer.test.ts`

- [ ] **Step 1: Write the failing golden-file test** (mirrors `ot-registry-xlsx.writer.test.ts`)

```typescript
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';

import { FrdoRegistryXlsxWriter } from './frdo-registry-xlsx.writer.js';

import type { FrdoRegistryRow } from '../mvp.types.js';

const row: FrdoRegistryRow = {
  documentId: 'doc_1',
  enrollmentId: 'e1',
  learnerId: 'l1',
  documentKindCode: 'PK',
  documentKind: 'Удостоверение о повышении квалификации',
  registrationNumber: 'УД-000123',
  issueDate: '10.03.2026',
  lastName: 'Иванов',
  firstName: 'Иван',
  middleName: 'Иванович',
  fullName: 'Иванов Иван Иванович',
  snils: '112-233-445 95',
  dateOfBirth: '01.05.1990',
  programName: 'Охрана труда',
  academicHours: '40',
  qualification: ''
};

describe('FrdoRegistryXlsxWriter', () => {
  it('writes a workbook readable back with the expected header + values', async () => {
    const buffer = await new FrdoRegistryXlsxWriter().build([row]);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    const ws = wb.worksheets[0]!;
    expect(ws.getRow(1).getCell(1).value).toBe('Вид документа');
    const data = ws.getRow(2);
    expect(data.getCell(1).value).toBe('Удостоверение о повышении квалификации');
    expect(data.getCell(2).value).toBe('УД-000123');
    expect(data.getCell(4).value).toBe('Иванов');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/frdo-registry/frdo-registry-xlsx.writer.test.ts --no-file-parallelism`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement** (frdo-registry-xlsx.writer.ts — mirrors `ot-registry-xlsx.writer.ts`; `COLUMNS` is swap-2)

```typescript
import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';

import type { FrdoRegistryRow } from '../mvp.types.js';

// PROVISIONAL — сверить с офиц. .xlsx-шаблоном ФИС ФРДО (Рособрнадзор) перед боевой отправкой (spec §6/§14).
// Единственное место маппинга поле→колонка (single swap point). Состав полей — best-effort по публичным
// требованиям ФРДО ДПО (вид документа / номер / дата / ФИО / СНИЛС / дата рождения / программа / часы).
const COLUMNS: { header: string; key: keyof FrdoRegistryRow; width: number }[] = [
  { header: 'Вид документа', key: 'documentKind', width: 40 },
  { header: 'Регистрационный номер', key: 'registrationNumber', width: 22 },
  { header: 'Дата выдачи', key: 'issueDate', width: 14 },
  { header: 'Фамилия', key: 'lastName', width: 18 },
  { header: 'Имя', key: 'firstName', width: 16 },
  { header: 'Отчество', key: 'middleName', width: 18 },
  { header: 'СНИЛС', key: 'snils', width: 16 },
  { header: 'Дата рождения', key: 'dateOfBirth', width: 14 },
  { header: 'Наименование программы', key: 'programName', width: 50 },
  { header: 'Количество часов', key: 'academicHours', width: 14 },
  { header: 'Квалификация', key: 'qualification', width: 24 }
];

@Injectable()
export class FrdoRegistryXlsxWriter {
  readonly contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  async build(rows: FrdoRegistryRow[]): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('ФРДО');
    ws.columns = COLUMNS.map((c) => ({ header: c.header, key: c.key as string, width: c.width }));
    for (const r of rows) {
      ws.addRow(COLUMNS.reduce((acc, c) => ({ ...acc, [c.key]: r[c.key] }), {}));
    }
    ws.getRow(1).font = { bold: true };
    return (await wb.xlsx.writeBuffer()) as unknown as Buffer;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/frdo-registry/frdo-registry-xlsx.writer.test.ts --no-file-parallelism`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/mvp/frdo-registry/frdo-registry-xlsx.writer.ts apps/backend/src/modules/mvp/frdo-registry/frdo-registry-xlsx.writer.test.ts
git commit -m "feat(backend): ФРДО .xlsx writer with provisional COLUMNS (swap point)"
```

---

## Task 8: `FrdoRegistryService` orchestrator + service test

**Files:**

- Create: `apps/backend/src/modules/mvp/frdo-registry/frdo-registry.service.ts`
- Test: `apps/backend/src/modules/mvp/frdo-registry/frdo-registry.service.test.ts`

- [ ] **Step 1: Write the failing service test** (harness mirrors `ot-registry.service.test.ts` `makeHarness`, but mocks `listIssuedDocuments` and drops the XML writer)

```typescript
import { EventEmitter2 } from '@nestjs/event-emitter';
import { describe, expect, it, vi } from 'vitest';

import { FrdoRegistryXlsxWriter } from './frdo-registry-xlsx.writer.js';
import { FrdoRegistryService } from './frdo-registry.service.js';
import { TenantScopedRepository } from '../../../infrastructure/database/tenant-repository.js';
import { AuditService } from '../../audit/audit.service.js';
import { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';
import { MvpService } from '../mvp.service.js';

import type { RequestContext } from '../../../common/context/request-context.js';
import type { S3StorageClient } from '../../../infrastructure/storage/s3-storage.client.js';
import type { DocumentsService } from '../../documents/documents.service.js';
import type { GeneratedDocumentEntity } from '../../documents/documents.types.js';
import type { FilesService } from '../../files/files.service.js';
import type {
  Course,
  CourseVersion,
  Enrollment,
  GroupCourse,
  GroupEntity,
  Learner
} from '../mvp.types.js';

const TENANT = 'tenant_demo';
const ctx: RequestContext = {
  requestId: 'r',
  correlationId: 'c',
  tenantId: TENANT,
  userId: 'u',
  ip: '127.0.0.1',
  userAgent: 'vitest'
};
const base = { tenantId: TENANT, status: 'active' as const, createdAt: 't', updatedAt: 't' };

function seed(state: InMemoryMvpState): void {
  state.learners.push({
    ...base,
    id: 'lrn_1',
    firstName: 'Иван',
    lastName: 'Иванов',
    middleName: 'Иванович',
    snils: '112-233-445 95',
    dateOfBirth: '1990-05-01'
  } as Learner);
  state.groups.push({
    ...base,
    id: 'grp_1',
    code: 'G1',
    name: 'Группа',
    counterpartyId: 'cp_1'
  } as GroupEntity);
  state.courses.push({
    ...base,
    id: 'crs_1',
    code: 'C1',
    title: 'Охрана труда',
    isArchived: false
  } as Course);
  state.courseVersions.push({
    ...base,
    id: 'cv_1',
    courseId: 'crs_1',
    versionNo: 1,
    academicHours: 40
  } as CourseVersion);
  state.groupCourses.push({
    ...base,
    id: 'gc_1',
    groupId: 'grp_1',
    courseId: 'crs_1',
    courseVersionId: 'cv_1',
    sortOrder: 0
  } as GroupCourse);
  state.enrollments.push({
    ...base,
    id: 'enr_1',
    groupId: 'grp_1',
    learnerId: 'lrn_1',
    status: 'completed',
    enrolledAt: '2026-01-01'
  } as Enrollment);
}

function makeHarness(docs: Partial<GeneratedDocumentEntity>[]) {
  const state = new InMemoryMvpState();
  const mvp = new MvpService(
    state,
    new TenantScopedRepository(),
    new AuditService(),
    {
      listDocuments: () => ({ items: [], page: 1, pageSize: 50, total: 0 })
    } as unknown as DocumentsService,
    { ensureMaterialLink: async () => undefined } as unknown as FilesService,
    new EventEmitter2()
  );
  const documents = {
    listIssuedDocuments: vi.fn(() => ({ items: docs, total: docs.length }))
  } as unknown as DocumentsService;
  const filesRegister = vi.fn(async (m: { tenantId: string }) => ({
    id: 'file_x',
    tenantId: m.tenantId,
    storageKey: 'k',
    originalName: 'n',
    mimeType: 'm',
    sizeBytes: 1,
    createdAt: 't'
  }));
  const files = { register: filesRegister } as unknown as FilesService;
  const storagePut = vi.fn(async () => undefined);
  const storage = { putObject: storagePut } as unknown as S3StorageClient;
  const auditWrite = vi.fn();
  const audit = { write: auditWrite } as unknown as AuditService;
  const service = new FrdoRegistryService(
    state,
    mvp,
    documents,
    files,
    storage,
    new FrdoRegistryXlsxWriter(),
    audit
  );
  return { service, state, storagePut, filesRegister, auditWrite };
}

const doc = (over: Partial<GeneratedDocumentEntity> = {}): Partial<GeneratedDocumentEntity> => ({
  id: 'doc_1',
  documentType: 'certificate',
  documentNumber: 'УД-000123',
  documentDate: '2026-03-10',
  status: 'final',
  sourceEntityType: 'enrollment',
  sourceEntityId: 'enr_1',
  ...over
});

describe('FrdoRegistryService.exportFrdoRegistry', () => {
  it('exports one row per issued document, persists batch + records, writes file', async () => {
    const h = makeHarness([doc()]);
    seed(h.state);

    const outcome = await h.service.exportFrdoRegistry(TENANT, {}, ctx);

    expect(outcome.exported).toBe(1);
    expect(outcome.failed).toBe(0);
    expect(outcome.fileId).toBe('file_x');
    expect(outcome.rows[0]!.registrationNumber).toBe('УД-000123');
    expect(outcome.rows[0]!.programName).toBe('Охрана труда');
    expect(h.state.frdoRegistryBatches).toHaveLength(1);
    expect(h.state.frdoRegistryBatches[0]!.batchStatus).toBe('generated');
    expect(h.state.frdoRegistryRecords).toHaveLength(1);
    expect(h.storagePut).toHaveBeenCalledTimes(1);
    expect(h.auditWrite.mock.calls[0]![0]).toMatchObject({
      action: 'regulatory.frdo_exported',
      entityType: 'frdo_registry_batch'
    });
  });

  it('excludes revoked documents and reports unmatched kinds as errors', async () => {
    const h = makeHarness([
      doc({ id: 'doc_rev', revokedAt: '2026-04-01' }),
      doc({ id: 'doc_bad', documentType: 'protocol' })
    ]);
    seed(h.state);

    const outcome = await h.service.exportFrdoRegistry(TENANT, {}, ctx);

    // revoked dropped before join; protocol has no ФРДО kind → error, no file.
    expect(outcome.exported).toBe(0);
    expect(outcome.errors.some((e) => e.field === 'documentKind')).toBe(true);
    expect(outcome.fileId).toBeUndefined();
    expect(h.state.frdoRegistryBatches[0]!.batchStatus).toBe('failed');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/frdo-registry/frdo-registry.service.test.ts --no-file-parallelism`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement** (frdo-registry.service.ts — structure mirrors `ot-registry.service.ts`, source = issued documents)

```typescript
import { randomUUID } from 'node:crypto';

import { Inject, Injectable, NotFoundException, Scope } from '@nestjs/common';

import { buildFrdoRows } from './frdo-registry-rows.js';
import { validateFrdoRow } from './frdo-registry-preflight.js';
import { FrdoRegistryXlsxWriter } from './frdo-registry-xlsx.writer.js';
import { S3StorageClient } from '../../../infrastructure/storage/s3-storage.client.js';
import { AuditService } from '../../audit/audit.service.js';
import { DocumentsService } from '../../documents/documents.service.js';
import { FilesService } from '../../files/files.service.js';
import { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';
import { MVP_STATE } from '../infrastructure/mvp-state.token.js';
import { MvpService } from '../mvp.service.js';

import type { FrdoDocumentBundle } from './frdo-registry-rows.js';
import type { RequestContext } from '../../../common/context/request-context.js';
import type {
  Learner,
  FrdoRegistryBatch,
  FrdoRegistryExportOutcome,
  FrdoRegistryRecord,
  FrdoRegistryRow,
  FrdoRegistryRowError
} from '../mvp.types.js';

export interface FrdoRegistryExportFilter {
  from?: string;
  to?: string;
  types?: ('certificate' | 'diploma')[];
  groupId?: string;
  clientId?: string;
}

/**
 * Wave 2 sub-goal A — ФИС ФРДО (Рособрнадзор): exports issued education documents
 * (удостоверения ПК / дипломы ПП) to a provisional .xlsx for manual upload.
 * Request-scoped, shares MVP_STATE; partial-success principle (valid rows exported,
 * invalid surfaced per-field; fully-invalid batch → no file).
 */
@Injectable({ scope: Scope.REQUEST })
export class FrdoRegistryService {
  constructor(
    @Inject(MVP_STATE) private readonly state: InMemoryMvpState,
    @Inject(MvpService) private readonly mvp: MvpService,
    @Inject(DocumentsService) private readonly documents: DocumentsService,
    @Inject(FilesService) private readonly files: FilesService,
    @Inject(S3StorageClient) private readonly storage: S3StorageClient,
    @Inject(FrdoRegistryXlsxWriter) private readonly xlsx: FrdoRegistryXlsxWriter,
    @Inject(AuditService) private readonly auditService: AuditService
  ) {}

  async exportFrdoRegistry(
    tenantId: string,
    filter: FrdoRegistryExportFilter,
    ctx: RequestContext
  ): Promise<FrdoRegistryExportOutcome> {
    const kindsByType = new Map(this.mvp.listFrdoDocumentKinds().map((k) => [k.templateType, k]));

    // Issuance journal returns all generated docs; include issued (generated|final),
    // exclude archived/revoked. NOT `status:'final'` only — issued certs may sit in
    // 'generated' depending on the issuance flow; filtering 'final' risks silently
    // exporting nothing.
    const docs = this.documents
      .listIssuedDocuments(tenantId, {
        types: filter.types?.length ? filter.types : ['certificate', 'diploma'],
        ...(filter.from ? { from: filter.from } : {}),
        ...(filter.to ? { to: filter.to } : {})
      })
      .items.filter((d) => !d.revokedAt && d.status !== 'archived' && d.status !== 'revoked');

    const gatherErrors: FrdoRegistryRowError[] = [];
    const bundles: FrdoDocumentBundle[] = [];
    for (const document of docs) {
      try {
        if (document.sourceEntityType !== 'enrollment') continue;
        const enrollment = this.mvp.getEnrollment(tenantId, document.sourceEntityId);
        const learner = this.mvp.getLearner(tenantId, enrollment.learnerId);
        const group = this.mvp.getGroup(tenantId, enrollment.groupId);
        if (filter.clientId && group.counterpartyId !== filter.clientId) continue;
        if (filter.groupId && enrollment.groupId !== filter.groupId) continue;

        const gc = this.mvp.listGroupCourses(tenantId, { group_id: enrollment.groupId }).items[0];
        const course = gc?.courseId ? this.mvp.getCourse(tenantId, gc.courseId) : undefined;
        const cv = gc?.courseVersionId
          ? this.mvp.getCourseVersion(tenantId, gc.courseVersionId)
          : undefined;

        const kind = kindsByType.get(document.documentType);
        if (!kind) {
          gatherErrors.push({
            documentId: document.id,
            learnerId: learner.id,
            fullName: this.fullName(learner),
            field: 'documentKind',
            message: 'Вид документа не сопоставлен классификатору ФРДО'
          });
          continue;
        }

        bundles.push({
          document,
          enrollment,
          learner,
          kind,
          programName: course?.title ?? '',
          ...(cv?.academicHours !== undefined ? { academicHours: cv.academicHours } : {})
        });
      } catch {
        gatherErrors.push({
          documentId: document.id,
          learnerId: '',
          fullName: '',
          field: 'document',
          message: 'Не удалось собрать данные документа (отсутствует связанная сущность)'
        });
      }
    }

    const rows = buildFrdoRows(bundles);
    const valid: FrdoRegistryRow[] = [];
    const preflightErrors: FrdoRegistryRowError[] = [];
    for (const r of rows) {
      const e = validateFrdoRow(r);
      if (e.length) preflightErrors.push(...e);
      else valid.push(r);
    }

    const errors = [...gatherErrors, ...preflightErrors];
    const exported = valid.length;
    const failed = errors.length;
    const total = exported + failed;
    const now = new Date().toISOString();

    const batch: FrdoRegistryBatch = {
      id: this.id('frb'),
      tenantId,
      status: 'active',
      createdAt: now,
      updatedAt: now,
      sourceFilterJson: { ...filter },
      totalCandidates: total,
      exportedRows: exported,
      failedRows: failed,
      batchStatus: failed ? (exported ? 'partial' : 'failed') : 'generated',
      generatedBy: ctx.userId ?? ''
    };

    if (exported) {
      const buffer = await this.xlsx.build(valid);
      const storageKey = `${tenantId}/frdo-registry/${batch.id}.xlsx`;
      const meta = await this.files.register({
        tenantId,
        storageKey,
        originalName: `frdo-registry-${batch.id}.xlsx`,
        mimeType: this.xlsx.contentType,
        sizeBytes: buffer.length,
        antivirusStatus: 'clean'
      });
      await this.storage.putObject({
        key: storageKey,
        body: buffer,
        contentType: this.xlsx.contentType
      });
      batch.fileId = meta.id;
    }

    this.state.frdoRegistryBatches.push(batch);
    for (const r of valid) {
      this.state.frdoRegistryRecords.push({
        id: this.id('frr'),
        tenantId,
        status: 'active',
        createdAt: now,
        updatedAt: now,
        batchId: batch.id,
        documentId: r.documentId,
        enrollmentId: r.enrollmentId,
        learnerId: r.learnerId,
        documentKindCode: r.documentKindCode,
        registrationNumber: r.registrationNumber,
        snils: r.snils
      });
    }

    this.auditService.write({
      tenantId,
      actorId: ctx.userId,
      action: 'regulatory.frdo_exported',
      entityType: 'frdo_registry_batch',
      entityId: batch.id,
      newValues: { exported, failed, batchStatus: batch.batchStatus },
      requestId: ctx.requestId,
      correlationId: ctx.correlationId,
      ip: ctx.ip,
      userAgent: ctx.userAgent
    });

    return {
      batchId: batch.id,
      fileId: batch.fileId,
      total,
      exported,
      failed,
      rows: valid,
      errors
    };
  }

  listBatches(tenantId: string): FrdoRegistryBatch[] {
    return this.state.frdoRegistryBatches
      .filter((b) => b.tenantId === tenantId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  getBatchWithRecords(
    tenantId: string,
    id: string
  ): { batch: FrdoRegistryBatch; records: FrdoRegistryRecord[] } {
    const batch = this.state.frdoRegistryBatches.find(
      (b) => b.tenantId === tenantId && b.id === id
    );
    if (!batch)
      throw new NotFoundException({
        code: 'frdo_registry_batch_not_found',
        message: 'Batch not found for tenant'
      });
    const records = this.state.frdoRegistryRecords.filter(
      (r) => r.tenantId === tenantId && r.batchId === id
    );
    return { batch, records };
  }

  async getBatchDownloadUrl(tenantId: string, id: string): Promise<{ url: string }> {
    const { batch } = this.getBatchWithRecords(tenantId, id);
    if (!batch.fileId)
      throw new NotFoundException({
        code: 'frdo_registry_file_not_found',
        message: 'Batch has no generated file'
      });
    return { url: await this.files.createDownloadUrl(tenantId, batch.fileId) };
  }

  private id(prefix: string): string {
    return `${prefix}_${randomUUID().replace(/-/g, '')}`;
  }

  private fullName(l: Learner): string {
    return [l.lastName, l.firstName, l.middleName].filter(Boolean).join(' ').trim();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/frdo-registry/frdo-registry.service.test.ts --no-file-parallelism`
Expected: PASS (both cases).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/mvp/frdo-registry/frdo-registry.service.ts apps/backend/src/modules/mvp/frdo-registry/frdo-registry.service.test.ts
git commit -m "feat(backend): FrdoRegistryService orchestrator (issued-docs → rows → .xlsx → batch)"
```

---

## Task 9: DTO + controller + module wiring + HTTP permission boundary

**Files:**

- Create: `apps/backend/src/modules/mvp/frdo-registry-export.dto.ts`
- Create: `apps/backend/src/modules/mvp/frdo-registry/frdo-registry.controller.ts`
- Modify: `apps/backend/src/modules/mvp/mvp.module.ts:15-36`
- Test: `apps/backend/src/modules/mvp/mvp.http.integration.test.ts`

- [ ] **Step 1: Write the DTO** (frdo-registry-export.dto.ts)

```typescript
import { IsArray, IsIn, IsOptional, IsString } from 'class-validator';

export class CreateFrdoRegistryExportDto {
  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @IsArray()
  @IsIn(['certificate', 'diploma'], { each: true })
  types?: ('certificate' | 'diploma')[];

  @IsOptional()
  @IsString()
  groupId?: string;

  @IsOptional()
  @IsString()
  clientId?: string;
}
```

- [ ] **Step 2: Write the controller** (frdo-registry.controller.ts — mirrors `ot-registry.controller.ts`, no response-import endpoint)

```typescript
import { Body, Controller, Get, Param, Post, UseGuards, UseInterceptors } from '@nestjs/common';

import { FrdoRegistryService } from './frdo-registry.service.js';
import { assertValidDto } from '../../../common/app-validation.pipe.js';
import { CurrentContext } from '../../../common/decorators/current-context.decorator.js';
import { TenantGuard } from '../../../common/guards/tenant.guard.js';
import { RequirePermissions } from '../../iam/permission.decorator.js';
import { PermissionGuard } from '../../iam/permission.guard.js';
import { MvpRequestPersistenceInterceptor } from '../infrastructure/mvp-request-persistence.interceptor.js';
import { CreateFrdoRegistryExportDto } from '../frdo-registry-export.dto.js';

import type { RequestContext } from '../../../common/context/request-context.js';

@Controller('frdo-registry')
@UseInterceptors(MvpRequestPersistenceInterceptor)
@UseGuards(TenantGuard)
export class FrdoRegistryController {
  constructor(private readonly service: FrdoRegistryService) {}

  @Post('exports')
  @UseGuards(PermissionGuard)
  @RequirePermissions('regulatory.export.write')
  async createExport(@CurrentContext() ctx: RequestContext, @Body() body: unknown) {
    const dto = assertValidDto(CreateFrdoRegistryExportDto, body);
    return this.service.exportFrdoRegistry(ctx.tenantId!, dto, ctx);
  }

  @Get('exports')
  @UseGuards(PermissionGuard)
  @RequirePermissions('regulatory.export.read')
  listExports(@CurrentContext() ctx: RequestContext) {
    return this.service.listBatches(ctx.tenantId!);
  }

  @Get('exports/:id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('regulatory.export.read')
  getExport(@CurrentContext() ctx: RequestContext, @Param('id') id: string) {
    return this.service.getBatchWithRecords(ctx.tenantId!, id);
  }

  @Get('exports/:id/file')
  @UseGuards(PermissionGuard)
  @RequirePermissions('regulatory.export.read')
  async getFile(@CurrentContext() ctx: RequestContext, @Param('id') id: string) {
    return this.service.getBatchDownloadUrl(ctx.tenantId!, id);
  }
}
```

- [ ] **Step 3: Wire the module** (mvp.module.ts)

Add imports (next to the `OtRegistry*` imports):

```typescript
import { FrdoRegistryXlsxWriter } from './frdo-registry/frdo-registry-xlsx.writer.js';
import { FrdoRegistryController } from './frdo-registry/frdo-registry.controller.js';
import { FrdoRegistryService } from './frdo-registry/frdo-registry.service.js';
```

Add `FrdoRegistryController` to the `controllers:` array; add to `providers:`:

```typescript
    FrdoRegistryXlsxWriter,
    { provide: FrdoRegistryService, scope: Scope.REQUEST, useClass: FrdoRegistryService },
```

- [ ] **Step 4: Write the permission-boundary test** (mvp.http.integration.test.ts — mirror the existing `PATCH /learners/:id/profile` stub block; add a stub controller method + a describe asserting 403 without `regulatory.export.write` and 200/handled with it)

Add to the stub controller class in that file:

```typescript
      @Post('frdo-registry/exports')
      @RequirePermissions('regulatory.export.write')
      frdoExport(@CurrentContext() context: { tenantId?: string }) {
        return { data: { ok: true, tenantId: context.tenantId } };
      }
```

Add a describe block mirroring the existing boundary tests (deny when permission absent, allow when present), using the file's existing `iamServiceMock`/request helpers.

- [ ] **Step 5: Run the boundary + full mvp http integration**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/mvp.http.integration.test.ts --no-file-parallelism`
Expected: PASS (existing + new ФРДО boundary).

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/mvp/frdo-registry-export.dto.ts apps/backend/src/modules/mvp/frdo-registry/frdo-registry.controller.ts apps/backend/src/modules/mvp/mvp.module.ts apps/backend/src/modules/mvp/mvp.http.integration.test.ts
git commit -m "feat(backend): ФРДО export endpoints + module wiring + permission boundary"
```

---

## Task 10: Frontend — types, api, hooks, UI section, contract test

**Files:**

- Modify: `apps/frontend/src/features/gov-export/types.ts`
- Modify: `apps/frontend/src/features/gov-export/api.ts`
- Modify: `apps/frontend/src/features/gov-export/hooks.ts`
- Modify: `apps/frontend/src/features/gov-export/api.contract.test.ts`
- Modify: `apps/frontend/app/gov-export/page.tsx`

- [ ] **Step 1: Add frontend types** (types.ts — append; mirror backend `Frdo*`)

```typescript
// === ФИС ФРДО (Рособрнадзор) ===

export interface FrdoRegistryRow {
  documentId: string;
  enrollmentId: string;
  learnerId: string;
  documentKindCode: string;
  documentKind: string;
  registrationNumber: string;
  issueDate: string;
  lastName: string;
  firstName: string;
  middleName: string;
  fullName: string;
  snils: string;
  dateOfBirth: string;
  programName: string;
  academicHours: string;
  qualification: string;
}

export interface FrdoRegistryRowError {
  documentId: string;
  learnerId: string;
  fullName: string;
  field: string;
  message: string;
}

export interface FrdoRegistryBatch {
  id: string;
  tenantId: string;
  createdAt: string;
  updatedAt: string;
  status: string;
  sourceFilterJson: Record<string, unknown>;
  fileId?: string;
  totalCandidates: number;
  exportedRows: number;
  failedRows: number;
  batchStatus: 'generated' | 'partial' | 'failed';
  generatedBy: string;
}

export interface FrdoRegistryExportOutcome {
  batchId: string;
  fileId?: string;
  total: number;
  exported: number;
  failed: number;
  rows: FrdoRegistryRow[];
  errors: FrdoRegistryRowError[];
}
```

- [ ] **Step 2: Add api methods** (api.ts — extend `govExportApi`; extend the `import type` from `./types`)

```typescript
  createFrdoRegistryExport: (
    session: UserSession,
    body: { from?: string; to?: string; types?: ('certificate' | 'diploma')[]; groupId?: string; clientId?: string }
  ): Promise<FrdoRegistryExportOutcome> =>
    apiRequest<FrdoRegistryExportOutcome>('/frdo-registry/exports', { method: 'POST', body, ...withAuth(session) }),

  listFrdoBatches: (session: UserSession): Promise<FrdoRegistryBatch[]> =>
    apiRequest<FrdoRegistryBatch[]>('/frdo-registry/exports', withAuth(session)),

  getFrdoBatchFileUrl: (session: UserSession, id: string): Promise<{ url: string }> =>
    apiRequest<{ url: string }>(`/frdo-registry/exports/${id}/file`, withAuth(session)),
```

- [ ] **Step 3: Add the hook** (hooks.ts — mirror `useOtRegistryBatches`)

```typescript
export const useFrdoRegistryBatches = (live = false) => {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['govExport', 'frdoRegistryBatches'],
    enabled: Boolean(session),
    queryFn: () => govExportApi.listFrdoBatches(session!),
    refetchInterval: live ? 15_000 : undefined
  });
  useEffect(() => {
    if (!session) void queryClient.invalidateQueries({ queryKey: ['govExport'] });
  }, [queryClient, session]);
  return {
    data: query.data ?? ([] as FrdoRegistryBatch[]),
    loading: query.isLoading,
    error: query.error instanceof Error ? query.error.message : null,
    refetch: async () => {
      await query.refetch();
    }
  };
};
```

(Extend the `import type { ... } from './types'` line with `FrdoRegistryBatch`.)

- [ ] **Step 4: Add the UI section** (page.tsx — state + handler + SectionCard, mirroring the ОТ section without format selector / response upload)

Add imports/usages: import `useFrdoRegistryBatches` and `FrdoRegistryExportOutcome`. Add state near the ОТ state:

```typescript
const [frdoFrom, setFrdoFrom] = useState('');
const [frdoTo, setFrdoTo] = useState('');
const [frdoBusy, setFrdoBusy] = useState(false);
const [frdoError, setFrdoError] = useState<string | null>(null);
const [frdoOutcome, setFrdoOutcome] = useState<FrdoRegistryExportOutcome | null>(null);
const frdoBatches = useFrdoRegistryBatches();

const onGenerateFrdo = async () => {
  if (!session) return;
  setFrdoBusy(true);
  setFrdoError(null);
  try {
    const outcome = await govExportApi.createFrdoRegistryExport(session, {
      ...(frdoFrom ? { from: frdoFrom } : {}),
      ...(frdoTo ? { to: frdoTo } : {})
    });
    setFrdoOutcome(outcome);
    await frdoBatches.refetch();
  } catch (e) {
    setFrdoError(e instanceof Error ? e.message : 'Ошибка формирования выгрузки ФРДО');
  } finally {
    setFrdoBusy(false);
  }
};

const onDownloadFrdo = async (batchId: string) => {
  if (!session) return;
  const { url } = await govExportApi.getFrdoBatchFileUrl(session, batchId);
  window.open(url, '_blank');
};
```

Add the section JSX (after the ОТ `SectionCard`):

```tsx
<SectionCard title="ФИС ФРДО (Рособрнадзор)">
  <p
    role="note"
    style={{
      background: '#FEF3C7',
      border: '1px solid #F59E0B',
      borderRadius: 6,
      padding: '8px 12px',
      margin: '0 0 12px'
    }}
  >
    ⚠️ Формат выгрузки предварительный (не сверен с эталоном ФИС ФРДО). Перед подачей в реестр
    сверьте колонки с Excel-шаблоном в личном кабинете ФРДО.
  </p>
  <FilterBar>
    <input
      type="date"
      value={frdoFrom}
      onChange={(e) => setFrdoFrom(e.target.value)}
      placeholder="Дата выдачи с"
    />
    <input
      type="date"
      value={frdoTo}
      onChange={(e) => setFrdoTo(e.target.value)}
      placeholder="по"
    />
    <button type="button" onClick={() => void onGenerateFrdo()} disabled={frdoBusy}>
      {frdoBusy ? 'Формирование...' : 'Сформировать выгрузку ФРДО'}
    </button>
  </FilterBar>
  {frdoError ? <SectionError message={frdoError} /> : null}
  {frdoOutcome ? (
    <div>
      <p>
        Экспортировано: {frdoOutcome.exported} / {frdoOutcome.total}. Ошибок: {frdoOutcome.failed}.
      </p>
      {frdoOutcome.errors.length > 0 ? (
        <ul>
          {frdoOutcome.errors.map((e) => (
            <li key={`${e.documentId}-${e.field}`}>
              {e.fullName || e.documentId}: {e.field} — {e.message}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  ) : null}
  <SectionCard title="История выгрузок ФРДО">
    {frdoBatches.loading ? <LoadingState message="Загрузка истории..." /> : null}
    {frdoBatches.error ? <SectionError message={frdoBatches.error} /> : null}
    {!frdoBatches.loading && !frdoBatches.error && !frdoBatches.data.length ? (
      <SectionEmpty message="Выгрузки отсутствуют" />
    ) : null}
    {frdoBatches.data.length ? (
      <DataTable
        columns={[
          { key: 'id', title: 'ID' },
          { key: 'batchStatus', title: 'Статус' },
          { key: 'exportedRows', title: 'Экспортировано' },
          { key: 'failedRows', title: 'Ошибок' },
          { key: 'createdAt', title: 'Дата' },
          { key: 'actionsView', title: 'Действия', render: (row) => row.actionsView }
        ]}
        rows={frdoBatches.data.map((batch) => ({
          ...batch,
          actionsView: (
            <button
              type="button"
              onClick={() => void onDownloadFrdo(batch.id)}
              disabled={!batch.fileId}
            >
              Скачать
            </button>
          )
        }))}
      />
    ) : null}
  </SectionCard>
</SectionCard>
```

- [ ] **Step 5: Add the api contract test** (api.contract.test.ts — mirror the existing OT contract test)

```typescript
it('createFrdoRegistryExport POSTs to /frdo-registry/exports and unwraps the envelope', async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      data: { batchId: 'b1', total: 1, exported: 1, failed: 0, rows: [], errors: [] },
      meta: {}
    })
  });
  vi.stubGlobal('fetch', fetchMock);

  const out = await govExportApi.createFrdoRegistryExport(session, { from: '2026-01-01' });

  expect(out.batchId).toBe('b1');
  expect(fetchMock.mock.calls[0]![0]).toContain('/frdo-registry/exports');
});
```

(Reuse the file's existing `session` fixture + `vi`/`govExportApi` imports.)

- [ ] **Step 6: Run frontend tests + typecheck**

Run: `pnpm --filter @cdoprof/frontend exec vitest run src/features/gov-export/api.contract.test.ts --no-file-parallelism`
Then: `pnpm --filter @cdoprof/frontend exec tsc --noEmit`
Expected: PASS both.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/features/gov-export apps/frontend/app/gov-export/page.tsx
git commit -m "feat(frontend): ФРДО export section in gov-export (types/api/hook/UI/contract test)"
```

---

## Task 11: `dateOfBirth` in learner bulk import

**Files:**

- Modify: `apps/backend/src/modules/mvp/learners-bulk-import.service.ts` (the row parser + the `createLearnerExtended` call ~293)
- Test: `apps/backend/src/modules/mvp/learners-bulk-import.service.test.ts`

- [ ] **Step 1: Write the failing test** (learners-bulk-import.service.test.ts — add a case asserting an imported «Дата рождения» column lands on the learner)

```typescript
it('imports the «Дата рождения» column onto the learner (ФРДО)', () => {
  const { bulk, mvp } = makeServices();
  const outcome = bulk.bulkImportLearners(
    'tenant_demo',
    ctx.userId,
    {
      rows: [{ fullName: 'Иванов Иван Иванович', email: 'dob@x.ru', dateOfBirth: '1990-05-01' }],
      idempotencyKey: 'k-dob'
    },
    ctx
  );
  const created = mvp.getLearner('tenant_demo', outcome.rows[0]!.learnerId!);
  expect(created.dateOfBirth).toBe('1990-05-01');
});
```

(Adapt the row shape + `makeServices`/`ctx` to the file's existing helpers — match how an existing import test constructs a row, e.g. the `snils` cases.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/learners-bulk-import.service.test.ts -t "Дата рождения" --no-file-parallelism`
Expected: FAIL (`dateOfBirth` undefined).

- [ ] **Step 3: Parse + forward the column** (learners-bulk-import.service.ts)

Where the row is parsed into `parsed` (alongside `snils`/`position`), read an optional `dateOfBirth` (accept ISO `YYYY-MM-DD`; trim). In the `createLearnerExtended` call (~293), add next to the `snils`/`position` conditional spreads:

```typescript
          ...(parsed.dateOfBirth ? { dateOfBirth: parsed.dateOfBirth } : {}),
```

Add `dateOfBirth?: string` to the parsed-row type and map the «Дата рождения» header in the column→field mapping (mirror how «СНИЛС» maps to `snils`).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/learners-bulk-import.service.test.ts -t "Дата рождения" --no-file-parallelism`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/mvp/learners-bulk-import.service.ts apps/backend/src/modules/mvp/learners-bulk-import.service.test.ts
git commit -m "feat(backend): import learner dateOfBirth column for ФРДО"
```

---

## Task 12: e2e smoke + docs/handoff + final gates

**Files:**

- Create: `apps/frontend/src/e2e/frdo-registry-export.e2e.test.ts` (mirror `ot-registry-export.e2e.test.ts`)
- Modify: `README.md` §2, `LMS_AGENT_HANDOFF.md` (new `### 5.103`), this plan's checkboxes, `docs/superpowers/plans/PLANS_STATUS.md`, `docs/TZ_MVP_TRACEABILITY.md`

- [ ] **Step 1: Write the e2e smoke** (mirror the OT e2e — dynamic-import the gov-export page module + assert the `/gov-export` route policy is `regulatory.export.read`; copy the OT file and rename symbols)

Run: `pnpm --filter @cdoprof/frontend exec vitest run src/e2e/frdo-registry-export.e2e.test.ts --no-file-parallelism`
Expected: PASS.

- [ ] **Step 2: Backend target cluster green**

Run:

```bash
pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/frdo-registry src/modules/mvp/mvp.service.test.ts src/modules/mvp/mvp.http.integration.test.ts --no-file-parallelism
```

Expected: PASS (all ФРДО files + service + http integration).

- [ ] **Step 3: Typecheck both apps**

Run: `pnpm typecheck`
Expected: PASS (8/8).

- [ ] **Step 4: Update docs** (README §2 Current/Last/Next; HANDOFF §5.103 with files + test status + deviations; tick this plan's checkboxes; add a PLANS_STATUS row for Wave 2 sub-goal A; add a TRACEABILITY entry BL-007/008 → ФРДО files).

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/e2e/frdo-registry-export.e2e.test.ts README.md LMS_AGENT_HANDOFF.md docs/superpowers/plans/2026-06-03-frdo-registry-export.md docs/superpowers/plans/PLANS_STATUS.md docs/TZ_MVP_TRACEABILITY.md
git commit -m "test(frontend): ФРДО e2e smoke + docs/handoff (Wave 2 sub-goal A)"
```

---

## Deviations log (fill during execution)

- Record any divergence from this plan here (e.g. exact learner PG-mapper file, bulk-import column header spelling, stub-controller test shape) so the handoff §5.103 is accurate.

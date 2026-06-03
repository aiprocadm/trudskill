# ЕИСОТ «лица на тестирование» Registry Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate a provisional ЕИСОТ / ЛКОТ (Минтруд) Excel roster of learners directed to a knowledge check («лица на тестирование») for manual upload to the ЛКОТ личный кабинет.

**Architecture:** A durable, request-scoped MVP-module `eisot-testing-registry/` mirroring `frdo-registry/` (deviation D1 precedent). It sources a roster of learners **by filter** (group / period / client) from `MvpService.listEnrollments` (one row per learner, deduped — NOT from exams or documents), joins learner/employer/course data through `MvpService` getters, preflight-validates, generates `.xlsx` via a single-swap-point `COLUMNS` writer, and persists a durable batch + per-record set in `MVP_STATE`. No migration, no new permissions, no XML, no round-trip. The empty `EisotAdapter` in `integrations/` is left untouched.

**Tech Stack:** NestJS (request-scoped service), ExcelJS, class-validator DTO, Next.js 15 + React Query (reads) + useState/async (mutations), Vitest.

**Spec:** [2026-06-03-eisot-testing-registry-export-design.md](../specs/2026-06-03-eisot-testing-registry-export-design.md)

**Provisional swap point (1):** `COLUMNS` in `eisot-testing-xlsx.writer.ts`. Marked `PROVISIONAL` in code; swap = one const.

**Status:** 📝 PLANNED — not yet implemented. Branch `feat/2026-06-03-eisot-testing-registry-export` (spec committed). **No migration** (all fields already in `main`: `learner.snils`/`position`/`dateOfBirth`, `counterparty.name`/`inn`; reuses `regulatory.export.read/write` from migration `0045`).

---

## File Structure

**Backend — new module `apps/backend/src/modules/mvp/eisot-testing-registry/`:**

- `eisot-testing-rows.ts` — pure `buildEisotTestingRows(bundles)` → `EisotTestingRow[]` (one row per learner).
- `eisot-testing-preflight.ts` — pure `validateEisotTestingRow(row)` → `EisotTestingRowError[]`.
- `eisot-testing-xlsx.writer.ts` — `EisotTestingXlsxWriter` with `COLUMNS` (swap point).
- `eisot-testing-registry.service.ts` — `EisotTestingRegistryService` (Scope.REQUEST) orchestrator.
- `eisot-testing-registry.controller.ts` — `@Controller('eisot-testing-registry')`, 4 endpoints.
- `*.test.ts` for rows / preflight / writer / service.

**Backend — modified:**

- `mvp.types.ts` — add `EisotTesting*` types (after the `FrdoRegistry*` block, before `CourseDocumentSetEntry` ~line 706).
- `infrastructure/in-memory-mvp.state.ts` — add 2 arrays + imports.
- `infrastructure/mvp-collections.ts` — register 2 collections.
- `mvp.module.ts` — register writer/service/controller.
- `eisot-testing-export.dto.ts` — create (new DTO file in `mvp/`).
- `mvp.http.integration.test.ts` — add ЕИСОТ stub-controller methods + permission-boundary describe block.

**Frontend — modified `apps/frontend/src/features/gov-export/`:**

- `types.ts` — add `EisotTesting*` mirrors.
- `api.ts` — add `createEisotTestingExport`, `listEisotTestingBatches`, `getEisotTestingBatchFileUrl`.
- `hooks.ts` — add `useEisotTestingBatches`.
- `api.contract.test.ts` — add ЕИСОТ contract test.
- `app/gov-export/page.tsx` — add «ЕИСОТ — лица на тестирование» section.
- `src/e2e/eisot-testing-registry-export.e2e.test.ts` — create e2e smoke.

---

## Known deviations from spec (by design)

Intentional simplifications, recorded so spec↔plan don't read as contradictory:

1. **`cancelled` enrollments are excluded.** Spec §1.2 says «без привязки к статусу экзамена», but a withdrawn/cancelled enrollment is not someone being sent to testing. Confirmed with owner during spec review. All other statuses (`pending`/`active`/`suspended`/`completed`) are included.
2. **Dedup by learner, first selected group wins.** A learner enrolled in several filtered groups yields one row; employer/program come from the first enrollment encountered (insertion order).
3. **Period filter re-applied manually on `enrolledAt`.** The in-memory `MvpService.listEnrollments` ignores `enrolled_from`/`enrolled_to` (same gap OT FIX #3 documented), so the service filters `enrolledAt` itself.
4. **Preflight: only ФИО + работодатель are hard.** СНИЛС / ИНН / дата рождения / должность / программа missing → blank cells, not errors. СНИЛС/ИНН, **if present**, are format-validated.
5. **`failed` counts distinct learners**, not per-field error objects (one row can yield several errors) — mirrors the FRDO fix (`new Set(...).size`), unit = learner.
6. **Audit action follows the `regulatory.*` convention** (`regulatory.eisot_testing_exported`), consistent with `regulatory.frdo_exported` / `regulatory.ot_registry_exported`.

---

## Task 1: Types — EisotTesting\* + state + collections

**Files:**

- Modify: `apps/backend/src/modules/mvp/mvp.types.ts` (after the `FrdoRegistryExportOutcome` block, before `CourseDocumentSetEntry` ~line 706)
- Modify: `apps/backend/src/modules/mvp/infrastructure/in-memory-mvp.state.ts` (imports + after `frdoRegistryRecords` line 82)
- Modify: `apps/backend/src/modules/mvp/infrastructure/mvp-collections.ts` (after `'frdoRegistryRecords'` line 37)

- [ ] **Step 1: Add the `EisotTesting*` types** (mvp.types.ts — insert immediately after the `FrdoRegistryExportOutcome` interface closes, before the `/** Запись в пакете выходных документов курса (§5.3)... */` comment for `CourseDocumentSetEntry`)

```typescript
// === ЕИСОТ «лица на тестирование» (Минтруд / ЛКОТ) — ростер по фильтру ===

export interface EisotTestingRow {
  enrollmentId: string;
  learnerId: string;
  lastName: string;
  firstName: string;
  middleName: string;
  fullName: string; // для метки ошибок
  snils: string;
  dateOfBirth: string; // ДД.ММ.ГГГГ | ''
  position: string;
  employerName: string;
  employerInn: string;
  programName: string;
  referralDate: string; // ДД.ММ.ГГГГ | '' (enrolledAt)
}

export interface EisotTestingRowError {
  enrollmentId: string;
  learnerId: string;
  fullName: string;
  field: string;
  message: string;
}

export type EisotTestingBatchStatus = 'generated' | 'partial' | 'failed';

export interface EisotTestingBatch extends BaseEntity {
  sourceFilterJson: Record<string, unknown>;
  fileId?: string;
  totalCandidates: number;
  exportedRows: number;
  failedRows: number;
  batchStatus: EisotTestingBatchStatus;
  generatedBy: string;
}

export interface EisotTestingRecord extends BaseEntity {
  batchId: string;
  enrollmentId: string;
  learnerId: string;
  snils: string;
  employerInn: string;
}

export interface EisotTestingExportOutcome {
  batchId: string;
  fileId?: string;
  total: number;
  exported: number;
  failed: number;
  rows: EisotTestingRow[];
  errors: EisotTestingRowError[];
}
```

- [ ] **Step 2: Add state arrays** (in-memory-mvp.state.ts — after `frdoRegistryRecords: FrdoRegistryRecord[] = [];` at line 82)

```typescript
  // Wave 2 sub-goal C — ЕИСОТ «лица на тестирование»: durable roster batches + per-record set.
  eisotTestingBatches: EisotTestingBatch[] = [];
  eisotTestingRecords: EisotTestingRecord[] = [];
```

Extend the `import type { ... } from '../mvp.types.js';` block (add `EisotTestingBatch, EisotTestingRecord` — alphabetical, next to `Enrollment`):

```typescript
  EisotTestingBatch,
  EisotTestingRecord,
```

- [ ] **Step 3: Register collections** (mvp-collections.ts — replace the closing `'frdoRegistryRecords'\n] as const;` with the four-line version)

```typescript
  'frdoRegistryBatches',
  'frdoRegistryRecords',
  'eisotTestingBatches',
  'eisotTestingRecords'
] as const;
```

- [ ] **Step 4: Verify types compile**

Run: `pnpm --filter @cdoprof/backend exec tsc --noEmit`
Expected: PASS (no type errors).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/mvp/mvp.types.ts apps/backend/src/modules/mvp/infrastructure/in-memory-mvp.state.ts apps/backend/src/modules/mvp/infrastructure/mvp-collections.ts
git commit -m "feat(backend): ЕИСОТ testing-roster types + state collections"
```

---

## Task 2: `buildEisotTestingRows` pure row builder

**Files:**

- Create: `apps/backend/src/modules/mvp/eisot-testing-registry/eisot-testing-rows.ts`
- Test: `apps/backend/src/modules/mvp/eisot-testing-registry/eisot-testing-rows.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from 'vitest';

import { buildEisotTestingRows } from './eisot-testing-rows.js';

import type { EisotTestingBundle } from './eisot-testing-rows.js';

const bundle: EisotTestingBundle = {
  enrollment: {
    id: 'enr_1',
    learnerId: 'lrn_1',
    enrolledAt: '2026-03-10'
  } as EisotTestingBundle['enrollment'],
  learner: {
    id: 'lrn_1',
    firstName: 'Иван',
    lastName: 'Иванов',
    middleName: 'Иванович',
    snils: '112-233-445 95',
    dateOfBirth: '1990-05-01',
    position: 'Электрик'
  } as EisotTestingBundle['learner'],
  employerName: 'ООО Ромашка',
  employerInn: '7707083893',
  programName: 'Охрана труда (40 ч)'
};

describe('buildEisotTestingRows', () => {
  it('maps one enrollment to one learner row with formatted dates', () => {
    const [row] = buildEisotTestingRows([bundle]);
    expect(row!.enrollmentId).toBe('enr_1');
    expect(row!.learnerId).toBe('lrn_1');
    expect(row!.lastName).toBe('Иванов');
    expect(row!.fullName).toBe('Иванов Иван Иванович');
    expect(row!.snils).toBe('112-233-445 95');
    expect(row!.dateOfBirth).toBe('01.05.1990');
    expect(row!.position).toBe('Электрик');
    expect(row!.employerName).toBe('ООО Ромашка');
    expect(row!.employerInn).toBe('7707083893');
    expect(row!.programName).toBe('Охрана труда (40 ч)');
    expect(row!.referralDate).toBe('10.03.2026');
  });

  it('emits empty strings for missing optional fields', () => {
    const [row] = buildEisotTestingRows([
      {
        ...bundle,
        employerInn: '',
        learner: {
          ...bundle.learner,
          snils: undefined,
          dateOfBirth: undefined,
          position: undefined
        } as EisotTestingBundle['learner']
      }
    ]);
    expect(row!.snils).toBe('');
    expect(row!.dateOfBirth).toBe('');
    expect(row!.position).toBe('');
    expect(row!.employerInn).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/eisot-testing-registry/eisot-testing-rows.test.ts --no-file-parallelism`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement** (eisot-testing-rows.ts — mirrors `frdo-registry-rows.ts`)

```typescript
import type { EisotTestingRow, Enrollment, Learner } from '../mvp.types.js';

export interface EisotTestingBundle {
  enrollment: Enrollment;
  learner: Learner;
  employerName: string;
  employerInn: string;
  programName: string;
}

const fmtDate = (iso: string): string => {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return d && m && y ? `${d}.${m}.${y}` : '';
};

const fullName = (l: Learner): string =>
  [l.lastName, l.firstName, l.middleName].filter(Boolean).join(' ').trim();

export function buildEisotTestingRows(bundles: EisotTestingBundle[]): EisotTestingRow[] {
  return bundles.map((b) => ({
    enrollmentId: b.enrollment.id,
    learnerId: b.learner.id,
    lastName: b.learner.lastName ?? '',
    firstName: b.learner.firstName ?? '',
    middleName: b.learner.middleName ?? '',
    fullName: fullName(b.learner),
    snils: b.learner.snils ?? '',
    dateOfBirth: b.learner.dateOfBirth ? fmtDate(b.learner.dateOfBirth) : '',
    position: b.learner.position ?? '',
    employerName: b.employerName ?? '',
    employerInn: b.employerInn ?? '',
    programName: b.programName ?? '',
    referralDate: b.enrollment.enrolledAt ? fmtDate(b.enrollment.enrolledAt) : ''
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/eisot-testing-registry/eisot-testing-rows.test.ts --no-file-parallelism`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/mvp/eisot-testing-registry/eisot-testing-rows.ts apps/backend/src/modules/mvp/eisot-testing-registry/eisot-testing-rows.test.ts
git commit -m "feat(backend): ЕИСОТ buildEisotTestingRows (one row per learner)"
```

---

## Task 3: `validateEisotTestingRow` preflight

**Files:**

- Create: `apps/backend/src/modules/mvp/eisot-testing-registry/eisot-testing-preflight.ts`
- Test: `apps/backend/src/modules/mvp/eisot-testing-registry/eisot-testing-preflight.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from 'vitest';

import { validateEisotTestingRow } from './eisot-testing-preflight.js';

import type { EisotTestingRow } from '../mvp.types.js';

const valid: EisotTestingRow = {
  enrollmentId: 'enr_1',
  learnerId: 'lrn_1',
  lastName: 'Иванов',
  firstName: 'Иван',
  middleName: 'Иванович',
  fullName: 'Иванов Иван Иванович',
  snils: '112-233-445 95',
  dateOfBirth: '01.05.1990',
  position: 'Электрик',
  employerName: 'ООО Ромашка',
  employerInn: '7707083893',
  programName: 'Охрана труда',
  referralDate: '10.03.2026'
};

describe('validateEisotTestingRow', () => {
  it('accepts a complete row', () => {
    expect(validateEisotTestingRow(valid)).toHaveLength(0);
  });

  it('accepts a row with no СНИЛС / no ИНН / no birth date (optional)', () => {
    expect(
      validateEisotTestingRow({ ...valid, snils: '', employerInn: '', dateOfBirth: '' })
    ).toHaveLength(0);
  });

  it('rejects missing ФИО and missing employer', () => {
    expect(
      validateEisotTestingRow({ ...valid, lastName: '', firstName: '' }).some(
        (e) => e.field === 'fullName'
      )
    ).toBe(true);
    expect(
      validateEisotTestingRow({ ...valid, employerName: '' }).some(
        (e) => e.field === 'employerName'
      )
    ).toBe(true);
  });

  it('rejects a malformed СНИЛС and a malformed ИНН when present', () => {
    expect(
      validateEisotTestingRow({ ...valid, snils: '123' }).some((e) => e.field === 'snils')
    ).toBe(true);
    expect(
      validateEisotTestingRow({ ...valid, employerInn: '12' }).some(
        (e) => e.field === 'employerInn'
      )
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/eisot-testing-registry/eisot-testing-preflight.test.ts --no-file-parallelism`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement** (eisot-testing-preflight.ts — СНИЛС helpers reused from `learners-bulk-import.service.ts`)

```typescript
import { isValidSnilsChecksum, normalizeSnils } from '../learners-bulk-import.service.js';

import type { EisotTestingRow, EisotTestingRowError } from '../mvp.types.js';

const INN_RE = /^(\d{10}|\d{12})$/;

/**
 * Provisional preflight for ЕИСОТ «лица на тестирование» rows. Hard fields (ФИО,
 * работодатель) exclude a row; optional СНИЛС/ИНН are format-validated only when
 * present. Missing optionals (СНИЛС / ИНН / дата рождения / должность / программа)
 * produce blank cells, not errors — see plan «Known deviations» #4.
 */
export function validateEisotTestingRow(row: EisotTestingRow): EisotTestingRowError[] {
  const errs: EisotTestingRowError[] = [];
  const push = (field: string, message: string) =>
    errs.push({
      enrollmentId: row.enrollmentId,
      learnerId: row.learnerId,
      fullName: row.fullName,
      field,
      message
    });

  if (!row.fullName?.trim() || !row.lastName?.trim() || !row.firstName?.trim())
    push('fullName', 'ФИО отсутствует (нужны фамилия и имя)');
  if (!row.employerName?.trim()) push('employerName', 'Наименование работодателя отсутствует');

  // СНИЛС опционален; но если указан — должен быть валиден (ловим опечатки ввода).
  if (row.snils?.trim()) {
    const snils = normalizeSnils(row.snils);
    if (snils.length !== 11 || !isValidSnilsChecksum(snils)) push('snils', 'Некорректный СНИЛС');
  }
  // ИНН опционален; но если указан — 10 или 12 цифр.
  if (row.employerInn?.trim() && !INN_RE.test(row.employerInn.trim()))
    push('employerInn', 'ИНН работодателя должен содержать 10 или 12 цифр');

  return errs;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/eisot-testing-registry/eisot-testing-preflight.test.ts --no-file-parallelism`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/mvp/eisot-testing-registry/eisot-testing-preflight.ts apps/backend/src/modules/mvp/eisot-testing-registry/eisot-testing-preflight.test.ts
git commit -m "feat(backend): ЕИСОТ preflight validation (hard ФИО/работодатель + optional СНИЛС/ИНН)"
```

---

## Task 4: `EisotTestingXlsxWriter` + golden-file test

**Files:**

- Create: `apps/backend/src/modules/mvp/eisot-testing-registry/eisot-testing-xlsx.writer.ts`
- Test: `apps/backend/src/modules/mvp/eisot-testing-registry/eisot-testing-xlsx.writer.test.ts`

- [ ] **Step 1: Write the failing golden-file test** (mirrors `frdo-registry-xlsx.writer.test.ts`)

```typescript
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';

import { EisotTestingXlsxWriter } from './eisot-testing-xlsx.writer.js';

import type { EisotTestingRow } from '../mvp.types.js';

const row: EisotTestingRow = {
  enrollmentId: 'enr_1',
  learnerId: 'lrn_1',
  lastName: 'Иванов',
  firstName: 'Иван',
  middleName: 'Иванович',
  fullName: 'Иванов Иван Иванович',
  snils: '112-233-445 95',
  dateOfBirth: '01.05.1990',
  position: 'Электрик',
  employerName: 'ООО Ромашка',
  employerInn: '7707083893',
  programName: 'Охрана труда',
  referralDate: '10.03.2026'
};

describe('EisotTestingXlsxWriter', () => {
  it('writes a workbook readable back with the expected header + values', async () => {
    const buffer = await new EisotTestingXlsxWriter().build([row]);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    const ws = wb.worksheets[0]!;
    expect(ws.getRow(1).getCell(1).value).toBe('Фамилия');
    const data = ws.getRow(2);
    expect(data.getCell(1).value).toBe('Иванов');
    expect(data.getCell(4).value).toBe('112-233-445 95');
    expect(data.getCell(8).value).toBe('7707083893');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/eisot-testing-registry/eisot-testing-xlsx.writer.test.ts --no-file-parallelism`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement** (eisot-testing-xlsx.writer.ts — mirrors `frdo-registry-xlsx.writer.ts`; `COLUMNS` is the swap point)

```typescript
import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';

import type { EisotTestingRow } from '../mvp.types.js';

// PROVISIONAL — сверить с офиц. .xlsx-шаблоном ЛКОТ «лица на тестирование» (Минтруд) перед боевой
// загрузкой (spec §6/§14). Единственное место маппинга поле→колонка (single swap point). Состав
// полей — best-effort по публичным требованиям ЛКОТ (ФИО / СНИЛС / дата рождения / должность /
// работодатель + ИНН / программа / дата направления).
const COLUMNS: { header: string; key: keyof EisotTestingRow; width: number }[] = [
  { header: 'Фамилия', key: 'lastName', width: 18 },
  { header: 'Имя', key: 'firstName', width: 16 },
  { header: 'Отчество', key: 'middleName', width: 18 },
  { header: 'СНИЛС', key: 'snils', width: 16 },
  { header: 'Дата рождения', key: 'dateOfBirth', width: 14 },
  { header: 'Должность', key: 'position', width: 24 },
  { header: 'Работодатель', key: 'employerName', width: 32 },
  { header: 'ИНН работодателя', key: 'employerInn', width: 16 },
  { header: 'Программа (категория проверки знаний)', key: 'programName', width: 44 },
  { header: 'Дата направления', key: 'referralDate', width: 16 }
];

@Injectable()
export class EisotTestingXlsxWriter {
  readonly contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  async build(rows: EisotTestingRow[]): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Лица на тестирование');
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

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/eisot-testing-registry/eisot-testing-xlsx.writer.test.ts --no-file-parallelism`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/mvp/eisot-testing-registry/eisot-testing-xlsx.writer.ts apps/backend/src/modules/mvp/eisot-testing-registry/eisot-testing-xlsx.writer.test.ts
git commit -m "feat(backend): ЕИСОТ .xlsx writer with provisional COLUMNS (swap point)"
```

---

## Task 5: `EisotTestingRegistryService` orchestrator + service test

**Files:**

- Create: `apps/backend/src/modules/mvp/eisot-testing-registry/eisot-testing-registry.service.ts`
- Test: `apps/backend/src/modules/mvp/eisot-testing-registry/eisot-testing-registry.service.test.ts`

- [ ] **Step 1: Write the failing service test** (harness mirrors `frdo-registry.service.test.ts`, but the service has no `DocumentsService` dep; seeds enrollments instead of documents)

```typescript
import { EventEmitter2 } from '@nestjs/event-emitter';
import { describe, expect, it, vi } from 'vitest';

import { EisotTestingXlsxWriter } from './eisot-testing-xlsx.writer.js';
import { EisotTestingRegistryService } from './eisot-testing-registry.service.js';
import { TenantScopedRepository } from '../../../infrastructure/database/tenant-repository.js';
import { AuditService } from '../../audit/audit.service.js';
import { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';
import { MvpService } from '../mvp.service.js';

import type { RequestContext } from '../../../common/context/request-context.js';
import type { S3StorageClient } from '../../../infrastructure/storage/s3-storage.client.js';
import type { DocumentsService } from '../../documents/documents.service.js';
import type { FilesService } from '../../files/files.service.js';
import type {
  Counterparty,
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

function makeHarness() {
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
  const service = new EisotTestingRegistryService(
    state,
    mvp,
    files,
    storage,
    new EisotTestingXlsxWriter(),
    audit
  );
  return { service, state, storagePut, filesRegister, auditWrite };
}

describe('EisotTestingRegistryService.exportEisotTestingRegistry', () => {
  it('exports one deduped row per learner, persists batch + records, writes file', async () => {
    const h = makeHarness();
    h.state.counterparties.push({
      ...base,
      id: 'cp_1',
      code: 'C1',
      name: 'ООО Ромашка',
      inn: '7707083893'
    } as Counterparty);
    h.state.counterparties.push({
      ...base,
      id: 'cp_2',
      code: 'C2',
      name: 'ООО Вторая',
      inn: '7736050003'
    } as Counterparty);
    h.state.learners.push({
      ...base,
      id: 'lrn_1',
      firstName: 'Иван',
      lastName: 'Иванов',
      middleName: 'Иванович',
      snils: '112-233-445 95',
      dateOfBirth: '1990-05-01',
      position: 'Электрик'
    } as Learner);
    h.state.groups.push({
      ...base,
      id: 'grp_1',
      code: 'G1',
      name: 'Группа 1',
      counterpartyId: 'cp_1'
    } as GroupEntity);
    h.state.groups.push({
      ...base,
      id: 'grp_2',
      code: 'G2',
      name: 'Группа 2',
      counterpartyId: 'cp_2'
    } as GroupEntity);
    h.state.courses.push({
      ...base,
      id: 'crs_1',
      code: 'CRS1',
      title: 'Охрана труда',
      isArchived: false
    } as Course);
    h.state.courseVersions.push({
      ...base,
      id: 'cv_1',
      courseId: 'crs_1',
      versionNo: 1
    } as CourseVersion);
    h.state.groupCourses.push({
      ...base,
      id: 'gc_1',
      groupId: 'grp_1',
      courseId: 'crs_1',
      courseVersionId: 'cv_1',
      sortOrder: 0
    } as GroupCourse);
    // Two enrollments for the SAME learner in two groups → deduped to one row.
    h.state.enrollments.push({
      ...base,
      id: 'enr_1',
      groupId: 'grp_1',
      learnerId: 'lrn_1',
      status: 'active',
      enrolledAt: '2026-03-10'
    } as Enrollment);
    h.state.enrollments.push({
      ...base,
      id: 'enr_2',
      groupId: 'grp_2',
      learnerId: 'lrn_1',
      status: 'active',
      enrolledAt: '2026-03-11'
    } as Enrollment);

    const outcome = await h.service.exportEisotTestingRegistry(TENANT, {}, ctx);

    expect(outcome.exported).toBe(1); // deduped by learner
    expect(outcome.failed).toBe(0);
    expect(outcome.fileId).toBe('file_x');
    expect(outcome.rows[0]!.lastName).toBe('Иванов');
    expect(outcome.rows[0]!.employerInn).toBe('7707083893'); // first group (grp_1) wins
    expect(outcome.rows[0]!.programName).toBe('Охрана труда');
    expect(h.state.eisotTestingBatches).toHaveLength(1);
    expect(h.state.eisotTestingBatches[0]!.batchStatus).toBe('generated');
    expect(h.state.eisotTestingRecords).toHaveLength(1);
    expect(h.storagePut).toHaveBeenCalledTimes(1);
    expect(h.auditWrite.mock.calls[0]![0]).toMatchObject({
      action: 'regulatory.eisot_testing_exported',
      entityType: 'eisot_testing_batch'
    });
  });

  it('excludes cancelled enrollments and fails a row with no employer', async () => {
    const h = makeHarness();
    // Active enrollment whose group has NO counterparty → employerName blank → hard error.
    h.state.learners.push({
      ...base,
      id: 'lrn_2',
      firstName: 'Пётр',
      lastName: 'Петров'
    } as Learner);
    h.state.groups.push({ ...base, id: 'grp_x', code: 'GX', name: 'Без клиента' } as GroupEntity);
    h.state.enrollments.push({
      ...base,
      id: 'enr_x',
      groupId: 'grp_x',
      learnerId: 'lrn_2',
      status: 'active',
      enrolledAt: '2026-03-12'
    } as Enrollment);
    // Cancelled enrollment → excluded entirely (must not count toward total).
    h.state.counterparties.push({
      ...base,
      id: 'cp_3',
      code: 'C3',
      name: 'ООО Третья',
      inn: '7728168971'
    } as Counterparty);
    h.state.learners.push({
      ...base,
      id: 'lrn_3',
      firstName: 'Анна',
      lastName: 'Сидорова'
    } as Learner);
    h.state.groups.push({
      ...base,
      id: 'grp_y',
      code: 'GY',
      name: 'Группа Y',
      counterpartyId: 'cp_3'
    } as GroupEntity);
    h.state.enrollments.push({
      ...base,
      id: 'enr_y',
      groupId: 'grp_y',
      learnerId: 'lrn_3',
      status: 'cancelled',
      enrolledAt: '2026-03-13'
    } as Enrollment);

    const outcome = await h.service.exportEisotTestingRegistry(TENANT, {}, ctx);

    expect(outcome.exported).toBe(0);
    expect(outcome.errors.some((e) => e.field === 'employerName')).toBe(true);
    expect(outcome.fileId).toBeUndefined();
    expect(outcome.total).toBe(1); // cancelled enr_y excluded; only enr_x is a candidate
    expect(h.state.eisotTestingBatches[0]!.batchStatus).toBe('failed');
    expect(h.storagePut).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/eisot-testing-registry/eisot-testing-registry.service.test.ts --no-file-parallelism`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement** (eisot-testing-registry.service.ts — structure mirrors `frdo-registry.service.ts`, source = enrollments by filter + dedup)

```typescript
import { randomUUID } from 'node:crypto';

import { Inject, Injectable, NotFoundException, Scope } from '@nestjs/common';

import { validateEisotTestingRow } from './eisot-testing-preflight.js';
import { buildEisotTestingRows } from './eisot-testing-rows.js';
import { EisotTestingXlsxWriter } from './eisot-testing-xlsx.writer.js';
import { S3StorageClient } from '../../../infrastructure/storage/s3-storage.client.js';
import { AuditService } from '../../audit/audit.service.js';
import { FilesService } from '../../files/files.service.js';
import { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';
import { MVP_STATE } from '../infrastructure/mvp-state.token.js';
import { MvpService } from '../mvp.service.js';

import type { EisotTestingBundle } from './eisot-testing-rows.js';
import type { RequestContext } from '../../../common/context/request-context.js';
import type {
  EisotTestingBatch,
  EisotTestingExportOutcome,
  EisotTestingRecord,
  EisotTestingRow,
  EisotTestingRowError
} from '../mvp.types.js';

export interface EisotTestingExportFilter {
  from?: string; // referral date (enrolledAt) range start, ISO
  to?: string; // referral date (enrolledAt) range end, ISO
  groupId?: string;
  clientId?: string;
}

/**
 * Wave 2 sub-goal C — ЕИСОТ «лица на тестирование» (Минтруд / ЛКОТ): exports a roster
 * of learners directed to a knowledge check to a provisional `.xlsx` for manual upload.
 * Source = enrollments by filter (group / period / client), deduped to one row per
 * learner — NOT exams or documents. Request-scoped, shares MVP_STATE; partial-success
 * principle (valid rows exported, invalid surfaced per-field; fully-invalid batch → no file).
 */
@Injectable({ scope: Scope.REQUEST })
export class EisotTestingRegistryService {
  constructor(
    @Inject(MVP_STATE) private readonly state: InMemoryMvpState,
    @Inject(MvpService) private readonly mvp: MvpService,
    @Inject(FilesService) private readonly files: FilesService,
    @Inject(S3StorageClient) private readonly storage: S3StorageClient,
    @Inject(EisotTestingXlsxWriter) private readonly xlsx: EisotTestingXlsxWriter,
    @Inject(AuditService) private readonly auditService: AuditService
  ) {}

  async exportEisotTestingRegistry(
    tenantId: string,
    filter: EisotTestingExportFilter,
    ctx: RequestContext
  ): Promise<EisotTestingExportOutcome> {
    // `listEnrollments` honours `group_id` but IGNORES `enrolled_from`/`enrolled_to`
    // (same in-memory gap OT FIX #3 documented), so re-apply the referral-date scope on
    // `enrolledAt` here. Exclude `cancelled` — a withdrawn learner is not sent to testing.
    const enrollments = this.mvp
      .listEnrollments(tenantId, { group_id: filter.groupId, page_size: 1000 })
      .items.filter(
        (e) =>
          e.status !== 'cancelled' &&
          (!filter.from || (e.enrolledAt ? e.enrolledAt >= filter.from : false)) &&
          (!filter.to || (e.enrolledAt ? e.enrolledAt <= filter.to : false))
      );

    const gatherErrors: EisotTestingRowError[] = [];
    const bundles: EisotTestingBundle[] = [];
    const seenLearners = new Set<string>();
    for (const enrollment of enrollments) {
      try {
        const learner = this.mvp.getLearner(tenantId, enrollment.learnerId);
        const group = this.mvp.getGroup(tenantId, enrollment.groupId);
        if (filter.clientId && group.counterpartyId !== filter.clientId) continue;

        // Dedup by learner — first matching enrollment wins (employer/program from it).
        if (seenLearners.has(learner.id)) continue;
        seenLearners.add(learner.id);

        const counterparty = group.counterpartyId
          ? this.mvp.getCounterparty(tenantId, group.counterpartyId)
          : undefined;
        const gc = this.mvp.listGroupCourses(tenantId, {
          group_id: enrollment.groupId,
          page_size: 1000
        }).items[0];
        const course = gc?.courseId ? this.mvp.getCourse(tenantId, gc.courseId) : undefined;

        bundles.push({
          enrollment,
          learner,
          employerName: counterparty?.name ?? '',
          employerInn: counterparty?.inn ?? '',
          programName: course?.title ?? ''
        });
      } catch {
        gatherErrors.push({
          enrollmentId: enrollment.id,
          learnerId: enrollment.learnerId,
          fullName: '',
          field: 'enrollment',
          message: 'Не удалось собрать данные зачисления (отсутствует связанная сущность)'
        });
      }
    }

    const rows = buildEisotTestingRows(bundles);
    const valid: EisotTestingRow[] = [];
    const preflightErrors: EisotTestingRowError[] = [];
    for (const r of rows) {
      const e = validateEisotTestingRow(r);
      if (e.length) preflightErrors.push(...e);
      else valid.push(r);
    }

    const errors = [...gatherErrors, ...preflightErrors];
    const exported = valid.length;
    const validLearnerIds = new Set(valid.map((r) => r.learnerId));
    // Count distinct FAILED learners, excluding any that also produced a valid row (a learner
    // deduped across groups could surface in both) — one candidate = one learner.
    const failed = new Set(
      errors.map((e) => e.learnerId).filter((id) => id && !validLearnerIds.has(id))
    ).size;
    const total = exported + failed;
    const now = new Date().toISOString();

    const batch: EisotTestingBatch = {
      id: this.id('etb'),
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
      const storageKey = `${tenantId}/eisot-testing/${batch.id}.xlsx`;
      const meta = await this.files.register({
        tenantId,
        storageKey,
        originalName: `eisot-testing-${batch.id}.xlsx`,
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

    this.state.eisotTestingBatches.push(batch);
    for (const r of valid) {
      this.state.eisotTestingRecords.push({
        id: this.id('etr'),
        tenantId,
        status: 'active',
        createdAt: now,
        updatedAt: now,
        batchId: batch.id,
        enrollmentId: r.enrollmentId,
        learnerId: r.learnerId,
        snils: r.snils,
        employerInn: r.employerInn
      });
    }

    this.auditService.write({
      tenantId,
      actorId: ctx.userId,
      action: 'regulatory.eisot_testing_exported',
      entityType: 'eisot_testing_batch',
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

  listBatches(tenantId: string): EisotTestingBatch[] {
    return this.state.eisotTestingBatches
      .filter((b) => b.tenantId === tenantId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  getBatchWithRecords(
    tenantId: string,
    id: string
  ): { batch: EisotTestingBatch; records: EisotTestingRecord[] } {
    const batch = this.state.eisotTestingBatches.find(
      (b) => b.tenantId === tenantId && b.id === id
    );
    if (!batch) {
      throw new NotFoundException({
        code: 'eisot_testing_batch_not_found',
        message: 'Batch not found for tenant'
      });
    }
    const records = this.state.eisotTestingRecords.filter(
      (r) => r.tenantId === tenantId && r.batchId === id
    );
    return { batch, records };
  }

  async getBatchDownloadUrl(tenantId: string, id: string): Promise<{ url: string }> {
    const { batch } = this.getBatchWithRecords(tenantId, id);
    if (!batch.fileId) {
      throw new NotFoundException({
        code: 'eisot_testing_file_not_found',
        message: 'Batch has no generated file'
      });
    }
    return { url: await this.files.createDownloadUrl(tenantId, batch.fileId) };
  }

  private id(prefix: string): string {
    return `${prefix}_${randomUUID().replace(/-/g, '')}`;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/eisot-testing-registry/eisot-testing-registry.service.test.ts --no-file-parallelism`
Expected: PASS (both cases).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/mvp/eisot-testing-registry/eisot-testing-registry.service.ts apps/backend/src/modules/mvp/eisot-testing-registry/eisot-testing-registry.service.test.ts
git commit -m "feat(backend): EisotTestingRegistryService orchestrator (enrollments → dedup → .xlsx → batch)"
```

---

## Task 6: DTO + controller + module wiring + HTTP permission boundary

**Files:**

- Create: `apps/backend/src/modules/mvp/eisot-testing-export.dto.ts`
- Create: `apps/backend/src/modules/mvp/eisot-testing-registry/eisot-testing-registry.controller.ts`
- Modify: `apps/backend/src/modules/mvp/mvp.module.ts`
- Test: `apps/backend/src/modules/mvp/mvp.http.integration.test.ts`

- [ ] **Step 1: Write the DTO** (eisot-testing-export.dto.ts)

```typescript
import { IsOptional, IsString } from 'class-validator';

export class CreateEisotTestingExportDto {
  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @IsString()
  groupId?: string;

  @IsOptional()
  @IsString()
  clientId?: string;
}
```

- [ ] **Step 1b: Write + run the DTO validation test** (eisot-testing-export.dto-validation.test.ts — `plainToInstance` + `validateSync`, the repo convention)

```typescript
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { CreateEisotTestingExportDto } from './eisot-testing-export.dto.js';

describe('CreateEisotTestingExportDto', () => {
  it('accepts an empty object (all filters optional)', () => {
    expect(validateSync(plainToInstance(CreateEisotTestingExportDto, {}))).toHaveLength(0);
  });

  it('accepts valid optional string filters', () => {
    const dto = plainToInstance(CreateEisotTestingExportDto, {
      from: '2026-01-01',
      to: '2026-12-31',
      groupId: 'grp_1',
      clientId: 'cp_1'
    });
    expect(validateSync(dto)).toHaveLength(0);
  });

  it('rejects a non-string filter', () => {
    const errors = validateSync(plainToInstance(CreateEisotTestingExportDto, { from: 123 }));
    expect(errors.some((e) => e.property === 'from')).toBe(true);
  });
});
```

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/eisot-testing-export.dto-validation.test.ts --no-file-parallelism`
Expected: PASS.

- [ ] **Step 2: Write the controller** (eisot-testing-registry.controller.ts — mirrors `frdo-registry.controller.ts`)

```typescript
import { Body, Controller, Get, Param, Post, UseGuards, UseInterceptors } from '@nestjs/common';

import { EisotTestingRegistryService } from './eisot-testing-registry.service.js';
import { assertValidDto } from '../../../common/app-validation.pipe.js';
import { CurrentContext } from '../../../common/decorators/current-context.decorator.js';
import { TenantGuard } from '../../../common/guards/tenant.guard.js';
import { RequirePermissions } from '../../iam/permission.decorator.js';
import { PermissionGuard } from '../../iam/permission.guard.js';
import { CreateEisotTestingExportDto } from '../eisot-testing-export.dto.js';
import { MvpRequestPersistenceInterceptor } from '../infrastructure/mvp-request-persistence.interceptor.js';

import type { RequestContext } from '../../../common/context/request-context.js';

@Controller('eisot-testing-registry')
@UseInterceptors(MvpRequestPersistenceInterceptor)
@UseGuards(TenantGuard)
export class EisotTestingRegistryController {
  constructor(private readonly service: EisotTestingRegistryService) {}

  @Post('exports')
  @UseGuards(PermissionGuard)
  @RequirePermissions('regulatory.export.write')
  async createExport(@CurrentContext() ctx: RequestContext, @Body() body: unknown) {
    const dto = assertValidDto(CreateEisotTestingExportDto, body);
    return this.service.exportEisotTestingRegistry(ctx.tenantId!, dto, ctx);
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

Add imports (next to the `FrdoRegistry*` imports at lines 3-5):

```typescript
import { EisotTestingXlsxWriter } from './eisot-testing-registry/eisot-testing-xlsx.writer.js';
import { EisotTestingRegistryController } from './eisot-testing-registry/eisot-testing-registry.controller.js';
import { EisotTestingRegistryService } from './eisot-testing-registry/eisot-testing-registry.service.js';
```

Add `EisotTestingRegistryController` to the `controllers:` array (after `FrdoRegistryController`):

```typescript
(FrdoRegistryController, EisotTestingRegistryController);
```

Add to `providers:` (after the `FrdoRegistryService` provider, line 46):

```typescript
    EisotTestingXlsxWriter,
    {
      provide: EisotTestingRegistryService,
      scope: Scope.REQUEST,
      useClass: EisotTestingRegistryService
    },
```

- [ ] **Step 4: Write the permission-boundary test** (mvp.http.integration.test.ts — mirror the existing ФРДО stub + boundary block)

In the stub controller class (right after the `listFrdoRegistryExports` method ~line 320), add:

```typescript
      // Wave 2 sub-goal C — ЕИСОТ testing roster (POST requires write; GET requires read)
      @Post('eisot-testing-registry/exports')
      @RequirePermissions('regulatory.export.write')
      createEisotTestingExport(
        @CurrentContext() context: { tenantId?: string; userId?: string },
        @Body() body: { from?: string; to?: string }
      ) {
        return {
          batchId: 'etb_stub',
          tenantId: context.tenantId,
          from: body.from,
          to: body.to
        };
      }

      @Get('eisot-testing-registry/exports')
      @RequirePermissions('regulatory.export.read')
      listEisotTestingExports(@CurrentContext() context: { tenantId?: string }) {
        return { items: [], tenantId: context.tenantId };
      }
```

Add a describe block at the end of the file (after the ФРДО boundary describe, ~line 1020), mirroring it verbatim with eisot paths:

```typescript
// === Wave 2 sub-goal C — ЕИСОТ testing-roster export RBAC boundary ===

describe('ЕИСОТ testing-roster export permission boundary', () => {
  beforeEach(() => {
    iamServiceMock.resolvePermissions.mockReset();
    iamServiceMock.resolvePermissions.mockResolvedValue(['courses.read']);
  });

  it('POST /eisot-testing-registry/exports — 403 without regulatory.export.write', async () => {
    iamServiceMock.resolvePermissions.mockResolvedValueOnce(['regulatory.export.read']);
    const token = issueSignedAccessToken(
      { sub: 'u1', tenant_id: 'tenant_demo', session_id: 's1', roles: ['teacher'] },
      process.env.AUTH_JWT_SECRET!,
      60
    );
    const response = await fetch(`${apiBaseUrl}/eisot-testing-registry/exports`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-tenant-id': 'tenant_demo',
        authorization: `Bearer ${token}`
      },
      body: JSON.stringify({})
    });
    expect(response.status).toBe(403);
    const payload = (await response.json()) as { error: { code: string } };
    expect(payload.error.code).toBe('permission_denied');
  });

  it('POST /eisot-testing-registry/exports — 201 with regulatory.export.write', async () => {
    iamServiceMock.resolvePermissions.mockResolvedValueOnce(['regulatory.export.write']);
    const token = issueSignedAccessToken(
      { sub: 'u_admin', tenant_id: 'tenant_demo', session_id: 's_active', roles: ['admin'] },
      process.env.AUTH_JWT_SECRET!,
      60
    );
    const response = await fetch(`${apiBaseUrl}/eisot-testing-registry/exports`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-tenant-id': 'tenant_demo',
        authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ from: '2026-01-01' })
    });
    expect(response.status).toBe(201);
    const payload = (await response.json()) as { data: { batchId: string } };
    expect(payload.data.batchId).toBe('etb_stub');
  });

  it('GET /eisot-testing-registry/exports — 403 without regulatory.export.read', async () => {
    iamServiceMock.resolvePermissions.mockResolvedValueOnce(['courses.read']);
    const token = issueSignedAccessToken(
      { sub: 'u1', tenant_id: 'tenant_demo', session_id: 's1', roles: ['teacher'] },
      process.env.AUTH_JWT_SECRET!,
      60
    );
    const response = await fetch(`${apiBaseUrl}/eisot-testing-registry/exports`, {
      headers: { 'x-tenant-id': 'tenant_demo', authorization: `Bearer ${token}` }
    });
    expect(response.status).toBe(403);
    const payload = (await response.json()) as { error: { code: string } };
    expect(payload.error.code).toBe('permission_denied');
  });

  it('GET /eisot-testing-registry/exports — 200 with regulatory.export.read', async () => {
    iamServiceMock.resolvePermissions.mockResolvedValueOnce(['regulatory.export.read']);
    const token = issueSignedAccessToken(
      { sub: 'u_admin', tenant_id: 'tenant_demo', session_id: 's_active', roles: ['admin'] },
      process.env.AUTH_JWT_SECRET!,
      60
    );
    const response = await fetch(`${apiBaseUrl}/eisot-testing-registry/exports`, {
      headers: { 'x-tenant-id': 'tenant_demo', authorization: `Bearer ${token}` }
    });
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { data: { items: unknown[]; tenantId: string } };
    expect(payload.data.tenantId).toBe('tenant_demo');
  });
});
```

> The stub block reuses the file's existing `@Post`/`@Get`/`@Body`/`@CurrentContext`/`RequirePermissions` imports and the `iamServiceMock`/`issueSignedAccessToken`/`apiBaseUrl` helpers — already present for the ФРДО block. Verify the closing `}` placement: the new `describe` goes at the same nesting level as the ФРДО `describe`.

- [ ] **Step 5: Run the http integration suite**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/mvp.http.integration.test.ts --no-file-parallelism`
Expected: PASS (existing + new ЕИСОТ boundary).

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/mvp/eisot-testing-export.dto.ts apps/backend/src/modules/mvp/eisot-testing-export.dto-validation.test.ts apps/backend/src/modules/mvp/eisot-testing-registry/eisot-testing-registry.controller.ts apps/backend/src/modules/mvp/mvp.module.ts apps/backend/src/modules/mvp/mvp.http.integration.test.ts
git commit -m "feat(backend): ЕИСОТ export endpoints + module wiring + permission boundary"
```

---

## Task 7: Frontend — types, api, hooks, UI section, contract test

**Files:**

- Modify: `apps/frontend/src/features/gov-export/types.ts`
- Modify: `apps/frontend/src/features/gov-export/api.ts`
- Modify: `apps/frontend/src/features/gov-export/hooks.ts`
- Modify: `apps/frontend/src/features/gov-export/api.contract.test.ts`
- Modify: `apps/frontend/app/gov-export/page.tsx`

- [ ] **Step 1: Add frontend types** (types.ts — append after the `FrdoRegistryExportOutcome` interface)

```typescript
// === ЕИСОТ «лица на тестирование» (Минтруд / ЛКОТ) ===

export interface EisotTestingRow {
  enrollmentId: string;
  learnerId: string;
  lastName: string;
  firstName: string;
  middleName: string;
  fullName: string;
  snils: string;
  dateOfBirth: string;
  position: string;
  employerName: string;
  employerInn: string;
  programName: string;
  referralDate: string;
}

export interface EisotTestingRowError {
  enrollmentId: string;
  learnerId: string;
  fullName: string;
  field: string;
  message: string;
}

export interface EisotTestingBatch {
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

export interface EisotTestingExportOutcome {
  batchId: string;
  fileId?: string;
  total: number;
  exported: number;
  failed: number;
  rows: EisotTestingRow[];
  errors: EisotTestingRowError[];
}
```

- [ ] **Step 2: Add api methods** (api.ts — extend the `import type { ... } from './types'` with `EisotTestingBatch, EisotTestingExportOutcome`, and add three methods after `getFrdoBatchFileUrl`, before the closing `}` of `govExportApi`; add a comma after the `getFrdoBatchFileUrl` method)

```typescript
  createEisotTestingExport: (
    session: UserSession,
    body: { from?: string; to?: string; groupId?: string; clientId?: string }
  ): Promise<EisotTestingExportOutcome> =>
    apiRequest<EisotTestingExportOutcome>('/eisot-testing-registry/exports', {
      method: 'POST',
      body,
      ...withAuth(session)
    }),

  listEisotTestingBatches: (session: UserSession): Promise<EisotTestingBatch[]> =>
    apiRequest<EisotTestingBatch[]>('/eisot-testing-registry/exports', withAuth(session)),

  getEisotTestingBatchFileUrl: (session: UserSession, id: string): Promise<{ url: string }> =>
    apiRequest<{ url: string }>(`/eisot-testing-registry/exports/${id}/file`, withAuth(session))
```

- [ ] **Step 3: Add the hook** (hooks.ts — extend the `import type { ... } from './types'` with `EisotTestingBatch`, and append after `useFrdoRegistryBatches`)

```typescript
/**
 * Fetch the list of ЕИСОТ «лица на тестирование» export batches. Mirrors useFrdoRegistryBatches.
 */
export const useEisotTestingBatches = (live = false) => {
  const { session } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['govExport', 'eisotTestingBatches'],
    enabled: Boolean(session),
    queryFn: (): Promise<EisotTestingBatch[]> => govExportApi.listEisotTestingBatches(session!),
    refetchInterval: live ? 15_000 : undefined
  });

  useEffect(() => {
    if (!session) {
      void queryClient.invalidateQueries({ queryKey: ['govExport'] });
    }
  }, [queryClient, session]);

  return {
    data: query.data ?? ([] as EisotTestingBatch[]),
    loading: query.isLoading,
    error: query.error instanceof Error ? query.error.message : null,
    refetch: async () => {
      await query.refetch();
    }
  };
};
```

- [ ] **Step 4: Add the api contract test** (api.contract.test.ts — add inside the existing `describe('govExportApi envelope compatibility', ...)` block, after the `createFrdoRegistryExport` test)

```typescript
it('createEisotTestingExport posts to /eisot-testing-registry/exports and unwraps batchId', async () => {
  fetchMock.mockResolvedValueOnce(
    new Response(
      envelope({ batchId: 'etb_1', total: 1, exported: 1, failed: 0, rows: [], errors: [] }),
      { status: 201 }
    )
  );

  const result = await govExportApi.createEisotTestingExport(session, { from: '2026-01-01' });

  expect(result.batchId).toBe('etb_1');
  const [calledUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  expect(calledUrl).toContain('/eisot-testing-registry/exports');
  expect(init.method).toBe('POST');
});
```

- [ ] **Step 5: Add the UI section** (page.tsx)

(a) Extend the hooks import (line 15) to include `useEisotTestingBatches`:

```typescript
import {
  useEisotTestingBatches,
  useFrdoRegistryBatches,
  useOtRegistryBatches
} from '../../src/features/gov-export/hooks';
```

(b) Extend the type import (lines 20-23) to include `EisotTestingExportOutcome`:

```typescript
import type {
  EisotTestingExportOutcome,
  FrdoRegistryExportOutcome,
  OtRegistryExportOutcome
} from '../../src/features/gov-export/types';
```

(c) Add state after the ФРДО state (after `const frdoBatches = useFrdoRegistryBatches();`, line 49):

```typescript
// ЕИСОТ «лица на тестирование» section state
const [eisotFrom, setEisotFrom] = useState('');
const [eisotTo, setEisotTo] = useState('');
const [eisotBusy, setEisotBusy] = useState(false);
const [eisotError, setEisotError] = useState<string | null>(null);
const [eisotOutcome, setEisotOutcome] = useState<EisotTestingExportOutcome | null>(null);
const eisotBatches = useEisotTestingBatches();
```

(d) Add handlers after `onDownloadFrdo` (after line 109):

```typescript
const onGenerateEisot = async () => {
  if (!session) return;
  setEisotBusy(true);
  setEisotError(null);
  try {
    const outcome = await govExportApi.createEisotTestingExport(session, {
      ...(eisotFrom ? { from: eisotFrom } : {}),
      ...(eisotTo ? { to: eisotTo } : {})
    });
    setEisotOutcome(outcome);
    await eisotBatches.refetch();
  } catch (e) {
    setEisotError(e instanceof Error ? e.message : 'Ошибка формирования выгрузки ЕИСОТ');
  } finally {
    setEisotBusy(false);
  }
};

const onDownloadEisot = async (batchId: string) => {
  if (!session) return;
  const { url } = await govExportApi.getEisotTestingBatchFileUrl(session, batchId);
  window.open(url, '_blank');
};
```

(e) Add the section JSX immediately after the ФРДО `</SectionCard>` (line 378, before the closing `</PageContainer>`):

```tsx
<SectionCard title="ЕИСОТ — лица на тестирование (Минтруд)">
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
    ⚠️ Формат выгрузки предварительный (не сверен с эталоном ЛКОТ). Перед подачей сверьте колонки с
    шаблоном в личном кабинете ЛКОТ (Минтруд).
  </p>
  <FilterBar>
    <input
      type="date"
      value={eisotFrom}
      onChange={(event) => setEisotFrom(event.target.value)}
      placeholder="Дата направления с"
    />
    <input
      type="date"
      value={eisotTo}
      onChange={(event) => setEisotTo(event.target.value)}
      placeholder="по"
    />
    <button type="button" onClick={() => void onGenerateEisot()} disabled={eisotBusy}>
      {eisotBusy ? 'Формирование...' : 'Сформировать выгрузку ЕИСОТ'}
    </button>
  </FilterBar>
  {eisotError ? <SectionError message={eisotError} /> : null}
  {eisotOutcome ? (
    <div>
      <p>
        Экспортировано: {eisotOutcome.exported} / {eisotOutcome.total}. Ошибок:{' '}
        {eisotOutcome.failed}.
      </p>
      {eisotOutcome.errors.length > 0 ? (
        <ul>
          {eisotOutcome.errors.map((e) => (
            <li key={`${e.enrollmentId}-${e.field}`}>
              {e.fullName || e.learnerId}: {e.field} — {e.message}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  ) : null}
  <SectionCard title="История выгрузок ЕИСОТ">
    {eisotBatches.loading ? <LoadingState message="Загрузка истории..." /> : null}
    {eisotBatches.error ? <SectionError message={eisotBatches.error} /> : null}
    {!eisotBatches.loading && !eisotBatches.error && !eisotBatches.data.length ? (
      <SectionEmpty message="Выгрузки отсутствуют" />
    ) : null}
    {eisotBatches.data.length ? (
      <DataTable
        columns={[
          { key: 'id', title: 'ID' },
          { key: 'batchStatus', title: 'Статус' },
          { key: 'exportedRows', title: 'Экспортировано' },
          { key: 'failedRows', title: 'Ошибок' },
          { key: 'createdAt', title: 'Дата' },
          {
            key: 'actionsView',
            title: 'Действия',
            render: (row) => row.actionsView
          }
        ]}
        rows={eisotBatches.data.map((batch) => ({
          ...batch,
          actionsView: (
            <button
              type="button"
              onClick={() => void onDownloadEisot(batch.id)}
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

- [ ] **Step 6: Run frontend tests + typecheck**

Run: `pnpm --filter @cdoprof/frontend exec vitest run src/features/gov-export/api.contract.test.ts --no-file-parallelism`
Then: `pnpm --filter @cdoprof/frontend exec tsc --noEmit`
Expected: PASS both.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/features/gov-export apps/frontend/app/gov-export/page.tsx
git commit -m "feat(frontend): ЕИСОТ testing-roster export section in gov-export (types/api/hook/UI/contract test)"
```

---

## Task 8: e2e smoke + docs/handoff + final gates

**Files:**

- Create: `apps/frontend/src/e2e/eisot-testing-registry-export.e2e.test.ts`
- Modify: `README.md` §2, `LMS_AGENT_HANDOFF.md` (new `### 5.104`), this plan's checkboxes, `docs/superpowers/plans/PLANS_STATUS.md`, `docs/TZ_MVP_TRACEABILITY.md`

- [ ] **Step 1: Write the e2e smoke** (eisot-testing-registry-export.e2e.test.ts — mirrors `frdo-registry-export.e2e.test.ts`)

```typescript
/**
 * ЕИСОТ «лица на тестирование» export route/permission + module E2E smoke (Wave 2 sub-goal C).
 *
 * Конвенции проекта: routing/permission через evaluateRouteAccess. Без React mount
 * (RTL не в зависимостях). Backend-логика покрыта юнит- и HTTP integration-тестами.
 * ЕИСОТ делит страницу /gov-export и право regulatory.export.read с ОТ/ФРДО-выгрузками.
 */

import { describe, expect, it } from 'vitest';

import { evaluateRouteAccess } from '../features/navigation/helpers';

import type { UserSession } from '../entities/session/model';

const buildSession = (permissions: string[]): UserSession => ({
  user: {
    id: 'u_eisot',
    tenantId: 'tenant_demo',
    login: 'eisot_user',
    email: null,
    status: 'active',
    displayName: 'EISOT User'
  },
  tokens: { accessToken: 'tok', sessionId: 'sid', expiresIn: 1000 },
  roles: [],
  permissions
});

describe('ЕИСОТ testing-roster export route/permission + module e2e smoke', () => {
  it('user WITH regulatory.export.read can access /gov-export', () => {
    expect(evaluateRouteAccess('/gov-export', buildSession(['regulatory.export.read']))).toEqual({
      kind: 'ok'
    });
  });

  it('user WITHOUT regulatory.export.read is forbidden on /gov-export', () => {
    expect(evaluateRouteAccess('/gov-export', buildSession(['tenant.read']))).toEqual({
      kind: 'forbidden'
    });
  });

  it('smoke: gov-export api exposes ЕИСОТ functions (no broken imports)', async () => {
    const mod = await import('../features/gov-export/api');
    expect(typeof mod.govExportApi.createEisotTestingExport).toBe('function');
    expect(typeof mod.govExportApi.listEisotTestingBatches).toBe('function');
    expect(typeof mod.govExportApi.getEisotTestingBatchFileUrl).toBe('function');
  });

  it('smoke: gov-export hooks expose useEisotTestingBatches (no broken imports)', async () => {
    const mod = await import('../features/gov-export/hooks');
    expect(typeof mod.useEisotTestingBatches).toBe('function');
  });
});
```

Run: `pnpm --filter @cdoprof/frontend exec vitest run src/e2e/eisot-testing-registry-export.e2e.test.ts --no-file-parallelism`
Expected: PASS.

- [ ] **Step 2: Backend target cluster green**

Run:

```bash
pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/eisot-testing-registry src/modules/mvp/mvp.http.integration.test.ts --no-file-parallelism
```

Expected: PASS (all ЕИСОТ files + http integration).

- [ ] **Step 3: Typecheck both apps**

Run: `pnpm typecheck`
Expected: PASS (8/8).

- [ ] **Step 4: Lint the new/changed files**

Run:

```bash
npx eslint apps/backend/src/modules/mvp/eisot-testing-registry apps/backend/src/modules/mvp/eisot-testing-export.dto.ts apps/frontend/src/features/gov-export apps/frontend/app/gov-export/page.tsx apps/frontend/src/e2e/eisot-testing-registry-export.e2e.test.ts --max-warnings=0
```

Expected: PASS (no errors).

- [ ] **Step 5: Update docs** (README §2 Current/Last/Next; HANDOFF §5.104 with files + test status + deviations; tick this plan's checkboxes; add a PLANS_STATUS row for Wave 2 sub-goal C; add a TRACEABILITY entry BL-008 → ЕИСОТ files).

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/e2e/eisot-testing-registry-export.e2e.test.ts README.md LMS_AGENT_HANDOFF.md docs/superpowers/plans/2026-06-03-eisot-testing-registry-export.md docs/superpowers/plans/PLANS_STATUS.md docs/TZ_MVP_TRACEABILITY.md
git commit -m "test(frontend): ЕИСОТ e2e smoke + docs/handoff (Wave 2 sub-goal C)"
```

---

## Deviations log (fill during execution)

- Record any divergence from this plan here (e.g. exact `Learner` field optionality, stub-controller test nesting) so the handoff §5.104 is accurate.

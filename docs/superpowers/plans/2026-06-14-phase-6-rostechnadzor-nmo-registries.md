# Phase 6 — Ростехнадзор + Минздрав-НМО registry exporters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two durable regulatory-registry exporters — **Ростехнадзор** (аттестация по промышленной безопасности) and **Минздрав-НМО** (непрерывное медобразование, ЗЕТ) — that produce provisional `.xlsx` files for manual upload, following the exact Wave 2 pattern of the three shipped exporters.

**Architecture:** Each exporter is a self-contained module under `apps/backend/src/modules/mvp/<name>-registry/` with a `Scope.REQUEST` service that gathers source bundles → builds rows (pure) → preflights rows (pure) → writes `.xlsx` (exceljs) → stores via the files layer → persists a durable batch + per-record set, applying the partial-success principle. **Ростехнадзор** mirrors the **ОТ** module (source = completed, exam-passed enrollments + protocol). **Минздрав-НМО** mirrors the **ФРДО** module (source = issued documents). No DB migration, no new permission — both reuse `regulatory.export.read`/`regulatory.export.write`.

**Tech Stack:** TypeScript, NestJS (`Scope.REQUEST` + `MvpRequestPersistenceInterceptor`), exceljs, vitest. Frontend: Next.js + `@tanstack/react-query`.

---

## Reference files (read before starting — these are the twins you copy)

- ОТ twin (Ростехнадзор source archetype): `apps/backend/src/modules/mvp/ot-registry/ot-registry.service.ts`, `ot-registry-rows.ts`, `ot-registry-preflight.ts`, `ot-registry-xlsx.writer.ts`.
- ФРДО twin (НМО source archetype): `apps/backend/src/modules/mvp/frdo-registry/frdo-registry.service.ts`, `frdo-registry-rows.ts`, `frdo-registry-preflight.ts`, `frdo-registry-xlsx.writer.ts`, `frdo-registry.controller.ts`; DTO `apps/backend/src/modules/mvp/frdo-registry-export.dto.ts`.
- ЕИСОТ twin (controller + roster preflight): `apps/backend/src/modules/mvp/eisot-testing-registry/*`.
- Types: `apps/backend/src/modules/mvp/mvp.types.ts:839-952` (FRDO + ЕИСОТ blocks).
- Wiring: `mvp/infrastructure/mvp-collections.ts`, `mvp/infrastructure/in-memory-mvp.state.ts:91-97`, `mvp/mvp.module.ts:3-8,65-105`.
- Permission boundary tests: `mvp/mvp.http.integration.test.ts:327-370` (stub controller) + `:1490-1650` (test blocks).
- Frontend twins: `apps/frontend/src/features/gov-export/{api,hooks,types,api.contract.test}.ts`, `apps/frontend/app/gov-export/page.tsx`, `apps/frontend/src/e2e/frdo-registry-export.e2e.test.ts`.

**Shared helpers reused (do not re-implement):**

- `isValidSnilsChecksum`, `normalizeSnils` from `../learners-bulk-import.service.js`.
- `fmtDate` (ISO → `ДД.ММ.ГГГГ`) and `fullName` — copy the 3-line local helpers from the twin's `*-rows.ts` (deliberate per-module duplication, same as the three existing modules).
- `DATE_RE = /^[0-3][0-9]\.[0-1][0-9]\.[0-9]{4}$/`, `INN_RE = /^(\d{10}|\d{12})$/` — copy into each preflight.

**Test execution (Cyrillic-path Gotcha — full backend suite crashes):**

```bash
pnpm --filter @cdoprof/backend exec vitest run <path> --no-file-parallelism
pnpm --filter @cdoprof/frontend exec vitest run <path> --no-file-parallelism
npx eslint <path> --max-warnings=0
pnpm typecheck
```

---

# MODULE 1 — Ростехнадзор (промышленная безопасность)

## Task 1: Ростехнадзор types in `mvp.types.ts`

**Files:**

- Modify: `apps/backend/src/modules/mvp/mvp.types.ts` (append after the ЕИСОТ block, ~line 952)

- [ ] **Step 1: Append the type block**

```ts
// === Ростехнадзор (аттестация по промышленной безопасности) — Phase 6 ===
// PROVISIONAL: формат не сверен с эталоном Ростехнадзора. `attestationArea` —
// swap-point (пока = наименование программы/курса; при наличии офиц. классификатора
// областей аттестации заменить источник + добавить fan-out по областям).

export interface RostechnadzorRow {
  enrollmentId: string;
  learnerId: string;
  lastName: string;
  firstName: string;
  middleName: string;
  fullName: string; // для метки ошибок
  snils: string;
  position: string;
  employerName: string;
  employerInn: string;
  attestationArea: string; // SWAP-POINT — провизорно = наименование программы
  protocolNumber: string;
  knowledgeCheckDate: string; // ДД.ММ.ГГГГ
  result: string; // 'удовлетворительно' (выгружаются только сданные)
}

export interface RostechnadzorRowError {
  enrollmentId: string;
  learnerId: string;
  fullName: string;
  field: string;
  message: string;
}

export type RostechnadzorBatchStatus = 'generated' | 'partial' | 'failed';

export interface RostechnadzorBatch extends BaseEntity {
  sourceFilterJson: Record<string, unknown>;
  fileId?: string;
  totalCandidates: number;
  exportedRows: number;
  failedRows: number;
  batchStatus: RostechnadzorBatchStatus;
  generatedBy: string;
}

export interface RostechnadzorRecord extends BaseEntity {
  batchId: string;
  enrollmentId: string;
  learnerId: string;
  snils: string;
  protocolNumber: string;
}

export interface RostechnadzorExportOutcome {
  batchId: string;
  fileId?: string;
  total: number;
  exported: number;
  failed: number;
  rows: RostechnadzorRow[];
  errors: RostechnadzorRowError[];
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS (types unused yet — confirms valid syntax).

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/modules/mvp/mvp.types.ts
git commit -m "feat(backend): Ростехнадзор registry types (row/batch/record/outcome)"
```

---

## Task 2: `rostechnadzor-rows.ts` — pure row builder

**Files:**

- Create: `apps/backend/src/modules/mvp/rostechnadzor-registry/rostechnadzor-rows.ts`
- Test: `apps/backend/src/modules/mvp/rostechnadzor-registry/rostechnadzor-rows.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';

import { buildRostechnadzorRows } from './rostechnadzor-rows.js';

import type { RostechnadzorBundle } from './rostechnadzor-rows.js';
import type { Enrollment, Learner } from '../mvp.types.js';

const learner = (over: Partial<Learner> = {}): Learner =>
  ({
    id: 'l1',
    tenantId: 't1',
    status: 'active',
    createdAt: '',
    updatedAt: '',
    lastName: 'Иванов',
    firstName: 'Иван',
    middleName: 'Иванович',
    snils: '112-233-445 95',
    position: 'Инженер',
    ...over
  }) as Learner;

const enrollment = (over: Partial<Enrollment> = {}): Enrollment =>
  ({ id: 'e1', tenantId: 't1', learnerId: 'l1', groupId: 'g1', ...over }) as Enrollment;

const bundle = (over: Partial<RostechnadzorBundle> = {}): RostechnadzorBundle => ({
  enrollment: enrollment(),
  learner: learner(),
  employerName: 'ООО Ромашка',
  employerInn: '7701234567',
  attestationArea: 'Б.1 Эксплуатация ОПО',
  protocol: { documentNumber: 'ПБ-42', documentDate: '2026-05-10' },
  ...over
});

describe('buildRostechnadzorRows', () => {
  it('maps a bundle to a row with formatted protocol date and passed result', () => {
    const [row] = buildRostechnadzorRows([bundle()]);
    expect(row).toMatchObject({
      enrollmentId: 'e1',
      learnerId: 'l1',
      lastName: 'Иванов',
      firstName: 'Иван',
      middleName: 'Иванович',
      fullName: 'Иванов Иван Иванович',
      snils: '112-233-445 95',
      position: 'Инженер',
      employerName: 'ООО Ромашка',
      employerInn: '7701234567',
      attestationArea: 'Б.1 Эксплуатация ОПО',
      protocolNumber: 'ПБ-42',
      knowledgeCheckDate: '10.05.2026',
      result: 'удовлетворительно'
    });
  });

  it('emits blank cells (not crashes) for missing optional fields', () => {
    const [row] = buildRostechnadzorRows([
      bundle({
        learner: learner({ snils: undefined, position: undefined, middleName: undefined }),
        protocol: { documentNumber: '', documentDate: '' }
      })
    ]);
    expect(row.snils).toBe('');
    expect(row.position).toBe('');
    expect(row.middleName).toBe('');
    expect(row.knowledgeCheckDate).toBe('');
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/rostechnadzor-registry/rostechnadzor-rows.test.ts --no-file-parallelism`
Expected: FAIL — `buildRostechnadzorRows` not found.

- [ ] **Step 3: Implement**

```ts
import type { Enrollment, Learner, RostechnadzorRow } from '../mvp.types.js';

export interface RostechnadzorBundle {
  enrollment: Enrollment;
  learner: Learner;
  employerName: string;
  employerInn: string;
  attestationArea: string;
  protocol: { documentNumber: string; documentDate: string };
}

const fmtDate = (iso: string): string => {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return d && m && y ? `${d}.${m}.${y}` : '';
};

const fullName = (l: Learner): string =>
  [l.lastName, l.firstName, l.middleName].filter(Boolean).join(' ').trim();

export function buildRostechnadzorRows(bundles: RostechnadzorBundle[]): RostechnadzorRow[] {
  return bundles.map((b) => ({
    enrollmentId: b.enrollment.id,
    learnerId: b.learner.id,
    lastName: b.learner.lastName ?? '',
    firstName: b.learner.firstName ?? '',
    middleName: b.learner.middleName ?? '',
    fullName: fullName(b.learner),
    snils: b.learner.snils ?? '',
    position: b.learner.position ?? '',
    employerName: b.employerName ?? '',
    employerInn: b.employerInn ?? '',
    attestationArea: b.attestationArea ?? '',
    protocolNumber: b.protocol.documentNumber ?? '',
    knowledgeCheckDate: fmtDate(b.protocol.documentDate ?? ''),
    result: 'удовлетворительно'
  }));
}
```

- [ ] **Step 4: Run test — verify it passes**

Run: same as Step 2. Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/mvp/rostechnadzor-registry/rostechnadzor-rows.ts apps/backend/src/modules/mvp/rostechnadzor-registry/rostechnadzor-rows.test.ts
git commit -m "feat(backend): Ростехнадзор pure row builder + test"
```

---

## Task 3: `rostechnadzor-preflight.ts` — pure validator

**Files:**

- Create: `apps/backend/src/modules/mvp/rostechnadzor-registry/rostechnadzor-preflight.ts`
- Test: `apps/backend/src/modules/mvp/rostechnadzor-registry/rostechnadzor-preflight.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';

import { validateRostechnadzorRow } from './rostechnadzor-preflight.js';

import type { RostechnadzorRow } from '../mvp.types.js';

const row = (over: Partial<RostechnadzorRow> = {}): RostechnadzorRow => ({
  enrollmentId: 'e1',
  learnerId: 'l1',
  lastName: 'Иванов',
  firstName: 'Иван',
  middleName: 'Иванович',
  fullName: 'Иванов Иван Иванович',
  snils: '112-233-445 95',
  position: 'Инженер',
  employerName: 'ООО Ромашка',
  employerInn: '7701234567',
  attestationArea: 'Б.1',
  protocolNumber: 'ПБ-42',
  knowledgeCheckDate: '10.05.2026',
  result: 'удовлетворительно',
  ...over
});

describe('validateRostechnadzorRow', () => {
  it('accepts a fully valid row', () => {
    expect(validateRostechnadzorRow(row())).toEqual([]);
  });

  it('flags missing ФИО, протокол, область, bad date', () => {
    const errs = validateRostechnadzorRow(
      row({
        lastName: '',
        fullName: '',
        protocolNumber: '',
        attestationArea: '',
        knowledgeCheckDate: '2026-05-10'
      })
    );
    const fields = errs.map((e) => e.field);
    expect(fields).toContain('fullName');
    expect(fields).toContain('protocolNumber');
    expect(fields).toContain('attestationArea');
    expect(fields).toContain('knowledgeCheckDate');
  });

  it('validates СНИЛС checksum only when present', () => {
    expect(validateRostechnadzorRow(row({ snils: '' }))).toEqual([]);
    expect(
      validateRostechnadzorRow(row({ snils: '123-456-789 00' })).map((e) => e.field)
    ).toContain('snils');
  });

  it('validates ИНН format only when present', () => {
    expect(validateRostechnadzorRow(row({ employerInn: '' }))).toEqual([]);
    expect(validateRostechnadzorRow(row({ employerInn: '12345' })).map((e) => e.field)).toContain(
      'employerInn'
    );
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/rostechnadzor-registry/rostechnadzor-preflight.test.ts --no-file-parallelism`
Expected: FAIL — function not found.

- [ ] **Step 3: Implement**

```ts
import { isValidSnilsChecksum, normalizeSnils } from '../learners-bulk-import.service.js';

import type { RostechnadzorRow, RostechnadzorRowError } from '../mvp.types.js';

const DATE_RE = /^[0-3][0-9]\.[0-1][0-9]\.[0-9]{4}$/;
const INN_RE = /^(\d{10}|\d{12})$/;

/**
 * Provisional preflight for Ростехнадзор rows. Hard fields (ФИО, протокол, область,
 * дата) exclude a row; optional СНИЛС/ИНН are format-validated only when present.
 * Missing optionals produce blank cells, not errors.
 */
export function validateRostechnadzorRow(row: RostechnadzorRow): RostechnadzorRowError[] {
  const errs: RostechnadzorRowError[] = [];
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
  if (!row.protocolNumber?.trim()) push('protocolNumber', 'Номер протокола отсутствует');
  if (!row.attestationArea?.trim()) push('attestationArea', 'Область аттестации отсутствует');
  if (!DATE_RE.test(row.knowledgeCheckDate ?? ''))
    push('knowledgeCheckDate', 'Дата проверки знаний должна быть в формате ДД.ММ.ГГГГ');

  if (row.snils?.trim()) {
    const snils = normalizeSnils(row.snils);
    if (snils.length !== 11 || !isValidSnilsChecksum(snils)) push('snils', 'Некорректный СНИЛС');
  }
  if (row.employerInn?.trim() && !INN_RE.test(row.employerInn.trim()))
    push('employerInn', 'ИНН работодателя должен содержать 10 или 12 цифр');

  return errs;
}
```

- [ ] **Step 4: Run test — verify it passes**

Run: same as Step 2. Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/mvp/rostechnadzor-registry/rostechnadzor-preflight.ts apps/backend/src/modules/mvp/rostechnadzor-registry/rostechnadzor-preflight.test.ts
git commit -m "feat(backend): Ростехнадзор row preflight validator + test"
```

---

## Task 4: `rostechnadzor-xlsx.writer.ts` — exceljs writer (the swap-point)

**Files:**

- Create: `apps/backend/src/modules/mvp/rostechnadzor-registry/rostechnadzor-xlsx.writer.ts`
- Test: `apps/backend/src/modules/mvp/rostechnadzor-registry/rostechnadzor-xlsx.writer.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';

import { RostechnadzorXlsxWriter } from './rostechnadzor-xlsx.writer.js';

import type { RostechnadzorRow } from '../mvp.types.js';

const row: RostechnadzorRow = {
  enrollmentId: 'e1',
  learnerId: 'l1',
  lastName: 'Иванов',
  firstName: 'Иван',
  middleName: 'Иванович',
  fullName: 'Иванов Иван Иванович',
  snils: '112-233-445 95',
  position: 'Инженер',
  employerName: 'ООО Ромашка',
  employerInn: '7701234567',
  attestationArea: 'Б.1',
  protocolNumber: 'ПБ-42',
  knowledgeCheckDate: '10.05.2026',
  result: 'удовлетворительно'
};

describe('RostechnadzorXlsxWriter', () => {
  it('writes a header row + one data row in column order', async () => {
    const buffer = await new RostechnadzorXlsxWriter().build([row]);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    const ws = wb.worksheets[0]!;
    expect(ws.getRow(1).getCell(1).value).toBe('Фамилия');
    expect(ws.getRow(1).getCell(8).value).toBe('Область аттестации');
    expect(ws.getRow(2).getCell(1).value).toBe('Иванов');
    expect(ws.getRow(2).getCell(11).value).toBe('удовлетворительно');
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/rostechnadzor-registry/rostechnadzor-xlsx.writer.test.ts --no-file-parallelism`
Expected: FAIL — class not found.

- [ ] **Step 3: Implement**

```ts
import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';

import type { RostechnadzorRow } from '../mvp.types.js';

// PROVISIONAL — сверить с офиц. шаблоном/требованиями Ростехнадзора перед боевой подачей.
// Единственное место маппинга поле→колонка (single swap point). `attestationArea`
// провизорно = наименование программы; заменить при наличии классификатора областей.
const COLUMNS: { header: string; key: keyof RostechnadzorRow; width: number }[] = [
  { header: 'Фамилия', key: 'lastName', width: 18 },
  { header: 'Имя', key: 'firstName', width: 16 },
  { header: 'Отчество', key: 'middleName', width: 18 },
  { header: 'СНИЛС', key: 'snils', width: 16 },
  { header: 'Должность', key: 'position', width: 24 },
  { header: 'Работодатель', key: 'employerName', width: 32 },
  { header: 'ИНН работодателя', key: 'employerInn', width: 16 },
  { header: 'Область аттестации', key: 'attestationArea', width: 44 },
  { header: 'Номер протокола', key: 'protocolNumber', width: 18 },
  { header: 'Дата проверки знаний', key: 'knowledgeCheckDate', width: 18 },
  { header: 'Результат', key: 'result', width: 20 }
];

@Injectable()
export class RostechnadzorXlsxWriter {
  readonly contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  async build(rows: RostechnadzorRow[]): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Ростехнадзор');
    ws.columns = COLUMNS.map((c) => ({ header: c.header, key: c.key as string, width: c.width }));
    for (const r of rows) {
      ws.addRow(COLUMNS.reduce((acc, c) => ({ ...acc, [c.key]: r[c.key] }), {}));
    }
    ws.getRow(1).font = { bold: true };
    return (await wb.xlsx.writeBuffer()) as unknown as Buffer;
  }
}
```

- [ ] **Step 4: Run test — verify it passes**

Run: same as Step 2. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/mvp/rostechnadzor-registry/rostechnadzor-xlsx.writer.ts apps/backend/src/modules/mvp/rostechnadzor-registry/rostechnadzor-xlsx.writer.test.ts
git commit -m "feat(backend): Ростехнадзор xlsx writer (PROVISIONAL COLUMNS swap-point) + test"
```

---

## Task 5: `rostechnadzor-registry-export.dto.ts` — request DTO

**Files:**

- Create: `apps/backend/src/modules/mvp/rostechnadzor-registry-export.dto.ts`
- Test: `apps/backend/src/modules/mvp/rostechnadzor-registry-export.dto-validation.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { CreateRostechnadzorExportDto } from './rostechnadzor-registry-export.dto.js';

describe('CreateRostechnadzorExportDto', () => {
  it('accepts an empty body (all optional)', () => {
    expect(validateSync(plainToInstance(CreateRostechnadzorExportDto, {}))).toHaveLength(0);
  });

  it('accepts full filter', () => {
    const dto = plainToInstance(CreateRostechnadzorExportDto, {
      groupId: 'g1',
      clientId: 'c1',
      enrolledFrom: '2026-01-01',
      enrolledTo: '2026-12-31'
    });
    expect(validateSync(dto)).toHaveLength(0);
  });

  it('rejects non-string groupId', () => {
    expect(
      validateSync(plainToInstance(CreateRostechnadzorExportDto, { groupId: 5 }))
    ).not.toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/rostechnadzor-registry-export.dto-validation.test.ts --no-file-parallelism`
Expected: FAIL — DTO not found.

- [ ] **Step 3: Implement**

```ts
import { IsOptional, IsString } from 'class-validator';

export class CreateRostechnadzorExportDto {
  @IsOptional()
  @IsString()
  groupId?: string;

  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @IsString()
  enrolledFrom?: string;

  @IsOptional()
  @IsString()
  enrolledTo?: string;
}
```

- [ ] **Step 4: Run test — verify it passes**

Run: same as Step 2. Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/mvp/rostechnadzor-registry-export.dto.ts apps/backend/src/modules/mvp/rostechnadzor-registry-export.dto-validation.test.ts
git commit -m "feat(backend): Ростехнадзор export DTO + validation test"
```

---

## Task 6: `rostechnadzor-registry.service.ts` — orchestrator (Scope.REQUEST)

**Files:**

- Create: `apps/backend/src/modules/mvp/rostechnadzor-registry/rostechnadzor-registry.service.ts`
- Test: `apps/backend/src/modules/mvp/rostechnadzor-registry/rostechnadzor-registry.service.test.ts`

This is the ОТ twin without programs-classifier/XML/import. Attestation area is sourced provisionally from the course title.

- [ ] **Step 1: Write the failing test**

Mirror `ot-registry/ot-registry.service.test.ts` structure. Use a `makeService()` helper that builds the service with hand-rolled stubs for `InMemoryMvpState`, `MvpService`, `DocumentsService`, `FilesService`, `S3StorageClient`, `RostechnadzorXlsxWriter`, `AuditService`. Minimum cases:

```ts
import { describe, expect, it, vi } from 'vitest';

import { RostechnadzorRegistryService } from './rostechnadzor-registry.service.js';
import { RostechnadzorXlsxWriter } from './rostechnadzor-xlsx.writer.js';
import { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';

const ctx = {
  tenantId: 't1',
  userId: 'u1',
  requestId: 'r',
  correlationId: 'c',
  ip: '',
  userAgent: ''
} as any;

function makeService(overrides: { passed?: boolean } = {}) {
  const state = new InMemoryMvpState();
  const learner = {
    id: 'l1',
    tenantId: 't1',
    lastName: 'Иванов',
    firstName: 'Иван',
    middleName: 'Петрович',
    snils: '112-233-445 95',
    position: 'Инженер'
  };
  const group = { id: 'g1', tenantId: 't1', counterpartyId: 'cp1' };
  const enrollment = {
    id: 'e1',
    tenantId: 't1',
    learnerId: 'l1',
    groupId: 'g1',
    status: 'completed',
    enrolledAt: '2026-05-01'
  };
  const mvp = {
    listEnrollments: vi.fn().mockReturnValue({ items: [enrollment] }),
    getLearner: vi.fn().mockReturnValue(learner),
    getGroup: vi.fn().mockReturnValue(group),
    getCounterparty: vi.fn().mockReturnValue({ id: 'cp1', name: 'ООО Ромашка', inn: '7701234567' }),
    listGroupCourses: vi
      .fn()
      .mockReturnValue({ items: [{ courseId: 'co1', courseVersionId: 'cv1' }] }),
    getCourse: vi.fn().mockReturnValue({ id: 'co1', title: 'Б.1 Эксплуатация ОПО' }),
    getExamResultByEnrollment: vi.fn().mockReturnValue([{ passed: overrides.passed ?? true }])
  } as any;
  const documents = {
    listDocuments: vi
      .fn()
      .mockReturnValue({ items: [{ documentNumber: 'ПБ-42', documentDate: '2026-05-10' }] })
  } as any;
  const files = {
    register: vi.fn().mockResolvedValue({ id: 'file1' }),
    createDownloadUrl: vi.fn().mockResolvedValue('http://x')
  } as any;
  const storage = { putObject: vi.fn().mockResolvedValue(undefined) } as any;
  const audit = { write: vi.fn() } as any;
  const service = new RostechnadzorRegistryService(
    state,
    mvp,
    documents,
    files,
    storage,
    new RostechnadzorXlsxWriter(),
    audit
  );
  return { service, state, files, storage };
}

describe('RostechnadzorRegistryService', () => {
  it('exports a passed enrollment → one row, file stored, batch generated', async () => {
    const { service, state, files, storage } = makeService();
    const outcome = await service.exportRostechnadzorRegistry('t1', {}, ctx);
    expect(outcome.exported).toBe(1);
    expect(outcome.failed).toBe(0);
    expect(outcome.rows[0]!.attestationArea).toBe('Б.1 Эксплуатация ОПО');
    expect(files.register).toHaveBeenCalledOnce();
    expect(storage.putObject).toHaveBeenCalledOnce();
    expect(state.rostechnadzorRegistryBatches).toHaveLength(1);
    expect(state.rostechnadzorRegistryBatches[0]!.batchStatus).toBe('generated');
    expect(state.rostechnadzorRegistryRecords).toHaveLength(1);
  });

  it('non-passed enrollment → failed gather-error, no file', async () => {
    const { service, state, files } = makeService({ passed: false });
    const outcome = await service.exportRostechnadzorRegistry('t1', {}, ctx);
    expect(outcome.exported).toBe(0);
    expect(outcome.failed).toBe(1);
    expect(outcome.errors[0]!.field).toBe('result');
    expect(files.register).not.toHaveBeenCalled();
    expect(state.rostechnadzorRegistryBatches[0]!.batchStatus).toBe('failed');
  });

  it('listBatches returns tenant batches; getBatchWithRecords + getBatchDownloadUrl work', async () => {
    const { service } = makeService();
    const { batchId } = await service.exportRostechnadzorRegistry('t1', {}, ctx);
    expect(service.listBatches('t1')).toHaveLength(1);
    expect(service.getBatchWithRecords('t1', batchId).records).toHaveLength(1);
    await expect(service.getBatchDownloadUrl('t1', batchId)).resolves.toEqual({ url: 'http://x' });
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/rostechnadzor-registry/rostechnadzor-registry.service.test.ts --no-file-parallelism`
Expected: FAIL — service not found.

- [ ] **Step 3: Implement**

```ts
import { randomUUID } from 'node:crypto';

import { Inject, Injectable, NotFoundException, Scope } from '@nestjs/common';

import { validateRostechnadzorRow } from './rostechnadzor-preflight.js';
import { buildRostechnadzorRows } from './rostechnadzor-rows.js';
import { RostechnadzorXlsxWriter } from './rostechnadzor-xlsx.writer.js';
import { S3StorageClient } from '../../../infrastructure/storage/s3-storage.client.js';
import { AuditService } from '../../audit/audit.service.js';
import { DocumentsService } from '../../documents/documents.service.js';
import { FilesService } from '../../files/files.service.js';
import { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';
import { MVP_STATE } from '../infrastructure/mvp-state.token.js';
import { MvpService } from '../mvp.service.js';

import type { RostechnadzorBundle } from './rostechnadzor-rows.js';
import type { RequestContext } from '../../../common/context/request-context.js';
import type {
  Learner,
  RostechnadzorBatch,
  RostechnadzorExportOutcome,
  RostechnadzorRecord,
  RostechnadzorRow,
  RostechnadzorRowError
} from '../mvp.types.js';

export interface RostechnadzorExportFilter {
  groupId?: string;
  clientId?: string;
  enrolledFrom?: string;
  enrolledTo?: string;
}

/**
 * Phase 6 — Ростехнадзор (промышленная безопасность): exports completed,
 * exam-passed enrollments to a provisional `.xlsx` for manual upload. Mirrors the
 * ОТ-registry archetype (only passed knowledge-checks; protocol from documents).
 * Request-scoped, shares MVP_STATE; partial-success (valid rows exported, invalid
 * surfaced per-field; fully-invalid batch → no file). `attestationArea` is PROVISIONAL.
 */
@Injectable({ scope: Scope.REQUEST })
export class RostechnadzorRegistryService {
  constructor(
    @Inject(MVP_STATE) private readonly state: InMemoryMvpState,
    @Inject(MvpService) private readonly mvp: MvpService,
    @Inject(DocumentsService) private readonly documents: DocumentsService,
    @Inject(FilesService) private readonly files: FilesService,
    @Inject(S3StorageClient) private readonly storage: S3StorageClient,
    @Inject(RostechnadzorXlsxWriter) private readonly xlsx: RostechnadzorXlsxWriter,
    @Inject(AuditService) private readonly auditService: AuditService
  ) {}

  async exportRostechnadzorRegistry(
    tenantId: string,
    filter: RostechnadzorExportFilter,
    ctx: RequestContext
  ): Promise<RostechnadzorExportOutcome> {
    const completed = this.mvp
      .listEnrollments(tenantId, {
        group_id: filter.groupId,
        enrolled_from: filter.enrolledFrom,
        enrolled_to: filter.enrolledTo,
        page_size: 1000
      })
      .items.filter((e) => e.status === 'completed');

    // `listEnrollments` ignores enrolled_from/to (documented in-memory gap), so
    // re-apply the date scope on `enrolledAt` (ISO lexicographic compare is correct).
    const enrollments = completed.filter(
      (e) =>
        (!filter.enrolledFrom || (e.enrolledAt ? e.enrolledAt >= filter.enrolledFrom : false)) &&
        (!filter.enrolledTo || (e.enrolledAt ? e.enrolledAt <= filter.enrolledTo : false))
    );

    const gatherErrors: RostechnadzorRowError[] = [];
    const bundles: RostechnadzorBundle[] = [];
    for (const enrollment of enrollments) {
      try {
        const learner = this.mvp.getLearner(tenantId, enrollment.learnerId);
        const group = this.mvp.getGroup(tenantId, enrollment.groupId);
        if (filter.clientId && group.counterpartyId !== filter.clientId) continue;

        const counterparty = group.counterpartyId
          ? this.mvp.getCounterparty(tenantId, group.counterpartyId)
          : undefined;

        const gc = this.mvp.listGroupCourses(tenantId, {
          group_id: enrollment.groupId,
          page_size: 1000
        }).items[0];
        const course = gc?.courseId ? this.mvp.getCourse(tenantId, gc.courseId) : undefined;

        const protocol = this.documents.listDocuments(tenantId, {
          documentType: 'protocol',
          sourceEntityType: 'enrollment',
          sourceEntityId: enrollment.id,
          pageSize: 1
        }).items[0];

        const exam = this.mvp.getExamResultByEnrollment(tenantId, enrollment.id)[0];
        if (!exam?.passed) {
          gatherErrors.push({
            enrollmentId: enrollment.id,
            learnerId: enrollment.learnerId,
            fullName: this.fullName(learner),
            field: 'result',
            message: 'Нет сданного результата проверки знаний (выгружаются только сданные)'
          });
          continue;
        }

        bundles.push({
          enrollment,
          learner,
          employerName: counterparty?.name ?? '',
          employerInn: counterparty?.inn ?? '',
          // SWAP-POINT — провизорно: область аттестации = наименование курса/программы.
          attestationArea: course?.title ?? '',
          protocol: {
            documentNumber: protocol?.documentNumber ?? '',
            documentDate: protocol?.documentDate ?? ''
          }
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

    const rows = buildRostechnadzorRows(bundles);
    const valid: RostechnadzorRow[] = [];
    const preflightErrors: RostechnadzorRowError[] = [];
    for (const r of rows) {
      const e = validateRostechnadzorRow(r);
      if (e.length) preflightErrors.push(...e);
      else valid.push(r);
    }

    const errors = [...gatherErrors, ...preflightErrors];
    const exported = valid.length;
    const validIds = new Set(valid.map((r) => r.enrollmentId));
    const failed = new Set(
      errors.map((e) => e.enrollmentId).filter((id) => id && !validIds.has(id))
    ).size;
    const total = exported + failed;
    const now = new Date().toISOString();

    const batch: RostechnadzorBatch = {
      id: this.id('rtb'),
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
      const storageKey = `${tenantId}/rostechnadzor-registry/${batch.id}.xlsx`;
      const meta = await this.files.register({
        tenantId,
        storageKey,
        originalName: `rostechnadzor-registry-${batch.id}.xlsx`,
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

    this.state.rostechnadzorRegistryBatches.push(batch);
    for (const r of valid) {
      this.state.rostechnadzorRegistryRecords.push({
        id: this.id('rtr'),
        tenantId,
        status: 'active',
        createdAt: now,
        updatedAt: now,
        batchId: batch.id,
        enrollmentId: r.enrollmentId,
        learnerId: r.learnerId,
        snils: r.snils,
        protocolNumber: r.protocolNumber
      });
    }

    this.auditService.write({
      tenantId,
      actorId: ctx.userId,
      action: 'regulatory.rostechnadzor_exported',
      entityType: 'rostechnadzor_batch',
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

  listBatches(tenantId: string): RostechnadzorBatch[] {
    return this.state.rostechnadzorRegistryBatches
      .filter((b) => b.tenantId === tenantId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  getBatchWithRecords(
    tenantId: string,
    id: string
  ): { batch: RostechnadzorBatch; records: RostechnadzorRecord[] } {
    const batch = this.state.rostechnadzorRegistryBatches.find(
      (b) => b.tenantId === tenantId && b.id === id
    );
    if (!batch) {
      throw new NotFoundException({
        code: 'rostechnadzor_batch_not_found',
        message: 'Batch not found for tenant'
      });
    }
    const records = this.state.rostechnadzorRegistryRecords.filter(
      (r) => r.tenantId === tenantId && r.batchId === id
    );
    return { batch, records };
  }

  async getBatchDownloadUrl(tenantId: string, id: string): Promise<{ url: string }> {
    const { batch } = this.getBatchWithRecords(tenantId, id);
    if (!batch.fileId) {
      throw new NotFoundException({
        code: 'rostechnadzor_file_not_found',
        message: 'Batch has no generated file'
      });
    }
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

> **NOTE:** the `state.rostechnadzorRegistryBatches`/`...Records` arrays referenced here are declared in Task 7. Implement Task 6 and Task 7 together; the service test only compiles after Task 7's state arrays exist. If running strictly TDD, add the two `in-memory-mvp.state.ts` arrays (Task 7 Step 1) FIRST, then this service.

- [ ] **Step 4: Run test — verify it passes**

Run: same as Step 2 (after Task 7 Step 1 state arrays exist). Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/mvp/rostechnadzor-registry/rostechnadzor-registry.service.ts apps/backend/src/modules/mvp/rostechnadzor-registry/rostechnadzor-registry.service.test.ts
git commit -m "feat(backend): Ростехнадзор export service (completed+passed enrollments) + test"
```

---

## Task 7: Wiring — state arrays, collections, controller, module

**Files:**

- Modify: `apps/backend/src/modules/mvp/infrastructure/in-memory-mvp.state.ts`
- Modify: `apps/backend/src/modules/mvp/infrastructure/mvp-collections.ts`
- Create: `apps/backend/src/modules/mvp/rostechnadzor-registry/rostechnadzor-registry.controller.ts`
- Modify: `apps/backend/src/modules/mvp/mvp.module.ts`

- [ ] **Step 1: Add state arrays** (`in-memory-mvp.state.ts`)

In the type import list (near line 20-35) add `RostechnadzorBatch`, `RostechnadzorRecord`. After the ЕИСОТ arrays (line ~97) add:

```ts
  // Phase 6 — Ростехнадзор (промышленная безопасность): durable export batches + records.
  rostechnadzorRegistryBatches: RostechnadzorBatch[] = [];
  rostechnadzorRegistryRecords: RostechnadzorRecord[] = [];
```

- [ ] **Step 2: Register collections** (`mvp-collections.ts`)

After `'eisotTestingRecords',` (line 41) add:

```ts
  'rostechnadzorRegistryBatches',
  'rostechnadzorRegistryRecords',
```

- [ ] **Step 3: Create the controller**

```ts
import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  UseGuards,
  UseInterceptors
} from '@nestjs/common';

import { RostechnadzorRegistryService } from './rostechnadzor-registry.service.js';
import { assertValidDto } from '../../../common/app-validation.pipe.js';
import { CurrentContext } from '../../../common/decorators/current-context.decorator.js';
import { TenantGuard } from '../../../common/guards/tenant.guard.js';
import { RequirePermissions } from '../../iam/permission.decorator.js';
import { PermissionGuard } from '../../iam/permission.guard.js';
import { MvpRequestPersistenceInterceptor } from '../infrastructure/mvp-request-persistence.interceptor.js';
import { CreateRostechnadzorExportDto } from '../rostechnadzor-registry-export.dto.js';

import type { RequestContext } from '../../../common/context/request-context.js';

@Controller('rostechnadzor-registry')
@UseInterceptors(MvpRequestPersistenceInterceptor)
@UseGuards(TenantGuard)
export class RostechnadzorRegistryController {
  constructor(
    @Inject(RostechnadzorRegistryService) private readonly service: RostechnadzorRegistryService
  ) {}

  @Post('exports')
  @UseGuards(PermissionGuard)
  @RequirePermissions('regulatory.export.write')
  async createExport(@CurrentContext() ctx: RequestContext, @Body() body: unknown) {
    const dto = assertValidDto(CreateRostechnadzorExportDto, body);
    return this.service.exportRostechnadzorRegistry(ctx.tenantId!, dto, ctx);
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

- [ ] **Step 4: Register in `mvp.module.ts`**

Imports (near the other registry imports, lines 3-8):

```ts
import { RostechnadzorRegistryController } from './rostechnadzor-registry/rostechnadzor-registry.controller.js';
import { RostechnadzorRegistryService } from './rostechnadzor-registry/rostechnadzor-registry.service.js';
import { RostechnadzorXlsxWriter } from './rostechnadzor-registry/rostechnadzor-xlsx.writer.js';
```

`controllers` array — after `EisotTestingRegistryController,`:

```ts
    RostechnadzorRegistryController,
```

`providers` array — after the ЕИСОТ provider block:

```ts
    RostechnadzorXlsxWriter,
    {
      provide: RostechnadzorRegistryService,
      scope: Scope.REQUEST,
      useClass: RostechnadzorRegistryService
    },
```

- [ ] **Step 5: Verify build + service test pass**

Run: `pnpm typecheck` → PASS
Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/rostechnadzor-registry/rostechnadzor-registry.service.test.ts --no-file-parallelism` → PASS

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/mvp/infrastructure/in-memory-mvp.state.ts apps/backend/src/modules/mvp/infrastructure/mvp-collections.ts apps/backend/src/modules/mvp/rostechnadzor-registry/rostechnadzor-registry.controller.ts apps/backend/src/modules/mvp/mvp.module.ts
git commit -m "feat(backend): wire Ростехнадзор registry (state, collections, controller, module)"
```

---

## Task 8: Permission boundary in `mvp.http.integration.test.ts`

**Files:**

- Modify: `apps/backend/src/modules/mvp/mvp.http.integration.test.ts`

- [ ] **Step 1: Add stub-controller endpoints**

After the ЕИСОТ stub block (line ~370), add:

```ts
      // Phase 6 — Ростехнадзор registry export (POST requires write; GET requires read)
      @Post('rostechnadzor-registry/exports')
      @RequirePermissions('regulatory.export.write')
      createRostechnadzorExport(
        @CurrentContext() context: { tenantId?: string; userId?: string },
        @Body() body: { groupId?: string }
      ) {
        return { batchId: 'rtb_stub', tenantId: context.tenantId, groupId: body.groupId ?? null };
      }

      @Get('rostechnadzor-registry/exports')
      @RequirePermissions('regulatory.export.read')
      listRostechnadzorExports(@CurrentContext() context: { tenantId?: string }) {
        return { items: [], tenantId: context.tenantId };
      }
```

- [ ] **Step 2: Add the 4 boundary test cases**

After the ЕИСОТ `describe`/`it` blocks (~line 1650), mirror them:

```ts
describe('Ростехнадзор registry permission boundary', () => {
  it('POST /rostechnadzor-registry/exports — 403 without regulatory.export.write', async () => {
    iamServiceMock.resolvePermissions.mockResolvedValueOnce(['regulatory.export.read']);
    const response = await fetch(`${apiBaseUrl}/rostechnadzor-registry/exports`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({})
    });
    expect(response.status).toBe(403);
  });

  it('POST /rostechnadzor-registry/exports — 201 with regulatory.export.write', async () => {
    iamServiceMock.resolvePermissions.mockResolvedValueOnce(['regulatory.export.write']);
    const response = await fetch(`${apiBaseUrl}/rostechnadzor-registry/exports`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ groupId: 'g1' })
    });
    expect(response.status).toBe(201);
    const json = await response.json();
    expect(json.data.batchId).toBe('rtb_stub');
  });

  it('GET /rostechnadzor-registry/exports — 403 without regulatory.export.read', async () => {
    iamServiceMock.resolvePermissions.mockResolvedValueOnce([]);
    const response = await fetch(`${apiBaseUrl}/rostechnadzor-registry/exports`, {
      headers: authHeaders
    });
    expect(response.status).toBe(403);
  });

  it('GET /rostechnadzor-registry/exports — 200 with regulatory.export.read', async () => {
    iamServiceMock.resolvePermissions.mockResolvedValueOnce(['regulatory.export.read']);
    const response = await fetch(`${apiBaseUrl}/rostechnadzor-registry/exports`, {
      headers: authHeaders
    });
    expect(response.status).toBe(200);
  });
});
```

> Use the exact local helper names already present in this file (`authHeaders`, `apiBaseUrl`, `iamServiceMock`) — confirm them in the ЕИСОТ block you are mirroring; adjust if they differ.

- [ ] **Step 3: Run test**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/mvp.http.integration.test.ts --no-file-parallelism`
Expected: PASS (all existing + 4 new).

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/modules/mvp/mvp.http.integration.test.ts
git commit -m "test(backend): Ростехнадзор export permission boundary (4 cases)"
```

---

# MODULE 2 — Минздрав-НМО (непрерывное медобразование)

## Task 9: НМО types in `mvp.types.ts`

**Files:**

- Modify: `apps/backend/src/modules/mvp/mvp.types.ts` (append after the Ростехнадзор block)

- [ ] **Step 1: Append the type block**

```ts
// === Минздрав-НМО (непрерывное медобразование, ЗЕТ) — Phase 6 ===
// PROVISIONAL: формат не сверен с эталоном портала НМО (edu.rosminzdrav.ru).
// `specialty` и `creditUnits` (ЗЕТ) — swap-points (специальность пока пустая;
// ЗЕТ провизорно = академические часы программы).

export interface NmoRow {
  documentId: string;
  enrollmentId: string;
  learnerId: string;
  lastName: string;
  firstName: string;
  middleName: string;
  fullName: string; // для метки ошибок
  snils: string;
  specialty: string; // SWAP-POINT — специальность (пока '')
  programName: string;
  creditUnits: string; // ЗЕТ — SWAP-POINT, провизорно = акад. часы; число строкой | ''
  completionDate: string; // ДД.ММ.ГГГГ
  documentNumber: string;
}

export interface NmoRowError {
  documentId: string;
  learnerId: string;
  fullName: string;
  field: string;
  message: string;
}

export type NmoBatchStatus = 'generated' | 'partial' | 'failed';

export interface NmoBatch extends BaseEntity {
  sourceFilterJson: Record<string, unknown>;
  fileId?: string;
  totalCandidates: number;
  exportedRows: number;
  failedRows: number;
  batchStatus: NmoBatchStatus;
  generatedBy: string;
}

export interface NmoRecord extends BaseEntity {
  batchId: string;
  documentId: string;
  enrollmentId: string;
  learnerId: string;
  snils: string;
  documentNumber: string;
}

export interface NmoExportOutcome {
  batchId: string;
  fileId?: string;
  total: number;
  exported: number;
  failed: number;
  rows: NmoRow[];
  errors: NmoRowError[];
}
```

- [ ] **Step 2: Typecheck** → `pnpm typecheck` PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/modules/mvp/mvp.types.ts
git commit -m "feat(backend): Минздрав-НМО registry types (row/batch/record/outcome)"
```

---

## Task 10: `nmo-rows.ts` — pure row builder

**Files:**

- Create: `apps/backend/src/modules/mvp/nmo-registry/nmo-rows.ts`
- Test: `apps/backend/src/modules/mvp/nmo-registry/nmo-rows.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';

import { buildNmoRows } from './nmo-rows.js';

import type { NmoDocumentBundle } from './nmo-rows.js';
import type { Enrollment, Learner } from '../mvp.types.js';

const learner = (over: Partial<Learner> = {}): Learner =>
  ({
    id: 'l1',
    tenantId: 't1',
    lastName: 'Петрова',
    firstName: 'Анна',
    middleName: 'Сергеевна',
    snils: '112-233-445 95',
    ...over
  }) as Learner;

const bundle = (over: Partial<NmoDocumentBundle> = {}): NmoDocumentBundle => ({
  document: { id: 'd1', documentNumber: 'НМО-7', documentDate: '2026-04-20' },
  enrollment: { id: 'e1', tenantId: 't1', learnerId: 'l1', groupId: 'g1' } as Enrollment,
  learner: learner(),
  programName: 'Кардиология (36 ч)',
  specialty: '',
  creditUnits: 36,
  ...over
});

describe('buildNmoRows', () => {
  it('maps a document bundle to a row with ЗЕТ from credit units and formatted date', () => {
    const [row] = buildNmoRows([bundle()]);
    expect(row).toMatchObject({
      documentId: 'd1',
      learnerId: 'l1',
      fullName: 'Петрова Анна Сергеевна',
      snils: '112-233-445 95',
      specialty: '',
      programName: 'Кардиология (36 ч)',
      creditUnits: '36',
      completionDate: '20.04.2026',
      documentNumber: 'НМО-7'
    });
  });

  it('emits blank ЗЕТ/snils when absent', () => {
    const [row] = buildNmoRows([
      bundle({ creditUnits: undefined, learner: learner({ snils: undefined }) })
    ]);
    expect(row.creditUnits).toBe('');
    expect(row.snils).toBe('');
  });
});
```

- [ ] **Step 2: Run — verify fail**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/nmo-registry/nmo-rows.test.ts --no-file-parallelism` → FAIL.

- [ ] **Step 3: Implement**

```ts
import type { GeneratedDocumentEntity } from '../../documents/documents.types.js';
import type { Enrollment, Learner, NmoRow } from '../mvp.types.js';

export interface NmoDocumentBundle {
  document: Pick<GeneratedDocumentEntity, 'id' | 'documentNumber' | 'documentDate'>;
  enrollment: Enrollment;
  learner: Learner;
  programName: string;
  specialty: string;
  creditUnits?: number;
}

const fmtDate = (iso: string): string => {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return d && m && y ? `${d}.${m}.${y}` : '';
};

const fullName = (l: Learner): string =>
  [l.lastName, l.firstName, l.middleName].filter(Boolean).join(' ').trim();

export function buildNmoRows(bundles: NmoDocumentBundle[]): NmoRow[] {
  return bundles.map((b) => ({
    documentId: b.document.id,
    enrollmentId: b.enrollment.id,
    learnerId: b.learner.id,
    lastName: b.learner.lastName ?? '',
    firstName: b.learner.firstName ?? '',
    middleName: b.learner.middleName ?? '',
    fullName: fullName(b.learner),
    snils: b.learner.snils ?? '',
    specialty: b.specialty ?? '',
    programName: b.programName ?? '',
    creditUnits: b.creditUnits !== undefined ? String(b.creditUnits) : '',
    completionDate: fmtDate(b.document.documentDate ?? ''),
    documentNumber: b.document.documentNumber ?? ''
  }));
}
```

- [ ] **Step 4: Run — verify pass** → PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/mvp/nmo-registry/nmo-rows.ts apps/backend/src/modules/mvp/nmo-registry/nmo-rows.test.ts
git commit -m "feat(backend): Минздрав-НМО pure row builder + test"
```

---

## Task 11: `nmo-preflight.ts` — pure validator

**Files:**

- Create: `apps/backend/src/modules/mvp/nmo-registry/nmo-preflight.ts`
- Test: `apps/backend/src/modules/mvp/nmo-registry/nmo-preflight.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';

import { validateNmoRow } from './nmo-preflight.js';

import type { NmoRow } from '../mvp.types.js';

const row = (over: Partial<NmoRow> = {}): NmoRow => ({
  documentId: 'd1',
  enrollmentId: 'e1',
  learnerId: 'l1',
  lastName: 'Петрова',
  firstName: 'Анна',
  middleName: 'Сергеевна',
  fullName: 'Петрова Анна Сергеевна',
  snils: '112-233-445 95',
  specialty: '',
  programName: 'Кардиология',
  creditUnits: '36',
  completionDate: '20.04.2026',
  documentNumber: 'НМО-7',
  ...over
});

describe('validateNmoRow', () => {
  it('accepts a valid row (specialty/ЗЕТ optional)', () => {
    expect(validateNmoRow(row())).toEqual([]);
  });

  it('flags missing ФИО, номер документа, программа, bad date', () => {
    const fields = validateNmoRow(
      row({ lastName: '', fullName: '', documentNumber: '', programName: '', completionDate: 'x' })
    ).map((e) => e.field);
    expect(fields).toContain('fullName');
    expect(fields).toContain('documentNumber');
    expect(fields).toContain('programName');
    expect(fields).toContain('completionDate');
  });

  it('flags non-numeric ЗЕТ only when present', () => {
    expect(validateNmoRow(row({ creditUnits: '' }))).toEqual([]);
    expect(validateNmoRow(row({ creditUnits: 'abc' })).map((e) => e.field)).toContain(
      'creditUnits'
    );
  });

  it('validates СНИЛС checksum only when present', () => {
    expect(validateNmoRow(row({ snils: '' }))).toEqual([]);
    expect(validateNmoRow(row({ snils: '123-456-789 00' })).map((e) => e.field)).toContain('snils');
  });
});
```

- [ ] **Step 2: Run — verify fail.**

- [ ] **Step 3: Implement**

```ts
import { isValidSnilsChecksum, normalizeSnils } from '../learners-bulk-import.service.js';

import type { NmoRow, NmoRowError } from '../mvp.types.js';

const DATE_RE = /^[0-3][0-9]\.[0-1][0-9]\.[0-9]{4}$/;

/**
 * Provisional preflight for Минздрав-НМО rows. Hard fields (ФИО, номер документа,
 * программа, дата) exclude a row; optional СНИЛС / ЗЕТ are validated only when present.
 * Specialty is provisional and never required.
 */
export function validateNmoRow(row: NmoRow): NmoRowError[] {
  const errs: NmoRowError[] = [];
  const push = (field: string, message: string) =>
    errs.push({
      documentId: row.documentId,
      learnerId: row.learnerId,
      fullName: row.fullName,
      field,
      message
    });

  if (!row.fullName?.trim() || !row.lastName?.trim() || !row.firstName?.trim())
    push('fullName', 'ФИО отсутствует (нужны фамилия и имя)');
  if (!row.documentNumber?.trim()) push('documentNumber', 'Номер документа отсутствует');
  if (!row.programName?.trim()) push('programName', 'Наименование программы отсутствует');
  if (!DATE_RE.test(row.completionDate ?? ''))
    push('completionDate', 'Дата освоения должна быть в формате ДД.ММ.ГГГГ');

  if (row.creditUnits?.trim() && !/^\d+([.,]\d+)?$/.test(row.creditUnits.trim()))
    push('creditUnits', 'ЗЕТ должно быть числом');

  if (row.snils?.trim()) {
    const snils = normalizeSnils(row.snils);
    if (snils.length !== 11 || !isValidSnilsChecksum(snils)) push('snils', 'Некорректный СНИЛС');
  }
  return errs;
}
```

- [ ] **Step 4: Run — verify pass** (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/mvp/nmo-registry/nmo-preflight.ts apps/backend/src/modules/mvp/nmo-registry/nmo-preflight.test.ts
git commit -m "feat(backend): Минздрав-НМО row preflight validator + test"
```

---

## Task 12: `nmo-xlsx.writer.ts` — exceljs writer (the swap-point)

**Files:**

- Create: `apps/backend/src/modules/mvp/nmo-registry/nmo-xlsx.writer.ts`
- Test: `apps/backend/src/modules/mvp/nmo-registry/nmo-xlsx.writer.test.ts`

- [ ] **Step 1: Write the failing test** (mirror Task 4's writer test)

```ts
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';

import { NmoXlsxWriter } from './nmo-xlsx.writer.js';

import type { NmoRow } from '../mvp.types.js';

const row: NmoRow = {
  documentId: 'd1',
  enrollmentId: 'e1',
  learnerId: 'l1',
  lastName: 'Петрова',
  firstName: 'Анна',
  middleName: 'Сергеевна',
  fullName: 'Петрова Анна Сергеевна',
  snils: '112-233-445 95',
  specialty: 'Кардиология',
  programName: 'Кардиология (36 ч)',
  creditUnits: '36',
  completionDate: '20.04.2026',
  documentNumber: 'НМО-7'
};

describe('NmoXlsxWriter', () => {
  it('writes header + data row in column order', async () => {
    const buffer = await new NmoXlsxWriter().build([row]);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    const ws = wb.worksheets[0]!;
    expect(ws.getRow(1).getCell(1).value).toBe('Фамилия');
    expect(ws.getRow(1).getCell(7).value).toBe('ЗЕТ');
    expect(ws.getRow(2).getCell(7).value).toBe('36');
    expect(ws.getRow(2).getCell(9).value).toBe('НМО-7');
  });
});
```

- [ ] **Step 2: Run — verify fail.**

- [ ] **Step 3: Implement**

```ts
import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';

import type { NmoRow } from '../mvp.types.js';

// PROVISIONAL — сверить с эталоном портала НМО (edu.rosminzdrav.ru) перед боевой подачей.
// Единственное место маппинга поле→колонка (single swap point). `specialty`/`ЗЕТ` —
// swap-points (специальность пока пустая; ЗЕТ провизорно = академические часы).
const COLUMNS: { header: string; key: keyof NmoRow; width: number }[] = [
  { header: 'Фамилия', key: 'lastName', width: 18 },
  { header: 'Имя', key: 'firstName', width: 16 },
  { header: 'Отчество', key: 'middleName', width: 18 },
  { header: 'СНИЛС', key: 'snils', width: 16 },
  { header: 'Специальность', key: 'specialty', width: 30 },
  { header: 'Наименование программы', key: 'programName', width: 50 },
  { header: 'ЗЕТ', key: 'creditUnits', width: 10 },
  { header: 'Дата освоения', key: 'completionDate', width: 16 },
  { header: 'Номер документа', key: 'documentNumber', width: 22 }
];

@Injectable()
export class NmoXlsxWriter {
  readonly contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  async build(rows: NmoRow[]): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('НМО');
    ws.columns = COLUMNS.map((c) => ({ header: c.header, key: c.key as string, width: c.width }));
    for (const r of rows) {
      ws.addRow(COLUMNS.reduce((acc, c) => ({ ...acc, [c.key]: r[c.key] }), {}));
    }
    ws.getRow(1).font = { bold: true };
    return (await wb.xlsx.writeBuffer()) as unknown as Buffer;
  }
}
```

- [ ] **Step 4: Run — verify pass.**

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/mvp/nmo-registry/nmo-xlsx.writer.ts apps/backend/src/modules/mvp/nmo-registry/nmo-xlsx.writer.test.ts
git commit -m "feat(backend): Минздрав-НМО xlsx writer (PROVISIONAL COLUMNS swap-point) + test"
```

---

## Task 13: `nmo-registry-export.dto.ts` — request DTO

**Files:**

- Create: `apps/backend/src/modules/mvp/nmo-registry-export.dto.ts`
- Test: `apps/backend/src/modules/mvp/nmo-registry-export.dto-validation.test.ts`

- [ ] **Step 1: Write the failing test** (mirror Task 5 + FRDO `types` array)

```ts
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { CreateNmoExportDto } from './nmo-registry-export.dto.js';

describe('CreateNmoExportDto', () => {
  it('accepts empty body', () => {
    expect(validateSync(plainToInstance(CreateNmoExportDto, {}))).toHaveLength(0);
  });

  it('accepts full filter with valid types', () => {
    const dto = plainToInstance(CreateNmoExportDto, {
      from: '2026-01-01',
      to: '2026-12-31',
      types: ['certificate'],
      groupId: 'g1',
      clientId: 'c1'
    });
    expect(validateSync(dto)).toHaveLength(0);
  });

  it('rejects an unknown document type', () => {
    expect(
      validateSync(plainToInstance(CreateNmoExportDto, { types: ['passport'] }))
    ).not.toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run — verify fail.**

- [ ] **Step 3: Implement**

```ts
import { IsArray, IsIn, IsOptional, IsString } from 'class-validator';

export class CreateNmoExportDto {
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

- [ ] **Step 4: Run — verify pass** (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/mvp/nmo-registry-export.dto.ts apps/backend/src/modules/mvp/nmo-registry-export.dto-validation.test.ts
git commit -m "feat(backend): Минздрав-НМО export DTO + validation test"
```

---

## Task 14: `nmo-registry.service.ts` — orchestrator (Scope.REQUEST)

**Files:**

- Create: `apps/backend/src/modules/mvp/nmo-registry/nmo-registry.service.ts`
- Test: `apps/backend/src/modules/mvp/nmo-registry/nmo-registry.service.test.ts`

This is the ФРДО twin without the document-kind classifier (НМО needs no kind lookup). `specialty` provisionally `''`; `creditUnits` provisionally from `courseVersion.academicHours`.

- [ ] **Step 1: Write the failing test**

Mirror `frdo-registry/frdo-registry.service.test.ts`. `makeService()` stubs: `InMemoryMvpState`, `MvpService` (`getEnrollment`, `getLearner`, `getGroup`, `listGroupCourses`, `getCourse`, `getCourseVersion`), `DocumentsService` (`listIssuedDocuments`), `FilesService`, `S3StorageClient`, `NmoXlsxWriter`, `AuditService`.

```ts
import { describe, expect, it, vi } from 'vitest';

import { NmoRegistryService } from './nmo-registry.service.js';
import { NmoXlsxWriter } from './nmo-xlsx.writer.js';
import { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';

const ctx = {
  tenantId: 't1',
  userId: 'u1',
  requestId: 'r',
  correlationId: 'c',
  ip: '',
  userAgent: ''
} as any;

function makeService(docOver: Record<string, unknown> = {}) {
  const state = new InMemoryMvpState();
  const doc = {
    id: 'd1',
    documentNumber: 'НМО-7',
    documentDate: '2026-04-20',
    documentType: 'certificate',
    sourceEntityType: 'enrollment',
    sourceEntityId: 'e1',
    status: 'final',
    ...docOver
  };
  const documents = { listIssuedDocuments: vi.fn().mockReturnValue({ items: [doc] }) } as any;
  const mvp = {
    getEnrollment: vi
      .fn()
      .mockReturnValue({ id: 'e1', tenantId: 't1', learnerId: 'l1', groupId: 'g1' }),
    getLearner: vi
      .fn()
      .mockReturnValue({
        id: 'l1',
        tenantId: 't1',
        lastName: 'Петрова',
        firstName: 'Анна',
        snils: '112-233-445 95'
      }),
    getGroup: vi.fn().mockReturnValue({ id: 'g1', tenantId: 't1', counterpartyId: 'cp1' }),
    listGroupCourses: vi
      .fn()
      .mockReturnValue({ items: [{ courseId: 'co1', courseVersionId: 'cv1' }] }),
    getCourse: vi.fn().mockReturnValue({ id: 'co1', title: 'Кардиология' }),
    getCourseVersion: vi.fn().mockReturnValue({ id: 'cv1', academicHours: 36 })
  } as any;
  const files = {
    register: vi.fn().mockResolvedValue({ id: 'file1' }),
    createDownloadUrl: vi.fn().mockResolvedValue('http://x')
  } as any;
  const storage = { putObject: vi.fn().mockResolvedValue(undefined) } as any;
  const audit = { write: vi.fn() } as any;
  const service = new NmoRegistryService(
    state,
    mvp,
    documents,
    files,
    storage,
    new NmoXlsxWriter(),
    audit
  );
  return { service, state, files };
}

describe('NmoRegistryService', () => {
  it('exports an issued document → one row with ЗЕТ from academicHours, batch generated', async () => {
    const { service, state, files } = makeService();
    const outcome = await service.exportNmoRegistry('t1', {}, ctx);
    expect(outcome.exported).toBe(1);
    expect(outcome.rows[0]!.creditUnits).toBe('36');
    expect(outcome.rows[0]!.programName).toBe('Кардиология');
    expect(files.register).toHaveBeenCalledOnce();
    expect(state.nmoRegistryBatches[0]!.batchStatus).toBe('generated');
    expect(state.nmoRegistryRecords).toHaveLength(1);
  });

  it('skips non-enrollment-sourced documents', async () => {
    const { service } = makeService({ sourceEntityType: 'group' });
    const outcome = await service.exportNmoRegistry('t1', {}, ctx);
    expect(outcome.total).toBe(0);
  });

  it('listBatches + getBatchWithRecords + download url', async () => {
    const { service } = makeService();
    const { batchId } = await service.exportNmoRegistry('t1', {}, ctx);
    expect(service.listBatches('t1')).toHaveLength(1);
    expect(service.getBatchWithRecords('t1', batchId).records).toHaveLength(1);
    await expect(service.getBatchDownloadUrl('t1', batchId)).resolves.toEqual({ url: 'http://x' });
  });
});
```

- [ ] **Step 2: Run — verify fail.**

- [ ] **Step 3: Implement** (ФРДО twin, no kind classifier)

```ts
import { randomUUID } from 'node:crypto';

import { Inject, Injectable, NotFoundException, Scope } from '@nestjs/common';

import { validateNmoRow } from './nmo-preflight.js';
import { buildNmoRows } from './nmo-rows.js';
import { NmoXlsxWriter } from './nmo-xlsx.writer.js';
import { S3StorageClient } from '../../../infrastructure/storage/s3-storage.client.js';
import { AuditService } from '../../audit/audit.service.js';
import { DocumentsService } from '../../documents/documents.service.js';
import { FilesService } from '../../files/files.service.js';
import { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';
import { MVP_STATE } from '../infrastructure/mvp-state.token.js';
import { MvpService } from '../mvp.service.js';

import type { NmoDocumentBundle } from './nmo-rows.js';
import type { RequestContext } from '../../../common/context/request-context.js';
import type {
  Learner,
  NmoBatch,
  NmoExportOutcome,
  NmoRecord,
  NmoRow,
  NmoRowError
} from '../mvp.types.js';

export interface NmoExportFilter {
  from?: string;
  to?: string;
  types?: ('certificate' | 'diploma')[];
  groupId?: string;
  clientId?: string;
}

/**
 * Phase 6 — Минздрав-НМО (непрерывное медобразование, ЗЕТ): exports issued education
 * documents to a provisional `.xlsx` for manual upload to the НМО portal. Mirrors the
 * ФРДО archetype (document-driven). Request-scoped, shares MVP_STATE; partial-success.
 * `specialty` and `creditUnits` (ЗЕТ) are PROVISIONAL swap-points.
 */
@Injectable({ scope: Scope.REQUEST })
export class NmoRegistryService {
  constructor(
    @Inject(MVP_STATE) private readonly state: InMemoryMvpState,
    @Inject(MvpService) private readonly mvp: MvpService,
    @Inject(DocumentsService) private readonly documents: DocumentsService,
    @Inject(FilesService) private readonly files: FilesService,
    @Inject(S3StorageClient) private readonly storage: S3StorageClient,
    @Inject(NmoXlsxWriter) private readonly xlsx: NmoXlsxWriter,
    @Inject(AuditService) private readonly auditService: AuditService
  ) {}

  async exportNmoRegistry(
    tenantId: string,
    filter: NmoExportFilter,
    ctx: RequestContext
  ): Promise<NmoExportOutcome> {
    const docs = this.documents
      .listIssuedDocuments(tenantId, {
        types: filter.types?.length ? filter.types : ['certificate', 'diploma'],
        ...(filter.from ? { from: filter.from } : {}),
        ...(filter.to ? { to: filter.to } : {})
      })
      .items.filter((d) => !d.revokedAt && d.status !== 'archived' && d.status !== 'revoked');

    const gatherErrors: NmoRowError[] = [];
    const bundles: NmoDocumentBundle[] = [];
    for (const document of docs) {
      try {
        if (document.sourceEntityType !== 'enrollment') continue;
        const enrollment = this.mvp.getEnrollment(tenantId, document.sourceEntityId);
        const learner = this.mvp.getLearner(tenantId, enrollment.learnerId);
        const group = this.mvp.getGroup(tenantId, enrollment.groupId);
        if (filter.clientId && group.counterpartyId !== filter.clientId) continue;
        if (filter.groupId && enrollment.groupId !== filter.groupId) continue;

        const gc = this.mvp.listGroupCourses(tenantId, {
          group_id: enrollment.groupId,
          page_size: 1000
        }).items[0];
        const course = gc?.courseId ? this.mvp.getCourse(tenantId, gc.courseId) : undefined;
        const cv = gc?.courseVersionId
          ? this.mvp.getCourseVersion(tenantId, gc.courseVersionId)
          : undefined;

        bundles.push({
          document,
          enrollment,
          learner,
          programName: course?.title ?? '',
          // SWAP-POINT — специальность пока пустая (нет источника); заполнить при наличии.
          specialty: '',
          // SWAP-POINT — ЗЕТ провизорно = академические часы программы.
          ...(cv?.academicHours !== undefined ? { creditUnits: cv.academicHours } : {})
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

    const rows = buildNmoRows(bundles);
    const valid: NmoRow[] = [];
    const preflightErrors: NmoRowError[] = [];
    for (const r of rows) {
      const e = validateNmoRow(r);
      if (e.length) preflightErrors.push(...e);
      else valid.push(r);
    }

    const errors = [...gatherErrors, ...preflightErrors];
    const exported = valid.length;
    const failed = new Set(errors.map((e) => e.documentId)).size;
    const total = exported + failed;
    const now = new Date().toISOString();

    const batch: NmoBatch = {
      id: this.id('nmb'),
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
      const storageKey = `${tenantId}/nmo-registry/${batch.id}.xlsx`;
      const meta = await this.files.register({
        tenantId,
        storageKey,
        originalName: `nmo-registry-${batch.id}.xlsx`,
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

    this.state.nmoRegistryBatches.push(batch);
    for (const r of valid) {
      this.state.nmoRegistryRecords.push({
        id: this.id('nmr'),
        tenantId,
        status: 'active',
        createdAt: now,
        updatedAt: now,
        batchId: batch.id,
        documentId: r.documentId,
        enrollmentId: r.enrollmentId,
        learnerId: r.learnerId,
        snils: r.snils,
        documentNumber: r.documentNumber
      });
    }

    this.auditService.write({
      tenantId,
      actorId: ctx.userId,
      action: 'regulatory.nmo_exported',
      entityType: 'nmo_batch',
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

  listBatches(tenantId: string): NmoBatch[] {
    return this.state.nmoRegistryBatches
      .filter((b) => b.tenantId === tenantId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  getBatchWithRecords(tenantId: string, id: string): { batch: NmoBatch; records: NmoRecord[] } {
    const batch = this.state.nmoRegistryBatches.find((b) => b.tenantId === tenantId && b.id === id);
    if (!batch) {
      throw new NotFoundException({
        code: 'nmo_batch_not_found',
        message: 'Batch not found for tenant'
      });
    }
    const records = this.state.nmoRegistryRecords.filter(
      (r) => r.tenantId === tenantId && r.batchId === id
    );
    return { batch, records };
  }

  async getBatchDownloadUrl(tenantId: string, id: string): Promise<{ url: string }> {
    const { batch } = this.getBatchWithRecords(tenantId, id);
    if (!batch.fileId) {
      throw new NotFoundException({
        code: 'nmo_file_not_found',
        message: 'Batch has no generated file'
      });
    }
    return { url: await this.files.createDownloadUrl(tenantId, batch.fileId) };
  }

  private id(prefix: string): string {
    return `${prefix}_${randomUUID().replace(/-/g, '')}`;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private fullName(l: Learner): string {
    return [l.lastName, l.firstName, l.middleName].filter(Boolean).join(' ').trim();
  }
}
```

> If ESLint flags `fullName` as unused, delete the method (НМО gather-errors use `learnerId: ''`/`fullName: ''` like ФРДО). It is included only for parity; remove rather than suppress if lint complains.

- [ ] **Step 4: Run — verify pass** (after Task 15 Step 1 state arrays exist). Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/mvp/nmo-registry/nmo-registry.service.ts apps/backend/src/modules/mvp/nmo-registry/nmo-registry.service.test.ts
git commit -m "feat(backend): Минздрав-НМО export service (issued documents) + test"
```

---

## Task 15: Wiring — state arrays, collections, controller, module

**Files:**

- Modify: `apps/backend/src/modules/mvp/infrastructure/in-memory-mvp.state.ts`
- Modify: `apps/backend/src/modules/mvp/infrastructure/mvp-collections.ts`
- Create: `apps/backend/src/modules/mvp/nmo-registry/nmo-registry.controller.ts`
- Modify: `apps/backend/src/modules/mvp/mvp.module.ts`

- [ ] **Step 1: State arrays** (`in-memory-mvp.state.ts`) — add `NmoBatch`, `NmoRecord` to type imports; after the Ростехнадзор arrays:

```ts
  // Phase 6 — Минздрав-НМО (НМО, ЗЕТ): durable export batches + records.
  nmoRegistryBatches: NmoBatch[] = [];
  nmoRegistryRecords: NmoRecord[] = [];
```

- [ ] **Step 2: Collections** (`mvp-collections.ts`) — after the Ростехнадзор entries:

```ts
  'nmoRegistryBatches',
  'nmoRegistryRecords',
```

- [ ] **Step 3: Controller** — identical to Task 7 Step 3 but `nmo-registry` prefix, `NmoRegistryService`, `CreateNmoExportDto`, `exportNmoRegistry`:

```ts
import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  UseGuards,
  UseInterceptors
} from '@nestjs/common';

import { NmoRegistryService } from './nmo-registry.service.js';
import { assertValidDto } from '../../../common/app-validation.pipe.js';
import { CurrentContext } from '../../../common/decorators/current-context.decorator.js';
import { TenantGuard } from '../../../common/guards/tenant.guard.js';
import { RequirePermissions } from '../../iam/permission.decorator.js';
import { PermissionGuard } from '../../iam/permission.guard.js';
import { MvpRequestPersistenceInterceptor } from '../infrastructure/mvp-request-persistence.interceptor.js';
import { CreateNmoExportDto } from '../nmo-registry-export.dto.js';

import type { RequestContext } from '../../../common/context/request-context.js';

@Controller('nmo-registry')
@UseInterceptors(MvpRequestPersistenceInterceptor)
@UseGuards(TenantGuard)
export class NmoRegistryController {
  constructor(@Inject(NmoRegistryService) private readonly service: NmoRegistryService) {}

  @Post('exports')
  @UseGuards(PermissionGuard)
  @RequirePermissions('regulatory.export.write')
  async createExport(@CurrentContext() ctx: RequestContext, @Body() body: unknown) {
    const dto = assertValidDto(CreateNmoExportDto, body);
    return this.service.exportNmoRegistry(ctx.tenantId!, dto, ctx);
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

- [ ] **Step 4: Register in `mvp.module.ts`** — imports:

```ts
import { NmoRegistryController } from './nmo-registry/nmo-registry.controller.js';
import { NmoRegistryService } from './nmo-registry/nmo-registry.service.js';
import { NmoXlsxWriter } from './nmo-registry/nmo-xlsx.writer.js';
```

`controllers` — after `RostechnadzorRegistryController,`:

```ts
    NmoRegistryController,
```

`providers` — after the Ростехнадзор provider block:

```ts
    NmoXlsxWriter,
    { provide: NmoRegistryService, scope: Scope.REQUEST, useClass: NmoRegistryService },
```

- [ ] **Step 5: Verify**

Run: `pnpm typecheck` → PASS
Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/nmo-registry/nmo-registry.service.test.ts --no-file-parallelism` → PASS

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/mvp/infrastructure/in-memory-mvp.state.ts apps/backend/src/modules/mvp/infrastructure/mvp-collections.ts apps/backend/src/modules/mvp/nmo-registry/nmo-registry.controller.ts apps/backend/src/modules/mvp/mvp.module.ts
git commit -m "feat(backend): wire Минздрав-НМО registry (state, collections, controller, module)"
```

---

## Task 16: Permission boundary in `mvp.http.integration.test.ts`

**Files:**

- Modify: `apps/backend/src/modules/mvp/mvp.http.integration.test.ts`

- [ ] **Step 1: Stub endpoints** — after the Ростехнадзор stub block:

```ts
      // Phase 6 — Минздрав-НМО registry export (POST requires write; GET requires read)
      @Post('nmo-registry/exports')
      @RequirePermissions('regulatory.export.write')
      createNmoExport(
        @CurrentContext() context: { tenantId?: string; userId?: string },
        @Body() body: { from?: string }
      ) {
        return { batchId: 'nmb_stub', tenantId: context.tenantId, from: body.from ?? null };
      }

      @Get('nmo-registry/exports')
      @RequirePermissions('regulatory.export.read')
      listNmoExports(@CurrentContext() context: { tenantId?: string }) {
        return { items: [], tenantId: context.tenantId };
      }
```

- [ ] **Step 2: Boundary tests** — mirror Task 8 Step 2 with `nmo-registry` path + `nmb_stub`.

```ts
describe('Минздрав-НМО registry permission boundary', () => {
  it('POST /nmo-registry/exports — 403 without regulatory.export.write', async () => {
    iamServiceMock.resolvePermissions.mockResolvedValueOnce(['regulatory.export.read']);
    const response = await fetch(`${apiBaseUrl}/nmo-registry/exports`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({})
    });
    expect(response.status).toBe(403);
  });

  it('POST /nmo-registry/exports — 201 with regulatory.export.write', async () => {
    iamServiceMock.resolvePermissions.mockResolvedValueOnce(['regulatory.export.write']);
    const response = await fetch(`${apiBaseUrl}/nmo-registry/exports`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ from: '2026-01-01' })
    });
    expect(response.status).toBe(201);
    expect((await response.json()).data.batchId).toBe('nmb_stub');
  });

  it('GET /nmo-registry/exports — 403 without regulatory.export.read', async () => {
    iamServiceMock.resolvePermissions.mockResolvedValueOnce([]);
    const response = await fetch(`${apiBaseUrl}/nmo-registry/exports`, { headers: authHeaders });
    expect(response.status).toBe(403);
  });

  it('GET /nmo-registry/exports — 200 with regulatory.export.read', async () => {
    iamServiceMock.resolvePermissions.mockResolvedValueOnce(['regulatory.export.read']);
    const response = await fetch(`${apiBaseUrl}/nmo-registry/exports`, { headers: authHeaders });
    expect(response.status).toBe(200);
  });
});
```

- [ ] **Step 3: Run** → `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/mvp.http.integration.test.ts --no-file-parallelism` PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/modules/mvp/mvp.http.integration.test.ts
git commit -m "test(backend): Минздрав-НМО export permission boundary (4 cases)"
```

---

# FRONTEND

## Task 17: gov-export types + api + hooks

**Files:**

- Modify: `apps/frontend/src/features/gov-export/types.ts`
- Modify: `apps/frontend/src/features/gov-export/api.ts`
- Modify: `apps/frontend/src/features/gov-export/hooks.ts`

- [ ] **Step 1: Append frontend types** (`types.ts`) — mirror the backend `mvp.types.ts` blocks (no `BaseEntity`; inline `id/tenantId/createdAt/updatedAt/status`):

```ts
// === Ростехнадзор (промышленная безопасность) — Phase 6 ===

export interface RostechnadzorRow {
  enrollmentId: string;
  learnerId: string;
  lastName: string;
  firstName: string;
  middleName: string;
  fullName: string;
  snils: string;
  position: string;
  employerName: string;
  employerInn: string;
  attestationArea: string;
  protocolNumber: string;
  knowledgeCheckDate: string;
  result: string;
}

export interface RostechnadzorRowError {
  enrollmentId: string;
  learnerId: string;
  fullName: string;
  field: string;
  message: string;
}

export interface RostechnadzorBatch {
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

export interface RostechnadzorExportOutcome {
  batchId: string;
  fileId?: string;
  total: number;
  exported: number;
  failed: number;
  rows: RostechnadzorRow[];
  errors: RostechnadzorRowError[];
}

// === Минздрав-НМО (НМО, ЗЕТ) — Phase 6 ===

export interface NmoRow {
  documentId: string;
  enrollmentId: string;
  learnerId: string;
  lastName: string;
  firstName: string;
  middleName: string;
  fullName: string;
  snils: string;
  specialty: string;
  programName: string;
  creditUnits: string;
  completionDate: string;
  documentNumber: string;
}

export interface NmoRowError {
  documentId: string;
  learnerId: string;
  fullName: string;
  field: string;
  message: string;
}

export interface NmoBatch {
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

export interface NmoExportOutcome {
  batchId: string;
  fileId?: string;
  total: number;
  exported: number;
  failed: number;
  rows: NmoRow[];
  errors: NmoRowError[];
}
```

- [ ] **Step 2: Append api methods** (`api.ts`) — add to the imports and the `govExportApi` object (before the closing `}`):

```ts
// (add to the type import block)
//   RostechnadzorBatch, RostechnadzorExportOutcome, NmoBatch, NmoExportOutcome

  createRostechnadzorExport: (
    session: UserSession,
    body: { groupId?: string; clientId?: string; enrolledFrom?: string; enrolledTo?: string }
  ): Promise<RostechnadzorExportOutcome> =>
    apiRequest<RostechnadzorExportOutcome>('/rostechnadzor-registry/exports', {
      method: 'POST',
      body,
      ...withAuth(session)
    }),

  listRostechnadzorBatches: (session: UserSession): Promise<RostechnadzorBatch[]> =>
    apiRequest<RostechnadzorBatch[]>('/rostechnadzor-registry/exports', withAuth(session)),

  getRostechnadzorBatchFileUrl: (session: UserSession, id: string): Promise<{ url: string }> =>
    apiRequest<{ url: string }>(`/rostechnadzor-registry/exports/${id}/file`, withAuth(session)),

  createNmoExport: (
    session: UserSession,
    body: { from?: string; to?: string; types?: ('certificate' | 'diploma')[]; groupId?: string; clientId?: string }
  ): Promise<NmoExportOutcome> =>
    apiRequest<NmoExportOutcome>('/nmo-registry/exports', {
      method: 'POST',
      body,
      ...withAuth(session)
    }),

  listNmoBatches: (session: UserSession): Promise<NmoBatch[]> =>
    apiRequest<NmoBatch[]>('/nmo-registry/exports', withAuth(session)),

  getNmoBatchFileUrl: (session: UserSession, id: string): Promise<{ url: string }> =>
    apiRequest<{ url: string }>(`/nmo-registry/exports/${id}/file`, withAuth(session))
```

> The last existing method (`getEisotTestingBatchFileUrl`) has no trailing comma before `}`. Add a comma after it, then append the block above.

- [ ] **Step 3: Append hooks** (`hooks.ts`) — mirror `useFrdoRegistryBatches`, add `RostechnadzorBatch`/`NmoBatch` to type imports:

```ts
export const useRostechnadzorBatches = (live = false) => {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['govExport', 'rostechnadzorBatches'],
    enabled: Boolean(session),
    queryFn: (): Promise<RostechnadzorBatch[]> => govExportApi.listRostechnadzorBatches(session!),
    refetchInterval: live ? 15_000 : undefined
  });
  useEffect(() => {
    if (!session) void queryClient.invalidateQueries({ queryKey: ['govExport'] });
  }, [queryClient, session]);
  return {
    data: query.data ?? ([] as RostechnadzorBatch[]),
    loading: query.isLoading,
    error: query.error instanceof Error ? query.error.message : null,
    refetch: async () => {
      await query.refetch();
    }
  };
};

export const useNmoBatches = (live = false) => {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['govExport', 'nmoBatches'],
    enabled: Boolean(session),
    queryFn: (): Promise<NmoBatch[]> => govExportApi.listNmoBatches(session!),
    refetchInterval: live ? 15_000 : undefined
  });
  useEffect(() => {
    if (!session) void queryClient.invalidateQueries({ queryKey: ['govExport'] });
  }, [queryClient, session]);
  return {
    data: query.data ?? ([] as NmoBatch[]),
    loading: query.isLoading,
    error: query.error instanceof Error ? query.error.message : null,
    refetch: async () => {
      await query.refetch();
    }
  };
};
```

- [ ] **Step 4: Verify** → `pnpm --filter @cdoprof/frontend exec tsc --noEmit` (or `pnpm typecheck`) PASS; `npx eslint apps/frontend/src/features/gov-export/{types,api,hooks}.ts --max-warnings=0` clean.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/gov-export/types.ts apps/frontend/src/features/gov-export/api.ts apps/frontend/src/features/gov-export/hooks.ts
git commit -m "feat(frontend): gov-export types/api/hooks for Ростехнадзор + НМО"
```

---

## Task 18: gov-export page sections + contract test

**Files:**

- Modify: `apps/frontend/app/gov-export/page.tsx`
- Modify: `apps/frontend/src/features/gov-export/api.contract.test.ts`

- [ ] **Step 1: Add contract test cases** (`api.contract.test.ts`) — mirror the existing FRDO/ЕИСОТ `it` blocks for the four new methods. Representative:

```ts
it('createRostechnadzorExport posts to /rostechnadzor-registry/exports and unwraps batchId', async () => {
  fetchMock.mockResolvedValueOnce(
    new Response(
      envelope({ batchId: 'rtb_1', total: 1, exported: 1, failed: 0, rows: [], errors: [] }),
      { status: 201 }
    )
  );
  const result = await govExportApi.createRostechnadzorExport(session, { groupId: 'g1' });
  expect(result.batchId).toBe('rtb_1');
  const [url, init] = fetchMock.mock.calls[0]!;
  expect(String(url)).toContain('/rostechnadzor-registry/exports');
  expect(init?.method).toBe('POST');
});

it('listRostechnadzorBatches GETs /rostechnadzor-registry/exports and unwraps array', async () => {
  fetchMock.mockResolvedValueOnce(new Response(envelope([{ id: 'rtb_1' }]), { status: 200 }));
  const result = await govExportApi.listRostechnadzorBatches(session);
  expect(result[0]!.id).toBe('rtb_1');
});

it('createNmoExport posts to /nmo-registry/exports and unwraps batchId', async () => {
  fetchMock.mockResolvedValueOnce(
    new Response(
      envelope({ batchId: 'nmb_1', total: 1, exported: 1, failed: 0, rows: [], errors: [] }),
      { status: 201 }
    )
  );
  const result = await govExportApi.createNmoExport(session, { from: '2026-01-01' });
  expect(result.batchId).toBe('nmb_1');
  expect(String(fetchMock.mock.calls[0]![0])).toContain('/nmo-registry/exports');
});

it('listNmoBatches GETs /nmo-registry/exports and unwraps array', async () => {
  fetchMock.mockResolvedValueOnce(new Response(envelope([{ id: 'nmb_1' }]), { status: 200 }));
  const result = await govExportApi.listNmoBatches(session);
  expect(result[0]!.id).toBe('nmb_1');
});
```

- [ ] **Step 2: Run contract test — verify fail** → method not found.

Run: `pnpm --filter @cdoprof/frontend exec vitest run src/features/gov-export/api.contract.test.ts --no-file-parallelism`

- [ ] **Step 3: Add two page sections** (`page.tsx`) — mirror the `<SectionCard title="ФИС ФРДО (Рособрнадзор)">` block (`page.tsx:322-396`) and the ЕИСОТ block (`:398-...`). For each new registry:
  - import `useRostechnadzorBatches`, `useNmoBatches` from `../../src/features/gov-export/hooks`.
  - add section state: `const rostechBatches = useRostechnadzorBatches();` + `useState` for busy/error/filter fields (groupId/clientId/enrolledFrom/enrolledTo for Ростехнадзор; from/to/groupId/clientId for НМО) — copy the FRDO/ЕИСОТ state shape.
  - add an `onCreateRostechnadzor`/`onCreateNmo` handler calling `govExportApi.createRostechnadzorExport`/`createNmoExport`, then `void rostechBatches.refetch()`.
  - render a `<SectionCard title="Ростехнадзор — аттестация по промышленной безопасности">` with the provisional ⚠️ warning text, the filter inputs, a «Сформировать выгрузку Ростехнадзор» button, and a «История выгрузок» list with per-batch download via `getRostechnadzorBatchFileUrl`. Same for НМО (`title="Минздрав-НМО — непрерывное медобразование (ЗЕТ)"`, download via `getNmoBatchFileUrl`).
  - Provisional warning text (Ростехнадзор): `⚠️ Формат выгрузки предварительный (не сверен с эталоном Ростехнадзора). Перед подачей сверьте колонки и область аттестации.`
  - Provisional warning text (НМО): `⚠️ Формат выгрузки предварительный (не сверен с эталоном портала НМО). Специальность и ЗЕТ требуют проверки перед подачей.`

  Keep each section self-contained; do not refactor the existing three.

- [ ] **Step 4: Run contract test — verify pass.**

- [ ] **Step 5: Verify** → `pnpm typecheck` PASS; `npx eslint apps/frontend/app/gov-export/page.tsx apps/frontend/src/features/gov-export/api.contract.test.ts --max-warnings=0` clean.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/app/gov-export/page.tsx apps/frontend/src/features/gov-export/api.contract.test.ts
git commit -m "feat(frontend): gov-export page sections + contract tests for Ростехнадзор + НМО"
```

---

## Task 19: e2e route-access + pipeline smoke

**Files:**

- Create: `apps/frontend/src/e2e/rostechnadzor-registry-export.e2e.test.ts`
- Create: `apps/frontend/src/e2e/nmo-registry-export.e2e.test.ts`

- [ ] **Step 1: Write the e2e tests** — open `apps/frontend/src/e2e/frdo-registry-export.e2e.test.ts` and replicate it for each new registry: assert route access to `/gov-export` for an admin with `regulatory.export.*`, dynamic-import smoke of the page module, and the api method shape. Match that file's structure exactly (no React mount — `evaluateRouteAccess` / dynamic import convention).

- [ ] **Step 2: Run** → both files green.

Run: `pnpm --filter @cdoprof/frontend exec vitest run src/e2e/rostechnadzor-registry-export.e2e.test.ts src/e2e/nmo-registry-export.e2e.test.ts --no-file-parallelism`

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/e2e/rostechnadzor-registry-export.e2e.test.ts apps/frontend/src/e2e/nmo-registry-export.e2e.test.ts
git commit -m "test(frontend): e2e route-access + smoke for Ростехнадзор + НМО exports"
```

---

# CLOSEOUT

## Task 20: Quality gate + docs handoff

**Files:**

- Modify: `README.md` (§2 AI Agent State)
- Modify: `LMS_AGENT_HANDOFF.md` (append §5.NN)
- Modify: `docs/superpowers/plans/PLANS_STATUS.md` (mark Phase 6 registries progress)
- Modify: this plan file (tick checkboxes)

- [ ] **Step 1: Full isolated verification**

```bash
pnpm typecheck
pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/rostechnadzor-registry src/modules/mvp/nmo-registry src/modules/mvp/rostechnadzor-registry-export.dto-validation.test.ts src/modules/mvp/nmo-registry-export.dto-validation.test.ts src/modules/mvp/mvp.http.integration.test.ts --no-file-parallelism
pnpm --filter @cdoprof/frontend exec vitest run src/features/gov-export src/e2e/rostechnadzor-registry-export.e2e.test.ts src/e2e/nmo-registry-export.e2e.test.ts --no-file-parallelism
npx eslint apps/backend/src/modules/mvp/rostechnadzor-registry apps/backend/src/modules/mvp/nmo-registry apps/frontend/src/features/gov-export apps/frontend/app/gov-export/page.tsx --max-warnings=0
```

Expected: all green; typecheck 8/8.

- [ ] **Step 2: Update README §2** — Current Stage / Last Completed Task / Current Task / Next Task / Last Updated At=2026-06-14 / By.

- [ ] **Step 3: Append `LMS_AGENT_HANDOFF.md` §5.NN** — summary, files changed (two modules + wiring + frontend), test status, deviations (PROVISIONAL columns; no migration; `attestationArea`/`specialty`/`creditUnits` swap-points).

- [ ] **Step 4: Update `PLANS_STATUS.md`** — note Phase 6 registries: Ростехнадзор + Минздрав-НМО shipped (PROVISIONAL), remainder of Phase 6 = ЭП/НЭП only.

- [ ] **Step 5: Commit**

```bash
git add README.md LMS_AGENT_HANDOFF.md docs/superpowers/plans/PLANS_STATUS.md docs/superpowers/plans/2026-06-14-phase-6-rostechnadzor-nmo-registries.md
git commit -m "docs: Phase 6 Ростехнадзор + Минздрав-НМО exporters handoff + plan closeout"
```

- [ ] **Step 6: Finish the branch** — invoke `superpowers:finishing-a-development-branch` to open the PR.

---

## Self-Review notes

- **Spec coverage:** §3.1 shared decisions → applied in every module (perms reused, no migration, XLSX-only, durable batches, partial-success, СНИЛС/date helpers). §3.2 file structure → Tasks 2-7 (Ростехнадзор), 10-15 (НМО). §3.3 wiring → Tasks 7, 15. §3.4 permission boundary → Tasks 8, 16. §4 Ростехнадзор (completed+passed enrollments, область swap-point, columns) → Tasks 1-8. §5 НМО (issued documents, специальность/ЗЕТ swap-points, columns) → Tasks 9-16. §7 frontend → Tasks 17-19. §8 testing → tests in every task. §9 out-of-scope (no XML, no import, no classifier migration) → honored (no XML writer, no import route, no migration tasks). Full coverage.
- **Placeholder scan:** all production code blocks are complete and exact; test bodies are concrete. Page.tsx (Task 18 Step 3) is described as a mirror of an existing committed section rather than reproduced in full — this is a deliberate DRY pointer to a large existing JSX block, with the exact source lines, new titles, warning strings, hook names, and download methods specified.
- **Type consistency:** `RostechnadzorRow`/`RostechnadzorBundle`/`RostechnadzorBatch`/`RostechnadzorRecord`/`RostechnadzorExportOutcome` and `Nmo*` names are used identically across types (Task 1/9), rows (2/10), preflight (3/11), writer (4/12), service (6/14), wiring (7/15), frontend (17). State arrays `rostechnadzorRegistryBatches`/`rostechnadzorRegistryRecords`/`nmoRegistryBatches`/`nmoRegistryRecords` consistent between service, state declaration, and collections. Service method names `exportRostechnadzorRegistry`/`exportNmoRegistry`/`listBatches`/`getBatchWithRecords`/`getBatchDownloadUrl` match controller + tests + frontend api routes.
- **TDD ordering caveat flagged:** Tasks 6/14 (service) depend on Tasks 7/15 (state arrays). Both service tasks note that the state arrays (Task 7/15 Step 1) must land before the service test compiles. Implementers using strict red-green should add the two state arrays first.

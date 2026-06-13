# Phase 10 Track A — Excel Report Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin builds an arbitrary Excel report (pick entity → fields → filters → preview → download XLSX → save/load template) without a developer.

**Architecture:** A declarative backend entity registry + a pure `buildReport` engine + an `exceljs` writer, exposed as 6 endpoints on `MvpController` under `enrollments.read/write` (no migration, no new permission, no S3). Saved templates live in a new MVP-state JSON collection. Frontend `features/report-builder/` drives a `/admin/reports/builder` page; XLSX is returned base64-in-envelope and downloaded client-side.

**Tech Stack:** NestJS + TypeScript (backend), `exceljs ^4.4.0` (already a dep), Next.js 15 App Router + TypeScript (frontend), Vitest, `@cdoprof/api-contracts` (hand-written contract source).

Spec: [docs/superpowers/specs/2026-06-13-phase-10a-excel-report-builder-design.md](../specs/2026-06-13-phase-10a-excel-report-builder-design.md)

---

## File Structure

**Backend — new (`apps/backend/src/modules/mvp/report-builder/`):**

- `report-types.ts` — `ReportFieldDef`, `ReportFilterDef`, `ReportEntityDef`, `ResolveCtx`, `ReportRequest`, `ReportPreview`, `ReportColumn`, `ReportTemplate`.
- `report-entities.ts` — registry of the 3 entities (learners/enrollments/documents) + `buildResolveCtx`.
- `build-report.ts` — pure `buildReport(input)` (filter → project → cap → total).
- `report-xlsx.writer.ts` — `ReportXlsxWriter` (dynamic columns).
- `report-builder.dto.ts` — class-validator request DTOs.
- Tests: `report-entities.test.ts`, `build-report.test.ts`, `report-xlsx.writer.test.ts`, `report-builder.dto-validation.test.ts`, `report-builder.service.test.ts`.

**Backend — modify:**

- `mvp.types.ts` — add report-builder types + `reportTemplates` to state shape.
- `infrastructure/mvp-collections.ts` — add `'reportTemplates'`.
- `infrastructure/in-memory-mvp-state.ts` (or wherever state arrays init) — init `reportTemplates: []`.
- `mvp.service.ts` — 6 methods.
- `mvp.controller.ts` — 6 endpoints.
- `mvp.http.integration.test.ts` — permission boundary for new routes.

**Contracts — modify:**

- `packages/api-contracts/src/domains/mvp-metrics/contracts.ts` — add report-builder DTOs.

**Frontend — new (`apps/frontend/src/features/report-builder/`):**

- `types.ts`, `api.ts`, `report-builder.ts` (pure logic), `screens.tsx`.
- `app/admin/reports/builder/page.tsx`.
- Tests: `report-builder.test.ts`, `api.contract.test.ts`, `report-builder.e2e.test.ts` (in `src/e2e/`).

**Frontend — modify:**

- `src/features/navigation/model.ts` — `routeMeta` + `navigationModel`.

---

## Task 1: Backend types + entity registry

**Files:**

- Create: `apps/backend/src/modules/mvp/report-builder/report-types.ts`
- Create: `apps/backend/src/modules/mvp/report-builder/report-entities.ts`
- Test: `apps/backend/src/modules/mvp/report-builder/report-entities.test.ts`
- Modify: `apps/backend/src/modules/mvp/mvp.types.ts` (add `ReportTemplate`, `ReportColumn`, `ReportRequest`, `ReportPreview`, `ReportFilterValue`)

- [ ] **Step 1: Write `report-types.ts`**

```ts
export type ReportFieldType = 'string' | 'number' | 'date' | 'enum';
export type ReportEntityKey = 'learners' | 'enrollments' | 'documents';
export type ReportCellValue = string | number | null;

export interface ResolveCtx {
  courseTitleById: Map<string, string>;
  groupById: Map<string, { name: string; counterpartyId?: string }>;
  clientNameById: Map<string, string>;
  learnerNameById: Map<string, string>;
  courseProgressByEnrollment: Map<string, number>; // 0..100
}

export interface ReportFieldDef<Row = unknown> {
  key: string;
  header: string;
  type: ReportFieldType;
  resolve: (row: Row, ctx: ResolveCtx) => ReportCellValue;
}

export type ReportFilterKind = 'eq' | 'date_from' | 'date_to';
export interface ReportFilterDef<Row = unknown> {
  key: string;
  label: string;
  kind: ReportFilterKind;
  type: ReportFieldType;
  apply: (row: Row, value: string, ctx: ResolveCtx) => boolean;
}

export interface ReportEntityDef<Row = unknown> {
  key: ReportEntityKey;
  label: string;
  fields: ReportFieldDef<Row>[];
  filters: ReportFilterDef<Row>[];
}

export interface ReportFilterValue {
  key: string;
  value: string;
}
export interface ReportColumn {
  key: string;
  header: string;
  type: ReportFieldType;
}
```

- [ ] **Step 2: Add persisted/DTO types to `mvp.types.ts`** (near `KpiSnapshotDto`):

```ts
export interface ReportTemplate extends BaseEntity {
  name: string;
  entityKey: 'learners' | 'enrollments' | 'documents';
  selectedFields: string[];
  filters: { key: string; value: string }[];
  createdBy?: string;
}
export interface ReportPreviewDto {
  columns: { key: string; header: string; type: 'string' | 'number' | 'date' | 'enum' }[];
  rows: Record<string, string | number | null>[];
  total: number;
  truncated: boolean;
}
export interface ReportExportDto {
  fileName: string;
  mimeType: string;
  contentBase64: string;
}
export interface ReportEntitiesMetaDto {
  entities: {
    key: string;
    label: string;
    fields: { key: string; header: string; type: string }[];
    filters: { key: string; label: string; kind: string; type: string }[];
  }[];
}
```

- [ ] **Step 3: Write the failing test `report-entities.test.ts`** — assert each entity exposes expected field keys and that resolvers + a couple of filters behave. Example:

```ts
import { describe, expect, it } from 'vitest';
import { REPORT_ENTITIES, getEntity } from './report-entities.js';

const ctx = {
  courseTitleById: new Map([['c1', 'ОТ-1']]),
  groupById: new Map([['g1', { name: 'Группа А', counterpartyId: 'cp1' }]]),
  clientNameById: new Map([['cp1', 'ООО Ромашка']]),
  learnerNameById: new Map([['l1', 'Иванов Иван Иванович']]),
  courseProgressByEnrollment: new Map([['e1', 75]])
};

describe('REPORT_ENTITIES', () => {
  it('enrollments entity resolves attached fields', () => {
    const ent = getEntity('enrollments');
    const row = {
      id: 'e1',
      learnerId: 'l1',
      groupId: 'g1',
      status: 'active',
      enrolledAt: '2026-01-02T00:00:00.000Z'
    } as never;
    const byKey = (k: string) => ent.fields.find((f) => f.key === k)!.resolve(row, ctx);
    expect(byKey('learnerName')).toBe('Иванов Иван Иванович');
    expect(byKey('groupName')).toBe('Группа А');
    expect(byKey('clientName')).toBe('ООО Ромашка');
    expect(byKey('progressPercent')).toBe(75);
    expect(byKey('status')).toBe('active');
  });
  it('getEntity throws on unknown key', () => {
    expect(() => getEntity('nope' as never)).toThrow();
  });
});
```

- [ ] **Step 4: Run, expect FAIL** (module not found). `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/report-builder/report-entities.test.ts --no-file-parallelism`

- [ ] **Step 5: Implement `report-entities.ts`** — define `REPORT_ENTITIES: ReportEntityDef[]` for learners/enrollments/documents with the fields listed in spec §4.1, attached-field resolvers via `ctx`, filters (status `eq`, course/group/client `eq`, enrolled/issued `date_from`/`date_to`). Add `getEntity(key)` (throws `Error` on unknown) and `REPORT_ENTITY_META` derivation. Note: documents rows are the shape returned by `DocumentsService.listDocuments` — resolve learner/course names via ctx where ids are present, else raw fields.

- [ ] **Step 6: Run, expect PASS.**

- [ ] **Step 7: Commit** `feat(backend): report-builder entity registry + types`

---

## Task 2: Pure `buildReport` engine

**Files:**

- Create: `apps/backend/src/modules/mvp/report-builder/build-report.ts`
- Test: `apps/backend/src/modules/mvp/report-builder/build-report.test.ts`

- [ ] **Step 1: Write failing test** covering: projects only selectedFields in order; applies `eq` + `date_from`/`date_to` filters; `total` reflects pre-cap count; `limit` caps rows and sets `truncated`; unknown field key → throws; empty selectedFields → throws.

```ts
import { describe, expect, it } from 'vitest';
import { buildReport } from './build-report.js';
import { getEntity } from './report-entities.js';

const ctx = {
  courseTitleById: new Map(),
  groupById: new Map(),
  clientNameById: new Map(),
  learnerNameById: new Map([
    ['l1', 'A'],
    ['l2', 'B']
  ]),
  courseProgressByEnrollment: new Map()
};
const rows = [
  {
    id: 'e1',
    learnerId: 'l1',
    groupId: 'g1',
    status: 'active',
    enrolledAt: '2026-01-01T00:00:00.000Z'
  },
  {
    id: 'e2',
    learnerId: 'l2',
    groupId: 'g1',
    status: 'completed',
    enrolledAt: '2026-03-01T00:00:00.000Z'
  }
] as never[];

it('filters by status eq and projects fields in order', () => {
  const out = buildReport({
    entity: getEntity('enrollments'),
    selectedFields: ['status', 'learnerName'],
    filters: [{ key: 'status', value: 'completed' }],
    rows,
    ctx
  });
  expect(out.columns.map((c) => c.key)).toEqual(['status', 'learnerName']);
  expect(out.rows).toEqual([{ status: 'completed', learnerName: 'B' }]);
  expect(out.total).toBe(1);
  expect(out.truncated).toBe(false);
});
it('caps with limit and marks truncated', () => {
  const out = buildReport({
    entity: getEntity('enrollments'),
    selectedFields: ['status'],
    filters: [],
    rows,
    ctx,
    limit: 1
  });
  expect(out.rows).toHaveLength(1);
  expect(out.total).toBe(2);
  expect(out.truncated).toBe(true);
});
it('throws on empty fields / unknown field', () => {
  expect(() =>
    buildReport({ entity: getEntity('enrollments'), selectedFields: [], filters: [], rows, ctx })
  ).toThrow();
  expect(() =>
    buildReport({
      entity: getEntity('enrollments'),
      selectedFields: ['ghost'],
      filters: [],
      rows,
      ctx
    })
  ).toThrow();
});
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement `buildReport`:**

```ts
export interface BuildReportInput {
  entity: ReportEntityDef;
  selectedFields: string[];
  filters: ReportFilterValue[];
  rows: unknown[];
  ctx: ResolveCtx;
  limit?: number;
}
export interface BuildReportResult {
  columns: ReportColumn[];
  rows: Record<string, ReportCellValue>[];
  total: number;
  truncated: boolean;
}
export function buildReport(input: BuildReportInput): BuildReportResult {
  const { entity, selectedFields, filters, rows, ctx, limit } = input;
  if (selectedFields.length === 0) throw new Error('no_fields_selected');
  const fieldDefs = selectedFields.map((k) => {
    const def = entity.fields.find((f) => f.key === k);
    if (!def) throw new Error(`unknown_field:${k}`);
    return def;
  });
  const filterDefs = filters.map((fv) => {
    const def = entity.filters.find((f) => f.key === fv.key);
    if (!def) throw new Error(`unknown_filter:${fv.key}`);
    return { def, value: fv.value };
  });
  const matched = rows.filter((r) =>
    filterDefs.every(({ def, value }) => value === '' || def.apply(r, value, ctx))
  );
  const total = matched.length;
  const capped = typeof limit === 'number' ? matched.slice(0, limit) : matched;
  const projected = capped.map((r) =>
    fieldDefs.reduce<Record<string, ReportCellValue>>((acc, def) => {
      acc[def.key] = def.resolve(r, ctx);
      return acc;
    }, {})
  );
  return {
    columns: fieldDefs.map((d) => ({ key: d.key, header: d.header, type: d.type })),
    rows: projected,
    total,
    truncated: typeof limit === 'number' && total > capped.length
  };
}
```

- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** `feat(backend): pure buildReport engine`

---

## Task 3: XLSX writer

**Files:**

- Create: `apps/backend/src/modules/mvp/report-builder/report-xlsx.writer.ts`
- Test: `apps/backend/src/modules/mvp/report-builder/report-xlsx.writer.test.ts`

- [ ] **Step 1: Write failing test** (mirror `ot-registry-xlsx.writer.test.ts`): build buffer from `{columns, rows}`, read back via `new ExcelJS.Workbook().xlsx.load(buf)`, assert header row = headers, first data row values, bold header. Date-typed cells render as the ISO/readable string.

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement `ReportXlsxWriter`:**

```ts
import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import type { ReportColumn, ReportCellValue } from './report-types.js';

@Injectable()
export class ReportXlsxWriter {
  readonly contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  async build(columns: ReportColumn[], rows: Record<string, ReportCellValue>[]): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Отчёт');
    ws.columns = columns.map((c) => ({
      header: c.header,
      key: c.key,
      width: Math.min(60, Math.max(12, c.header.length + 4))
    }));
    for (const r of rows) {
      ws.addRow(
        columns.reduce<Record<string, ReportCellValue>>((acc, c) => {
          acc[c.key] = r[c.key] ?? null;
          return acc;
        }, {})
      );
    }
    ws.getRow(1).font = { bold: true };
    return (await wb.xlsx.writeBuffer()) as unknown as Buffer;
  }
}
```

- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** `feat(backend): report-builder xlsx writer`

---

## Task 4: Request DTOs + validation

**Files:**

- Create: `apps/backend/src/modules/mvp/report-builder.dto.ts`
- Test: `apps/backend/src/modules/mvp/report-builder.dto-validation.test.ts`

- [ ] **Step 1: Write failing dto-validation test** (`plainToInstance` + `validateSync`, mirror an existing `*.dto-validation.test.ts`): valid preview/export request passes; missing `entityKey` fails; empty `selectedFields` fails (`@ArrayNotEmpty`); bad filter shape fails; template `name` `@MinLength(1)`.

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement DTOs** — `ReportFilterValueDto` (`@IsString key`, `@IsString value`), `BuildReportRequestDto` (`@IsIn(['learners','enrollments','documents']) entityKey`, `@IsArray @ArrayNotEmpty @IsString({each:true}) selectedFields`, `@IsArray @ValidateNested({each:true}) @Type(()=>ReportFilterValueDto) filters`), `SaveReportTemplateDto` (extends build request + `@IsString @MinLength(1) name`, optional `@IsString id`). Use the same decorators/imports as neighbouring DTOs.

- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** `feat(backend): report-builder request DTOs`

---

## Task 5: Service methods + state collection

**Files:**

- Modify: `apps/backend/src/modules/mvp/infrastructure/mvp-collections.ts` (add `'reportTemplates'`)
- Modify: state init file (`grep -rn "reportTemplates\|scormAttempts: \[\]\|scormAttempts = \[\]" apps/backend/src/modules/mvp/infrastructure` to find where arrays initialise; add `reportTemplates: []`)
- Modify: `apps/backend/src/modules/mvp/mvp.service.ts` (add 6 methods + import writer/engine/registry)
- Test: `apps/backend/src/modules/mvp/report-builder.service.test.ts`

- [ ] **Step 1: Add `'reportTemplates'` to `MVP_COLLECTIONS`** and init array in state; add `reportTemplates: ReportTemplate[]` to the `InMemoryMvpState` interface.

- [ ] **Step 2: Write failing service test** (`makeServices()` helper, see `learners-bulk-import.service.test.ts`):
  - `getReportEntitiesMeta()` returns 3 entities with fields/filters.
  - `previewReport(tenant, {entityKey:'enrollments', selectedFields:['status'], filters:[]})` returns rows only for that tenant (seed 2 tenants), `total`, `truncated` honoured by the preview cap (50).
  - `exportReport(...)` returns `{fileName endsWith '.xlsx', mimeType, contentBase64}` with non-empty base64 that ExcelJS can load.
  - `saveReportTemplate` creates (id assigned), then update by id mutates in place (same id, idempotent count), `listReportTemplates` tenant-scoped, `deleteReportTemplate` removes; each writes an audit entry (assert `auditService` called with `reports.template_created/_updated/_deleted`).
  - tenant isolation: tenant B cannot get/delete tenant A's template (throws not-found).

- [ ] **Step 3: Run, expect FAIL.**

- [ ] **Step 4: Implement methods** in `MvpService`:

```ts
private buildResolveCtx(tenantId: string): ResolveCtx { /* build maps from here(state.courses/groups/counterparties/learners/courseProgress) — mirror analytics-dashboard map construction */ }

getReportEntitiesMeta(): ReportEntitiesMetaDto { return { entities: REPORT_ENTITIES.map(...meta...) }; }

previewReport(tenantId: string, req: BuildReportRequestDto): ReportPreviewDto {
  const entity = getEntity(req.entityKey);
  const rows = this.loadReportRows(tenantId, req.entityKey); // learners/enrollments from state; documents via this.documentsService.listDocuments(tenantId, {})
  const r = buildReport({ entity, selectedFields: req.selectedFields, filters: req.filters, rows, ctx: this.buildResolveCtx(tenantId), limit: 50 });
  return { ...r };
}

async exportReport(tenantId: string, req: BuildReportRequestDto): Promise<ReportExportDto> {
  const entity = getEntity(req.entityKey);
  const rows = this.loadReportRows(tenantId, req.entityKey);
  const r = buildReport({ entity, selectedFields: req.selectedFields, filters: req.filters, rows, ctx: this.buildResolveCtx(tenantId), limit: 50_000 });
  const buf = await this.reportXlsxWriter.build(r.columns, r.rows);
  return { fileName: `report-${req.entityKey}-${tenantId.slice(0,8)}.xlsx`, mimeType: this.reportXlsxWriter.contentType, contentBase64: buf.toString('base64') };
}
// listReportTemplates / getReportTemplate (getById tenant-checked) / saveReportTemplate (create or update-by-id, audit) / deleteReportTemplate (audit)
```

- `loadReportRows`: switch on entityKey → `here(this.state.learners)`, `here(this.state.enrollments)`, or `this.documentsService.listDocuments(tenantId, {}).items` (confirm the return shape; map to rows).
- Throw `BadRequestException({code:'validation_error',...})` on engine errors (wrap `buildReport` throws).
- Instantiate `ReportXlsxWriter` (stateless) — either inject or `new ReportXlsxWriter()` in the method (writer has no deps). Prefer a private readonly field `= new ReportXlsxWriter()` to keep the 6-arg constructor unchanged.

- [ ] **Step 5: Run, expect PASS.**
- [ ] **Step 6: Verify `mvp-collections` regression test still green** (`pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/infrastructure --no-file-parallelism`).
- [ ] **Step 7: Commit** `feat(backend): report-builder service methods + reportTemplates collection`

---

## Task 6: Controller endpoints + permission boundary

**Files:**

- Modify: `apps/backend/src/modules/mvp/mvp.controller.ts` (6 endpoints next to `reports/analytics-dashboard`)
- Modify: `apps/backend/src/modules/mvp/mvp.http.integration.test.ts`

- [ ] **Step 1: Write failing http-integration assertions** (extend the stub-controller harness pattern in that file): `GET reports/builder/entities`, `POST reports/builder/preview`, `POST reports/builder/export`, `GET reports/builder/templates` require `enrollments.read` (403 without); `POST reports/builder/templates`, `DELETE reports/builder/templates/:id` require `enrollments.write` (403 without).

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement endpoints** (mirror `getAnalyticsDashboard` block at `mvp.controller.ts:515`):

```ts
@Get('reports/builder/entities')
@UseGuards(PermissionGuard) @RequirePermissions('enrollments.read')
getReportEntities() { return this.mvpService.getReportEntitiesMeta(); }

@Post('reports/builder/preview')
@UseGuards(PermissionGuard) @RequirePermissions('enrollments.read')
previewReport(@CurrentContext() c: RequestContext, @Body() body: unknown) {
  return this.mvpService.previewReport(c.tenantId!, assertValidDto(BuildReportRequestDto, body));
}

@Post('reports/builder/export')
@UseGuards(PermissionGuard) @RequirePermissions('enrollments.read')
exportReport(@CurrentContext() c: RequestContext, @Body() body: unknown) {
  return this.mvpService.exportReport(c.tenantId!, assertValidDto(BuildReportRequestDto, body));
}

@Get('reports/builder/templates')
@UseGuards(PermissionGuard) @RequirePermissions('enrollments.read')
listReportTemplates(@CurrentContext() c: RequestContext) { return this.mvpService.listReportTemplates(c.tenantId!); }

@Post('reports/builder/templates')
@UseGuards(PermissionGuard) @RequirePermissions('enrollments.write')
saveReportTemplate(@CurrentContext() c: RequestContext, @Body() body: unknown) {
  return this.mvpService.saveReportTemplate(c.tenantId!, assertValidDto(SaveReportTemplateDto, body), c);
}

@Delete('reports/builder/templates/:id')
@UseGuards(PermissionGuard) @RequirePermissions('enrollments.write')
deleteReportTemplate(@CurrentContext() c: RequestContext, @Param('id') id: string) {
  return this.mvpService.deleteReportTemplate(c.tenantId!, id, c);
}
```

(Ensure `Delete` is imported from `@nestjs/common`.)

- [ ] **Step 4: Run, expect PASS** (`pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/mvp.http.integration.test.ts --no-file-parallelism`).
- [ ] **Step 5: Commit** `feat(backend): report-builder endpoints + permission boundary`

---

## Task 7: API contracts

**Files:**

- Modify: `packages/api-contracts/src/domains/mvp-metrics/contracts.ts`

- [ ] **Step 1:** Add (hand-written, mirroring `AnalyticsDashboardDto` there): `ReportEntitiesMetaDto`, `BuildReportRequest`, `ReportPreviewResponse`, `ReportExportResponse`, `ReportTemplateDto`. Re-export from the package index if that domain is re-exported.
- [ ] **Step 2: Run** `pnpm contracts:typecheck` and `pnpm --filter @cdoprof/api-contracts test` — expect PASS. (Do NOT hand-edit `src/generated/*`; run `pnpm contracts:generate` if generation is required and commit the result.)
- [ ] **Step 3: Commit** `feat(contracts): report-builder DTOs`

---

## Task 8: Frontend feature module (api + pure logic)

**Files:**

- Create: `apps/frontend/src/features/report-builder/types.ts`
- Create: `apps/frontend/src/features/report-builder/report-builder.ts` (pure: validation, filter serialization, base64→Blob download helper kept separate/guarded for tests)
- Create: `apps/frontend/src/features/report-builder/api.ts`
- Test: `apps/frontend/src/features/report-builder/report-builder.test.ts`
- Test: `apps/frontend/src/features/report-builder/api.contract.test.ts`

- [ ] **Step 1: Write failing pure-logic test** — `canRun(state)` true only with entity + ≥1 field; `toRequest(state)` drops empty filters; `decodeBase64ToBlob` produces a Blob of the right type (guard: only call in jsdom-free way — test the base64→Uint8Array step as a pure function `base64ToBytes`).

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement `report-builder.ts`** — `canRun`, `toRequest`, `base64ToBytes` (pure, uses `atob`/`Buffer` guarded), and `triggerDownload(blob, fileName)` (DOM, not unit-tested).

- [ ] **Step 4: Write failing `api.contract.test.ts`** — `vi.stubGlobal('fetch', ...)` returning the `{data,meta}` envelope for `getEntities`, `preview`, `export`, template CRUD; assert `apiRequest` unwraps `data` and that `export` returns `{fileName,mimeType,contentBase64}`.

- [ ] **Step 5: Implement `api.ts`** using `apiRequest` from `src/lib/api/client.ts` (mirror an existing feature `api.ts`, e.g. `features/recertification/api.ts`).

- [ ] **Step 6: Run both tests, expect PASS.**
- [ ] **Step 7: Commit** `feat(frontend): report-builder api + pure logic`

---

## Task 9: Frontend screen + page + navigation + e2e

**Files:**

- Create: `apps/frontend/src/features/report-builder/screens.tsx`
- Create: `apps/frontend/app/admin/reports/builder/page.tsx`
- Modify: `apps/frontend/src/features/navigation/model.ts`
- Test: `apps/frontend/src/e2e/report-builder.e2e.test.ts`

- [ ] **Step 1: Write failing e2e** (match `admin-bulk-enrollment.e2e.test.ts` convention — `evaluateRouteAccess` for `/admin/reports/builder` granted to admin / denied to learner; dynamic-import smoke of the screen module).

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Add navigation** — `routeMeta['/admin/reports/builder']` (same access policy as analytics/reports) + `navigationModel` entry (label «Конструктор отчётов», under reports/analytics slot).

- [ ] **Step 4: Implement `ReportBuilderScreen`** — entity `<select>`, field checkboxes (from `getEntities`), filter rows, «Превью» → `DataTable` (`@cdoprof/ui`), «Скачать XLSX» → export + `triggerDownload`, «Сохранить шаблон» (name input) + templates list (load/delete). Mutations via `useState`+async/await `wrap` pattern (NOT React Query). Wrap page in `<ProtectedPage>`. State wrappers: `PageContainer`/`PageHeader`/`SectionCard`/`SectionError`/`LoadingState`.

- [ ] **Step 5: Implement `page.tsx`** — thin wrapper rendering the screen inside `<ProtectedPage>`.

- [ ] **Step 6: Run e2e, expect PASS.** Run `pnpm --filter @cdoprof/frontend exec vitest run src/e2e/report-builder.e2e.test.ts --no-file-parallelism`.

- [ ] **Step 7: Commit** `feat(frontend): report-builder screen + page + navigation`

---

## Task 10: Full verification + docs handoff

- [ ] **Step 1: Typecheck** `pnpm typecheck` → expect 8/8.
- [ ] **Step 2: Lint changed files** `npx eslint <changed files> --max-warnings=0` → clean.
- [ ] **Step 3: Targeted test sweep** — backend report-builder suites + `mvp.http.integration` + `mvp.infrastructure` + frontend report-builder + e2e (isolated `--no-file-parallelism` runs per CLAUDE.md Cyrillic gotcha).
- [ ] **Step 4: Manual acceptance** against spec §9 (entity→fields→filter→preview→download→save/load→permission 403s).
- [ ] **Step 5: Docs** — README §2 (Current/Next Task), `LMS_AGENT_HANDOFF.md` §5.121, tick this plan's boxes, cross-link spec. Note Tracks B & C remain (designs in spec §11).
- [ ] **Step 6: Commit** `docs: Phase 10 Track A handoff §5.121 + plan + README §2`
- [ ] **Step 7:** Push + open PR (`## Summary` + `## Test plan`).

---

## Self-Review notes

- **Spec coverage:** §1 flow → Tasks 8–9; §4.1 registry → Task 1; §4.2 engine → Task 2; §4.3 writer → Task 3; §4.4 service+state → Task 5; §4.5 endpoints+perms → Task 6; §4.6 download → Tasks 5/8; §4.7 frontend → Tasks 8–9; §7 tests → every task; contracts (§8) → Task 7; §9 acceptance → Task 10.
- **Permission reuse (D-A2):** `enrollments.read` for read/preview/export/list; `enrollments.write` for save/delete — no migration.
- **No-migration invariant:** only MVP-state JSON collection added (`reportTemplates`), registered in `mvp-collections.ts` (Task 5 Step 1) — the documented persistence pitfall.
- **Type consistency:** `entityKey` union `'learners'|'enrollments'|'documents'`, `ReportColumn{key,header,type}`, `truncated:boolean`, `contentBase64` used identically across backend types, contracts, and frontend.
- **Cross-module documents:** loaded via `DocumentsService.listDocuments` (confirmed exists) — confirm exact return shape (`.items`) at Task 5 Step 4.

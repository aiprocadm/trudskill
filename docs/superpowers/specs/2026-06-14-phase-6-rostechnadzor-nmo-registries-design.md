# Phase 6 — Ростехнадзор + Минздрав-НМО registry exporters (design)

**Date:** 2026-06-14
**Status:** Approved (brainstorming) → ready for implementation plan
**Author:** AI agent session (продолжай по ТЗ → Phase 6 «новые реестры»)

## 1. Context & goal

The Phase 6 «документы и гос-реестры» roadmap item is partially shipped: Wave 2
delivered three durable registry exporters — **ФРДО** (`frdo-registry/`, #225),
**ЕИСОТ-ОТ обученные** (`ot-registry/`, #222/#223), **ЕИСОТ «лица на тестирование»**
(`eisot-testing-registry/`, #226). The documented remainder of Phase 6 (per
[PLANS_STATUS §3](../plans/PLANS_STATUS.md)) is two more registries plus the
deferred ЭП/НЭП signature provider.

**Goal of this work:** add two more durable registry exporters following the exact
Wave 2 pattern:

- **Ростехнадзор** — реестр аттестации в области промышленной безопасности (ПБ).
- **Минздрав-НМО** — реестр освоения программ непрерывного медицинского образования
  (НМО, ЗЕТ).

The signature provider (ЭП/НЭП) is **out of scope** — it was deferred by the owner
and is tracked separately.

## 2. Provisional by design

Neither registry has an official format reference available to the owner yet (same
situation that produced the «PROVISIONAL» marking on all three existing exporters).
Therefore this work builds the **full export machinery** now and encodes a
best-effort column set, with every format-sensitive point marked as a swap-point.
When the owner obtains the official template/XSD, reconciliation is a localized edit
to the `COLUMNS` array (and possibly a follow-up migration for controlled
classifiers), not a rewrite.

This mirrors the established precedent: ЕИСОТ «лица на тестирование» shipped with
**no migration**, reusing existing learner/enrollment fields, and one swap-point.

## 3. Architecture — replicate the durable Wave 2 pattern

Each exporter is a self-contained module under `apps/backend/src/modules/mvp/`,
following ФРДО/ЕИСОТ structure exactly. No new abstraction is introduced; the two
modules are siblings of the existing three.

### 3.1 Shared decisions (both registries)

| Decision         | Choice                                                          | Rationale                                                                                                                                                                                               |
| ---------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Permissions      | Reuse `regulatory.export.read` / `regulatory.export.write`      | Same regulatory-export surface; no new permission/migration needed                                                                                                                                      |
| DB migration     | **None**                                                        | Source from existing learner/enrollment/document/program data (ЕИСОТ precedent). Controlled classifiers (ПБ области, НМО специальности) populated from existing program metadata as PROVISIONAL columns |
| Output format    | **XLSX only**                                                   | No official XML schema for either; ФРДО/ЕИСОТ made the same call. XML is a future swap-in (the ОТ module shows how)                                                                                     |
| Durability       | Batches + records collections in MVP-state                      | Matches all three existing exporters; admin can list past exports + re-download                                                                                                                         |
| Failure handling | Partial-success principle                                       | Valid rows export; per-row errors returned; `batchStatus: generated\|partial\|failed`                                                                                                                   |
| СНИЛС / dates    | Reuse `isValidSnilsChecksum`, `dd.mm.yyyy` formatter            | Established shared helpers                                                                                                                                                                              |
| Frontend         | Two new sections in existing `gov-export/` feature + admin page | Mirror the three existing sections; no novel UI                                                                                                                                                         |

### 3.2 Per-module file structure (6 source files + tests each)

For `<name>` ∈ { `rostechnadzor`, `nmo` }, under
`apps/backend/src/modules/mvp/<name>-registry/`:

- `<name>-registry.controller.ts` — 4 routes: `POST exports`, `GET exports`,
  `GET exports/:id`, `GET exports/:id/file`. Decorator stack identical to ФРДО:
  `@Controller('<name>-registry')` + `@UseInterceptors(MvpRequestPersistenceInterceptor)`
  - `@UseGuards(TenantGuard)`; per-route `@UseGuards(PermissionGuard)` +
    `@RequirePermissions('regulatory.export.read'|'.write')`.
- `<name>-registry.service.ts` — `Scope.REQUEST`. Gathers source bundles, builds
  rows, runs preflight, on ≥1 valid row builds XLSX → stores via files layer →
  registers durable batch + records, writes audit. Returns an outcome object.
- `<name>-registry-rows.ts` — pure `build<Name>Rows(bundles): <Name>Row[]`.
- `<name>-registry-preflight.ts` — pure per-row validation → `<Name>RowError[]`.
- `<name>-registry-xlsx.writer.ts` — `Injectable`; `COLUMNS` array (the swap-point)
  - `build(rows): Promise<Buffer>` via exceljs.
- `<name>-registry-export.dto.ts` — request filter DTO (`class-validator`).

Test siblings: `*-rows.test.ts`, `*-preflight.test.ts`, `*-xlsx.writer.test.ts`,
`*-registry.service.test.ts`, `*-export.dto-validation.test.ts`.

### 3.3 Wiring (3 touch-points per module)

- `mvp/infrastructure/mvp-collections.ts` — add `<name>RegistryBatches`,
  `<name>RegistryRecords`.
- `mvp/infrastructure/in-memory-mvp.state.ts` — add the two arrays + their types.
- `mvp/mvp.module.ts` — register controller, REQUEST-scoped service, XLSX writer.

### 3.4 Permission boundary

Add the new endpoints to `mvp.http.integration.test.ts` asserting the
`regulatory.export.read/write` boundary (the established stub-controller pattern).

## 4. Module 1 — Ростехнадзор (промышленная безопасность)

- **Module path:** `rostechnadzor-registry/`, route prefix `rostechnadzor-registry`.
- **Data source:** completed enrollments with the final exam passed (ОТ-style:
  `listEnrollments(tenantId, { group_id, enrolled_from, enrolled_to, page_size })`
  filtered to `status === 'completed'`). Protocol number/date resolved from the
  issued protocol/document, as ОТ does.
- **Row granularity:** one row per learner per attestation area. v1 emits **one row
  per completed enrollment** (the область column is provisional free-text from
  program meta); fan-out per area becomes a swap-point comment for when an official
  область-classifier exists.
- **PROVISIONAL `COLUMNS`:**

  | Header                 | key                  | Source                                                  |
  | ---------------------- | -------------------- | ------------------------------------------------------- |
  | Фамилия                | `lastName`           | parsed ФИО                                              |
  | Имя                    | `firstName`          | parsed ФИО                                              |
  | Отчество               | `middleName`         | parsed ФИО                                              |
  | СНИЛС                  | `snils`              | learner                                                 |
  | Должность              | `position`           | learner                                                 |
  | Работодатель           | `employerName`       | counterparty                                            |
  | ИНН работодателя       | `employerInn`        | counterparty                                            |
  | **Область аттестации** | `attestationArea`    | **swap-point — program meta/name**                      |
  | Номер протокола        | `protocolNumber`     | protocol/document                                       |
  | Дата проверки знаний   | `knowledgeCheckDate` | protocol/document date (dd.mm.yyyy)                     |
  | Результат              | `result`             | exam pass → `удовлетворительно` / `неудовлетворительно` |

- **Preflight:** ФИО present; СНИЛС optional but checksum-validated if present;
  protocol number present; date parseable. Invalid rows reported, valid rows export.

## 5. Module 2 — Минздрав-НМО (непрерывное медобразование)

- **Module path:** `nmo-registry/`, route prefix `nmo-registry`.
- **Data source:** issued documents (ФРДО-style:
  `documents.listIssuedDocuments(tenantId, { types, from, to })` filtered to
  non-revoked, non-archived). НМО reports completed education evidenced by a
  document.
- **Row granularity:** one row per issued document.
- **PROVISIONAL `COLUMNS`:**

  | Header                 | key              | Source                                         |
  | ---------------------- | ---------------- | ---------------------------------------------- |
  | Фамилия                | `lastName`       | parsed ФИО                                     |
  | Имя                    | `firstName`      | parsed ФИО                                     |
  | Отчество               | `middleName`     | parsed ФИО                                     |
  | СНИЛС                  | `snils`          | learner                                        |
  | **Специальность**      | `specialty`      | **swap-point — program meta/name**             |
  | Наименование программы | `programName`    | course/program                                 |
  | **ЗЕТ**                | `creditUnits`    | **swap-point — academic hours / program meta** |
  | Дата освоения          | `completionDate` | document issue/completion date (dd.mm.yyyy)    |
  | Номер документа        | `documentNumber` | generated document                             |

- **Preflight:** ФИО present; СНИЛС optional + checksum if present; program name
  present; completion date parseable; ЗЕТ numeric (provisional default from academic
  hours if meta absent). Partial-success.

## 6. Data flow (both modules, identical shape)

```
POST /<name>-registry/exports  { filter }
  → assertValidDto(<Name>ExportRequest, body)
  → service.createExport(tenantId, filter, ctx)
      → gather source bundles (enrollments | documents)
      → build<Name>Rows(bundles)               [pure]
      → preflight each row → errors             [pure]
      → if validRows ≥ 1:
          xlsx.build(validRows) → Buffer
          files.store(...) → fileId
        register batch { id, status, sourceFilterJson, totals, batchStatus, fileId? }
        register records (one per row, valid+failed)
        audit('regulatory.<name>_export_generated', ...)
      → return { batch, errors }
GET  /<name>-registry/exports            → list batches (durable)
GET  /<name>-registry/exports/:id        → batch + records
GET  /<name>-registry/exports/:id/file   → stream XLSX (404 if no file / all-failed)
```

## 7. Frontend

- `apps/frontend/src/features/gov-export/` — extend `api.ts` (`createRostechnadzorExport`,
  `listRostechnadzorBatches`, `getRostechnadzorBatchFileUrl`; same trio for `nmo`),
  `hooks.ts` (`useRostechnadzorBatches`, `useNmoBatches` with the existing polling
  pattern), `types.ts` (batch/row/error types).
- `apps/frontend/app/gov-export/page.tsx` — two new collapsible sections, each with a
  date-range (+ group/client for Ростехнадзор) filter, an «Сформировать» action, a
  batch list, and per-batch download. Mirror the existing ФРДО/ЕИСОТ sections.
- Tests: `gov-export/api.contract.test.ts` extension; gov-export e2e route-access +
  pipeline smoke (frontend `src/e2e/` convention — no React mount).

## 8. Testing strategy

Per module the standard trio + writer/rows units:

- **rows-builder unit** — bundle → row mapping, ФИО parse, date format, result mapping.
- **preflight unit** — each validation rule incl. СНИЛС checksum vectors.
- **xlsx-writer unit** — header row, column order/count, row values.
- **service integration** — gather + partial-success + batch/record persistence +
  audit; all-failed → no file; empty source → empty batch.
- **DTO-validation** — filter shape (dates, optional group/client).
- **permission-boundary** — added to `mvp.http.integration.test.ts`.
- **frontend** — api.contract envelope unwrap + e2e route-access.

Run isolated (Cyrillic-path Gotcha): per-module backend file runs with
`--no-file-parallelism`; `pnpm test:frontend`; `pnpm typecheck`; `npx eslint <path>`.

## 9. Out of scope (explicit)

- ЭП/НЭП signature provider (owner-deferred, separate track).
- XML serialization for either registry (future swap-in; XLSX-only for v1).
- Official область-аттестации / специальность classifier lookup tables + migration
  (deferred until owner has the official format; encoded as PROVISIONAL columns now).
- Registry-response import (the ОТ module has it; neither new registry needs it for v1).
- Per-attestation-area row fan-out for Ростехнадзор (swap-point until a real
  classifier exists).

## 10. Risks

- **Format drift** — columns are best-effort; mitigated by the PROVISIONAL marking +
  localized swap-points, exactly as the three shipped exporters.
- **ЗЕТ vs academic hours** — НМО ЗЕТ is approximated from academic hours when no
  dedicated meta field exists; flagged as a swap-point.
- **Cyrillic-path test crashes** — known; mitigated by isolated file runs + CI.

## 11. Self-review notes

- Placeholder scan: swap-points are deliberate provisional artifacts (program
  metadata sources named), not unresolved TODOs.
- Consistency: both modules reuse `regulatory.export.*`, no migration, XLSX-only,
  durable batches — matches §3.1 throughout.
- Scope: two sibling modules + one shared frontend extension = one focused plan.
- Ambiguity: data sources fixed per module (§4 enrollments, §5 documents); granularity
  fixed at one-row-per-enrollment / one-row-per-document for v1.

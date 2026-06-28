# Audit Tail d–g — Reminder Dedup, Persistence Atomicity, Task/Order Idempotency

> **STATUS: ✅ COMPLETE (merged, 2026-06-28).** All four bugs fixed via TDD and merged on `main` in PR #284/#286. Commits: d `d4b7472` · e `09afed9` · f `8cd9a02` · g `7acf6a9` (+ log-counter follow-up `d0d2182`). Handoff write-up: [LMS_AGENT_HANDOFF.md](../../../LMS_AGENT_HANDOFF.md) §5.150. Local re-verification 2026-06-28: the four target suites pass — `license-expiry-scanner.service.test.ts` (7) + both `*-request-persistence.interceptor.test.ts` (2+2) + `documents.service.test.ts` (64) = **4 files / 75 tests green**. Checkboxes below ticked retroactively to reflect merged state.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Close the remaining four verified latent bugs (d/e/f/g) from the 2026-06-27 pre-pilot audit tail: (d) a renewed license never re-reminds, (e) a throwing HTTP handler still persists its partial mutations, (f) worker redelivery of an already-completed document task 400s, (g) a partially-issued group order never reconciles missing certificates on retry.

**Architecture:** All backend, all exercised by in-memory state. (d) is a one-line dedup-key change. (e) is a transactional-semantics fix in the two request-persistence interceptors — persist domain state only when the handler succeeds. (f)/(g) are idempotency fixes in `documents.service.ts`. Each guarded by tests written first (TDD).

**Tech Stack:** TypeScript, NestJS, Vitest. Single-file vitest on this Windows/Cyrillic machine: `pnpm --filter @trudskill/backend exec vitest run <path> --no-file-parallelism` (output is buffered — trust the final `Test Files`/`Tests` summary + exit code).

**Branch:** continue on `fix/2026-06-27-audit-tail-progress-dedup-notify` (extends PR #284 "close pre-pilot audit tail"; e/f/g share `documents.service.ts` with the already-landed 1a fix, so a separate branch would conflict). Order f → g (same file, sequential); d and e are independent.

**Key safety fact (de-risks e):** `AuditService.write`/`writeCritical` persist directly to `audit.audit_log` via `databaseService.query` — independent of these interceptors. So not persisting domain state on a handler throw does NOT drop the audit-of-attempt. The full backend suite (HTTP integration + business flows) is the regression net.

---

## Task 1: Renewed license re-reminds (bug d)

**Problem (verified):** `LicenseExpiryScanner.scanTenant` ([apps/backend/src/modules/mvp/reminders/license-expiry-scanner.service.ts:65](../../../apps/backend/src/modules/mvp/reminders/license-expiry-scanner.service.ts)) dispatches with `dedupKey: \`license:${license.id}:${milestone}\``. When a license is renewed (its `validUntil`extended, same`id`), the new expiry re-enters the 90/30/7 cadence — but `license:{id}:90`already has a delivery row from the previous term, so`NotificationDispatcher` dedups it away and the renewal is never reminded.

**Fix:** Include `validUntil` in the dedup key so each license term has its own keyspace: `license:${license.id}:${license.validUntil}:${milestone}`.

**Files:**

- Modify: `apps/backend/src/modules/mvp/reminders/license-expiry-scanner.service.ts:65`
- Test: `apps/backend/src/modules/mvp/reminders/license-expiry-scanner.service.test.ts`

- [x] **Step 1: Write the failing test.** Read the existing test file to reuse its harness (mock `LicensesService.findActiveExpiringBefore`, a `NotificationDispatcher` spy whose `dispatch` is recorded, a `state` with staff recipients via `buildStaffRecipients`). Add a test "renewed license (new validUntil) re-reminds at the same milestone":
  - scan once with a license `{ id:'lic1', validUntil:'2026-09-01', ... }` at an `asOf` that yields milestone 90 → assert `dispatch` was called with `dedupKey` containing `2026-09-01`.
  - assert the dedupKey is exactly `license:lic1:2026-09-01:90` (or whatever milestone value `pickMilestone` returns — read `RECERT_MILESTONES`/`pickMilestone` to use the real value).
  - scan again with the SAME license but `validUntil:'2027-09-01'` at an `asOf` yielding milestone 90 → assert the second `dispatch` dedupKey is `license:lic1:2027-09-01:90` (distinct from the first). This is what lets the dispatcher treat it as a fresh reminder.

- [x] **Step 2: Run, confirm FAIL:** `pnpm --filter @trudskill/backend exec vitest run src/modules/mvp/reminders/license-expiry-scanner.service.test.ts -t "renewed license" --no-file-parallelism` → FAIL (current key omits validUntil).

- [x] **Step 3: Apply the fix** — change line 65 to `dedupKey: \`license:${license.id}:${license.validUntil}:${milestone}\``.

- [x] **Step 4: Run, confirm PASS** (same command) and run the whole file: `pnpm --filter @trudskill/backend exec vitest run src/modules/mvp/reminders/license-expiry-scanner.service.test.ts --no-file-parallelism` → all green.

- [x] **Step 5: Commit**

```bash
git add apps/backend/src/modules/mvp/reminders/license-expiry-scanner.service.ts apps/backend/src/modules/mvp/reminders/license-expiry-scanner.service.test.ts
git commit -m "fix(backend): key license-expiry reminder dedup by validUntil so a renewed license re-reminds (audit tail d)"
```

---

## Task 2: Persist domain state only on handler success (bug e)

**Problem (verified):** Both request-persistence interceptors run the handler in a `try` and call `saveFromState` in a `finally` ([documents-request-persistence.interceptor.ts:73-96](../../../apps/backend/src/modules/documents/infrastructure/documents-request-persistence.interceptor.ts) and the identical [mvp-request-persistence.interceptor.ts:67-90](../../../apps/backend/src/modules/mvp/infrastructure/mvp-request-persistence.interceptor.ts)). When the handler throws, the `finally` still persists whatever partial mutations the handler made before throwing → a failed request leaves partial domain state committed.

**Fix:** Persist only when the handler completes successfully. On a handler throw, skip the save (the request-scoped state is discarded, giving a clean rollback) and re-throw. Keep the load-phase try/catch/finally and all metrics exactly as-is; only the save phase moves out of `finally` onto the success path. Audit entries are unaffected (written directly to the DB by `AuditService`).

**Files:**

- Modify: `apps/backend/src/modules/documents/infrastructure/documents-request-persistence.interceptor.ts`
- Modify: `apps/backend/src/modules/mvp/infrastructure/mvp-request-persistence.interceptor.ts`
- Test (create): `apps/backend/src/modules/documents/infrastructure/documents-request-persistence.interceptor.test.ts`
- Test (create): `apps/backend/src/modules/mvp/infrastructure/mvp-request-persistence.interceptor.test.ts`

- [x] **Step 1: Write the failing tests** (one per interceptor). Construct the interceptor directly with test doubles:
  - `state` = a plain object; `metrics` = an object whose methods (`observeDuration`, `incrementCounter`) are `vi.fn()`; `persistence` = `{ loadIntoState: vi.fn().mockResolvedValue(undefined), saveFromState: vi.fn().mockResolvedValue(undefined), constructor: { name: 'Test' } }` — note `constructor.name` is read, so use a real class instance or set it; simplest is a small `class TestBackend { async loadIntoState(){} async saveFromState(){} }` instance with `vi.spyOn`; `tenantGateway` = `{ runExclusive: (_t, fn) => fn() }`.
  - Build an `ExecutionContext` double: `getType: () => 'http'`, `switchToHttp: () => ({ getRequest: () => req })` where `req` carries a resolvable tenant context (read `resolveRequestContext` to see what fields it needs — likely `req.tenantContext`/headers; mirror however other tests in the repo stub it, or set the fields it reads).
  - `next` = `{ handle: () => <observable> }`. Use `rxjs` `throwError(() => new Error('boom'))` for the failing case and `of('ok')` for the success case.
  - Test A "does not persist when the handler throws": `next.handle` returns `throwError`. `await expect(lastValueFrom(interceptor.intercept(ctx, next))).rejects.toThrow('boom')`; assert `saveFromState` was NOT called and `loadIntoState` WAS called.
  - Test B "persists when the handler succeeds": `next.handle` returns `of('ok')`; assert the emitted value is `'ok'` and `saveFromState` WAS called once.

- [x] **Step 2: Run, confirm FAIL** for both files (Test A fails — save currently happens in `finally`):
      `pnpm --filter @trudskill/backend exec vitest run src/modules/documents/infrastructure/documents-request-persistence.interceptor.test.ts src/modules/mvp/infrastructure/mvp-request-persistence.interceptor.test.ts --no-file-parallelism`

- [x] **Step 3: Apply the fix in BOTH interceptors.** Replace the `try { return await lastValueFrom(...) } finally { <save block> }` with a success-only save. Concretely, in each interceptor, change the inner block to:

```ts
const result = await lastValueFrom(next.handle().pipe(defaultIfEmpty(null)));

// Persist only on success — a throwing handler must not commit partial
// mutations (audit tail e). The request-scoped state is discarded on throw,
// giving a clean rollback. Audit entries persist independently via AuditService.
const saveStarted = Date.now();
try {
  await this.persistence.saveFromState(tenantId, this.state);
  this.metrics.incrementCounter('<save_total_metric>', { backend, result: 'ok' });
} catch (error) {
  this.metrics.incrementCounter('<save_total_metric>', { backend, result: 'error' });
  throw error;
} finally {
  this.metrics.observeDuration('<save_duration_metric>', Date.now() - saveStarted, {
    backend
  });
}

return result;
```

Use the existing metric names per file: documents → `documents_persistence_save_total` / `documents_persistence_save_duration_ms`; mvp → `mvp_persistence_save_total` / `mvp_persistence_save_duration_ms`. The `await lastValueFrom(...)` now sits outside any try, so a handler throw propagates before the save block is reached. Leave the load phase (try/catch/finally) untouched.

- [x] **Step 4: Run, confirm PASS** for both interceptor test files (same command as Step 2).

- [x] **Step 5: Regression — run a representative set of HTTP-integration suites** that exercise both interceptors, to confirm no flow relied on save-on-error:
      `pnpm --filter @trudskill/backend exec vitest run src/modules/mvp/mvp.http.integration.test.ts src/modules/mvp/mvp.domains.http.integration.test.ts src/modules/documents/documents.http.integration.test.ts --no-file-parallelism`
      All green. (The full `pnpm test:backend` runs in the final verification.)

- [x] **Step 6: Commit**

```bash
git add apps/backend/src/modules/documents/infrastructure/documents-request-persistence.interceptor.ts apps/backend/src/modules/mvp/infrastructure/mvp-request-persistence.interceptor.ts apps/backend/src/modules/documents/infrastructure/documents-request-persistence.interceptor.test.ts apps/backend/src/modules/mvp/infrastructure/mvp-request-persistence.interceptor.test.ts
git commit -m "fix(backend): persist request-scoped domain state only on handler success, not in finally (audit tail e)"
```

---

## Task 3: Idempotent re-completion of a document task (bug f)

**Problem (verified):** `completeTask` ([documents.service.ts:690-694](../../../apps/backend/src/modules/documents/documents.service.ts)) calls `this.startTask(tenantId, taskId)` **first**; `startTask` throws `BadRequestException('Terminal task cannot be started')` for a `completed` task (line 731). So the idempotent short-circuit on the next line (`if (task.status === 'completed') return this.getDocument(...)`) is unreachable — a worker redelivering a `completeTask` for an already-completed task gets a 400 instead of an idempotent success.

**Fix:** Check the idempotent (already-completed) case BEFORE calling `startTask`.

**Files:**

- Modify: `apps/backend/src/modules/documents/documents.service.ts:690-694`
- Test: `apps/backend/src/modules/documents/documents.service.test.ts`

- [x] **Step 1: Write the failing test.** Reuse the file's `generateDocument`/`startTask`/`completeTask` setup (find an existing test that completes a task). Test "completeTask is idempotent on redelivery of an already-completed task":
  - generate a task, `startTask`, `completeTask(... fileId ...)` → first generated doc.
  - call `completeTask` again with the same `(taskId, fileId)` → assert it returns the SAME generated document (`.id` equal) and does NOT throw, and that `state.generatedDocuments` for that task did not grow (still one).

- [x] **Step 2: Run, confirm FAIL:** `pnpm --filter @trudskill/backend exec vitest run src/modules/documents/documents.service.test.ts -t "idempotent on redelivery" --no-file-parallelism` → FAIL with `BadRequestException: Terminal task cannot be started`.

- [x] **Step 3: Apply the fix.** Reorder `completeTask` so the completed-task short-circuit runs first:

```ts
  completeTask(tenantId: string, taskId: string, fileId: string, generatedBy?: string) {
    const existing = this.getDocumentTask(tenantId, taskId);
    // Idempotent redelivery: an already-completed task returns its document instead of
    // erroring (startTask would throw 'Terminal task cannot be started' first) (audit tail f).
    if (existing.status === 'completed')
      return this.getDocument(tenantId, existing.generatedDocumentId!);
    this.startTask(tenantId, taskId);
    const task = this.getDocumentTask(tenantId, taskId);
    if (task.status !== 'running') throw new BadRequestException('Task state is not processable');
    // ... unchanged remainder
```

Keep the rest of the method (reservation, generated-doc creation, audit) byte-for-byte. A `failed` task still reaches `startTask` and correctly throws (failed is terminal; it must be retried via `retryTask`).

- [x] **Step 4: Run, confirm PASS** (the `-t` test) and the whole documents.service file:
      `pnpm --filter @trudskill/backend exec vitest run src/modules/documents/documents.service.test.ts --no-file-parallelism` → green.

- [x] **Step 5: Commit**

```bash
git add apps/backend/src/modules/documents/documents.service.ts apps/backend/src/modules/documents/documents.service.test.ts
git commit -m "fix(backend): make completeTask idempotent on redelivery of a completed task (audit tail f)"
```

---

## Task 4: Group order reconciles missing certificates on retry (bug g)

**Problem (verified):** `issueGroupOrder` ([documents.service.ts:1454-1602](../../../apps/backend/src/modules/documents/documents.service.ts)) pushes the order to state, then loops `enrollmentIds` issuing certificates. If issuance is incomplete (a throw mid-cascade in an earlier run, or `enrollmentIds` grew between calls), the idempotent branch (lines 1483-1488) finds the existing order and returns only the certificates that already exist — it never issues the missing ones. So a retry can never heal a partially-issued order.

**Fix:** Make the cert cascade self-healing. Extract the per-enrollment cert-issuance loop into a private helper `ensureOrderCertificates(tenantId, actorId, order, req, ctx)` that, for each `req.enrollmentIds`, issues a certificate only if one isn't already linked to this order (the existing within-order dedup at line 1549). Call it on BOTH the existing-order path and the new-order path. Return the full set of certificates linked to the order.

**Files:**

- Modify: `apps/backend/src/modules/documents/documents.service.ts:1454-1602`
- Test: `apps/backend/src/modules/documents/documents.service.test.ts`

- [x] **Step 1: Write the failing test.** Reuse the file's `issueGroupOrder` setup (find existing group-order tests for templates/versions/enrollments). Test "re-issuing a group order fills in certificates missing from the first issuance":
  - First call: `issueGroupOrder` with `certificateTemplateId` + `enrollmentIds: ['e1']` → order + 1 cert.
  - Simulate a grown roster / prior partial issuance: call `issueGroupOrder` again with the SAME `groupId`+`templateId` but `enrollmentIds: ['e1','e2']`.
  - Assert: `alreadyExisted === true`, the returned `order.id` equals the first order, and `certificates` now covers BOTH `e1` and `e2` (e1 not duplicated, e2 newly issued). Assert `state.generatedDocuments` has exactly one cert per (enrollment, order) — no duplicate for e1.

- [x] **Step 2: Run, confirm FAIL:** `pnpm --filter @trudskill/backend exec vitest run src/modules/documents/documents.service.test.ts -t "fills in certificates missing" --no-file-parallelism` → FAIL (e2 cert never created; only e1 returned).

- [x] **Step 3: Refactor.** Extract lines 1533-1599 (the `const certificates ...` block through the enrollment loop) into:

```ts
  private async ensureOrderCertificates(
    tenantId: string,
    actorId: string | undefined,
    order: GeneratedDocumentEntity,
    req: IssueGroupOrderRequest,
    ctx: RequestContext
  ): Promise<GeneratedDocumentEntity[]> {
    if (!req.certificateTemplateId || req.enrollmentIds.length === 0) {
      // No cert cascade requested — return whatever is already linked to the order.
      return this.state.generatedDocuments.filter(
        (d) => d.tenantId === tenantId && d.groupOrderDocumentId === order.id
      );
    }
    const certTpl = this.state.templates.find(
      (t) => t.tenantId === tenantId && t.id === req.certificateTemplateId
    );
    if (!certTpl) throw new NotFoundException(`Template ${req.certificateTemplateId} not found`);
    const certVersionId =
      certTpl.currentVersionId ??
      this.state.versions.find(
        (v) => v.tenantId === tenantId && v.templateId === req.certificateTemplateId && v.isActive
      )?.id ??
      '';
    for (const enrId of req.enrollmentIds) {
      const dup = this.state.generatedDocuments.find(
        (d) =>
          d.tenantId === tenantId &&
          d.sourceEntityType === 'enrollment' &&
          d.sourceEntityId === enrId &&
          d.templateId === req.certificateTemplateId &&
          d.groupOrderDocumentId === order.id
      );
      if (dup) continue;
      const certNumber = this.reserveNumber(tenantId, certTpl.templateType).reservedNumber;
      const cert: GeneratedDocumentEntity = {
        id: this.id('gdoc'),
        tenantId,
        templateId: req.certificateTemplateId,
        templateVersionId: certVersionId,
        documentType: certTpl.templateType,
        name: `${certTpl.name} ${certNumber}`,
        sourceEntityType: 'enrollment',
        sourceEntityId: enrId,
        fileId: '',
        status: 'generated',
        documentNumber: certNumber,
        documentDate: this.now().slice(0, 10),
        isFinal: false,
        generatedBy: actorId,
        generatedAt: this.now(),
        groupOrderDocumentId: order.id,
        qrToken: this.generateQrToken()
      };
      this.state.generatedDocuments.push(cert);
      await this.auditService.writeCritical({
        tenantId,
        actorId,
        action: 'documents.certificate_issued_via_order',
        entityType: 'documents.generated',
        entityId: cert.id,
        newValues: { enrollmentId: enrId, orderId: order.id } as unknown as Record<string, unknown>,
        requestId: ctx.requestId,
        correlationId: ctx.correlationId,
        ip: ctx.ip,
        userAgent: ctx.userAgent
      });
    }
    // Return the full linked set (existing + newly issued), in roster order where possible.
    return this.state.generatedDocuments.filter(
      (d) => d.tenantId === tenantId && d.groupOrderDocumentId === order.id
    );
  }
```

Then:

- In the existing-order branch (lines 1483-1488): replace the plain filter+return with
  ```ts
  if (existing) {
    const certificates = await this.ensureOrderCertificates(tenantId, actorId, existing, req, ctx);
    return { order: existing, certificates, alreadyExisted: true };
  }
  ```
- In the new-order branch: after the order is pushed + audited, replace the inline loop with

  ```ts
  const certificates = await this.ensureOrderCertificates(tenantId, actorId, order, req, ctx);
  return { order, certificates, alreadyExisted: false };
  ```

  Preserve the order-creation, order audit (`documents.group_order_issued`), and idempotency-find logic exactly. Note `this.now()` is called per-cert in the helper (was a single `now` before) — that's fine (document timestamps); if the file's tests assert a shared timestamp, capture `const now = this.now()` once inside the helper and reuse it to match prior behaviour.

- [x] **Step 4: Run, confirm PASS** (the `-t` test) and the whole documents.service file plus any group-order integration test:
      `pnpm --filter @trudskill/backend exec vitest run src/modules/documents/documents.service.test.ts --no-file-parallelism`
      Then grep for other group-order tests (`rg -l issueGroupOrder src/modules/documents`) and run them too. All green.

- [x] **Step 5: Commit**

```bash
git add apps/backend/src/modules/documents/documents.service.ts apps/backend/src/modules/documents/documents.service.test.ts
git commit -m "fix(backend): reconcile missing group-order certificates on idempotent retry (audit tail g)"
```

---

## Final verification (after all four tasks)

- [x] `pnpm typecheck` → 8/8.
- [x] Full `pnpm test:backend` → green (rely on exit code + `Test Files`/`Tests` summary; buffered under Cyrillic path).
- [x] `npx eslint` on every touched file with `--max-warnings=0`.
- [x] Dispatch a final whole-branch review covering the d–g commits (seam focus: does the (e) save-on-success change interact with (f)/(g)'s multi-step document mutations? e.g. a throwing issueGroupOrder now rolls back cleanly — confirm that's consistent with the (g) reconciliation).

## Handoff (after merge)

- Append `### 5.150` to [LMS_AGENT_HANDOFF.md](../../../LMS_AGENT_HANDOFF.md) §5: the four fixes, the (e) transactional-semantics change (note: a failed mutation no longer persists partial domain state; audit unaffected), files changed, test status.
- Update `project_prepilot_latent_bug_audit.md`: move (d)(e)(f)(g) out of the open tail → fully closed (only the deferred logging-counter minor remains).
- Update [README.md](../../../README.md) §2 «AI Agent State» and extend PR #284's description to cover a–g.

## Self-review notes

- **Spec coverage:** d → Task 1; e → Task 2 (both interceptors); f → Task 3; g → Task 4. ✓
- **(e) risk:** audit persists independently (`AuditService` → `audit.audit_log` directly), so the success-only save can't drop audit-of-attempt; full suite is the net. The load phase + all metrics are preserved.
- **(g) interaction with (e):** with (e) fixed, a throwing `issueGroupOrder` persists nothing (clean rollback); the reconciliation in (g) heals the case where a prior run committed an incomplete-but-successful order or the roster grew. Both together make group-order issuance retry-safe.
- **Ordering:** f before g (same file). d and e independent.

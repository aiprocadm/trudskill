# Audit Tail Fixes — Progress Denominator, Certificate Dedup, Notification Stranding

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three verified-but-unfixed latent bugs from the 2026-06-27 pre-pilot audit tail: (1a) duplicate certificate on event re-emit after the 24h idempotency-cache TTL, (1b) notification recipients stranded after a mid-loop send failure, (1c) premature 100% course/module progress because the denominator counts only visited materials.

**Architecture:** All three live in the backend NestJS domain services and are exercised by in-memory state (so they pass current tests — the boundary conditions only bite on durable Postgres / real cron re-runs). Each fix is a small, surgical change to one service plus one repository method, guarded by new unit tests written first (TDD). No migrations, no new permissions, no API-shape changes.

**Tech Stack:** TypeScript, NestJS, Vitest. Single-file vitest runs on this Windows/Cyrillic machine use `pnpm --filter @trudskill/backend exec vitest run <path> --no-file-parallelism`.

**Branch:** `fix/2026-06-27-audit-tail-progress-dedup-notify` (cut from current `main`-tracking branch; do NOT continue on `fix/2026-06-27-backend-full-suite-green`).

**Pre-pilot risk order:** 1c (compromises attestation gating) ≥ 1a (visible duplicate cert) ≥ 1b (silently lost notification). Implement in the order 1c → 1a → 1b, or in parallel — tasks are independent (different files).

---

## Task 1: Progress denominator includes never-opened materials (bug 1c)

**Problem (verified):** `recalculateModuleProgress` ([apps/backend/src/modules/mvp/mvp.service.ts:2295-2342](../../../apps/backend/src/modules/mvp/mvp.service.ts)) reduces `requiredSeconds`/`studiedSeconds` over `state.materialProgress` rows — but a `materialProgress` row is only created when a learner opens a material (`upsertMaterialProgress`, line 2271 `if (!existing) this.state.materialProgress.push(record)`). Materials never opened are absent from the denominator, so a module of 5 materials shows 100% after the learner opens 1. `recalculateCourseProgress` (line 2344-2389) has the same bug one level up: it aggregates over `state.moduleProgress` rows, which only exist for modules that had at least one opened material.

**Fix:** Drive module completion from the **full material set** of the module (`state.materials` filtered by `moduleId`) and course completion from the **full module set** of the course (`state.modules` joined via `state.courseVersions` to `courseId`). Use a count-based completion gate (N completed of M total) so the zero-`minViewSeconds` edge (ratio-based 100% on an unopened 0-second material) is also closed. Keep populating `studiedSeconds`/`requiredSeconds` on the record for display.

**Open assumption (documented deviation):** course→modules is resolved across _all_ course versions of `courseId` that contain materials. If the product guarantees an enrollment is pinned to a single active course version, this denominator could include retired-version modules; we count only modules that actually contain ≥1 material, which empties retired scaffolding in practice. Flag to owner if course completion looks too strict after a version bump.

**Files:**

- Modify: `apps/backend/src/modules/mvp/mvp.service.ts:2295-2389` (both `recalculateModuleProgress` and `recalculateCourseProgress`)
- Test: `apps/backend/src/modules/mvp/mvp.service.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `apps/backend/src/modules/mvp/mvp.service.test.ts` (use the existing `makeServices()` helper and the existing course/module/material/enrollment setup helpers in that file — mirror an existing progress test such as the one that calls `upsertMaterialProgress`). The two behaviours under test:

```ts
describe('progress denominator (audit tail 1c)', () => {
  it('module is not 100% until every material in the module is completed', async () => {
    // Arrange: a module with TWO materials, each minViewSeconds=600.
    // (reuse the file's existing builder that seeds course/version/module/materials + enrollment)
    const { svc, ctx, enrollment, moduleId, materialA, materialB } = seedModuleWithTwoMaterials();

    // Act: fully study only material A.
    svc.upsertMaterialProgress(
      ctx.tenantId,
      ctx.userId,
      materialA.id,
      { enrollmentId: enrollment.id, studiedSeconds: 600 },
      ctx
    );

    // Assert: module progress must NOT be completed (B never opened).
    const mp = svc['state'].moduleProgress.find(
      (m) => m.enrollmentId === enrollment.id && m.moduleId === moduleId
    );
    expect(mp?.progressPercent).toBe(50);
    expect(mp?.status).not.toBe('completed');

    // Act: now study material B too.
    svc.upsertMaterialProgress(
      ctx.tenantId,
      ctx.userId,
      materialB.id,
      { enrollmentId: enrollment.id, studiedSeconds: 600 },
      ctx
    );

    const mp2 = svc['state'].moduleProgress.find(
      (m) => m.enrollmentId === enrollment.id && m.moduleId === moduleId
    );
    expect(mp2?.progressPercent).toBe(100);
    expect(mp2?.status).toBe('completed');
  });

  it('course is not 100% while a sibling module has no opened materials', async () => {
    // Arrange: ONE course version, TWO modules, each with one 600s material.
    const { svc, ctx, enrollment, courseId, materialInModule1 } = seedCourseWithTwoModules();

    // Act: complete only module 1's material.
    svc.upsertMaterialProgress(
      ctx.tenantId,
      ctx.userId,
      materialInModule1.id,
      { enrollmentId: enrollment.id, studiedSeconds: 600 },
      ctx
    );

    // Assert: course progress must reflect the untouched module 2 (50%, not 100%).
    const cp = svc['state'].courseProgress.find(
      (c) => c.enrollmentId === enrollment.id && c.courseId === courseId
    );
    expect(cp?.progressPercent).toBe(50);
    expect(cp?.status).not.toBe('completed');
  });
});
```

> If `seedModuleWithTwoMaterials` / `seedCourseWithTwoModules` don't already exist, write them inline in the test using the same `state` mutations the file's other progress tests use (push `courses`, `courseVersions`, `modules`, `materials`, `groups`, `groupCourses`, `enrollments`). Do NOT invent service methods — seed `state` directly as the existing tests do.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @trudskill/backend exec vitest run src/modules/mvp/mvp.service.test.ts -t "audit tail 1c" --no-file-parallelism`
Expected: FAIL — current code reports `progressPercent: 100` / `status: 'completed'` after only one material.

- [ ] **Step 3: Rewrite `recalculateModuleProgress`**

Replace the body of `recalculateModuleProgress` (lines 2295-2342) with a count-based gate over the full material set:

```ts
  private recalculateModuleProgress(
    tenantId: string,
    enrollmentId: string,
    moduleId: string,
    courseId: string
  ): void {
    // Denominator = ALL materials defined in the module, not only the ones the
    // learner has opened (audit tail 1c — visited-only denominator → premature 100%).
    const allMaterials = this.state.materials.filter(
      (m) => m.tenantId === tenantId && m.moduleId === moduleId
    );
    const progressRows = this.state.materialProgress.filter(
      (item) =>
        item.tenantId === tenantId &&
        item.enrollmentId === enrollmentId &&
        item.moduleId === moduleId
    );
    const requiredSeconds = allMaterials.reduce((acc, m) => acc + m.minViewSeconds, 0);
    const studiedSeconds = progressRows.reduce((acc, item) => acc + item.studiedSeconds, 0);
    const totalCount = allMaterials.length;
    const completedCount = progressRows.filter((p) => p.status === 'completed').length;
    const progressPercent =
      totalCount === 0 ? 100 : this.normalizePercent((completedCount / totalCount) * 100);
    const status: ProgressStatus =
      totalCount === 0 || completedCount === totalCount
        ? 'completed'
        : completedCount > 0 || studiedSeconds > 0
          ? 'in_progress'
          : 'not_started';
    const now = this.now();
    const existing = this.state.moduleProgress.find(
      (item) =>
        item.tenantId === tenantId &&
        item.enrollmentId === enrollmentId &&
        item.moduleId === moduleId
    );
    const record: ModuleProgress = existing ?? {
      id: this.id('modp'),
      tenantId,
      enrollmentId,
      courseId,
      moduleId,
      status,
      progressPercent,
      studiedSeconds,
      requiredSeconds,
      createdAt: now,
      updatedAt: now
    };
    record.status = status;
    record.progressPercent = progressPercent;
    record.requiredSeconds = requiredSeconds;
    record.studiedSeconds = studiedSeconds;
    record.lastActivityAt = now;
    record.calculatedAt = now;
    record.updatedAt = now;
    record.completedAt = status === 'completed' ? now : undefined;
    if (!existing) this.state.moduleProgress.push(record);
  }
```

- [ ] **Step 4: Rewrite `recalculateCourseProgress`**

Replace the body of `recalculateCourseProgress` (lines 2344-2389) so the denominator is the full module set of the course (resolved via course versions), not only modules that already have a progress row:

```ts
  private recalculateCourseProgress(
    tenantId: string,
    enrollmentId: string,
    courseId: string
  ): void {
    // Denominator = ALL modules of the course's version(s) that contain materials,
    // not only modules with an existing progress row (audit tail 1c, course level).
    const versionIds = new Set(
      this.state.courseVersions
        .filter((v) => v.tenantId === tenantId && v.courseId === courseId)
        .map((v) => v.id)
    );
    const courseModules = this.state.modules.filter(
      (m) =>
        m.tenantId === tenantId &&
        versionIds.has(m.courseVersionId) &&
        this.state.materials.some((mat) => mat.tenantId === tenantId && mat.moduleId === m.id)
    );
    const moduleProgress = this.state.moduleProgress.filter(
      (item) =>
        item.tenantId === tenantId &&
        item.enrollmentId === enrollmentId &&
        item.courseId === courseId
    );
    const requiredSeconds = moduleProgress.reduce((acc, item) => acc + item.requiredSeconds, 0);
    const studiedSeconds = moduleProgress.reduce((acc, item) => acc + item.studiedSeconds, 0);
    const totalCount = courseModules.length;
    const completedCount = courseModules.filter((m) =>
      moduleProgress.some((mp) => mp.moduleId === m.id && mp.status === 'completed')
    ).length;
    const progressPercent =
      totalCount === 0 ? 100 : this.normalizePercent((completedCount / totalCount) * 100);
    const status: ProgressStatus =
      totalCount === 0 || completedCount === totalCount
        ? 'completed'
        : completedCount > 0 || studiedSeconds > 0
          ? 'in_progress'
          : 'not_started';
    const now = this.now();
    const existing = this.state.courseProgress.find(
      (item) =>
        item.tenantId === tenantId &&
        item.enrollmentId === enrollmentId &&
        item.courseId === courseId
    );
    const record: CourseProgress = existing ?? {
      id: this.id('cpg'),
      tenantId,
      enrollmentId,
      courseId,
      status,
      progressPercent,
      studiedSeconds,
      requiredSeconds,
      createdAt: now,
      updatedAt: now
    };
    record.status = status;
    record.progressPercent = progressPercent;
    record.requiredSeconds = requiredSeconds;
    record.studiedSeconds = studiedSeconds;
    record.lastActivityAt = now;
    record.calculatedAt = now;
    record.updatedAt = now;
    record.completedAt = status === 'completed' ? now : undefined;
    if (!existing) this.state.courseProgress.push(record);
  }
```

- [ ] **Step 5: Run the new tests + the full mvp.service suite**

Run: `pnpm --filter @trudskill/backend exec vitest run src/modules/mvp/mvp.service.test.ts --no-file-parallelism`
Expected: PASS, including the two new cases. If a pre-existing progress test now fails, inspect it — a test that asserted "100% after one of several materials" was asserting the BUG; update it to the corrected expectation and note it in the handoff as an intended behaviour change.

- [ ] **Step 6: Guard against course-completion / enrollment-completion regressions**

Run: `pnpm --filter @trudskill/backend exec vitest run src/modules/mvp/business-flows.e2e.test.ts --no-file-parallelism`
Expected: PASS. The canonical E2E completes a course by studying all materials, so it must still reach 100%. If it now stalls below 100%, the E2E was relying on the partial-study shortcut — fix the E2E to study every material (correct behaviour), not the service.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/mvp/mvp.service.ts apps/backend/src/modules/mvp/mvp.service.test.ts
git commit -m "fix(backend): count all module/course materials in progress denominator (audit tail 1c)"
```

---

## Task 2: Durable certificate dedup on enrollment-completed re-emit (bug 1a)

**Problem (verified):** Auto-issuance idempotency is keyed `enrollment:{id}:{templateId}:v1` ([enrollment-document-issuance.listener.ts:74,138](../../../apps/backend/src/modules/documents/enrollment-document-issuance.listener.ts)), but the only thing enforcing it is the in-memory idempotency **cache** in `generateDocument`, which expires after 24h: `this.state.idem.set(idemKey, { taskId, expiresAt: Date.now() + 24*60*60*1000 })` ([documents.service.ts:626](../../../apps/backend/src/modules/documents/documents.service.ts)) and is purged by `cleanupIdempotencyCache` (line 1196-1201). If `ENROLLMENT_COMPLETED_EVENT` is re-emitted >24h later (worker redelivery, manual re-completion, status bounce), the cache misses and a **duplicate certificate** is issued for the same enrollment+template.

**Fix:** Add a durable guard in `generateDocument` keyed on the persisted task set: when both `sourceEntityType` and `sourceEntityId` are provided, return any existing non-`failed` task for the same `(tenantId, templateId, sourceEntityType, sourceEntityId)` instead of creating a second one. Tasks persist in tenant state (`state.tasks`), so this survives the cache TTL. The TTL cache stays as the fast path for sub-24h HTTP retries. Ad-hoc generation without a source entity keeps today's behaviour; the batch/group-order path already derives per-item keys and is unaffected.

**Files:**

- Modify: `apps/backend/src/modules/documents/documents.service.ts:585-629` (`generateDocument`)
- Test: `apps/backend/src/modules/documents/documents.service.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `apps/backend/src/modules/documents/documents.service.test.ts` (mirror the file's existing `generateDocument` test setup — it seeds a template + version and calls `svc.generateDocument`):

```ts
it('does not issue a duplicate document for the same source after the idempotency cache expires (audit tail 1a)', () => {
  const { svc, tenantId, templateId } = seedTemplateReadyForGeneration();
  const req = {
    idempotencyKey: 'enrollment:e1:tpl:v1',
    templateId,
    sourceEntityType: 'enrollment',
    sourceEntityId: 'e1',
    documentType: 'certificate'
  };
  const first = svc.generateDocument(tenantId, 'actor', req);

  // Simulate >24h passing: evict the TTL idempotency cache (what cleanupIdempotencyCache does).
  svc['state'].idem.clear();

  const second = svc.generateDocument(tenantId, 'actor', req);

  expect(second.id).toBe(first.id); // same task, not a new one
  const tasksForSource = svc['state'].tasks.filter(
    (t) => t.sourceEntityType === 'enrollment' && t.sourceEntityId === 'e1'
  );
  expect(tasksForSource).toHaveLength(1);
});
```

> Use whatever the file already uses to build a generatable template (look for an existing `it('generateDocument ...')`). Do not add new public methods.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @trudskill/backend exec vitest run src/modules/documents/documents.service.test.ts -t "audit tail 1a" --no-file-parallelism`
Expected: FAIL — `tasksForSource` has length 2 (a duplicate task was created after the cache was cleared).

- [ ] **Step 3: Add the durable guard in `generateDocument`**

In `documents.service.ts`, immediately after the existing TTL-cache check (after line 595 `return this.getDocumentTask(tenantId, existing.taskId);`) and before `const template = this.getTemplate(...)` (line 596), insert:

```ts
// Durable dedup (audit tail 1a): the TTL idempotency cache above expires after 24h,
// so a re-emitted enrollment.completed event would otherwise issue a duplicate.
// When the request is tied to a source entity, never create a second non-failed task
// for the same (templateId, source) — tasks persist in tenant state beyond the cache.
if (req.sourceEntityType && req.sourceEntityId) {
  const durable = this.state.tasks.find(
    (t) =>
      t.tenantId === tenantId &&
      t.templateId === req.templateId &&
      t.sourceEntityType === req.sourceEntityType &&
      t.sourceEntityId === req.sourceEntityId &&
      t.taskType === 'generate' &&
      t.status !== 'failed'
  );
  if (durable) {
    // Refresh the fast-path cache so subsequent in-window calls stay cheap.
    this.state.idem.set(idemKey, {
      taskId: durable.id,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000
    });
    return this.getDocumentTask(tenantId, durable.id);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @trudskill/backend exec vitest run src/modules/documents/documents.service.test.ts -t "audit tail 1a" --no-file-parallelism`
Expected: PASS.

- [ ] **Step 5: Run the documents + listener suites for regressions**

Run: `pnpm --filter @trudskill/backend exec vitest run src/modules/documents/documents.service.test.ts src/modules/documents/enrollment-document-issuance.listener.test.ts src/modules/documents/documents.idempotency-concurrency.test.ts --no-file-parallelism`
Expected: PASS. If a reissue/regenerate test fails because it intentionally re-issues for the same source, narrow the guard — confirm that flow uses `taskType !== 'generate'` or a distinct source, and adjust the predicate rather than dropping the guard.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/documents/documents.service.ts apps/backend/src/modules/documents/documents.service.test.ts
git commit -m "fix(backend): durable source-entity dedup so re-emitted completion can't duplicate a certificate (audit tail 1a)"
```

---

## Task 3: Per-recipient notification dedup prevents stranding (bug 1b)

**Problem (verified):** `NotificationDispatcher.dispatch` ([notification-dispatcher.service.ts:51-92](../../../apps/backend/src/modules/communication/notification-dispatcher.service.ts)) checks the dedupKey **once for the whole dispatch** (lines 52-57) but records a delivery row **per recipient** inside the loop (line 70). If `mailer.send` throws on recipient #2 after #1 was already recorded with the dedupKey, the dispatch rejects; on retry `findByDedupKey` finds #1's row and returns early, so recipients #2…N **never** get the message — a permanently stranded milestone notification.

**Fix:** Make idempotency per-recipient. Add `listByDedupKey` to the repository, build the set of already-succeeded recipient emails for the dedupKey, and skip only those; wrap each `mailer.send` in try/catch so one failure records a `failed` row and continues instead of aborting the loop. A retry then re-attempts failed + never-attempted recipients. Push fan-out targets only recipients actually (re)sent this dispatch, preserving the "no re-push on a fully-deduped dispatch" behaviour.

**Files:**

- Modify: `apps/backend/src/modules/communication/email-deliveries.repository.ts` (add `listByDedupKey` to interface)
- Modify: `apps/backend/src/modules/communication/in-memory-email-deliveries.state.ts` (implement)
- Modify: `apps/backend/src/modules/communication/postgres-email-deliveries.repository.ts` (implement)
- Modify: `apps/backend/src/modules/communication/notification-dispatcher.service.ts:51-92` (`dispatch`)
- Test: `apps/backend/src/modules/communication/notification-dispatcher.service.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `apps/backend/src/modules/communication/notification-dispatcher.service.test.ts` (the file's `make()` helper and `baseInput` are reused):

```ts
describe('NotificationDispatcher stranding (audit tail 1b)', () => {
  const threeRecipients = {
    ...baseInput,
    dedupKey: 'recert:d1:30',
    recipients: [
      { email: 'a@x.com', kind: 'learner' as const },
      { email: 'b@x.com', kind: 'learner' as const },
      { email: 'c@x.com', kind: 'learner' as const }
    ]
  };

  it('a mid-loop send failure does not strand later recipients on retry', async () => {
    const { dispatcher, mailer, deliveries } = make();
    // First attempt: a@ ok, b@ throws, c@ never reached.
    mailer.send
      .mockResolvedValueOnce({ status: 'sent' })
      .mockRejectedValueOnce(new Error('smtp boom'));
    await dispatcher.dispatch(threeRecipients);

    // a@ recorded (sent); b@ recorded (failed); loop continued to c@ (sent).
    const after1 = (await deliveries.list('t1', {})).items;
    expect(after1.map((d) => d.recipientEmail).sort()).toEqual(['a@x.com', 'b@x.com', 'c@x.com']);

    // Retry: a@ and c@ already succeeded → skipped; b@ (failed) is re-attempted.
    mailer.send.mockClear();
    mailer.send.mockResolvedValue({ status: 'sent' });
    await dispatcher.dispatch(threeRecipients);

    expect(mailer.send).toHaveBeenCalledTimes(1);
    expect(mailer.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'b@x.com' }));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @trudskill/backend exec vitest run src/modules/communication/notification-dispatcher.service.test.ts -t "audit tail 1b" --no-file-parallelism`
Expected: FAIL — current code throws on b@ before recording it and before reaching c@, and the retry early-returns on a@'s dedupKey.

- [ ] **Step 3: Add `listByDedupKey` to the repository interface**

In `email-deliveries.repository.ts`, add to the `EmailDeliveriesRepository` interface (after `findByDedupKey`, line 38):

```ts
  listByDedupKey(tenantId: string, dedupKey: string): Promise<EmailDeliveryRow[]>;
```

- [ ] **Step 4: Implement it in the in-memory state**

In `in-memory-email-deliveries.state.ts`, add after `findByDedupKey` (line 37):

```ts
  async listByDedupKey(tenantId: string, dedupKey: string): Promise<EmailDeliveryRow[]> {
    return this.deliveries.filter((d) => d.tenantId === tenantId && d.dedupKey === dedupKey);
  }
```

- [ ] **Step 5: Implement it in the Postgres repository**

In `postgres-email-deliveries.repository.ts`, add after `findByDedupKey` (line 91):

```ts
  async listByDedupKey(tenantId: string, dedupKey: string): Promise<EmailDeliveryRow[]> {
    const rows = await this.db.query<EmailDeliveryDbRow>(
      `select * from communication.email_deliveries
       where tenant_id = $1 and dedup_key = $2
       order by created_at desc`,
      [tenantId, dedupKey]
    );
    return rows.map((r) => this.map(r));
  }
```

- [ ] **Step 6: Rewrite `dispatch` for per-recipient idempotency**

Replace the body of `dispatch` (lines 51-92) in `notification-dispatcher.service.ts` with:

```ts
  async dispatch(input: DispatchInput): Promise<void> {
    // Per-recipient idempotency (audit tail 1b): a mid-loop send failure must not
    // strand later recipients. Skip only recipients already delivered successfully
    // under this dedupKey; failed/never-attempted recipients are (re)tried.
    const alreadyDelivered = new Set<string>();
    if (input.dedupKey) {
      const prior = await this.deliveries.listByDedupKey(input.tenantId, input.dedupKey);
      for (const row of prior) {
        if (row.status !== 'failed') alreadyDelivered.add(row.recipientEmail);
      }
    }

    const override = await this.templates.getOverride(input.tenantId, input.templateKey);
    const base = override ?? EMAIL_TEMPLATE_DEFAULTS[input.templateKey];
    const rendered = renderTemplate(base, input.variables);

    const sent: DispatchRecipient[] = [];
    for (const recipient of input.recipients) {
      if (alreadyDelivered.has(recipient.email)) continue;
      let result: Awaited<ReturnType<MailerService['send']>>;
      try {
        result = await this.mailer.send({
          to: recipient.email,
          subject: rendered.subject,
          body: rendered.body,
          templateKey: input.templateKey
        });
      } catch (error) {
        // Record the failure (so it is visible + retryable) and keep going — do not
        // let one bad recipient strand the rest of the milestone fan-out.
        result = { status: 'failed', error: error instanceof Error ? error.message : String(error) };
      }
      await this.deliveries.record({
        tenantId: input.tenantId,
        templateKey: input.templateKey,
        recipientEmail: recipient.email,
        recipientKind: recipient.kind,
        subject: rendered.subject,
        status: result.status,
        ...(result.providerMessageId ? { providerMessageId: result.providerMessageId } : {}),
        ...(result.error ? { error: result.error } : {}),
        ...(input.relatedEntityType ? { relatedEntityType: input.relatedEntityType } : {}),
        ...(input.relatedEntityId ? { relatedEntityId: input.relatedEntityId } : {}),
        ...(input.dedupKey ? { dedupKey: input.dedupKey } : {})
      });
      if (result.status !== 'failed') sent.push(recipient);
    }

    // Phase 10 Track C — web-push fan-out only for recipients actually sent this
    // dispatch (a fully-deduped retry sends nothing → no re-push).
    const userIds = sent.map((r) => r.userId).filter((id): id is string => Boolean(id));
    if (userIds.length > 0) {
      await this.pushSender.sendToUsers(input.tenantId, userIds, toPushNotification(rendered));
    }
  }
```

> Note: the existing test `'a push error does not break dispatch (email already journaled)'` expects `dispatch` to reject when `pushSender` throws — that is preserved (the push call is still outside the try/catch). The existing `'dedup-skipped dispatch sends no push'` test still passes: on the second dispatch every recipient is in `alreadyDelivered`, `sent` is empty, no push.

- [ ] **Step 7: Run the dispatcher suite + the deliveries-state suite**

Run: `pnpm --filter @trudskill/backend exec vitest run src/modules/communication/notification-dispatcher.service.test.ts src/modules/communication/in-memory-email-deliveries.state.test.ts --no-file-parallelism`
Expected: PASS — the new 1b case plus all pre-existing dedup/push tests.

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/modules/communication/email-deliveries.repository.ts apps/backend/src/modules/communication/in-memory-email-deliveries.state.ts apps/backend/src/modules/communication/postgres-email-deliveries.repository.ts apps/backend/src/modules/communication/notification-dispatcher.service.ts apps/backend/src/modules/communication/notification-dispatcher.service.test.ts
git commit -m "fix(backend): per-recipient notification dedup so a mid-loop failure can't strand recipients (audit tail 1b)"
```

---

## Final verification (after all three tasks)

- [ ] **Typecheck:** `pnpm typecheck` → 8/8 pass.
- [ ] **Targeted suites green** (the three above) under `--no-file-parallelism`.
- [ ] **Full backend suite:** `pnpm test:backend` → green (per the 2026-06-27 note this now runs clean from root; rely on the exit code + `Test Files`/`Tests` summary, output is buffered under the Cyrillic path).
- [ ] **Lint your touched files:** `npx eslint apps/backend/src/modules/mvp/mvp.service.ts apps/backend/src/modules/documents/documents.service.ts apps/backend/src/modules/communication/notification-dispatcher.service.ts --max-warnings=0`.

## Handoff (after merge)

- Append a `### 5.149` entry to [LMS_AGENT_HANDOFF.md](../../../LMS_AGENT_HANDOFF.md) §5: the three audit-tail fixes, files changed, the intended behaviour change (course/module now require all materials/modules completed — was previously satisfiable by partial study), and test status.
- Update the audit memory `project_prepilot_latent_bug_audit.md`: move (a), (b), (c) out of the "Verified-but-UNFIXED" tail into fixed; leave (d)–(g) as the remaining tail.
- Update [README.md](../../../README.md) §2 «AI Agent State».

## Self-review notes

- **Spec coverage:** 1a → Task 2; 1b → Task 3; 1c → Task 1 (both module and course level). ✓
- **Type consistency:** `listByDedupKey` signature identical across interface + both impls; `ModuleProgress`/`CourseProgress`/`ProgressStatus` reused unchanged; no new public service methods referenced. ✓
- **Behaviour-change flag:** Task 1 may flip existing tests/E2E that relied on partial-study reaching 100% — Steps 5/6 explicitly instruct to correct those expectations (they asserted the bug), not to weaken the fix.

# GroupCourse Version Pinning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-pin `GroupCourse.courseVersionId` to a course's latest published version at attach time, so module-gating's existing PINNED branch becomes functional and a cohort stays on the version it started on.

**Architecture:** One new private helper `latestPublishedVersionId` + one conditional-spread assignment in `createGroupCourse`. Read-side (PINNED > PUBLISHED > PROGRESS, §5.154 fix #7) is unchanged — this only populates the field it already consumes. No migration, no DTO/API change, no frontend.

**Tech Stack:** NestJS + TypeScript backend, Vitest. In-memory MVP state + JSON snapshot persistence (`groupCourses` already in `MVP_COLLECTIONS`).

Spec: [docs/superpowers/specs/2026-06-30-group-course-version-pinning-design.md](../specs/2026-06-30-group-course-version-pinning-design.md)

---

## File Structure

- **Modify** `apps/backend/src/modules/mvp/mvp.service.ts`
  - Add private helper `latestPublishedVersionId(tenantId, courseId): string | undefined`.
  - In `createGroupCourse` (line ~1403), compute the pin and add it to the entity literal via conditional spread (matching the existing `requires*` spreads).
- **Modify** `apps/backend/src/modules/mvp/mvp.service.test.ts` — 3 unit tests for the pin.
- **Modify** `apps/backend/src/modules/mvp/module-gating.service.test.ts` — 1 integration test for the correctness payoff.
- **Modify** `README.md` (§2 Current Stage) + `LMS_AGENT_HANDOFF.md` (§5.159 entry).

---

### Task 1: Auto-pin GroupCourse to latest published version

**Files:**

- Modify: `apps/backend/src/modules/mvp/mvp.service.ts` (`createGroupCourse` ~1403; new private helper)
- Test: `apps/backend/src/modules/mvp/mvp.service.test.ts`
- Test: `apps/backend/src/modules/mvp/module-gating.service.test.ts`

- [ ] **Step 1: Write the failing unit tests** (append a new `describe` block in `mvp.service.test.ts`, e.g. after the `updateProgramMeta`/`publishCourseVersion` blocks)

```typescript
describe('createGroupCourse — version pinning (§5.159)', () => {
  it('pins courseVersionId to the only published version at attach time', () => {
    const service = makeService();
    const course = service.createCourse(
      'tenant_demo',
      ctx.userId,
      { code: 'CP', title: 'Pin' },
      ctx
    );
    const group = service.createGroup('tenant_demo', ctx.userId, { code: 'GP', name: 'GP' }, ctx);
    const v1 = service.createCourseVersion('tenant_demo', course.id);
    (v1 as { status: string }).status = 'published';
    const gc = service.createGroupCourse('tenant_demo', {
      groupId: group.id,
      courseId: course.id
    });
    expect(gc.courseVersionId).toBe(v1.id);
  });

  it('pins to the latest published version (by versionNo) when several are published', () => {
    const service = makeService();
    const course = service.createCourse(
      'tenant_demo',
      ctx.userId,
      { code: 'CP', title: 'Pin' },
      ctx
    );
    const group = service.createGroup('tenant_demo', ctx.userId, { code: 'GP', name: 'GP' }, ctx);
    const v1 = service.createCourseVersion('tenant_demo', course.id);
    (v1 as { status: string }).status = 'published';
    const v2 = service.createCourseVersion('tenant_demo', course.id);
    (v2 as { status: string }).status = 'published';
    const gc = service.createGroupCourse('tenant_demo', {
      groupId: group.id,
      courseId: course.id
    });
    expect(gc.courseVersionId).toBe(v2.id);
  });

  it('leaves courseVersionId unset when the course has no published version', () => {
    const service = makeService();
    const course = service.createCourse(
      'tenant_demo',
      ctx.userId,
      { code: 'CP', title: 'Pin' },
      ctx
    );
    const group = service.createGroup('tenant_demo', ctx.userId, { code: 'GP', name: 'GP' }, ctx);
    service.createCourseVersion('tenant_demo', course.id); // draft only
    const gc = service.createGroupCourse('tenant_demo', {
      groupId: group.id,
      courseId: course.id
    });
    expect(gc.courseVersionId).toBeUndefined();
  });
});
```

- [ ] **Step 2: Write the failing module-gating test** (append an `it` inside the existing top-level `describe` in `module-gating.service.test.ts`, alongside the «scopes the course-level final-exam gate to published versions» test)

```typescript
it('isolates a group pinned to v1 from a later-published v2 required module (PINNED beats PUBLISHED)', () => {
  const service = makeService();
  const course = service.createCourse(T, ADMIN, { code: 'CP2', title: 'Pinned' }, ctx);
  const group = service.createGroup(T, ADMIN, { code: 'GP2', name: 'Group P' }, ctx);
  const bank = service.createQuestionBank(T, ADMIN, { title: 'Bank', courseId: course.id }, ctx);

  // v1 published BEFORE attach → group auto-pins to v1.
  const v1 = service.createCourseVersion(T, course.id);
  (v1 as { status: string }).status = 'published';
  service.createModule(
    T,
    ADMIN,
    { courseVersionId: v1.id, title: 'v1 Module', minViewSeconds: 0, isRequired: true },
    ctx
  );
  const gc = service.createGroupCourse(T, { groupId: group.id, courseId: course.id });
  expect(gc.courseVersionId).toBe(v1.id); // precondition: the pin landed

  // v2 published AFTER attach, with a required module behind an unpassed gating test.
  const v2 = service.createCourseVersion(T, course.id);
  (v2 as { status: string }).status = 'published';
  const m2 = service.createModule(
    T,
    ADMIN,
    { courseVersionId: v2.id, title: 'v2 Module', minViewSeconds: 0, isRequired: true },
    ctx
  );
  makeTest(service, course.id, bank.id, m2.id, 'v2 gating');

  const learner = service.createLearner(T, ADMIN, { code: 'LP', name: 'P Learner' }, ctx);
  const enrollment = service.createEnrollment(
    T,
    ADMIN,
    { groupId: group.id, learnerId: learner.id },
    ctx
  );
  const finalTest = makeTest(service, course.id, bank.id, undefined, 'Final');

  // Pinned to v1 → v2's gating module is out of scope → final exam is NOT locked.
  expect(() =>
    service.startAttempt(
      T,
      ADMIN,
      { testId: finalTest.id, enrollmentId: enrollment.id, learnerId: enrollment.learnerId },
      ctx
    )
  ).not.toThrow();
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm --filter @trudskill/backend exec vitest run src/modules/mvp/mvp.service.test.ts src/modules/mvp/module-gating.service.test.ts --no-file-parallelism -t "pinning|pins|unset|PINNED beats PUBLISHED"`

Expected: the two «pins…» unit tests FAIL (`expected undefined to be cver_…`); the «unset» test PASSES (field already undefined — it characterizes the fallback path); the module-gating test FAILS (precondition `expect(gc.courseVersionId).toBe(v1.id)` fails — pin not yet implemented). This is the RED.

- [ ] **Step 4: Add the private helper** in `mvp.service.ts` (place near other private read helpers, e.g. just before `updateProgramMeta` or alongside existing `private` selectors). `CourseVersion` is already imported in this file.

```typescript
  /**
   * Latest published version id for a course, by `versionNo` (monotonic). Used to pin a
   * GroupCourse to a concrete approved version at attach time so module-gating's PINNED
   * branch is non-empty (the cohort stays on the version it started on). Returns undefined
   * when the course has no published version yet — the read-side then falls back to PUBLISHED.
   */
  private latestPublishedVersionId(tenantId: string, courseId: string): string | undefined {
    let latest: CourseVersion | undefined;
    for (const v of this.state.courseVersions) {
      if (v.tenantId !== tenantId || v.courseId !== courseId || v.status !== 'published') continue;
      if (!latest || v.versionNo > latest.versionNo) latest = v;
    }
    return latest?.id;
  }
```

- [ ] **Step 5: Wire the pin into `createGroupCourse`** — in `mvp.service.ts` (~1418), compute the pin after the duplicate check and add it to the entity literal via conditional spread (mirrors the existing `requires*` spreads; conditional spread is required under `exactOptionalPropertyTypes`).

Add, immediately before `const entity: GroupCourse = {`:

```typescript
const pinnedVersionId = this.latestPublishedVersionId(tenantId, request.courseId);
```

Then add this as the last property inside the `const entity: GroupCourse = { … }` literal (after the `requiresProctoring` spread):

```typescript
      ...(pinnedVersionId ? { courseVersionId: pinnedVersionId } : {})
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm --filter @trudskill/backend exec vitest run src/modules/mvp/mvp.service.test.ts src/modules/mvp/module-gating.service.test.ts --no-file-parallelism`

Expected: PASS (full both files). If the module-gating test still fails, re-confirm v1 is published before `createGroupCourse` and v2 after.

- [ ] **Step 7: Confirm the module-gating RED was real (revert-check)**

Temporarily comment out the `...(pinnedVersionId ? … : {})` spread, run the module-gating test, observe it throws `module_gate_locked` (or the precondition fails), then restore the spread and re-run to green. This proves the test exercises the fix.

- [ ] **Step 8: Lint the changed files**

Run: `npx eslint apps/backend/src/modules/mvp/mvp.service.ts apps/backend/src/modules/mvp/mvp.service.test.ts apps/backend/src/modules/mvp/module-gating.service.test.ts --max-warnings=0`
Expected: no output (clean).

- [ ] **Step 9: Commit**

```bash
git add apps/backend/src/modules/mvp/mvp.service.ts \
        apps/backend/src/modules/mvp/mvp.service.test.ts \
        apps/backend/src/modules/mvp/module-gating.service.test.ts
git commit -m "fix(backend): auto-pin GroupCourse to latest published course version (§5.159)"
```

---

### Task 2: Verify, document, and finalize

**Files:**

- Modify: `README.md` (§2 Current Stage)
- Modify: `LMS_AGENT_HANDOFF.md` (new §5.159 entry + tick the §5.154 follow-up remainder)

- [ ] **Step 1: Run the full affected suites + typecheck**

Run:

```bash
pnpm --filter @trudskill/backend exec vitest run src/modules/mvp/mvp.service.test.ts src/modules/mvp/module-gating.service.test.ts src/modules/mvp/business-flows.e2e.test.ts --no-file-parallelism
pnpm typecheck
```

Expected: all suites green; typecheck 8/8.

- [ ] **Step 2: Append §5.159 to `LMS_AGENT_HANDOFF.md`** (after the §5.158 entry, before `## 6. Files Changed`). Content: summary (auto-pin at attach to latest published `versionNo`; read-side unchanged; closes the last §5.154 follow-up), files changed, test status, residual limitation (attach-before-publish), and mark the §5.154 follow-up list as fully closed.

- [ ] **Step 3: Prepend a §5.159 line to `README.md` §2 Current Stage** mirroring the §5.158 entry style (one paragraph: what/why/test status/no-migration), and note that all §5.154 follow-ups are now closed.

- [ ] **Step 4: Commit the docs**

```bash
git add README.md LMS_AGENT_HANDOFF.md
git commit -m "docs(handoff): §5.159 GroupCourse version pinning — close last §5.154 follow-up"
```

---

## Notes for the implementer

- **Concurrent sessions:** this repo is edited by multiple sessions on the same branch. Before each commit, `git status --short` and stage only the files this plan touches (explicit paths, never `git add -A`). Run commits in the background (lint-staged is slow on the Cyrillic path). See memory `concurrent-sessions-git-hazard`.
- **Why the «unset» test isn't RED:** the field already defaults to `undefined`; that test characterizes the preserved fallback path so a future change that eagerly pins (breaking the documented residual-limitation contract) is caught.
- **No new permissions, no migration, no API-envelope/DTO/frontend change.**

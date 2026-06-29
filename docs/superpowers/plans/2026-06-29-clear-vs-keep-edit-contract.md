# Clear-vs-keep Edit Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make admin edit forms able to _clear_ a previously-set optional field (program-meta fields on a draft course version; commission description) instead of silently reverting to the old value.

**Architecture:** Introduce an explicit clear-vs-keep wire contract — `null` clears enum/number/FK fields, `[]` clears arrays, `''` clears free-text, and an omitted key means "keep". The backend service normalizes `null` → `undefined` (entity types stay `?: T`; persistence via `JSON.stringify` drops the key). The frontend always sends every field of these _pre-populated edit forms_, with the mapping extracted into pure, unit-tested functions.

**Tech Stack:** NestJS + class-validator (backend), Next.js + TypeScript (frontend), Vitest.

**Spec:** [docs/superpowers/specs/2026-06-29-clear-vs-keep-edit-contract-design.md](../specs/2026-06-29-clear-vs-keep-edit-contract-design.md)

---

## File Structure

- `apps/backend/src/modules/mvp/mvp.dto.ts` — widen `UpdateProgramMetaRequest` scalar/enum/FK fields to `| null` (type-only; `@IsOptional()` already accepts `null`).
- `apps/backend/src/modules/mvp/mvp.service.ts` — `updateProgramMeta`: normalize `null` → `undefined` for scalar/enum/FK fields; change the `commissionId` existence guard from `!== undefined` to `!= null`.
- `apps/backend/src/modules/mvp/mvp.service.test.ts` — extend the existing `updateProgramMeta` + `updateCommission` describe blocks with clearing tests.
- `apps/backend/src/modules/mvp/mvp.dto-validation.test.ts` — extend the existing `UpdateProgramMetaRequest` block + add an `UpdateCommissionRequest` lock.
- `apps/frontend/src/features/mvp/payloads.ts` (NEW) — pure builders `buildProgramMetaPatch`, `buildCommissionInfoPayload`.
- `apps/frontend/src/features/mvp/payloads.test.ts` (NEW) — unit tests for the builders.
- `apps/frontend/src/features/mvp/types.ts` — widen `ProgramMetaPatch` scalar/enum/FK fields to `| null`.
- `apps/frontend/src/features/mvp/screens.tsx` — call the builders; remove the omit-when-empty logic.

**Important — TDD on Vitest vs. typecheck:** Vitest transpiles without type-checking, so the `null`-input tests in Task 1 run (and go RED) even before the DTO is widened. `tsc` (`pnpm typecheck`) is run _after_ the implementation to confirm the widened types are coherent. Do **not** run `pnpm typecheck` during a RED phase — it will report expected type errors on the not-yet-widened code.

**RED vs LOCK:** Each test below is labelled. **RED** tests genuinely fail before the change (the real bug). **LOCK** tests pass on write — the backend already handles `[]`/`''` correctly; the corresponding bug is frontend-only — so they are regression locks guarding the wire contract.

---

## Task 1: Backend — program-meta `null` clearing + commission `''` lock

**Files:**

- Modify: `apps/backend/src/modules/mvp/mvp.dto.ts` (UpdateProgramMetaRequest, ~lines 995-1040)
- Modify: `apps/backend/src/modules/mvp/mvp.service.ts` (updateProgramMeta, ~lines 6083, 6102-6118)
- Test: `apps/backend/src/modules/mvp/mvp.service.test.ts` (updateProgramMeta block ~line 2000; updateCommission block ~line 1723)
- Test: `apps/backend/src/modules/mvp/mvp.dto-validation.test.ts` (UpdateProgramMetaRequest block ~line 224)

- [ ] **Step 1: Write the failing service tests (clearing)**

In `mvp.service.test.ts`, inside `describe('updateProgramMeta', () => {` (just before its closing `});` at ~line 2021), add:

```ts
it('clears trainingType when null is sent (RED — normalizes to undefined)', () => {
  const service = makeService();
  const { courseVersionId, commissionId } = seedCourseVersionAndCommission(service);
  service.updateProgramMeta(
    'tenant_demo',
    ctx.userId,
    courseVersionId,
    completeMeta(commissionId),
    ctx
  );

  const updated = service.updateProgramMeta(
    'tenant_demo',
    ctx.userId,
    courseVersionId,
    { trainingType: null },
    ctx
  );

  expect(updated.trainingType).toBeUndefined();
});

it('detaches commission when commissionId is null, without throwing (RED)', () => {
  const service = makeService();
  const { courseVersionId, commissionId } = seedCourseVersionAndCommission(service);
  service.updateProgramMeta(
    'tenant_demo',
    ctx.userId,
    courseVersionId,
    completeMeta(commissionId),
    ctx
  );

  const updated = service.updateProgramMeta(
    'tenant_demo',
    ctx.userId,
    courseVersionId,
    { commissionId: null },
    ctx
  );

  expect(updated.commissionId).toBeUndefined();
});

it('clears only the targeted field and keeps omitted ones intact (RED)', () => {
  const service = makeService();
  const { courseVersionId, commissionId } = seedCourseVersionAndCommission(service);
  service.updateProgramMeta(
    'tenant_demo',
    ctx.userId,
    courseVersionId,
    completeMeta(commissionId),
    ctx
  );

  const updated = service.updateProgramMeta(
    'tenant_demo',
    ctx.userId,
    courseVersionId,
    { studyForm: null },
    ctx
  );

  expect(updated.studyForm).toBeUndefined();
  expect(updated.academicHours).toBe(40);
  expect(updated.trainingType).toBe('primary');
  expect(updated.commissionId).toBe(commissionId);
});

it('clears regulatoryBasisCodes when an empty array is sent (LOCK)', () => {
  const service = makeService();
  const { courseVersionId, commissionId } = seedCourseVersionAndCommission(service);
  service.updateProgramMeta(
    'tenant_demo',
    ctx.userId,
    courseVersionId,
    completeMeta(commissionId),
    ctx
  );

  const updated = service.updateProgramMeta(
    'tenant_demo',
    ctx.userId,
    courseVersionId,
    { regulatoryBasisCodes: [] },
    ctx
  );

  expect(updated.regulatoryBasisCodes).toEqual([]);
});
```

In `mvp.service.test.ts`, inside `describe('updateCommission', () => {` (after the existing `it(...)` at ~line 1742, before the block's closing `});`), add:

```ts
it('clears description when an empty string is sent (LOCK — backend already correct)', () => {
  const service = makeService();
  const c = service.createCommission(
    'tenant_demo',
    ctx.userId,
    { code: 'C1', name: 'C', description: 'old' },
    ctx
  );
  const updated = service.updateCommission(
    'tenant_demo',
    ctx.userId,
    c.id,
    { name: 'C', description: '' },
    ctx
  );
  expect(updated.description).toBe('');
});
```

- [ ] **Step 2: Run the service tests — verify the RED ones fail**

Run:

```bash
pnpm --filter @trudskill/backend exec vitest run src/modules/mvp/mvp.service.test.ts -t "updateProgramMeta" --no-file-parallelism
```

Expected: the three `RED` tests FAIL — `clears trainingType` (received `null`, expected `undefined`), `detaches commission` (throws `commission_not_found`), `clears only the targeted field` (received `null`). The `LOCK` tests pass.

- [ ] **Step 3: Widen the DTO types (type-only)**

In `mvp.dto.ts`, `UpdateProgramMetaRequest` (~lines 995-1040), add `| null` to the scalar/enum/FK field types (decorators unchanged — `@IsOptional()` already skips validators on `null`). Arrays are NOT widened (they clear via `[]`).

```ts
export class UpdateProgramMetaRequest {
  @IsOptional()
  @IsInt()
  @Min(1)
  academicHours?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  recertificationPeriodMonths?: number | null;

  @IsOptional()
  @IsIn(TRAINING_TYPES)
  trainingType?: TrainingType | null;

  @IsOptional()
  @IsIn(LEARNER_CATEGORIES)
  learnerCategory?: LearnerCategory | null;

  @IsOptional()
  @IsIn(STUDY_FORMS)
  studyForm?: StudyForm | null;

  @IsOptional()
  @IsIn(FINAL_ASSESSMENT_FORMS)
  finalAssessmentForm?: FinalAssessmentForm | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  regulatoryBasisCodes?: string[];

  @IsOptional()
  @IsString()
  programAttachmentFileId?: string | null;

  @IsOptional()
  @IsString()
  commissionId?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  otProgramCodes?: string[];
}
```

- [ ] **Step 4: Implement the service normalization + commissionId guard**

In `mvp.service.ts`, `updateProgramMeta`:

1. Change the commission existence guard (~line 6083) from `!== undefined` to `!= null` so `null` (detach) and `undefined` (keep) both skip the lookup:

```ts
if (request.commissionId != null) {
  const commission = this.state.commissions.find(
    (c) => c.tenantId === tenantId && c.id === request.commissionId
  );
  if (!commission) {
    throw new BadRequestException({
      code: 'commission_not_found',
      message: `Commission ${request.commissionId} not found`
    });
  }
  if (commission.status === 'archived') {
    throw new BadRequestException({
      code: 'commission_archived',
      message: 'Cannot attach archived commission'
    });
  }
}
```

2. Normalize `null` → `undefined` for scalar/enum/FK assignments (~lines 6102-6118). Arrays keep their existing assignment (`[]` persists):

```ts
const oldValues = { ...cv };
if (request.academicHours !== undefined) cv.academicHours = request.academicHours ?? undefined;
if (request.recertificationPeriodMonths !== undefined)
  cv.recertificationPeriodMonths = request.recertificationPeriodMonths ?? undefined;
if (request.trainingType !== undefined) cv.trainingType = request.trainingType ?? undefined;
if (request.learnerCategory !== undefined)
  cv.learnerCategory = request.learnerCategory ?? undefined;
if (request.studyForm !== undefined) cv.studyForm = request.studyForm ?? undefined;
if (request.finalAssessmentForm !== undefined) {
  cv.finalAssessmentForm = request.finalAssessmentForm ?? undefined;
}
if (request.regulatoryBasisCodes !== undefined) {
  cv.regulatoryBasisCodes = request.regulatoryBasisCodes;
}
if (request.programAttachmentFileId !== undefined) {
  cv.programAttachmentFileId = request.programAttachmentFileId ?? undefined;
}
if (request.commissionId !== undefined) cv.commissionId = request.commissionId ?? undefined;
if (request.otProgramCodes !== undefined) cv.otProgramCodes = request.otProgramCodes;
cv.updatedAt = this.now();
```

- [ ] **Step 5: Run the service tests — verify GREEN**

Run:

```bash
pnpm --filter @trudskill/backend exec vitest run src/modules/mvp/mvp.service.test.ts -t "updateProgramMeta" --no-file-parallelism
pnpm --filter @trudskill/backend exec vitest run src/modules/mvp/mvp.service.test.ts -t "updateCommission" --no-file-parallelism
```

Expected: all PASS.

- [ ] **Step 6: Add the DTO-validation lock tests**

In `mvp.dto-validation.test.ts`, inside `describe('Pillar A — UpdateProgramMetaRequest', () => {` (before its closing `});` at ~line 283), add:

```ts
it('принимает null как явную очистку enum/числовых/FK-полей (clear-vs-keep)', () => {
  const inst = plainToInstance(UpdateProgramMetaRequest, {
    academicHours: null,
    trainingType: null,
    learnerCategory: null,
    studyForm: null,
    finalAssessmentForm: null,
    commissionId: null
  });
  expect(validateSync(inst, { whitelist: true, forbidNonWhitelisted: true })).toHaveLength(0);
});

it('принимает [] как явную очистку массивов (clear-vs-keep)', () => {
  const inst = plainToInstance(UpdateProgramMetaRequest, {
    regulatoryBasisCodes: [],
    otProgramCodes: []
  });
  expect(validateSync(inst, { whitelist: true, forbidNonWhitelisted: true })).toHaveLength(0);
});
```

Add `UpdateCommissionRequest` to the `./mvp.dto.js` import block (~lines 9-29), then append a new describe block after the `UpdateProgramMetaRequest` block (after ~line 283):

```ts
describe('Pillar A — UpdateCommissionRequest (clear-vs-keep)', () => {
  it('принимает пустую строку description как очистку', () => {
    const inst = plainToInstance(UpdateCommissionRequest, { name: 'C', description: '' });
    expect(validateSync(inst, { whitelist: true, forbidNonWhitelisted: true })).toHaveLength(0);
  });
});
```

- [ ] **Step 7: Run the DTO-validation tests + backend typecheck**

Run:

```bash
pnpm --filter @trudskill/backend exec vitest run src/modules/mvp/mvp.dto-validation.test.ts --no-file-parallelism
pnpm --filter @trudskill/backend exec tsc --noEmit -p tsconfig.json
```

Expected: tests PASS; typecheck PASS (confirms the widened DTO types + `?? undefined` are coherent).

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/modules/mvp/mvp.dto.ts apps/backend/src/modules/mvp/mvp.service.ts apps/backend/src/modules/mvp/mvp.service.test.ts apps/backend/src/modules/mvp/mvp.dto-validation.test.ts
git commit -m "fix(backend): program-meta clear-vs-keep — null clears, omit keeps (§5.155)"
```

---

## Task 2: Frontend — pure builders + wiring

**Files:**

- Create: `apps/frontend/src/features/mvp/payloads.ts`
- Create: `apps/frontend/src/features/mvp/payloads.test.ts`
- Modify: `apps/frontend/src/features/mvp/types.ts` (ProgramMetaPatch, ~lines 317-328)
- Modify: `apps/frontend/src/features/mvp/screens.tsx` (imports ~line 8; buildPayload ~903-916; onSaveEditInfo ~2693-2714)

- [ ] **Step 1: Write the failing builder tests**

Create `apps/frontend/src/features/mvp/payloads.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { buildCommissionInfoPayload, buildProgramMetaPatch } from './payloads';

const filled = {
  academicHours: '40',
  trainingType: 'primary' as const,
  learnerCategory: 'worker' as const,
  studyForm: 'distance' as const,
  finalAssessmentForm: 'test' as const,
  regulatoryBasisCodes: ['PP_2464_2022'],
  commissionId: 'commission_1',
  otProgramCodes: ['OT-1']
};

describe('buildProgramMetaPatch (clear-vs-keep)', () => {
  it('sends real values when fields are filled', () => {
    const patch = buildProgramMetaPatch(filled);
    expect(patch.academicHours).toBe(40);
    expect(patch.trainingType).toBe('primary');
    expect(patch.commissionId).toBe('commission_1');
    expect(patch.regulatoryBasisCodes).toEqual(['PP_2464_2022']);
    expect(patch.otProgramCodes).toEqual(['OT-1']);
  });

  it('emits explicit clearing values for emptied fields (null / [])', () => {
    const patch = buildProgramMetaPatch({
      academicHours: '',
      trainingType: '',
      learnerCategory: '',
      studyForm: '',
      finalAssessmentForm: '',
      regulatoryBasisCodes: [],
      commissionId: '',
      otProgramCodes: []
    });
    expect(patch.academicHours).toBeNull();
    expect(patch.trainingType).toBeNull();
    expect(patch.learnerCategory).toBeNull();
    expect(patch.studyForm).toBeNull();
    expect(patch.finalAssessmentForm).toBeNull();
    expect(patch.commissionId).toBeNull();
    expect(patch.regulatoryBasisCodes).toEqual([]);
    expect(patch.otProgramCodes).toEqual([]);
  });

  it('treats zero / non-positive hours as a clear (null), not 0', () => {
    expect(buildProgramMetaPatch({ ...filled, academicHours: '0' }).academicHours).toBeNull();
  });
});

describe('buildCommissionInfoPayload (clear-vs-keep)', () => {
  it('always includes description; whitespace-only clears it to empty string', () => {
    expect(buildCommissionInfoPayload('Имя', '  ')).toEqual({ name: 'Имя', description: '' });
  });

  it('trims and passes through a real description', () => {
    expect(buildCommissionInfoPayload('  Имя  ', '  desc  ')).toEqual({
      name: 'Имя',
      description: 'desc'
    });
  });
});
```

- [ ] **Step 2: Run the builder tests — verify RED**

Run:

```bash
pnpm --filter @trudskill/frontend exec vitest run src/features/mvp/payloads.test.ts --no-file-parallelism
```

Expected: FAIL — `Failed to resolve import "./payloads"` (module does not exist yet).

- [ ] **Step 3: Widen `ProgramMetaPatch`**

In `types.ts` (~lines 317-328), add `| null` to the scalar/enum/FK fields (arrays unchanged):

```ts
export interface ProgramMetaPatch {
  academicHours?: number | null;
  trainingType?: TrainingType | null;
  learnerCategory?: LearnerCategory | null;
  studyForm?: StudyForm | null;
  finalAssessmentForm?: FinalAssessmentForm | null;
  regulatoryBasisCodes?: string[];
  programAttachmentFileId?: string | null;
  commissionId?: string | null;
  // ОТ-реестр (Минтруд/ЕИСОТ) — program mapping
  otProgramCodes?: string[];
}
```

- [ ] **Step 4: Create the pure builders**

Create `apps/frontend/src/features/mvp/payloads.ts`:

```ts
import type {
  FinalAssessmentForm,
  LearnerCategory,
  ProgramMetaPatch,
  StudyForm,
  TrainingType
} from './types';

/** Local form state of the program-meta EDIT form (empty string / [] = "cleared"). */
export interface ProgramMetaFormState {
  academicHours: string;
  trainingType: TrainingType | '';
  learnerCategory: LearnerCategory | '';
  studyForm: StudyForm | '';
  finalAssessmentForm: FinalAssessmentForm | '';
  regulatoryBasisCodes: string[];
  commissionId: string;
  otProgramCodes: string[];
}

/**
 * Clear-vs-keep mapping for the program-meta EDIT form. The form pre-populates the
 * current values, so EVERY field is always sent: a real value updates, an explicit
 * clearing value (`null` for scalar/enum/FK, `[]` for arrays) unsets it. Omitting a
 * key would mean "keep" — which is exactly the bug this avoids.
 */
export function buildProgramMetaPatch(state: ProgramMetaFormState): ProgramMetaPatch {
  const hoursNum = Number(state.academicHours);
  return {
    academicHours:
      state.academicHours && Number.isFinite(hoursNum) && hoursNum > 0 ? hoursNum : null,
    trainingType: state.trainingType || null,
    learnerCategory: state.learnerCategory || null,
    studyForm: state.studyForm || null,
    finalAssessmentForm: state.finalAssessmentForm || null,
    regulatoryBasisCodes: state.regulatoryBasisCodes,
    commissionId: state.commissionId || null,
    otProgramCodes: state.otProgramCodes
  };
}

/**
 * Clear-vs-keep mapping for the commission info EDIT form. Free-text `description`
 * is always sent (trimmed); an empty string clears it. Name is trimmed.
 */
export function buildCommissionInfoPayload(
  name: string,
  description: string
): { name: string; description: string } {
  return { name: name.trim(), description: description.trim() };
}
```

- [ ] **Step 5: Run the builder tests — verify GREEN**

Run:

```bash
pnpm --filter @trudskill/frontend exec vitest run src/features/mvp/payloads.test.ts --no-file-parallelism
```

Expected: all PASS.

- [ ] **Step 6: Wire the builders into `screens.tsx`**

(a) Add the import after line 8 (`import { showActAsLearnerAction, ... } from './assessment-permissions';`):

```ts
import { buildCommissionInfoPayload, buildProgramMetaPatch } from './payloads';
```

(b) Replace the `buildPayload` body (~lines 903-916) with a call to the builder:

```ts
const buildPayload = (): ProgramMetaPatch =>
  buildProgramMetaPatch({
    academicHours,
    trainingType,
    learnerCategory,
    studyForm,
    finalAssessmentForm,
    regulatoryBasisCodes,
    commissionId,
    otProgramCodes
  });
```

(c) In `onSaveEditInfo` (~lines 2700-2706), replace the trimmed-description omission block:

```ts
    setSavingEdit(true);
    setEditError(null);
    try {
      await updateCommission(id, buildCommissionInfoPayload(editName, editDescription));
      await refetch();
      setEditingInfo(false);
```

(removes the `const trimmedDescription = ...`, `const payload: { ... } = ...`, and `if (trimmedDescription) ...` lines; the `const trimmedName` empty-name guard above stays).

- [ ] **Step 7: Run frontend typecheck + the builder tests**

Run:

```bash
pnpm --filter @trudskill/frontend exec tsc --noEmit
pnpm --filter @trudskill/frontend exec vitest run src/features/mvp/payloads.test.ts --no-file-parallelism
```

Expected: typecheck PASS (confirms `exactOptionalPropertyTypes` is satisfied — every key is always provided with a `T | null` value); tests PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/frontend/src/features/mvp/payloads.ts apps/frontend/src/features/mvp/payloads.test.ts apps/frontend/src/features/mvp/types.ts apps/frontend/src/features/mvp/screens.tsx
git commit -m "fix(frontend): edit forms always send fields so clearing persists (§5.155)"
```

---

## Task 3: Full verification + handoff docs

**Files:**

- Modify: `README.md` (§2 «AI Agent State»)
- Modify: `LMS_AGENT_HANDOFF.md` (§5.155)

- [ ] **Step 1: Lint the changed files**

Run (each must report 0 problems):

```bash
cd apps/backend && npx eslint src/modules/mvp/mvp.dto.ts src/modules/mvp/mvp.service.ts --max-warnings=0 && cd ..
cd apps/frontend && npx eslint src/features/mvp/payloads.ts src/features/mvp/payloads.test.ts src/features/mvp/screens.tsx --max-warnings=0 && cd ..
```

Expected: no output / exit 0.

- [ ] **Step 2: Run the full affected backend + frontend suites**

Run:

```bash
pnpm --filter @trudskill/backend exec vitest run src/modules/mvp/mvp.service.test.ts src/modules/mvp/mvp.dto-validation.test.ts --no-file-parallelism
pnpm --filter @trudskill/frontend exec vitest run src/features/mvp/payloads.test.ts src/features/mvp/api.contract.test.ts --no-file-parallelism
```

Expected: all PASS.

- [ ] **Step 3: Monorepo typecheck**

Run:

```bash
pnpm typecheck
```

Expected: PASS (all projects).

- [ ] **Step 4: Update handoff docs**

In `LMS_AGENT_HANDOFF.md` §5, append a `### 5.155` entry: summary (clear-vs-keep contract for program-meta + commission edit forms), files changed, test status, deviations, cross-link to the spec/plan. In `README.md` §2, update Current Task / Last Completed Task / Last Updated At (2026-06-29) / By.

- [ ] **Step 5: Commit**

```bash
git add README.md LMS_AGENT_HANDOFF.md
git commit -m "docs: handoff §5.155 — clear-vs-keep edit contract"
```

---

## Self-Review

**Spec coverage:**

- Contract (null / [] / '') — Task 1 (DTO + service), Task 2 (builders). ✓
- D1 normalize null→undefined, entity types unchanged — Task 1 Step 4. ✓
- D2 DTO type-only widening + commissionId `!= null` guard — Task 1 Steps 3-4. ✓
- D3 Bug B frontend-only (+ backend lock test) — Task 1 Step 1 (LOCK), Task 2 Step 6c. ✓
- D4 no contracts:generate — not in plan (correct). ✓
- D5 pure-function extraction — Task 2 Steps 3-4. ✓
- Safety invariant (always-send round-trips) — Task 1 "keeps omitted ones intact" test + Task 2 builders. ✓

**Type consistency:** `ProgramMetaFormState` / `buildProgramMetaPatch` / `buildCommissionInfoPayload` names are identical across Task 2 Steps 1, 4, 6. `ProgramMetaPatch` widened identically in backend DTO (Task 1 Step 3) and frontend type (Task 2 Step 3). Service uses `?? undefined` consistently.

**Placeholder scan:** No TBD/TODO; every code step shows full code; every run step shows the command + expected outcome.

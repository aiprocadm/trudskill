# Phase 3 Plan B — Learner Test Player + Autograding Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an enrolled learner take a published test in the browser (navigate questions, answer, auto-save, watch a timer, submit) and immediately see an auto-graded result — and make the backend autograder correct for all five question types.

**Architecture:** The attempt _lifecycle_ (`startAttempt` / `saveAnswer` / `submitAttempt` / `finalizeExamResult`) already exists in `MvpService` and is exercised by `business-flows.e2e.test.ts`. Plan B therefore does **not** rebuild it. The real backend work is: (1) persist the Plan-A grading reference fields that `createQuestion` currently drops, (2) extract a pure-function autograder that correctly scores `single_choice` / `multiple_choice` / `number_input` / `text` and abstains on `essay`, (3) wire it into `submitAttempt` (fixing a silent over-scoring bug), and (4) expose a learner-safe "questions for this attempt" endpoint that never leaks answer keys. The frontend adds a self-contained `test-player` feature folder + learner routes that mirror the existing `assessment-admin` and `/learner/*` conventions exactly.

**Tech Stack:** NestJS + TypeScript (backend, in-memory MVP state with request-boundary persistence), Next.js 15 App Router + React Query + `@cdoprof/ui` (frontend), Vitest (all tests). ESM imports use `.js` suffixes on the backend.

---

## Context the executor must know (read before starting)

- **CLAUDE.md gotcha:** the repo path contains Cyrillic. The full backend suite crashes (`ERR_IPC_CHANNEL_CLOSED`). Always run isolated files with `--no-file-parallelism`. Do **not** add cases to the 2400-line `mvp.domains.http.integration.test.ts` — mirror the compact stub-controller pattern in `apps/backend/src/modules/mvp/assessment-admin.http.integration.test.ts` instead.
- **Service unit-test instantiation:** `MvpService` takes 6 positional args. Use the existing `makeServices()` helper in `apps/backend/src/modules/mvp/mvp.service.test.ts` (and the attempt setup at `mvp.service.test.ts:420-450`). Do not hand-roll DI.
- **Frontend mutations** use `useState` + async/await (the `MutationState` / `initial()` / `describe()` helpers in `apps/frontend/src/features/assessment-admin/hooks.ts:120-152`), **not** React Query mutations.
- **`exactOptionalPropertyTypes: true`** — never pass `{ x: undefined }`; use conditional spread `{ ...(v ? { x: v } : {}) }`.
- **No React Testing Library.** Frontend "e2e" = `evaluateRouteAccess` + `getVisibleNavigation` + format-pipeline + dynamic-import smoke. Mirror `apps/frontend/src/e2e/admin-assessment-surface.e2e.test.ts`.
- **API envelope:** backend wraps `{ data, meta }`; `apiRequest` from `apps/frontend/src/lib/api/client.ts` unwraps to `data`.

## Key decisions (locked during planning)

1. **Lifecycle is reused, not rebuilt.** `startAttempt`/`saveAnswer`/`submitAttempt`/`finalizeExamResult` stay. We only replace the inline grading loop in `submitAttempt`.
2. **Autograder is a pure function** (`assessment-autograde.service.ts`), table-test friendly and reusable by Plan C, mirroring `reviewer-queue.service.ts`.
3. **`essay` is never auto-graded.** `gradeAnswer` returns `{ score: 0, autoGraded: false }`; final score is a Plan C reviewer action. A test containing essays gets a _provisional_ auto-score; `attempt.passed` reflects the auto-graded sum (documented limitation).
4. **Text grading** compares `normalizeText(answer) === normalizeText(question.expectedAnswer)` (trim + lowercase + collapse internal whitespace). `expectedAnswer` becomes a real field on `Question` (it is currently a write-only DTO field with nowhere to live).
5. **Number grading** is absolute tolerance: `|value - numericExpected| <= (numericTolerance ?? 0)`.
6. **Answer-key safety:** the player fetches questions via a dedicated `GET /attempts/:id/questions` that strips `isCorrect`, `numericExpected`, `numericTolerance`, `expectedAnswer`, and `explanation`. Never reuse the admin question endpoints for the player.
7. **Discovery:** Plan B adds one lean read endpoint `GET /me/tests` returning the learner's available tests composed from their enrollments → group courses → published tests, annotated with attempt/result status, scoped to the actor's linked learner. This makes the slice reachable (browse → start → play → result) and matches the `/learner/courses` + `/learner/documents` sibling pattern. Course-viewer deep-link integration is deferred (the course→test surfacing in the viewer is not built yet).
8. **Cadence:** 4 stacked PRs — (1) this doc only, (2) backend Tasks 1–5, (3) frontend Tasks 6–10, (4) closeout Task 11. Branch root: `feat/2026-05-30-phase-3-plan-b-test-player`.

## File Structure

**Backend (create):**

- `apps/backend/src/modules/mvp/assessment-autograde.service.ts` — pure grader.
- `apps/backend/src/modules/mvp/assessment-autograde.service.test.ts` — table-driven unit tests.
- `apps/backend/src/modules/mvp/test-player.http.integration.test.ts` — stub-controller permission/envelope tests for the 2 new endpoints.
- `apps/backend/migrations/0041_assessment_text_expected_answer.sql` — additive nullable `expected_answer` + `auto_graded` columns (schema parity).
- `apps/backend/src/modules/mvp/migrations.0041.test.ts` — regex assertions on the migration (mirror `migrations.0040.test.ts`).

**Backend (modify):**

- `apps/backend/src/modules/mvp/mvp.types.ts` — add `Question.expectedAnswer?`, `AttemptAnswer.autoGraded?`, `AttemptQuestionView`, `LearnerTestSummary`.
- `apps/backend/src/modules/mvp/mvp.service.ts` — persist grading fields in `createQuestion`; replace grading loop in `submitAttempt`; add `getAttemptQuestions` + `listLearnerTests`.
- `apps/backend/src/modules/mvp/mvp.controller.ts` — add `GET /attempts/:id/questions` and `GET /me/tests`.
- `apps/backend/src/modules/mvp/mvp.service.test.ts` — grading-field persistence + number/text/essay submit grading.

**Frontend (create):**

- `apps/frontend/src/features/test-player/{types.ts,api.ts,hooks.ts,format.ts,format.test.ts,api.contract.test.ts}`
- `apps/frontend/src/features/test-player/{tests-list-screen.tsx,test-attempt-screen.tsx,test-result-screen.tsx}`
- `apps/frontend/app/learner/tests/page.tsx`
- `apps/frontend/app/learner/tests/[testId]/attempt/[attemptId]/page.tsx`
- `apps/frontend/app/learner/tests/[testId]/result/page.tsx`
- `apps/frontend/src/e2e/learner-test-player.e2e.test.ts`

**Frontend (modify):**

- `apps/frontend/src/lib/auth/permission-map.ts` — add `assessment.tests.read` + `assessment.attempts.read` to `learner`.
- `apps/frontend/src/features/navigation/model.ts` — add `routeMeta` + `navigationModel` entries for `/learner/tests`.

---

## Task 1: Persist grading reference fields (backend foundation)

**Why first:** the autograder has nothing to grade against until `createQuestion` stops dropping `numericExpected` / `numericTolerance` / `expectedAnswer` / `tags`, and `expectedAnswer` has a typed home.

**Files:**

- Modify: `apps/backend/src/modules/mvp/mvp.types.ts:221-234` (Question), `:310-317` (AttemptAnswer)
- Modify: `apps/backend/src/modules/mvp/mvp.service.ts:2058-2120` (createQuestion)
- Test: `apps/backend/src/modules/mvp/mvp.service.test.ts`

- [x] **Step 1: Write the failing test** — append to `mvp.service.test.ts`:

```ts
describe('Plan B — createQuestion persists grading reference fields', () => {
  it('stores numericExpected/numericTolerance/expectedAnswer/tags on create', () => {
    const { service, ctx } = makeServices();
    const bank = service.createQuestionBank('tenant_demo', ctx.userId, { title: 'B' }, ctx);

    const num = service.createQuestion(
      'tenant_demo',
      ctx.userId,
      {
        questionBankId: bank.id,
        type: 'number_input',
        title: 'pi?',
        score: 2,
        numericExpected: 3.14,
        numericTolerance: 0.01
      },
      ctx
    );
    expect(num.numericExpected).toBe(3.14);
    expect(num.numericTolerance).toBe(0.01);

    const txt = service.createQuestion(
      'tenant_demo',
      ctx.userId,
      {
        questionBankId: bank.id,
        type: 'text',
        title: 'capital?',
        score: 1,
        expectedAnswer: 'Москва',
        tags: ['geo']
      },
      ctx
    );
    expect(txt.expectedAnswer).toBe('Москва');
    expect(txt.tags).toEqual(['geo']);
  });
});
```

- [x] **Step 2: Run it and confirm it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/mvp.service.test.ts --no-file-parallelism -t "persists grading reference fields"`
Expected: FAIL — `num.numericExpected` is `undefined` (createQuestion drops it).

- [x] **Step 3: Add the typed fields** — in `mvp.types.ts`, the `Question` interface already has `numericExpected?`/`numericTolerance?`/`tags?` (Plan A). Add `expectedAnswer`:

```ts
export interface Question extends BaseEntity {
  questionBankId: string;
  type: QuestionType;
  title: string;
  body?: string;
  score: number;
  isArchived: boolean;
  text?: string;
  explanation?: string;
  maxScore?: number;
  numericExpected?: number;
  numericTolerance?: number;
  expectedAnswer?: string; // Plan B: short-answer (text) autograding reference
  tags?: string[];
}
```

And add `autoGraded` to `AttemptAnswer`:

```ts
export interface AttemptAnswer extends BaseEntity {
  attemptId: string;
  questionId: string;
  answerOptionIds?: string[];
  selectedOptionIds?: string[];
  textAnswer?: string;
  score?: number;
  autoGraded?: boolean; // Plan B: false ⇒ needs manual review (essay / misconfigured)
}
```

- [x] **Step 4: Persist fields in `createQuestion`** — in `mvp.service.ts`, extend the `entity` object built at `:2073` using conditional spread (because of `exactOptionalPropertyTypes`):

```ts
const entity: Question = {
  id: this.id('q'),
  tenantId,
  questionBankId: request.questionBankId,
  type: request.type,
  title,
  body,
  score,
  isArchived: false,
  status: 'active',
  createdAt: this.now(),
  updatedAt: this.now(),
  ...(request.numericExpected !== undefined ? { numericExpected: request.numericExpected } : {}),
  ...(request.numericTolerance !== undefined ? { numericTolerance: request.numericTolerance } : {}),
  ...(request.expectedAnswer !== undefined ? { expectedAnswer: request.expectedAnswer } : {}),
  ...(request.tags !== undefined ? { tags: request.tags } : {})
};
```

(`updateQuestion` already copies these via `Object.assign(current, request)` at `:2136`; once `expectedAnswer` is a typed field this is consistent. No change needed there.)

- [x] **Step 5: Run the test and confirm it passes**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/mvp.service.test.ts --no-file-parallelism -t "persists grading reference fields"`
Expected: PASS.

- [x] **Step 6: Typecheck + lint the touched files**

Run: `pnpm --filter @cdoprof/backend exec tsc --noEmit` then `npx eslint apps/backend/src/modules/mvp/mvp.service.ts apps/backend/src/modules/mvp/mvp.types.ts --max-warnings=0`
Expected: clean.

- [x] **Step 7: Commit**

```bash
git add apps/backend/src/modules/mvp/mvp.types.ts apps/backend/src/modules/mvp/mvp.service.ts apps/backend/src/modules/mvp/mvp.service.test.ts
git commit -m "feat(backend): Phase 3 Plan B — persist question grading reference fields (Task 1)"
```

---

## Task 2: Pure-function autograder

**Files:**

- Create: `apps/backend/src/modules/mvp/assessment-autograde.service.ts`
- Test: `apps/backend/src/modules/mvp/assessment-autograde.service.test.ts`

- [x] **Step 1: Write the failing test** — create `assessment-autograde.service.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { gradeAnswer, normalizeText } from './assessment-autograde.service.js';

import type { AnswerOption, AttemptAnswer, Question } from './mvp.types.js';

function q(partial: Partial<Question>): Question {
  return {
    id: 'q1',
    tenantId: 't',
    questionBankId: 'b',
    type: 'single_choice',
    title: 'Q',
    score: 2,
    isArchived: false,
    status: 'active',
    createdAt: 'now',
    updatedAt: 'now',
    ...partial
  };
}
function opt(id: string, isCorrect: boolean): AnswerOption {
  return {
    id,
    tenantId: 't',
    questionId: 'q1',
    text: id,
    isCorrect,
    sortOrder: 0,
    status: 'active',
    createdAt: 'now',
    updatedAt: 'now'
  };
}
function ans(partial: Partial<AttemptAnswer>): AttemptAnswer {
  return {
    id: 'a1',
    tenantId: 't',
    attemptId: 'at1',
    questionId: 'q1',
    status: 'active',
    createdAt: 'now',
    updatedAt: 'now',
    ...partial
  };
}

describe('normalizeText', () => {
  it('trims, lowercases and collapses internal whitespace', () => {
    expect(normalizeText('  Москва  Сити ')).toBe('москва сити');
  });
});

describe('gradeAnswer — single_choice', () => {
  const options = [opt('o1', true), opt('o2', false)];
  it('awards full score for the correct option', () => {
    expect(
      gradeAnswer({
        question: q({ type: 'single_choice' }),
        options,
        answer: ans({ selectedOptionIds: ['o1'] })
      })
    ).toEqual({ score: 2, autoGraded: true });
  });
  it('awards 0 for a wrong option', () => {
    expect(
      gradeAnswer({
        question: q({ type: 'single_choice' }),
        options,
        answer: ans({ selectedOptionIds: ['o2'] })
      })
    ).toEqual({ score: 0, autoGraded: true });
  });
  it('awards 0 and stays auto-graded when unanswered', () => {
    expect(
      gradeAnswer({ question: q({ type: 'single_choice' }), options, answer: undefined })
    ).toEqual({ score: 0, autoGraded: true });
  });
  it('abstains (autoGraded:false) when no correct option is configured', () => {
    expect(
      gradeAnswer({
        question: q({ type: 'single_choice' }),
        options: [opt('o1', false)],
        answer: ans({ selectedOptionIds: ['o1'] })
      })
    ).toEqual({ score: 0, autoGraded: false });
  });
});

describe('gradeAnswer — multiple_choice (binary: all-correct-and-only)', () => {
  const options = [opt('o1', true), opt('o2', true), opt('o3', false)];
  it('awards full score only when the exact correct set is chosen', () => {
    expect(
      gradeAnswer({
        question: q({ type: 'multiple_choice' }),
        options,
        answer: ans({ selectedOptionIds: ['o2', 'o1'] })
      })
    ).toEqual({ score: 2, autoGraded: true });
  });
  it('awards 0 for a partial set (no partial credit in V1)', () => {
    expect(
      gradeAnswer({
        question: q({ type: 'multiple_choice' }),
        options,
        answer: ans({ selectedOptionIds: ['o1'] })
      })
    ).toEqual({ score: 0, autoGraded: true });
  });
  it('awards 0 when an extra wrong option is included', () => {
    expect(
      gradeAnswer({
        question: q({ type: 'multiple_choice' }),
        options,
        answer: ans({ selectedOptionIds: ['o1', 'o2', 'o3'] })
      })
    ).toEqual({ score: 0, autoGraded: true });
  });
});

describe('gradeAnswer — number_input (absolute tolerance)', () => {
  it('awards full score within tolerance', () => {
    expect(
      gradeAnswer({
        question: q({ type: 'number_input', numericExpected: 3.14, numericTolerance: 0.01 }),
        options: [],
        answer: ans({ textAnswer: '3.15' })
      })
    ).toEqual({ score: 2, autoGraded: true });
  });
  it('awards 0 outside tolerance', () => {
    expect(
      gradeAnswer({
        question: q({ type: 'number_input', numericExpected: 3.14, numericTolerance: 0.01 }),
        options: [],
        answer: ans({ textAnswer: '3.2' })
      })
    ).toEqual({ score: 0, autoGraded: true });
  });
  it('treats missing tolerance as exact match', () => {
    expect(
      gradeAnswer({
        question: q({ type: 'number_input', numericExpected: 10 }),
        options: [],
        answer: ans({ textAnswer: '10' })
      })
    ).toEqual({ score: 2, autoGraded: true });
  });
  it('awards 0 for a non-numeric answer', () => {
    expect(
      gradeAnswer({
        question: q({ type: 'number_input', numericExpected: 10 }),
        options: [],
        answer: ans({ textAnswer: 'ten' })
      })
    ).toEqual({ score: 0, autoGraded: true });
  });
  it('abstains when numericExpected is not configured', () => {
    expect(
      gradeAnswer({
        question: q({ type: 'number_input' }),
        options: [],
        answer: ans({ textAnswer: '1' })
      })
    ).toEqual({ score: 0, autoGraded: false });
  });
});

describe('gradeAnswer — text (normalized exact match)', () => {
  it('awards full score for a case/whitespace-insensitive match', () => {
    expect(
      gradeAnswer({
        question: q({ type: 'text', expectedAnswer: 'Москва' }),
        options: [],
        answer: ans({ textAnswer: '  москва ' })
      })
    ).toEqual({ score: 2, autoGraded: true });
  });
  it('awards 0 for a mismatch', () => {
    expect(
      gradeAnswer({
        question: q({ type: 'text', expectedAnswer: 'Москва' }),
        options: [],
        answer: ans({ textAnswer: 'Питер' })
      })
    ).toEqual({ score: 0, autoGraded: true });
  });
  it('abstains when expectedAnswer is not configured', () => {
    expect(
      gradeAnswer({ question: q({ type: 'text' }), options: [], answer: ans({ textAnswer: 'x' }) })
    ).toEqual({ score: 0, autoGraded: false });
  });
});

describe('gradeAnswer — essay (never auto-graded)', () => {
  it('always abstains', () => {
    expect(
      gradeAnswer({
        question: q({ type: 'essay' }),
        options: [],
        answer: ans({ textAnswer: 'long answer' })
      })
    ).toEqual({ score: 0, autoGraded: false });
  });
});
```

- [x] **Step 2: Run it and confirm it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/assessment-autograde.service.test.ts --no-file-parallelism`
Expected: FAIL — module `./assessment-autograde.service.js` not found.

- [x] **Step 3: Implement the grader** — create `assessment-autograde.service.ts`:

```ts
import type { AnswerOption, AttemptAnswer, Question } from './mvp.types.js';

/**
 * Phase 3 Plan B: pure-function autograder.
 *
 * Binary V1 grading (no partial credit). Reusable by Plan C reviewer flow.
 * `autoGraded: false` means the question cannot be machine-scored and needs a
 * human reviewer (essay) OR is misconfigured (no correct option / no reference
 * value); callers treat the 0 as provisional.
 */
export interface AutogradeInput {
  question: Question;
  options: AnswerOption[];
  answer: AttemptAnswer | undefined;
}

export interface AutogradeResult {
  score: number;
  autoGraded: boolean;
}

export function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function gradeChoice(input: AutogradeInput): AutogradeResult {
  const { question, options, answer } = input;
  const correct = options
    .filter((o) => o.isCorrect)
    .map((o) => o.id)
    .sort();
  if (correct.length === 0) return { score: 0, autoGraded: false };
  const selected = [...(answer?.selectedOptionIds ?? answer?.answerOptionIds ?? [])].sort();
  const matched = JSON.stringify(correct) === JSON.stringify(selected);
  return { score: matched ? question.score : 0, autoGraded: true };
}

function gradeNumber(input: AutogradeInput): AutogradeResult {
  const { question, answer } = input;
  if (question.numericExpected === undefined || question.numericExpected === null) {
    return { score: 0, autoGraded: false };
  }
  const raw = answer?.textAnswer?.trim();
  const value = raw === undefined || raw === '' ? Number.NaN : Number(raw);
  if (Number.isNaN(value)) return { score: 0, autoGraded: true };
  const tolerance = question.numericTolerance ?? 0;
  const matched = Math.abs(value - question.numericExpected) <= tolerance;
  return { score: matched ? question.score : 0, autoGraded: true };
}

function gradeText(input: AutogradeInput): AutogradeResult {
  const { question, answer } = input;
  if (!question.expectedAnswer) return { score: 0, autoGraded: false };
  const given = answer?.textAnswer ?? '';
  const matched = normalizeText(given) === normalizeText(question.expectedAnswer);
  return { score: matched ? question.score : 0, autoGraded: true };
}

export function gradeAnswer(input: AutogradeInput): AutogradeResult {
  switch (input.question.type) {
    case 'single_choice':
    case 'multiple_choice':
      return gradeChoice(input);
    case 'number_input':
      return gradeNumber(input);
    case 'text':
      return gradeText(input);
    case 'essay':
    default:
      return { score: 0, autoGraded: false };
  }
}
```

- [x] **Step 4: Run the test and confirm it passes**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/assessment-autograde.service.test.ts --no-file-parallelism`
Expected: PASS (all cases).

- [x] **Step 5: Lint**

Run: `npx eslint apps/backend/src/modules/mvp/assessment-autograde.service.ts apps/backend/src/modules/mvp/assessment-autograde.service.test.ts --max-warnings=0`
Expected: clean.

- [x] **Step 6: Commit**

```bash
git add apps/backend/src/modules/mvp/assessment-autograde.service.ts apps/backend/src/modules/mvp/assessment-autograde.service.test.ts
git commit -m "feat(backend): Phase 3 Plan B — pure-function autograder for 5 question types (Task 2)"
```

---

## Task 3: Wire the autograder into `submitAttempt`

**Why:** `submitAttempt:2784-2796` currently grades only choice questions, `continue`s past `text` (correct text → 0), and silently awards full marks for `number_input`/`essay` (empty `correct`/`selected` arrays compare equal). Replace the loop with the grader and persist per-answer score + `autoGraded`.

**Files:**

- Modify: `apps/backend/src/modules/mvp/mvp.service.ts:2780-2802`
- Test: `apps/backend/src/modules/mvp/mvp.service.test.ts`

- [x] **Step 1: Write the failing test** — append to `mvp.service.test.ts`. (Reuse the attempt-setup style at `mvp.service.test.ts:420-450`: create course/group/group-course/enrollment/test/questions/test-questions, then start → answer → submit.)

```ts
describe('Plan B — submitAttempt grades number_input and text, abstains on essay', () => {
  it('scores number within tolerance, text by normalized match, essay = 0/needs-review', () => {
    const { service, ctx } = makeServices();
    const env = seedAttemptEnv(service, ctx); // helper below

    const numQ = service.createQuestion(
      'tenant_demo',
      ctx.userId,
      {
        questionBankId: env.bankId,
        type: 'number_input',
        title: 'pi',
        score: 2,
        numericExpected: 3.14,
        numericTolerance: 0.01
      },
      ctx
    );
    const txtQ = service.createQuestion(
      'tenant_demo',
      ctx.userId,
      {
        questionBankId: env.bankId,
        type: 'text',
        title: 'cap',
        score: 3,
        expectedAnswer: 'Москва'
      },
      ctx
    );
    const essayQ = service.createQuestion(
      'tenant_demo',
      ctx.userId,
      { questionBankId: env.bankId, type: 'essay', title: 'discuss', score: 5 },
      ctx
    );
    service.addTestQuestion('tenant_demo', ctx.userId, env.testId, { questionId: numQ.id }, ctx);
    service.addTestQuestion('tenant_demo', ctx.userId, env.testId, { questionId: txtQ.id }, ctx);
    service.addTestQuestion('tenant_demo', ctx.userId, env.testId, { questionId: essayQ.id }, ctx);

    const attempt = service.startAttempt(
      'tenant_demo',
      ctx.userId,
      { testId: env.testId, enrollmentId: env.enrollmentId, learnerId: env.learnerId },
      ctx
    );
    service.saveAnswer(
      'tenant_demo',
      ctx.userId,
      attempt.id,
      { questionId: numQ.id, textAnswer: '3.15' },
      ctx
    );
    service.saveAnswer(
      'tenant_demo',
      ctx.userId,
      attempt.id,
      { questionId: txtQ.id, textAnswer: ' москва ' },
      ctx
    );
    service.saveAnswer(
      'tenant_demo',
      ctx.userId,
      attempt.id,
      { questionId: essayQ.id, textAnswer: 'an essay' },
      ctx
    );

    const submitted = service.submitAttempt('tenant_demo', ctx.userId, attempt.id, ctx);

    expect(submitted.score).toBe(5); // 2 (num) + 3 (text) + 0 (essay)
    expect(submitted.status).toBe('submitted');
  });
});
```

Add the `seedAttemptEnv` helper near the top of the file's helpers (only if one does not already exist — check first; the existing attempt tests already build this inline, so you may factor the existing inline setup into `seedAttemptEnv` returning `{ bankId, testId, enrollmentId, learnerId }`).

- [x] **Step 2: Run it and confirm it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/mvp.service.test.ts --no-file-parallelism -t "grades number_input and text"`
Expected: FAIL — with the old loop `score` is wrong (essay/number over-scored, text under-scored).

- [x] **Step 3: Replace the grading loop** — add the import at the top of `mvp.service.ts` (near the other local imports):

```ts
import { gradeAnswer } from './assessment-autograde.service.js';
```

Replace `mvp.service.ts:2784-2797` (the `let score = 0; for (...) { ... } attempt.score = score;` block) with:

```ts
let score = 0;
for (const qid of attempt.questionOrder) {
  const question = this.getById(this.state.questions, tenantId, qid);
  const options = this.state.answerOptions.filter(
    (item) => item.tenantId === tenantId && item.questionId === qid
  );
  const answer = answers.find((item) => item.questionId === qid);
  const graded = gradeAnswer({ question, options, answer });
  if (answer) {
    answer.score = graded.score;
    answer.autoGraded = graded.autoGraded;
    answer.updatedAt = this.now();
  }
  score += graded.score;
}
attempt.score = score;
```

(Leave the following lines — `attempt.passed = score >= test.rules.passingScore;` etc. — unchanged.)

- [x] **Step 4: Run the new test + the full service suite for regressions**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/mvp.service.test.ts --no-file-parallelism`
Expected: PASS, including the pre-existing choice-grading attempt tests (`mvp.service.test.ts:420-450`).

- [x] **Step 5: Run concurrency + business-flow regressions** (they call submit)

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/mvp.concurrency.test.ts src/modules/mvp/business-flows.e2e.test.ts --no-file-parallelism`
Expected: PASS.

- [x] **Step 6: Lint + commit**

```bash
npx eslint apps/backend/src/modules/mvp/mvp.service.ts --max-warnings=0
git add apps/backend/src/modules/mvp/mvp.service.ts apps/backend/src/modules/mvp/mvp.service.test.ts
git commit -m "feat(backend): Phase 3 Plan B — autograde all question types in submitAttempt (Task 3)"
```

---

## Task 4: Learner-safe `GET /attempts/:id/questions`

**Why:** the player must render the snapshot questions without leaking `isCorrect` / reference values.

**Files:**

- Modify: `apps/backend/src/modules/mvp/mvp.types.ts` (add `AttemptQuestionView`)
- Modify: `apps/backend/src/modules/mvp/mvp.service.ts` (add `getAttemptQuestions` near `getAttempt:2546`)
- Modify: `apps/backend/src/modules/mvp/mvp.controller.ts` (add endpoint after `getAttempt:863`)
- Test: `apps/backend/src/modules/mvp/mvp.service.test.ts` (no-leak unit) + `apps/backend/src/modules/mvp/test-player.http.integration.test.ts` (permission boundary)

- [x] **Step 1: Write the failing unit test** — append to `mvp.service.test.ts`:

```ts
describe('Plan B — getAttemptQuestions never leaks answer keys', () => {
  it('returns ordered questions with options stripped of isCorrect and no reference fields', () => {
    const { service, ctx } = makeServices();
    const env = seedAttemptEnv(service, ctx);
    const choiceQ = service.createQuestion(
      'tenant_demo',
      ctx.userId,
      {
        questionBankId: env.bankId,
        type: 'single_choice',
        title: 'q',
        score: 1,
        answerOptions: [
          { text: 'A', isCorrect: true },
          { text: 'B', isCorrect: false }
        ]
      },
      ctx
    );
    service.addTestQuestion('tenant_demo', ctx.userId, env.testId, { questionId: choiceQ.id }, ctx);
    const attempt = service.startAttempt(
      'tenant_demo',
      ctx.userId,
      { testId: env.testId, enrollmentId: env.enrollmentId, learnerId: env.learnerId },
      ctx
    );

    const view = service.getAttemptQuestions('tenant_demo', ctx.userId, attempt.id, ctx);

    expect(view).toHaveLength(attempt.questionOrder.length);
    const serialized = JSON.stringify(view);
    expect(serialized).not.toContain('isCorrect');
    expect(serialized).not.toContain('expectedAnswer');
    expect(serialized).not.toContain('numericExpected');
    const first = view.find((v) => v.id === choiceQ.id)!;
    expect(first.options.map((o) => o.text).sort()).toEqual(['A', 'B']);
  });
});
```

- [x] **Step 2: Run it and confirm it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/mvp.service.test.ts --no-file-parallelism -t "never leaks answer keys"`
Expected: FAIL — `service.getAttemptQuestions` is not a function.

- [x] **Step 3: Add the view type** — in `mvp.types.ts`, after `TestAttempt`:

```ts
export interface AttemptQuestionOptionView {
  id: string;
  text: string;
  sortOrder: number;
}

export interface AttemptQuestionView {
  id: string;
  type: QuestionType;
  title: string;
  body?: string;
  score: number;
  options: AttemptQuestionOptionView[];
}
```

- [x] **Step 4: Implement the service method** — in `mvp.service.ts`, after `getAttempt` (`:2550`):

```ts
getAttemptQuestions(
  tenantId: string,
  actorId: string | undefined,
  attemptId: string,
  context: RequestContext
): AttemptQuestionView[] {
  const attempt = this.getById(this.state.attempts, tenantId, attemptId);
  this.assertActorMatchesLearnerIamLink(tenantId, actorId, attempt.learnerId, context.permissions);
  return attempt.questionOrder.map((qid) => {
    const q = this.getById(this.state.questions, tenantId, qid);
    const options = this.state.answerOptions
      .filter((o) => o.tenantId === tenantId && o.questionId === qid)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((o) => ({ id: o.id, text: o.text, sortOrder: o.sortOrder }));
    return {
      id: q.id,
      type: q.type,
      title: q.title,
      score: q.score,
      options,
      ...(q.body !== undefined ? { body: q.body } : {})
    };
  });
}
```

Add `AttemptQuestionView` to the type import block at the top of `mvp.service.ts` (the `import type { ... } from './mvp.types.js'` group).

- [x] **Step 5: Add the controller endpoint** — in `mvp.controller.ts`, after `getAttempt` (`:863`):

```ts
@Get('attempts/:id/questions')
@UseGuards(PermissionGuard)
@RequirePermissions('assessment.attempts.take')
getAttemptQuestions(@CurrentContext() c: RequestContext, @Param('id') id: string) {
  return this.mvpService.getAttemptQuestions(c.tenantId!, c.userId, id, c);
}
```

- [x] **Step 6: Run the unit test (PASS), then write the HTTP permission test** — create `test-player.http.integration.test.ts` mirroring `assessment-admin.http.integration.test.ts` exactly (same imports, same `makeTestApp` stub-controller helper, same envelope assertions). Cover the two new endpoints (this one + `/me/tests` from Task 5):

```ts
// Mirror assessment-admin.http.integration.test.ts structure.
// For GET /attempts/:id/questions assert:
//   - 401 when no auth context (auth_required)
//   - 403 when caller lacks 'assessment.attempts.take' (permission_denied)
//   - 200 + { data: [...] } envelope when permitted
// Use the same hand-rolled stub controller pattern (do NOT boot the real MvpController).
```

(Write the full file by copying `assessment-admin.http.integration.test.ts` and adapting the routes/permissions. Keep it to ~8 cases across both endpoints.)

- [x] **Step 7: Run both test files**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/mvp.service.test.ts src/modules/mvp/test-player.http.integration.test.ts --no-file-parallelism`
Expected: PASS.

- [x] **Step 8: Lint + commit**

```bash
npx eslint apps/backend/src/modules/mvp/mvp.controller.ts apps/backend/src/modules/mvp/mvp.service.ts apps/backend/src/modules/mvp/mvp.types.ts apps/backend/src/modules/mvp/test-player.http.integration.test.ts --max-warnings=0
git add apps/backend/src/modules/mvp/
git commit -m "feat(backend): Phase 3 Plan B — learner-safe GET /attempts/:id/questions (Task 4)"
```

---

## Task 5: Learner test discovery `GET /me/tests`

**Why:** gives the `/learner/tests` list a clean, scoped data source (browse → start).

**Files:**

- Modify: `apps/backend/src/modules/mvp/mvp.types.ts` (add `LearnerTestSummary`)
- Modify: `apps/backend/src/modules/mvp/mvp.service.ts` (add `listLearnerTests`)
- Modify: `apps/backend/src/modules/mvp/mvp.controller.ts` (add `GET /me/tests`)
- Test: `apps/backend/src/modules/mvp/mvp.service.test.ts` + extend `test-player.http.integration.test.ts`

- [x] **Step 1: Write the failing unit test** — append to `mvp.service.test.ts`:

```ts
describe('Plan B — listLearnerTests', () => {
  it('returns published tests for the learner enrolled courses with attempt status', () => {
    const { service, ctx } = makeServices();
    const env = seedAttemptEnv(service, ctx); // builds enrollment + group-course + test
    service.publishTest('tenant_demo', ctx.userId, env.testId, ctx);

    const tests = service.listLearnerTests('tenant_demo', ctx.userId, env.learnerId, ctx);

    expect(tests).toHaveLength(1);
    expect(tests[0]).toMatchObject({
      testId: env.testId,
      enrollmentId: env.enrollmentId,
      status: 'not_started'
    });
  });

  it('excludes tests for courses the learner is not enrolled in', () => {
    const { service, ctx } = makeServices();
    const env = seedAttemptEnv(service, ctx);
    // a second test on a course with NO group-course link for this learner
    const otherCourse = service.createCourse('tenant_demo', ctx.userId, { title: 'Other' }, ctx);
    const otherTest = service.createTest(
      'tenant_demo',
      ctx.userId,
      { courseId: otherCourse.id, title: 'Other test' },
      ctx
    );
    service.publishTest('tenant_demo', ctx.userId, otherTest.id, ctx);

    const tests = service.listLearnerTests('tenant_demo', ctx.userId, env.learnerId, ctx);
    expect(tests.map((t) => t.testId)).not.toContain(otherTest.id);
  });
});
```

(Verify the exact `createCourse` / `createTest` signatures in `mvp.service.ts` before finalizing the test; adapt arg shapes to match.)

- [x] **Step 2: Run it and confirm it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/mvp.service.test.ts --no-file-parallelism -t "listLearnerTests"`
Expected: FAIL — not a function.

- [x] **Step 3: Add the summary type** — in `mvp.types.ts`:

```ts
export interface LearnerTestSummary {
  testId: string;
  title: string;
  courseId: string;
  enrollmentId: string;
  status: 'not_started' | 'in_progress' | 'passed' | 'failed' | 'submitted';
  attemptsUsed: number;
  attemptLimit: number;
  bestScore?: number;
  maxScore?: number;
}
```

- [x] **Step 4: Implement `listLearnerTests`** — in `mvp.service.ts`, near `listExamResults`:

```ts
listLearnerTests(
  tenantId: string,
  _actorId: string | undefined,
  learnerId: string,
  _context: RequestContext
): LearnerTestSummary[] {
  const enrollments = this.state.enrollments.filter(
    (e) => e.tenantId === tenantId && e.learnerId === learnerId
  );
  const summaries: LearnerTestSummary[] = [];
  for (const enrollment of enrollments) {
    const courseIds = this.state.groupCourses
      .filter((gc) => gc.tenantId === tenantId && gc.groupId === enrollment.groupId)
      .map((gc) => gc.courseId);
    const tests = this.state.tests.filter(
      (t) => t.tenantId === tenantId && !t.isArchived && Boolean(t.publishedAt) && courseIds.includes(t.courseId)
    );
    for (const test of tests) {
      const attempts = this.state.attempts.filter(
        (a) => a.tenantId === tenantId && a.testId === test.id && a.enrollmentId === enrollment.id
      );
      const result = this.state.examResults.find(
        (r) => r.tenantId === tenantId && r.testId === test.id && r.enrollmentId === enrollment.id
      );
      const inProgress = attempts.some((a) => a.status === 'in_progress' || a.status === 'draft');
      const status: LearnerTestSummary['status'] = inProgress
        ? 'in_progress'
        : result
          ? result.passed ? 'passed' : 'failed'
          : attempts.length > 0 ? 'submitted' : 'not_started';
      summaries.push({
        testId: test.id,
        title: test.title,
        courseId: test.courseId,
        enrollmentId: enrollment.id,
        status,
        attemptsUsed: attempts.length,
        attemptLimit: test.rules.attemptLimit,
        ...(result?.finalScore !== undefined ? { bestScore: result.finalScore } : {}),
        ...(result?.maxScore !== undefined ? { maxScore: result.maxScore } : {})
      });
    }
  }
  return summaries;
}
```

Add `LearnerTestSummary` to the type import block in `mvp.service.ts`.

- [x] **Step 5: Add the controller endpoint** — in `mvp.controller.ts`, after the exam-results endpoints (`:947`). The learner is resolved from the actor's linked learner record; reuse the existing resolver if one exists (grep for `linkedIamUserId` lookups in the controller/service — Pillar A added `assertActorMatchesLearnerIamLink`; there should be a way to map `c.userId → learner`). If a `resolveLearnerIdForActor` helper does not exist, accept `learnerId` as a required query param validated against the link:

```ts
@Get('me/tests')
@UseGuards(PermissionGuard)
@RequirePermissions('assessment.tests.read')
listMyTests(@CurrentContext() c: RequestContext, @Query('learnerId') learnerId: string) {
  return this.mvpService.listLearnerTests(c.tenantId!, c.userId, learnerId, c);
}
```

(Prefer server-side resolution of `learnerId` from `c.userId` if the helper exists; fall back to the validated query param. Document whichever you choose in the closeout deviations.)

- [x] **Step 6: Extend the HTTP test** — add `/me/tests` cases to `test-player.http.integration.test.ts` (401 / 403 without `assessment.tests.read` / 200 envelope).

- [x] **Step 7: Run tests**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/mvp.service.test.ts src/modules/mvp/test-player.http.integration.test.ts --no-file-parallelism`
Expected: PASS.

- [x] **Step 8: Lint + commit**

```bash
npx eslint apps/backend/src/modules/mvp/mvp.controller.ts apps/backend/src/modules/mvp/mvp.service.ts apps/backend/src/modules/mvp/mvp.types.ts --max-warnings=0
git add apps/backend/src/modules/mvp/
git commit -m "feat(backend): Phase 3 Plan B — GET /me/tests learner discovery (Task 5)"
```

---

## Task 6 (optional schema parity): migration 0041

**Why:** keep the Postgres schema in step with the new `expectedAnswer` + `autoGraded` fields. The MVP module runs in-memory by default (`ALLOW_IN_MEMORY_STATE=true`), so the service tests above are the acceptance gate; this migration is additive/nullable and safe.

**Files:**

- Create: `apps/backend/migrations/0041_assessment_text_expected_answer.sql`
- Test: `apps/backend/src/modules/mvp/migrations.0041.test.ts` (mirror `migrations.0040.test.ts`)

- [x] **Step 1: Write the migration test** (regex assertions, mirroring `migrations.0040.test.ts`): assert the file adds `expected_answer text` to `assessment.questions`, `auto_graded boolean` to `assessment.attempt_answers`, and uses `IF NOT EXISTS`.

- [x] **Step 2: Run it → FAIL** (file missing).

- [x] **Step 3: Write the migration:**

```sql
-- 0041_assessment_text_expected_answer.sql
-- Phase 3 Plan B: store the short-answer (text) grading reference and per-answer
-- auto-grade flag. Additive + nullable — safe on existing rows.
ALTER TABLE assessment.questions
  ADD COLUMN IF NOT EXISTS expected_answer text;

ALTER TABLE assessment.attempt_answers
  ADD COLUMN IF NOT EXISTS auto_graded boolean;
```

- [x] **Step 4: Run the migration test → PASS.**

- [x] **Step 5: Commit**

```bash
git add apps/backend/migrations/0041_assessment_text_expected_answer.sql apps/backend/src/modules/mvp/migrations.0041.test.ts
git commit -m "feat(backend): Phase 3 Plan B — migration 0041 expected_answer + auto_graded (Task 6)"
```

---

## Task 7: Frontend — reconcile learner permission map

**Files:**

- Modify: `apps/frontend/src/lib/auth/permission-map.ts:81-87`
- Test: covered by the e2e in Task 10 (add assertion there).

- [x] **Step 1: Add the two missing permissions** to the `learner` array (align with backend seed `0038`):

```ts
learner: [
  'enrollments.read',
  'assessment.tests.read',
  'assessment.attempts.read',
  'assessment.attempts.take',
  'assessment.submissions.submit',
  'assessment.results.read',
  'assessment.assignments.read'
];
```

- [x] **Step 2: Lint**

Run: `npx eslint apps/frontend/src/lib/auth/permission-map.ts --max-warnings=0`
Expected: clean.

- [x] **Step 3: Commit**

```bash
git add apps/frontend/src/lib/auth/permission-map.ts
git commit -m "fix(frontend): Phase 3 Plan B — grant learner assessment.tests.read + attempts.read (Task 7)"
```

---

## Task 8: Frontend — `test-player` feature folder (types/api/hooks/format)

**Files:**

- Create: `apps/frontend/src/features/test-player/types.ts`
- Create: `apps/frontend/src/features/test-player/api.ts`
- Create: `apps/frontend/src/features/test-player/hooks.ts`
- Create: `apps/frontend/src/features/test-player/format.ts`
- Test: `apps/frontend/src/features/test-player/format.test.ts`, `apps/frontend/src/features/test-player/api.contract.test.ts`

- [x] **Step 1: Write `types.ts`:**

```ts
export type AttemptQuestionType =
  | 'single_choice'
  | 'multiple_choice'
  | 'number_input'
  | 'text'
  | 'essay';

export interface AttemptQuestionOption {
  id: string;
  text: string;
  sortOrder: number;
}

export interface AttemptQuestion {
  id: string;
  type: AttemptQuestionType;
  title: string;
  body?: string;
  score: number;
  options: AttemptQuestionOption[];
}

export interface AttemptDto {
  id: string;
  testId: string;
  enrollmentId: string;
  learnerId: string;
  attemptNo: number;
  status: string;
  startedAt: string;
  expiresAt?: string;
  score?: number;
  maxScore: number;
  passed?: boolean;
  questionOrder: string[];
}

export interface ExamResultDto {
  id: string;
  testId: string;
  enrollmentId: string;
  learnerId: string;
  attemptsCount: number;
  finalScore?: number;
  maxScore: number;
  passed: boolean;
}

export interface LearnerTestSummary {
  testId: string;
  title: string;
  courseId: string;
  enrollmentId: string;
  status: 'not_started' | 'in_progress' | 'passed' | 'failed' | 'submitted';
  attemptsUsed: number;
  attemptLimit: number;
  bestScore?: number;
  maxScore?: number;
}

export interface StartAttemptPayload {
  testId: string;
  enrollmentId: string;
  learnerId: string;
}

export interface SaveAnswerPayload {
  questionId: string;
  selectedOptionIds?: string[];
  textAnswer?: string;
}

/** Local-only draft state keyed by questionId (not sent verbatim). */
export type AnswerDraftMap = Record<string, { selectedOptionIds?: string[]; textAnswer?: string }>;
```

- [x] **Step 2: Write `api.ts`** (mirror `assessment-admin/api.ts:1-42` helpers exactly):

```ts
import { apiRequest } from '../../lib/api/client';

import type {
  AttemptDto,
  AttemptQuestion,
  ExamResultDto,
  LearnerTestSummary,
  SaveAnswerPayload,
  StartAttemptPayload
} from './types';
import type { UserSession } from '../../entities/session/model';

const withAuth = (session: UserSession) => ({
  auth: {
    userId: session.user.id,
    tenantId: session.user.tenantId,
    accessToken: session.tokens.accessToken
  }
});

export const testPlayerApi = {
  myTests: (session: UserSession, learnerId: string): Promise<LearnerTestSummary[]> =>
    apiRequest<LearnerTestSummary[]>(`/me/tests?learnerId=${encodeURIComponent(learnerId)}`, {
      method: 'GET',
      ...withAuth(session)
    }),
  startAttempt: (session: UserSession, payload: StartAttemptPayload): Promise<AttemptDto> =>
    apiRequest<AttemptDto>('/attempts/start', {
      method: 'POST',
      body: payload,
      ...withAuth(session)
    }),
  getAttempt: (session: UserSession, attemptId: string): Promise<AttemptDto> =>
    apiRequest<AttemptDto>(`/attempts/${attemptId}`, { method: 'GET', ...withAuth(session) }),
  getAttemptQuestions: (session: UserSession, attemptId: string): Promise<AttemptQuestion[]> =>
    apiRequest<AttemptQuestion[]>(`/attempts/${attemptId}/questions`, {
      method: 'GET',
      ...withAuth(session)
    }),
  saveAnswer: (
    session: UserSession,
    attemptId: string,
    payload: SaveAnswerPayload
  ): Promise<unknown> =>
    apiRequest(`/attempts/${attemptId}/answers`, {
      method: 'POST',
      body: payload,
      ...withAuth(session)
    }),
  submitAttempt: (session: UserSession, attemptId: string): Promise<AttemptDto> =>
    apiRequest<AttemptDto>(`/attempts/${attemptId}/submit`, {
      method: 'POST',
      ...withAuth(session)
    }),
  getAttemptResult: (session: UserSession, attemptId: string): Promise<ExamResultDto> =>
    apiRequest<ExamResultDto>(`/attempts/${attemptId}/result`, {
      method: 'GET',
      ...withAuth(session)
    })
};
```

- [x] **Step 3: Write `format.ts`:**

```ts
import type { LearnerTestSummary } from './types';

export const LEARNER_TEST_STATUS_LABEL: Record<LearnerTestSummary['status'], string> = {
  not_started: 'Не начат',
  in_progress: 'В процессе',
  submitted: 'На проверке',
  passed: 'Пройден',
  failed: 'Не пройден'
};

export function formatLearnerTestStatus(status: LearnerTestSummary['status']): string {
  return LEARNER_TEST_STATUS_LABEL[status] ?? status;
}

export function formatAttemptsLeft(used: number, limit: number): string {
  const left = Math.max(0, limit - used);
  return `Осталось попыток: ${left} из ${limit}`;
}

/** ms → "MM:SS"; clamps negatives to 00:00. */
export function formatTimeRemaining(msRemaining: number): string {
  const total = Math.max(0, Math.floor(msRemaining / 1000));
  const mm = String(Math.floor(total / 60)).padStart(2, '0');
  const ss = String(total % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

/** Remaining ms from an ISO expiry vs a now-ms; undefined expiry ⇒ null (no timer). */
export function remainingMsFromExpiry(expiresAt: string | undefined, nowMs: number): number | null {
  if (!expiresAt) return null;
  return new Date(expiresAt).getTime() - nowMs;
}

export function formatScoreLine(score: number | undefined, maxScore: number): string {
  return `${score ?? 0} / ${maxScore}`;
}
```

- [x] **Step 4: Write `format.test.ts`:**

```ts
import { describe, expect, it } from 'vitest';

import {
  formatAttemptsLeft,
  formatLearnerTestStatus,
  formatScoreLine,
  formatTimeRemaining,
  remainingMsFromExpiry
} from './format';

describe('test-player format', () => {
  it('maps RU status labels', () => {
    expect(formatLearnerTestStatus('passed')).toBe('Пройден');
    expect(formatLearnerTestStatus('not_started')).toBe('Не начат');
  });
  it('formats attempts left, clamped at 0', () => {
    expect(formatAttemptsLeft(1, 3)).toBe('Осталось попыток: 2 из 3');
    expect(formatAttemptsLeft(5, 3)).toBe('Осталось попыток: 0 из 3');
  });
  it('formats mm:ss and clamps negatives', () => {
    expect(formatTimeRemaining(65000)).toBe('01:05');
    expect(formatTimeRemaining(-1)).toBe('00:00');
  });
  it('computes remaining ms or null without expiry', () => {
    expect(remainingMsFromExpiry(undefined, 0)).toBeNull();
    expect(remainingMsFromExpiry(new Date(1000).toISOString(), 0)).toBe(1000);
  });
  it('formats score line', () => {
    expect(formatScoreLine(4, 5)).toBe('4 / 5');
    expect(formatScoreLine(undefined, 5)).toBe('0 / 5');
  });
});
```

- [x] **Step 5: Write `hooks.ts`** (queries via React Query; mutations via the `useState` `wrap` pattern from `assessment-admin/hooks.ts:120-152`):

```ts
'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { testPlayerApi } from './api';
import { ApiClientError } from '../../lib/api/client';
import { useAuth } from '../auth/context';

import type { AttemptDto, SaveAnswerPayload, StartAttemptPayload } from './types';

export function useMyTests(learnerId: string | null) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['test-player', 'my-tests', learnerId],
    enabled: Boolean(session) && Boolean(learnerId),
    queryFn: () => testPlayerApi.myTests(session!, learnerId!)
  });
}

export function useAttempt(attemptId: string | null) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['test-player', 'attempt', attemptId],
    enabled: Boolean(session) && Boolean(attemptId),
    queryFn: () => testPlayerApi.getAttempt(session!, attemptId!)
  });
}

export function useAttemptQuestions(attemptId: string | null) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['test-player', 'attempt-questions', attemptId],
    enabled: Boolean(session) && Boolean(attemptId),
    queryFn: () => testPlayerApi.getAttemptQuestions(session!, attemptId!)
  });
}

export function useAttemptResult(attemptId: string | null) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['test-player', 'attempt-result', attemptId],
    enabled: Boolean(session) && Boolean(attemptId),
    queryFn: () => testPlayerApi.getAttemptResult(session!, attemptId!)
  });
}

interface MutationState<T> {
  isPending: boolean;
  error: string | null;
  data: T | null;
}
function initial<T>(): MutationState<T> {
  return { isPending: false, error: null, data: null };
}
function describe(err: unknown, fallback: string): string {
  return err instanceof ApiClientError ? err.message : fallback;
}

export function useStartAttempt() {
  const { session } = useAuth();
  const [state, setState] = useState<MutationState<AttemptDto>>(initial());
  const mutate = async (payload: StartAttemptPayload) => {
    if (!session) return null;
    setState({ isPending: true, error: null, data: null });
    try {
      const data = await testPlayerApi.startAttempt(session, payload);
      setState({ isPending: false, error: null, data });
      return data;
    } catch (err) {
      setState({ isPending: false, error: describe(err, 'Не удалось начать тест'), data: null });
      return null;
    }
  };
  return { ...state, mutate, reset: () => setState(initial()) };
}

export function useSaveAnswer() {
  const { session } = useAuth();
  const [state, setState] = useState<MutationState<true>>(initial());
  const mutate = async (attemptId: string, payload: SaveAnswerPayload) => {
    if (!session) return null;
    setState({ isPending: true, error: null, data: null });
    try {
      await testPlayerApi.saveAnswer(session, attemptId, payload);
      setState({ isPending: false, error: null, data: true });
      return true;
    } catch (err) {
      setState({
        isPending: false,
        error: describe(err, 'Не удалось сохранить ответ'),
        data: null
      });
      return null;
    }
  };
  return { ...state, mutate, reset: () => setState(initial()) };
}

export function useSubmitAttempt() {
  const { session } = useAuth();
  const [state, setState] = useState<MutationState<AttemptDto>>(initial());
  const mutate = async (attemptId: string) => {
    if (!session) return null;
    setState({ isPending: true, error: null, data: null });
    try {
      const data = await testPlayerApi.submitAttempt(session, attemptId);
      setState({ isPending: false, error: null, data });
      return data;
    } catch (err) {
      setState({ isPending: false, error: describe(err, 'Не удалось завершить тест'), data: null });
      return null;
    }
  };
  return { ...state, mutate, reset: () => setState(initial()) };
}
```

- [x] **Step 6: Write `api.contract.test.ts`** (stub `fetch` with `vi.stubGlobal`, assert URL/method/body + envelope unwrap; mirror `assessment-admin/api.contract.test.ts`). Cover: `myTests` (GET, query param), `startAttempt` (POST body), `getAttemptQuestions` (GET), `saveAnswer` (POST body), `submitAttempt` (POST), `getAttemptResult` (GET). ~8 cases.

- [x] **Step 7: Run the feature tests**

Run: `pnpm --filter @cdoprof/frontend exec vitest run src/features/test-player/ --no-file-parallelism`
Expected: PASS.

- [x] **Step 8: Lint + commit**

```bash
npx eslint apps/frontend/src/features/test-player/ --max-warnings=0
git add apps/frontend/src/features/test-player/
git commit -m "feat(frontend): Phase 3 Plan B — test-player feature (types/api/hooks/format) (Task 8)"
```

---

## Task 9: Frontend — player screens

**Files:**

- Create: `apps/frontend/src/features/test-player/tests-list-screen.tsx`
- Create: `apps/frontend/src/features/test-player/test-attempt-screen.tsx`
- Create: `apps/frontend/src/features/test-player/test-result-screen.tsx`

Use the state-wrapper components (`PageContainer`, `PageHeader`, `SectionCard`, `SectionEmpty`, `SectionError`, `LoadingState`) from `apps/frontend/src/components/` and `@cdoprof/ui` primitives. Match the structure of an existing learner screen (e.g. `apps/frontend/src/features/mvp/screens.tsx` `LearnerCourseDetailsScreen`).

- [x] **Step 1: `tests-list-screen.tsx`** — `'use client'`; resolves the learner id from `useAuth()` (the linked learner). Uses `useMyTests`. Renders a list of `LearnerTestSummary` with `formatLearnerTestStatus` + `formatAttemptsLeft`. Each row links to `/learner/tests/[testId]` carrying `enrollmentId` (via query string `?enrollmentId=...`). Loading → `LoadingState`; error → `SectionError`; empty → `SectionEmpty` ("Нет доступных тестов").

```tsx
'use client';

import Link from 'next/link';

import { LoadingState } from '../../components/loading-state';
import { PageContainer } from '../../components/page-container';
import { PageHeader } from '../../components/page-header';
import { SectionCard } from '../../components/section-card';
import { SectionEmpty } from '../../components/section-empty';
import { SectionError } from '../../components/section-error';
import { useAuth } from '../auth/context';
import { formatAttemptsLeft, formatLearnerTestStatus } from './format';
import { useMyTests } from './hooks';

export function TestsListScreen() {
  const { session } = useAuth();
  const learnerId = session?.user.id ?? null; // resolved learner id; adjust if a dedicated learner link is exposed
  const { data, isLoading, isError } = useMyTests(learnerId);

  return (
    <PageContainer>
      <PageHeader title="Мои тесты" />
      {isLoading ? (
        <LoadingState />
      ) : isError ? (
        <SectionError message="Не удалось загрузить тесты" />
      ) : !data || data.length === 0 ? (
        <SectionEmpty message="Нет доступных тестов" />
      ) : (
        <SectionCard>
          <ul>
            {data.map((t) => (
              <li key={`${t.testId}:${t.enrollmentId}`}>
                <Link
                  href={`/learner/tests/${t.testId}?enrollmentId=${encodeURIComponent(t.enrollmentId)}`}
                >
                  {t.title}
                </Link>
                <span>{formatLearnerTestStatus(t.status)}</span>
                <span>{formatAttemptsLeft(t.attemptsUsed, t.attemptLimit)}</span>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
    </PageContainer>
  );
}
```

(Confirm the exact component import paths in `apps/frontend/src/components/` before writing — adapt names to the real files.)

- [x] **Step 2: `test-attempt-screen.tsx`** — the player. Auto-save (debounced 1500ms on the current question's draft), a countdown timer that auto-submits once at zero, Prev/Next navigation, and type-aware inputs. Full code:

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { LoadingState } from '../../components/loading-state';
import { PageContainer } from '../../components/page-container';
import { PageHeader } from '../../components/page-header';
import { SectionCard } from '../../components/section-card';
import { SectionError } from '../../components/section-error';
import { formatTimeRemaining, remainingMsFromExpiry } from './format';
import { useAttempt, useAttemptQuestions, useSaveAnswer, useSubmitAttempt } from './hooks';

import type { AnswerDraftMap, AttemptQuestion, SaveAnswerPayload } from './types';

interface TestAttemptScreenProps {
  testId: string;
  attemptId: string;
}

const AUTOSAVE_DELAY_MS = 1500;

export function TestAttemptScreen({ testId, attemptId }: TestAttemptScreenProps) {
  const router = useRouter();
  const { data: attempt, isLoading: attemptLoading, isError: attemptError } = useAttempt(attemptId);
  const {
    data: questions,
    isLoading: questionsLoading,
    isError: questionsError
  } = useAttemptQuestions(attemptId);
  const saveAnswer = useSaveAnswer();
  const submitAttempt = useSubmitAttempt();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [drafts, setDrafts] = useState<AnswerDraftMap>({});
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const autoSubmittedRef = useRef(false);

  const current: AttemptQuestion | undefined = questions?.[currentIndex];

  // Countdown timer.
  useEffect(() => {
    if (!attempt?.expiresAt) {
      setRemainingMs(null);
      return;
    }
    const tick = () => setRemainingMs(remainingMsFromExpiry(attempt.expiresAt, Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [attempt?.expiresAt]);

  const goToResult = () =>
    router.push(`/learner/tests/${testId}/result?attemptId=${encodeURIComponent(attemptId)}`);

  const handleSubmit = async () => {
    const result = await submitAttempt.mutate(attemptId);
    if (result) goToResult();
  };

  // Auto-submit exactly once when the timer hits zero.
  useEffect(() => {
    if (remainingMs === null || autoSubmittedRef.current) return;
    if (remainingMs <= 0) {
      autoSubmittedRef.current = true;
      void handleSubmit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remainingMs]);

  // Debounced auto-save of the current question's draft.
  useEffect(() => {
    if (!current) return;
    const draft = drafts[current.id];
    if (!draft) return;
    const handle = setTimeout(() => {
      const payload: SaveAnswerPayload = {
        questionId: current.id,
        ...(draft.selectedOptionIds ? { selectedOptionIds: draft.selectedOptionIds } : {}),
        ...(draft.textAnswer !== undefined ? { textAnswer: draft.textAnswer } : {})
      };
      void saveAnswer.mutate(attemptId, payload);
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, drafts]);

  if (attemptLoading || questionsLoading) return <LoadingState />;
  if (attemptError || questionsError || !attempt || !questions) {
    return <SectionError message="Не удалось загрузить попытку" />;
  }
  if (questions.length === 0) {
    return <SectionError message="В тесте нет вопросов" />;
  }

  const setChoice = (questionId: string, optionId: string, multiple: boolean) => {
    setDrafts((prev) => {
      const existing = prev[questionId]?.selectedOptionIds ?? [];
      const selectedOptionIds = multiple
        ? existing.includes(optionId)
          ? existing.filter((id) => id !== optionId)
          : [...existing, optionId]
        : [optionId];
      return { ...prev, [questionId]: { selectedOptionIds } };
    });
  };

  const setText = (questionId: string, textAnswer: string) => {
    setDrafts((prev) => ({ ...prev, [questionId]: { textAnswer } }));
  };

  const q = current!;
  const draft = drafts[q.id] ?? {};
  const isLast = currentIndex === questions.length - 1;

  return (
    <PageContainer>
      <PageHeader title="Прохождение теста" />
      <SectionCard>
        {remainingMs !== null ? <p>Осталось времени: {formatTimeRemaining(remainingMs)}</p> : null}
        <p>
          Вопрос {currentIndex + 1} из {questions.length}
        </p>
        <h2>{q.title}</h2>
        {q.body ? <p>{q.body}</p> : null}

        {(q.type === 'single_choice' || q.type === 'multiple_choice') &&
          q.options.map((o) => (
            <label key={o.id}>
              <input
                type={q.type === 'multiple_choice' ? 'checkbox' : 'radio'}
                name={q.id}
                checked={(draft.selectedOptionIds ?? []).includes(o.id)}
                onChange={() => setChoice(q.id, o.id, q.type === 'multiple_choice')}
              />
              {o.text}
            </label>
          ))}

        {q.type === 'number_input' && (
          <input
            type="number"
            value={draft.textAnswer ?? ''}
            onChange={(e) => setText(q.id, e.target.value)}
          />
        )}

        {q.type === 'text' && (
          <input
            type="text"
            value={draft.textAnswer ?? ''}
            onChange={(e) => setText(q.id, e.target.value)}
          />
        )}

        {q.type === 'essay' && (
          <textarea
            value={draft.textAnswer ?? ''}
            onChange={(e) => setText(q.id, e.target.value)}
          />
        )}
      </SectionCard>

      <div>
        <button
          type="button"
          disabled={currentIndex === 0}
          onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
        >
          Назад
        </button>
        {isLast ? (
          <button
            type="button"
            disabled={submitAttempt.isPending}
            onClick={() => void handleSubmit()}
          >
            Завершить тест
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setCurrentIndex((i) => Math.min(questions.length - 1, i + 1))}
          >
            Далее
          </button>
        )}
      </div>

      {submitAttempt.error ? <SectionError message={submitAttempt.error} /> : null}
    </PageContainer>
  );
}
```

(Confirm component import paths/props in `apps/frontend/src/components/` before writing; the timer is rendered as plain text inside the card to avoid assuming a `PageHeader` `actions` prop.)

- [x] **Step 3: `test-result-screen.tsx`** — pass/fail + score line + attempts count + back link. Full code:

```tsx
'use client';

import Link from 'next/link';

import { LoadingState } from '../../components/loading-state';
import { PageContainer } from '../../components/page-container';
import { PageHeader } from '../../components/page-header';
import { SectionCard } from '../../components/section-card';
import { SectionEmpty } from '../../components/section-empty';
import { SectionError } from '../../components/section-error';
import { formatScoreLine } from './format';
import { useAttemptResult } from './hooks';

interface TestResultScreenProps {
  testId: string;
  attemptId: string;
}

export function TestResultScreen({ attemptId }: TestResultScreenProps) {
  const { data: result, isLoading, isError } = useAttemptResult(attemptId || null);

  return (
    <PageContainer>
      <PageHeader title="Результат теста" />
      {isLoading ? (
        <LoadingState />
      ) : isError ? (
        <SectionError message="Не удалось загрузить результат" />
      ) : !result ? (
        <SectionEmpty message="Результат недоступен" />
      ) : (
        <SectionCard>
          <p>{result.passed ? 'Тест пройден' : 'Тест не пройден'}</p>
          <p>Баллы: {formatScoreLine(result.finalScore, result.maxScore)}</p>
          <p>Попыток: {result.attemptsCount}</p>
          <p>
            Развёрнутые ответы (эссе) при наличии проверит преподаватель — результат может
            измениться.
          </p>
          <Link href="/learner/tests">Назад к тестам</Link>
        </SectionCard>
      )}
    </PageContainer>
  );
}
```

(`testId` stays in the props type for the route to pass through but is intentionally not destructured — the result is fetched by `attemptId`. The reviewer note is shown unconditionally in V1 since `ExamResultDto` does not carry a "has-essay" flag; tightening it is a Plan C concern.)

- [x] **Step 4: Dynamic-import smoke check** (the e2e in Task 10 imports each screen). Quick local sanity:

Run: `pnpm --filter @cdoprof/frontend exec tsc --noEmit`
Expected: clean (no type errors in the three screens).

- [x] **Step 5: Lint + commit**

```bash
npx eslint apps/frontend/src/features/test-player/ --max-warnings=0
git add apps/frontend/src/features/test-player/
git commit -m "feat(frontend): Phase 3 Plan B — learner test player screens (Task 9)"
```

---

## Task 10: Frontend — routes, navigation, e2e

**Files:**

- Create: `apps/frontend/app/learner/tests/page.tsx`
- Create: `apps/frontend/app/learner/tests/[testId]/attempt/[attemptId]/page.tsx`
- Create: `apps/frontend/app/learner/tests/[testId]/result/page.tsx`
- Modify: `apps/frontend/src/features/navigation/model.ts`
- Test: `apps/frontend/src/e2e/learner-test-player.e2e.test.ts`

- [x] **Step 1: Routes** (mirror `app/learner/courses/[id]/page.tsx`):

`app/learner/tests/page.tsx`:

```tsx
import { TestsListScreen } from '../../../src/features/test-player/tests-list-screen';
import { ProtectedPage } from '../../../src/widgets/shell/protected-page';

export default function LearnerTestsPage() {
  return (
    <ProtectedPage>
      <TestsListScreen />
    </ProtectedPage>
  );
}
```

`app/learner/tests/[testId]/attempt/[attemptId]/page.tsx`:

```tsx
import { TestAttemptScreen } from '../../../../../../src/features/test-player/test-attempt-screen';
import { ProtectedPage } from '../../../../../../src/widgets/shell/protected-page';

export default async function LearnerAttemptPage({
  params
}: {
  params: Promise<{ testId: string; attemptId: string }>;
}) {
  const { testId, attemptId } = await params;
  return (
    <ProtectedPage>
      <TestAttemptScreen testId={testId} attemptId={attemptId} />
    </ProtectedPage>
  );
}
```

`app/learner/tests/[testId]/result/page.tsx`:

```tsx
import { TestResultScreen } from '../../../../../src/features/test-player/test-result-screen';
import { ProtectedPage } from '../../../../../src/widgets/shell/protected-page';

export default async function LearnerResultPage({
  params,
  searchParams
}: {
  params: Promise<{ testId: string }>;
  searchParams: Promise<{ attemptId?: string }>;
}) {
  const { testId } = await params;
  const { attemptId } = await searchParams;
  return (
    <ProtectedPage>
      <TestResultScreen testId={testId} attemptId={attemptId ?? ''} />
    </ProtectedPage>
  );
}
```

(Verify the relative `../` depth against the actual folder nesting before committing.)

- [x] **Step 2: Navigation** — in `apps/frontend/src/features/navigation/model.ts`, add to `routeMeta`:

```ts
{ pattern: '/learner/tests', meta: { public: false, requiredPermissions: ['assessment.tests.read'] } },
{ pattern: '/learner/tests/:testId/attempt/:attemptId', meta: { public: false, requiredPermissions: ['assessment.attempts.take'] } },
{ pattern: '/learner/tests/:testId/result', meta: { public: false, requiredPermissions: ['assessment.results.read'] } },
```

and to `navigationModel`:

```ts
{ href: '/learner/tests', label: 'Мои тесты', requiredPermissions: ['assessment.tests.read'] },
```

(Match the exact pattern syntax used by neighboring entries — confirm whether the router uses `:param` or `[param]` in `routeMeta` patterns and follow it.)

- [x] **Step 3: Write the e2e** — `learner-test-player.e2e.test.ts`, mirroring `admin-assessment-surface.e2e.test.ts:1-130`:

```ts
import { describe, expect, it } from 'vitest';

import {
  formatAttemptsLeft,
  formatLearnerTestStatus,
  formatTimeRemaining
} from '../features/test-player/format';
import { evaluateRouteAccess, getVisibleNavigation } from '../features/navigation/helpers';

import type { UserSession } from '../entities/session/model';

const learner: UserSession = {
  user: {
    id: 'u_learner',
    tenantId: 'tenant_demo',
    login: 'learner',
    email: null,
    status: 'active',
    displayName: 'Learner'
  },
  tokens: { accessToken: 'a', sessionId: 's1', expiresIn: 1000 },
  roles: ['learner'],
  permissions: [
    'enrollments.read',
    'assessment.tests.read',
    'assessment.attempts.read',
    'assessment.attempts.take',
    'assessment.results.read'
  ]
};
const noAssessment: UserSession = { ...learner, permissions: ['enrollments.read'] };

describe('learner test player — routing', () => {
  it('grants /learner/tests with assessment.tests.read', () => {
    expect(evaluateRouteAccess('/learner/tests', learner)).toEqual({ kind: 'ok' });
  });
  it('grants the attempt player with assessment.attempts.take', () => {
    expect(evaluateRouteAccess('/learner/tests/t1/attempt/at1', learner)).toEqual({ kind: 'ok' });
  });
  it('grants the result route with assessment.results.read', () => {
    expect(evaluateRouteAccess('/learner/tests/t1/result', learner)).toEqual({ kind: 'ok' });
  });
  it('denies /learner/tests without tests.read', () => {
    expect(evaluateRouteAccess('/learner/tests', noAssessment)).toEqual({ kind: 'forbidden' });
  });
  it('redirects to login with no session', () => {
    expect(evaluateRouteAccess('/learner/tests', null)).toEqual({ kind: 'redirect-login' });
  });
});

describe('learner test player — navigation', () => {
  it('shows "Мои тесты" to a learner with tests.read', () => {
    expect(getVisibleNavigation(learner).map((i) => i.href)).toContain('/learner/tests');
  });
  it('hides it without the permission', () => {
    expect(getVisibleNavigation(noAssessment).map((i) => i.href)).not.toContain('/learner/tests');
  });
});

describe('learner test player — format pipeline', () => {
  it('formats status, attempts, timer', () => {
    expect(formatLearnerTestStatus('in_progress')).toBe('В процессе');
    expect(formatAttemptsLeft(0, 2)).toBe('Осталось попыток: 2 из 2');
    expect(formatTimeRemaining(90000)).toBe('01:30');
  });
});

describe('learner test player — module smoke', () => {
  it('loads TestsListScreen', async () => {
    const mod = await import('../features/test-player/tests-list-screen');
    expect(typeof mod.TestsListScreen).toBe('function');
  });
  it('loads TestAttemptScreen', async () => {
    const mod = await import('../features/test-player/test-attempt-screen');
    expect(typeof mod.TestAttemptScreen).toBe('function');
  });
  it('loads TestResultScreen', async () => {
    const mod = await import('../features/test-player/test-result-screen');
    expect(typeof mod.TestResultScreen).toBe('function');
  });
});
```

- [x] **Step 4: Run the e2e + the whole frontend suite (regressions)**

Run: `pnpm --filter @cdoprof/frontend exec vitest run src/e2e/learner-test-player.e2e.test.ts src/features/test-player/ --no-file-parallelism`
then `pnpm test:frontend`
Expected: PASS, no regressions in the existing ~296 frontend tests.

- [x] **Step 5: Lint + commit**

```bash
npx eslint apps/frontend/app/learner/tests apps/frontend/src/features/navigation/model.ts apps/frontend/src/e2e/learner-test-player.e2e.test.ts --max-warnings=0
git add apps/frontend/app/learner/tests apps/frontend/src/features/navigation/model.ts apps/frontend/src/e2e/learner-test-player.e2e.test.ts
git commit -m "feat(frontend): Phase 3 Plan B — learner test routes + nav + e2e (Task 10)"
```

---

## Task 11: Closeout

**Files:**

- Modify: `LMS_AGENT_HANDOFF.md` (append `### 5.94`)
- Modify: `README.md` §2 (AI Agent State)
- Modify: this plan file (tick completed checkboxes)

- [x] **Step 1: Full quality gate**

Run: `pnpm -s ci:check`
Expected: green. (If the Cyrillic backend-suite crash appears, fall back to the isolated file runs listed in each task + note it, per CLAUDE.md.)

- [x] **Step 2: Canonical §39 E2E regression**

Run:

```
pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/business-flows.e2e.test.ts --no-file-parallelism
pnpm --filter @cdoprof/frontend exec vitest run src/e2e/lms-role-flows.e2e.test.ts src/e2e/canonical-e2e-readiness.e2e.test.ts --no-file-parallelism
```

Expected: PASS.

- [x] **Step 3: Write `### 5.94`** in `LMS_AGENT_HANDOFF.md` — summary, files changed, test counts, and deviations (especially: lifecycle reused not rebuilt; createQuestion was dropping grading fields; submit over-scoring bug fixed; `/me/tests` learnerId resolution choice; essay provisional-score limitation deferred to Plan C). Cross-link this plan.

- [x] **Step 4: Update `README.md` §2** — Last Completed Task = Phase 3 Plan B; Next Task = Phase 3 Plan C (submission lifecycle + reviewer scoring + essay grading). Bump migration high-water mark to 0041. Update Last Updated At/By.

- [x] **Step 5: Tick this plan's checkboxes**, then commit:

```bash
git add LMS_AGENT_HANDOFF.md README.md docs/superpowers/plans/2026-05-30-phase-3-plan-b-test-player.md
git commit -m "docs(handoff): Phase 3 Plan B complete — §5.94 + README sync (Task 11)"
```

---

## Acceptance gates (Phase 3 Plan B)

- [x] `createQuestion` persists `numericExpected` / `numericTolerance` / `expectedAnswer` / `tags`; `Question.expectedAnswer` is a typed field.
- [x] `gradeAnswer` correctly scores all five types (single/multi/number/text auto; essay abstains) — table tests green.
- [x] `submitAttempt` no longer over-scores `number_input`/`essay` and no longer zeroes correct `text`; per-answer `score` + `autoGraded` persisted.
- [x] `GET /attempts/:id/questions` returns ordered snapshot questions with **no** `isCorrect` / reference fields; gated by `assessment.attempts.take`; scoped to the attempt's learner.
- [x] `GET /me/tests` returns the learner's published, enrolled-course tests with attempt/result status; gated by `assessment.tests.read`.
- [x] Learner can reach `/learner/tests`, the attempt player, and the result route (permission-map reconciled; nav entry visible).
- [x] `pnpm -s ci:check` green (or documented Cyrillic fallback with isolated runs green).
- [x] Canonical §39 E2E (`business-flows.e2e.test.ts`, `lms-role-flows.e2e.test.ts`, `canonical-e2e-readiness.e2e.test.ts`) — no regressions.
- [x] `LMS_AGENT_HANDOFF.md` §5.94 + `README.md` §2 updated.

## Out of scope (deferred)

- **Plan C:** assignment submission lifecycle (upload → submit → return), reviewer scoring actions, manual essay grading (`completeAttemptReview`), reviewer queue active actions.
- **V1.1:** partial credit (multi-choice), question categories taxonomy, test versioning, relative numeric tolerance, Excel question import, course-viewer deep-link into a test.
- **Postgres column mapping** for `expected_answer`/`auto_graded` beyond the additive migration (MVP runs in-memory by default; mirror Plan A's numeric-column handling if/when the Postgres backend persists these).

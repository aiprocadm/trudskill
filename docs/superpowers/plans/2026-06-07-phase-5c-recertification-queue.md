# Phase 5C — Очередь «Нужна переаттестация» Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Дать администратору учебного центра экран «Нужна переаттестация» — список черновиков переаттестации (ФИО, курс, срок, «осталось»), с действиями «Убрать» и «Проверить сейчас», на уже построенных endpoints 5B.

**Architecture:** Преимущественно фронтенд. Единственная правка бэкенда — обогащение `GET /recertification-drafts` человекочитаемыми `learnerName` + `courseTitle` (+ `learnerSnils?`), резолвимыми из загруженного request-scoped `InMemoryMvpState` через переиспользуемые помощники из `reminders/reminder-recipients.ts`. Фронтенд — новый feature-модуль `features/recertification/` + страница `/admin/recertification` + запись в навигации-данными. Без новой миграции (права засеяны в 0048).

**Tech Stack:** NestJS (backend service), Next.js 15 App Router + TypeScript, React Query (`useQuery` для чтения), `@cdoprof/ui` (`DataTable`/`StatusChip`/`LoadingState`), Vitest.

**Спецификация:** [docs/superpowers/specs/2026-06-07-phase-5c-recertification-queue-design.md](../specs/2026-06-07-phase-5c-recertification-queue-design.md)

---

## File Structure

**Backend (обогащение списка):**

- Modify `apps/backend/src/modules/mvp/reminders/reminder-recipients.ts` — добавить `resolveLearnerDisplay(state, tenantId, learnerId)`.
- Create `apps/backend/src/modules/mvp/reminders/reminder-recipients.test.ts` — unit-тест нового резолвера.
- Modify `apps/backend/src/modules/mvp/recertification/recertification.service.ts` — тип `RecertificationDraftView` + `listDrafts` маппит строки в view.
- Modify `apps/backend/src/modules/mvp/recertification/recertification.service.test.ts` — describe-блок на обогащение.

**Frontend (новый feature-модуль + страница + навигация):**

- Create `apps/frontend/src/features/recertification/types.ts` — типы + лейблы статусов.
- Create `apps/frontend/src/features/recertification/format.ts` — `formatRemaining`, `formatSnils`, `RECERT_STATUS_LABELS` re-use.
- Create `apps/frontend/src/features/recertification/format.test.ts` — тесты формата.
- Create `apps/frontend/src/features/recertification/api.ts` — `list`/`reject`/`scan`.
- Create `apps/frontend/src/features/recertification/api.contract.test.ts` — конверт + URL/метод.
- Create `apps/frontend/src/features/recertification/hooks.ts` — `useRecertificationQueue` (`useQuery`) + `useRecertificationMutations` (`useState` wrappers).
- Create `apps/frontend/src/features/recertification/screens.tsx` — `RecertificationQueueScreen`.
- Create `apps/frontend/app/admin/recertification/page.tsx` — `<ProtectedPage>`.
- Modify `apps/frontend/src/features/navigation/model.ts` — `routeMeta` + `navigationModel`.
- Create `apps/frontend/src/e2e/recertification-queue.e2e.test.ts` — доступ к маршруту + навигация + smoke-import.

**Docs:**

- Modify `README.md` §2, `LMS_AGENT_HANDOFF.md` §5, и галочки этого плана.

---

## Task 1: Backend — резолвер отображения слушателя

**Files:**

- Modify: `apps/backend/src/modules/mvp/reminders/reminder-recipients.ts`
- Create: `apps/backend/src/modules/mvp/reminders/reminder-recipients.test.ts`

- [x] **Step 1: Write the failing test**

Create `apps/backend/src/modules/mvp/reminders/reminder-recipients.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { resolveLearnerDisplay } from './reminder-recipients.js';

import type { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';

const state = {
  learners: [
    {
      id: 'l1',
      tenantId: 't1',
      firstName: 'Иван',
      lastName: 'Иванов',
      middleName: 'Петрович',
      snils: '123-456-789 01'
    },
    { id: 'l2', tenantId: 't1', firstName: 'Анна', lastName: 'Сидорова' }
  ]
} as unknown as InMemoryMvpState;

describe('resolveLearnerDisplay', () => {
  it('builds ФИО as lastName firstName middleName and includes snils', () => {
    expect(resolveLearnerDisplay(state, 't1', 'l1')).toEqual({
      name: 'Иванов Иван Петрович',
      snils: '123-456-789 01'
    });
  });

  it('omits snils when absent and skips missing middleName', () => {
    expect(resolveLearnerDisplay(state, 't1', 'l2')).toEqual({ name: 'Сидорова Анна' });
  });

  it('returns empty name when learner is not found (graceful)', () => {
    expect(resolveLearnerDisplay(state, 't1', 'ghost')).toEqual({ name: '' });
  });

  it('does not leak learners across tenants', () => {
    expect(resolveLearnerDisplay(state, 'other', 'l1')).toEqual({ name: '' });
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/reminders/reminder-recipients.test.ts --no-file-parallelism`
Expected: FAIL — `resolveLearnerDisplay` is not exported.

- [x] **Step 3: Add the resolver**

Append to `apps/backend/src/modules/mvp/reminders/reminder-recipients.ts`:

```ts
/** Display name (ФИО) + СНИЛС for a learner id, for read-models (graceful empty when absent). */
export function resolveLearnerDisplay(
  state: InMemoryMvpState,
  tenantId: string,
  learnerId: string
): { name: string; snils?: string } {
  const learner = state.learners.find((l) => l.tenantId === tenantId && l.id === learnerId);
  if (!learner) return { name: '' };
  const name = [learner.lastName, learner.firstName, learner.middleName].filter(Boolean).join(' ');
  return { name, ...(learner.snils ? { snils: learner.snils } : {}) };
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/reminders/reminder-recipients.test.ts --no-file-parallelism`
Expected: PASS (4 tests).

- [x] **Step 5: Lint the touched files**

Run: `npx eslint apps/backend/src/modules/mvp/reminders/reminder-recipients.ts apps/backend/src/modules/mvp/reminders/reminder-recipients.test.ts --max-warnings=0`
Expected: no errors.

- [x] **Step 6: Commit**

```bash
git add apps/backend/src/modules/mvp/reminders/reminder-recipients.ts apps/backend/src/modules/mvp/reminders/reminder-recipients.test.ts
git commit -m "feat(backend): resolveLearnerDisplay helper for recertification read-model"
```

---

## Task 2: Backend — обогащение `listDrafts` → `RecertificationDraftView[]`

**Files:**

- Modify: `apps/backend/src/modules/mvp/recertification/recertification.service.ts`
- Modify: `apps/backend/src/modules/mvp/recertification/recertification.service.test.ts`

- [x] **Step 1: Write the failing test**

Append to `apps/backend/src/modules/mvp/recertification/recertification.service.test.ts` (after the existing `describe(...)` blocks; the `make()` helper and `doc()` are already defined at the top of the file):

```ts
describe('RecertificationService.listDrafts (enrichment)', () => {
  it('enriches each draft with learnerName + courseTitle resolved from state', async () => {
    const { service, drafts } = make();
    await drafts.create({
      tenantId: 't1',
      learnerId: 'l1',
      sourceDocumentId: 'gdoc1',
      courseVersionId: 'cv1',
      validUntil: '2026-08-01'
    });

    const views = await service.listDrafts('t1', {});

    expect(views).toHaveLength(1);
    expect(views[0]!.learnerName).toBe('Иванов Иван');
    expect(views[0]!.courseTitle).toBe('Охрана труда');
    // raw row fields are preserved
    expect(views[0]!.validUntil).toBe('2026-08-01');
    expect(views[0]!.status).toBe('pending');
  });

  it('degrades to empty strings when learner/course cannot be resolved', async () => {
    const { service, drafts } = make();
    await drafts.create({
      tenantId: 't1',
      learnerId: 'ghost',
      sourceDocumentId: 'gdoc9',
      courseVersionId: 'ghost',
      validUntil: '2026-08-01'
    });

    const views = await service.listDrafts('t1', {});

    expect(views[0]!.learnerName).toBe('');
    expect(views[0]!.courseTitle).toBe('');
    expect(views[0]!.learnerSnils).toBeUndefined();
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/recertification/recertification.service.test.ts --no-file-parallelism`
Expected: FAIL — `listDrafts` returns raw rows without `learnerName`/`courseTitle`.

- [x] **Step 3: Add the view type + enrich `listDrafts`**

In `apps/backend/src/modules/mvp/recertification/recertification.service.ts`:

(a) Extend the imports from reminder-recipients. Replace the existing scanner import block's reliance — add this import near the other relative imports at the top:

```ts
import {
  resolveCourseTitleByVersion,
  resolveLearnerDisplay
} from '../reminders/reminder-recipients.js';
```

(b) Add the exported view type just below the existing `export { ... }` re-export block (around line 25):

```ts
export interface RecertificationDraftView extends RecertificationDraftRow {
  learnerName: string;
  learnerSnils?: string;
  courseTitle: string;
}
```

(c) Replace the existing `listDrafts` method:

```ts
async listDrafts(
  tenantId: string,
  query: RecertificationDraftsQuery
): Promise<RecertificationDraftView[]> {
  const rows = await this.drafts.list(tenantId, query);
  return rows.map((row) => {
    const learner = resolveLearnerDisplay(this.state, tenantId, row.learnerId);
    return {
      ...row,
      learnerName: learner.name,
      ...(learner.snils ? { learnerSnils: learner.snils } : {}),
      courseTitle: resolveCourseTitleByVersion(this.state, tenantId, row.courseVersionId) ?? ''
    };
  });
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/recertification/recertification.service.test.ts --no-file-parallelism`
Expected: PASS (all prior tests + 2 new enrichment tests).

- [x] **Step 5: Verify the permission-boundary integration test still passes (shape unchanged for RBAC)**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/mvp.http.integration.test.ts --no-file-parallelism`
Expected: PASS — the `recertification permission boundary` describe block is unaffected (enrichment does not change permissions).

- [x] **Step 6: Lint**

Run: `npx eslint apps/backend/src/modules/mvp/recertification/recertification.service.ts apps/backend/src/modules/mvp/recertification/recertification.service.test.ts --max-warnings=0`
Expected: no errors.

- [x] **Step 7: Commit**

```bash
git add apps/backend/src/modules/mvp/recertification/recertification.service.ts apps/backend/src/modules/mvp/recertification/recertification.service.test.ts
git commit -m "feat(backend): enrich recertification-drafts list with learnerName + courseTitle"
```

---

## Task 3: Frontend — типы + формат

**Files:**

- Create: `apps/frontend/src/features/recertification/types.ts`
- Create: `apps/frontend/src/features/recertification/format.ts`
- Create: `apps/frontend/src/features/recertification/format.test.ts`

- [x] **Step 1: Write the types**

Create `apps/frontend/src/features/recertification/types.ts`:

```ts
/**
 * Phase 5C — типы UI очереди переаттестации. Дублируем backend-union на фронте,
 * чтобы лейблы статусов проверялись на этапе компиляции (как в licenses/types.ts).
 */

export type RecertificationDraftStatus = 'pending' | 'approved' | 'rejected';

/** Raw row as returned by reject/scan endpoints (без обогащения). */
export interface RecertificationDraft {
  id: string;
  tenantId: string;
  learnerId: string;
  sourceDocumentId: string;
  courseVersionId: string;
  validUntil: string;
  status: RecertificationDraftStatus;
  resultingEnrollmentId?: string;
  reason?: string;
  decidedAt?: string;
  decidedBy?: string;
  createdAt: string;
  updatedAt: string;
}

/** Enriched row returned by GET /recertification-drafts (list). */
export interface RecertificationDraftView extends RecertificationDraft {
  learnerName: string;
  learnerSnils?: string;
  courseTitle: string;
}

/** POST /recertification/scan summary. */
export interface RecertScanSummary {
  draftsCreated: number;
  emailsDispatched: number;
}

export const RECERT_STATUS_LABELS: Record<RecertificationDraftStatus, string> = {
  pending: 'Ожидает',
  approved: 'Одобрен',
  rejected: 'Отклонён'
};
```

- [x] **Step 2: Write the failing format test**

Create `apps/frontend/src/features/recertification/format.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { formatRemaining, formatSnils } from './format';
import { RECERT_STATUS_LABELS } from './types';

describe('formatRemaining', () => {
  it('future date → «через N дн.»', () => {
    expect(formatRemaining('2026-06-17', '2026-06-07')).toBe('через 10 дн.');
  });
  it('same date → «сегодня»', () => {
    expect(formatRemaining('2026-06-07', '2026-06-07')).toBe('сегодня');
  });
  it('past date → «просрочено N дн.»', () => {
    expect(formatRemaining('2026-06-01', '2026-06-07')).toBe('просрочено 6 дн.');
  });
  it('handles month boundary correctly', () => {
    expect(formatRemaining('2026-07-01', '2026-06-29')).toBe('через 2 дн.');
  });
});

describe('formatSnils', () => {
  it('returns dash for undefined', () => {
    expect(formatSnils(undefined)).toBe('—');
  });
  it('masks raw digits', () => {
    expect(formatSnils('12345678901')).toBe('123-456-789 01');
  });
  it('passes through already-masked', () => {
    expect(formatSnils('123-456-789 01')).toBe('123-456-789 01');
  });
});

describe('RECERT_STATUS_LABELS', () => {
  it('has Russian labels for each status', () => {
    expect(RECERT_STATUS_LABELS.pending).toBe('Ожидает');
    expect(RECERT_STATUS_LABELS.approved).toBe('Одобрен');
    expect(RECERT_STATUS_LABELS.rejected).toBe('Отклонён');
  });
});
```

- [x] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @cdoprof/frontend exec vitest run src/features/recertification/format.test.ts --no-file-parallelism`
Expected: FAIL — `./format` does not exist.

- [x] **Step 4: Write the format helpers**

Create `apps/frontend/src/features/recertification/format.ts`:

```ts
/** YYYY-MM-DD → integer day index in UTC (для безопасной арифметики дат без TZ-сдвигов). */
function toUtcDayIndex(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
}

/**
 * Сколько осталось до `validUntil` относительно `today` (обе строки — YYYY-MM-DD).
 * «дн.» — единая безопасная аббревиатура для любого числа дней (день/дня/дней).
 */
export function formatRemaining(validUntil: string, today: string): string {
  const days = Math.round(toUtcDayIndex(validUntil) - toUtcDayIndex(today));
  if (days > 0) return `через ${days} дн.`;
  if (days === 0) return 'сегодня';
  return `просрочено ${Math.abs(days)} дн.`;
}

/** Маска СНИЛС для отображения; «—» при отсутствии, без изменений при нестандартной длине. */
export function formatSnils(snils: string | undefined): string {
  if (!snils) return '—';
  const digits = snils.replace(/\D/g, '');
  if (digits.length !== 11) return snils;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 9)} ${digits.slice(9, 11)}`;
}
```

- [x] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @cdoprof/frontend exec vitest run src/features/recertification/format.test.ts --no-file-parallelism`
Expected: PASS (3 describe blocks).

- [x] **Step 6: Lint + commit**

```bash
npx eslint apps/frontend/src/features/recertification/types.ts apps/frontend/src/features/recertification/format.ts apps/frontend/src/features/recertification/format.test.ts --max-warnings=0
git add apps/frontend/src/features/recertification/types.ts apps/frontend/src/features/recertification/format.ts apps/frontend/src/features/recertification/format.test.ts
git commit -m "feat(frontend): recertification queue types + format helpers"
```

---

## Task 4: Frontend — API-клиент + контракт-тест

**Files:**

- Create: `apps/frontend/src/features/recertification/api.ts`
- Create: `apps/frontend/src/features/recertification/api.contract.test.ts`

- [x] **Step 1: Write the API client**

Create `apps/frontend/src/features/recertification/api.ts`:

```ts
import { apiRequest } from '../../lib/api/client';

import type {
  RecertScanSummary,
  RecertificationDraft,
  RecertificationDraftStatus,
  RecertificationDraftView
} from './types';
import type { UserSession } from '../../entities/session/model';

const withAuth = (session: UserSession) => ({
  auth: {
    userId: session.user.id,
    tenantId: session.user.tenantId,
    accessToken: session.tokens.accessToken
  }
});

export const recertificationApi = {
  list: (
    session: UserSession,
    status?: RecertificationDraftStatus
  ): Promise<RecertificationDraftView[]> =>
    apiRequest<RecertificationDraftView[]>(
      `/recertification-drafts${status ? `?status=${status}` : ''}`,
      withAuth(session)
    ),

  reject: (session: UserSession, id: string, reason?: string): Promise<RecertificationDraft> =>
    apiRequest<RecertificationDraft>(`/recertification-drafts/${id}/reject`, {
      method: 'POST',
      body: reason ? { reason } : {},
      ...withAuth(session)
    }),

  scan: (session: UserSession): Promise<RecertScanSummary> =>
    apiRequest<RecertScanSummary>('/recertification/scan', {
      method: 'POST',
      ...withAuth(session)
    })
};
```

- [x] **Step 2: Write the failing contract test**

Create `apps/frontend/src/features/recertification/api.contract.test.ts`:

```ts
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { recertificationApi as RecertApi } from './api';
import type { UserSession } from '../../entities/session/model';

const fetchMock = vi.fn();

const session: UserSession = {
  user: {
    id: 'u1',
    tenantId: 'tenant_demo',
    login: 'admin',
    email: 'admin@example.com',
    displayName: 'Admin',
    status: 'active'
  },
  tokens: { accessToken: 'token', sessionId: 's1', expiresIn: 300 },
  roles: ['tenant_admin'],
  permissions: ['recertification.read', 'recertification.write']
};

const envelope = <T>(data: T) =>
  JSON.stringify({
    data,
    meta: { requestId: 'req-1', correlationId: 'corr-1', timestamp: '2026-01-01T00:00:00.000Z' }
  });

describe('recertificationApi envelope compatibility (Phase 5C)', () => {
  let recertificationApi: typeof RecertApi;

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL ??= 'http://localhost:3001/api/v1';
    process.env.NEXT_PUBLIC_REALTIME_URL ??= 'ws://localhost:3002';
    process.env.PUBLIC_BASE_URL ??= 'http://localhost:3000';
    recertificationApi = (await import('./api')).recertificationApi;
  });

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('list unwraps array envelope and sets status query', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        envelope([
          {
            id: 'd1',
            tenantId: 'tenant_demo',
            learnerId: 'l1',
            sourceDocumentId: 'gd1',
            courseVersionId: 'cv1',
            validUntil: '2026-08-01',
            status: 'pending',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
            learnerName: 'Иванов Иван',
            courseTitle: 'Охрана труда'
          }
        ]),
        { status: 200 }
      )
    );

    const result = await recertificationApi.list(session, 'pending');

    expect(result).toHaveLength(1);
    expect(result[0]?.learnerName).toBe('Иванов Иван');
    expect(result[0]?.courseTitle).toBe('Охрана труда');

    const [calledUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const url = new URL(calledUrl);
    expect(url.pathname).toContain('/recertification-drafts');
    expect(url.searchParams.get('status')).toBe('pending');
    expect(init.method ?? 'GET').toBe('GET');
  });

  it('list omits status query when undefined', async () => {
    fetchMock.mockResolvedValueOnce(new Response(envelope([]), { status: 200 }));

    await recertificationApi.list(session);

    const [calledUrl] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new URL(calledUrl).searchParams.toString()).toBe('');
  });

  it('reject POSTs /recertification-drafts/:id/reject with reason body', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        envelope({
          id: 'd1',
          tenantId: 'tenant_demo',
          learnerId: 'l1',
          sourceDocumentId: 'gd1',
          courseVersionId: 'cv1',
          validUntil: '2026-08-01',
          status: 'rejected',
          reason: 'не требуется',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-02T00:00:00.000Z'
        }),
        { status: 200 }
      )
    );

    const result = await recertificationApi.reject(session, 'd1', 'не требуется');
    expect(result.status).toBe('rejected');

    const [calledUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toContain('/recertification-drafts/d1/reject');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string) as { reason?: string };
    expect(body.reason).toBe('не требуется');
  });

  it('reject sends empty body when no reason', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        envelope({
          id: 'd1',
          tenantId: 'tenant_demo',
          learnerId: 'l1',
          sourceDocumentId: 'gd1',
          courseVersionId: 'cv1',
          validUntil: '2026-08-01',
          status: 'rejected',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-02T00:00:00.000Z'
        }),
        { status: 200 }
      )
    );

    await recertificationApi.reject(session, 'd1');

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).toEqual({});
  });

  it('scan POSTs /recertification/scan and unwraps summary', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(envelope({ draftsCreated: 2, emailsDispatched: 3 }), { status: 200 })
    );

    const result = await recertificationApi.scan(session);
    expect(result.draftsCreated).toBe(2);
    expect(result.emailsDispatched).toBe(3);

    const [calledUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toContain('/recertification/scan');
    expect(init.method).toBe('POST');
  });
});
```

- [x] **Step 3: Run test to verify it passes**

Run: `pnpm --filter @cdoprof/frontend exec vitest run src/features/recertification/api.contract.test.ts --no-file-parallelism`
Expected: PASS (5 tests). (The API client was written in Step 1, so the test goes green immediately — this is an API-contract test, not strict red-first TDD.)

- [x] **Step 4: Lint + commit**

```bash
npx eslint apps/frontend/src/features/recertification/api.ts apps/frontend/src/features/recertification/api.contract.test.ts --max-warnings=0
git add apps/frontend/src/features/recertification/api.ts apps/frontend/src/features/recertification/api.contract.test.ts
git commit -m "feat(frontend): recertification queue api client + contract test"
```

---

## Task 5: Frontend — hooks (`useQuery` + `useState` мутации)

**Files:**

- Create: `apps/frontend/src/features/recertification/hooks.ts`

- [x] **Step 1: Write the hooks**

Create `apps/frontend/src/features/recertification/hooks.ts`:

```ts
'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { recertificationApi } from './api';
import { useAuth } from '../auth/context';

import type { RecertScanSummary, RecertificationDraftStatus } from './types';

export function useRecertificationQueue(status?: RecertificationDraftStatus) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['recertification-drafts', status ?? 'all'],
    enabled: Boolean(session),
    queryFn: () => recertificationApi.list(session!, status)
  });
}

/**
 * Ручные обёртки без `useMutation` — проект придерживается этого паттерна
 * (см. useLicensesMutations / useDomainMutations). На success — invalidate списка.
 */
export function useRecertificationMutations() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [rejectPending, setRejectPending] = useState(false);
  const [scanPending, setScanPending] = useState(false);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['recertification-drafts'] });

  return {
    rejectPending,
    scanPending,
    rejectDraft: async (id: string, reason?: string) => {
      if (!session) throw new Error('Нет активной сессии');
      setRejectPending(true);
      try {
        const result = await recertificationApi.reject(session, id, reason);
        await invalidate();
        return result;
      } finally {
        setRejectPending(false);
      }
    },
    runScan: async (): Promise<RecertScanSummary> => {
      if (!session) throw new Error('Нет активной сессии');
      setScanPending(true);
      try {
        const summary = await recertificationApi.scan(session);
        await invalidate();
        return summary;
      } finally {
        setScanPending(false);
      }
    }
  };
}
```

- [x] **Step 2: Typecheck the feature so far**

Run: `pnpm --filter @cdoprof/frontend exec tsc --noEmit`
Expected: PASS — no type errors. (Hooks have no standalone unit test; they are validated via typecheck + the e2e smoke-import in Task 8, matching the `licenses` feature which has no hooks test.)

- [x] **Step 3: Lint + commit**

```bash
npx eslint apps/frontend/src/features/recertification/hooks.ts --max-warnings=0
git add apps/frontend/src/features/recertification/hooks.ts
git commit -m "feat(frontend): recertification queue hooks (useQuery + manual mutations)"
```

---

## Task 6: Frontend — экран очереди

**Files:**

- Create: `apps/frontend/src/features/recertification/screens.tsx`

- [x] **Step 1: Write the screen**

Create `apps/frontend/src/features/recertification/screens.tsx`:

```tsx
'use client';

import { DataTable, LoadingState, StatusChip } from '@cdoprof/ui';
import { type ReactElement, useState } from 'react';

import { formatRemaining, formatSnils } from './format';
import { useRecertificationMutations, useRecertificationQueue } from './hooks';
import { RECERT_STATUS_LABELS, type RecertificationDraftStatus } from './types';
import {
  PageContainer,
  PageHeader,
  SectionCard,
  SectionEmpty,
  SectionError
} from '../../components/state-wrappers';

const STATUS_FILTER_OPTIONS: Array<{ value: RecertificationDraftStatus | ''; label: string }> = [
  { value: 'pending', label: 'Ожидают' },
  { value: 'rejected', label: 'Отклонённые' },
  { value: '', label: 'Все' }
];

interface QueueRow {
  id: string;
  status: RecertificationDraftStatus;
  learnerView: ReactElement;
  courseView: string;
  validUntil: string;
  remainingView: string;
  statusView: ReactElement;
  actionsView: ReactElement;
}

export function RecertificationQueueScreen(): ReactElement {
  const today = new Date().toISOString().slice(0, 10);
  const [statusFilter, setStatusFilter] = useState<RecertificationDraftStatus | ''>('pending');
  const { data, isLoading, error } = useRecertificationQueue(
    statusFilter === '' ? undefined : statusFilter
  );
  const { rejectPending, scanPending, rejectDraft, runScan } = useRecertificationMutations();
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const onScan = async () => {
    setNotice(null);
    setActionError(null);
    try {
      const summary = await runScan();
      setNotice(`Проверка завершена: создано черновиков — ${summary.draftsCreated}.`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Не удалось запустить проверку');
    }
  };

  const onReject = async (id: string) => {
    if (!window.confirm('Убрать запись из очереди?')) return;
    const reason = window.prompt('Причина (необязательно)') ?? undefined;
    setNotice(null);
    setActionError(null);
    try {
      await rejectDraft(id, reason || undefined);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Не удалось убрать запись');
    }
  };

  const rows: QueueRow[] = (data ?? []).map((draft) => ({
    id: draft.id,
    status: draft.status,
    learnerView: (
      <span>
        {draft.learnerName || '—'}
        <br />
        <span className="ui-text-muted">{formatSnils(draft.learnerSnils)}</span>
      </span>
    ),
    courseView: draft.courseTitle || '—',
    validUntil: draft.validUntil,
    remainingView: formatRemaining(draft.validUntil, today),
    statusView: <StatusChip status={RECERT_STATUS_LABELS[draft.status]} />,
    actionsView:
      draft.status === 'pending' ? (
        <button
          type="button"
          className="ui-button"
          onClick={() => void onReject(draft.id)}
          disabled={rejectPending}
        >
          Убрать
        </button>
      ) : (
        <span className="ui-text-muted">—</span>
      )
  }));

  return (
    <PageContainer>
      <PageHeader
        title="Нужна переаттестация"
        subtitle="Слушатели, у которых истекает срок действия удостоверения. Перезачисление — через «Массовую загрузку»."
        actions={
          <button
            type="button"
            className="ui-button"
            onClick={() => void onScan()}
            disabled={scanPending}
          >
            {scanPending ? 'Проверяем…' : 'Проверить сейчас'}
          </button>
        }
      />

      <SectionCard title="Очередь переаттестации">
        <div className="ui-inline" style={{ marginBottom: 12, gap: 8 }}>
          <label className="ui-inline" style={{ gap: 4 }}>
            <span>Статус:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as RecertificationDraftStatus | '')}
            >
              {STATUS_FILTER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {notice ? <p className="ui-callout">{notice}</p> : null}
        {actionError ? <SectionError message={actionError} /> : null}

        {isLoading ? <LoadingState message="Загрузка очереди…" /> : null}
        {error ? <SectionError message="Не удалось загрузить очередь переаттестации" /> : null}
        {!isLoading && !error && rows.length === 0 ? (
          <SectionEmpty
            message="Сейчас никому не нужна переаттестация"
            hint="Нажмите «Проверить сейчас», чтобы проверить сроки удостоверений"
          />
        ) : null}
        {!isLoading && !error && rows.length > 0 ? (
          <DataTable<QueueRow>
            columns={[
              { key: 'learnerView', title: 'Слушатель', render: (row) => row.learnerView },
              { key: 'courseView', title: 'Курс' },
              { key: 'validUntil', title: 'Действует до' },
              { key: 'remainingView', title: 'Осталось' },
              { key: 'statusView', title: 'Статус', render: (row) => row.statusView },
              { key: 'actionsView', title: 'Действие', render: (row) => row.actionsView }
            ]}
            rows={rows}
          />
        ) : null}
      </SectionCard>
    </PageContainer>
  );
}
```

- [x] **Step 2: Typecheck**

Run: `pnpm --filter @cdoprof/frontend exec tsc --noEmit`
Expected: PASS — no type errors.

- [x] **Step 3: Lint + commit**

```bash
npx eslint apps/frontend/src/features/recertification/screens.tsx --max-warnings=0
git add apps/frontend/src/features/recertification/screens.tsx
git commit -m "feat(frontend): recertification queue screen"
```

---

## Task 7: Frontend — страница + навигация

**Files:**

- Create: `apps/frontend/app/admin/recertification/page.tsx`
- Modify: `apps/frontend/src/features/navigation/model.ts`

- [x] **Step 1: Create the page**

Create `apps/frontend/app/admin/recertification/page.tsx`:

```tsx
import { RecertificationQueueScreen } from '../../../src/features/recertification/screens';
import { ProtectedPage } from '../../../src/widgets/shell/protected-page';

export default function AdminRecertificationPage() {
  return (
    <ProtectedPage>
      <RecertificationQueueScreen />
    </ProtectedPage>
  );
}
```

- [x] **Step 2: Add the route meta**

In `apps/frontend/src/features/navigation/model.ts`, add to the `routeMeta` array immediately after the `/admin/clients` (non-`[id]`) entry (around line 80):

```ts
  {
    pattern: '/admin/recertification',
    meta: { public: false, requiredPermissions: ['recertification.read'] }
  },
```

- [x] **Step 3: Add the navigation item**

In the same file, append to the end of the `navigationModel` array (after the `/admin/clients` entry, before the closing `]`):

```ts
  ,
  {
    href: '/admin/recertification',
    label: 'Переаттестация',
    requiredPermissions: ['recertification.read'],
    navSlot: 'more'
  }
```

(Note: the existing last array element has no trailing comma — ensure exactly one comma separates it from this new entry.)

- [x] **Step 4: Typecheck**

Run: `pnpm --filter @cdoprof/frontend exec tsc --noEmit`
Expected: PASS.

- [x] **Step 5: Lint + commit**

```bash
npx eslint apps/frontend/app/admin/recertification/page.tsx apps/frontend/src/features/navigation/model.ts --max-warnings=0
git add apps/frontend/app/admin/recertification/page.tsx apps/frontend/src/features/navigation/model.ts
git commit -m "feat(frontend): /admin/recertification page + navigation entry"
```

---

## Task 8: Frontend — e2e smoke (маршрут + навигация + импорт)

**Files:**

- Create: `apps/frontend/src/e2e/recertification-queue.e2e.test.ts`

- [x] **Step 1: Write the e2e test**

Create `apps/frontend/src/e2e/recertification-queue.e2e.test.ts`:

```ts
/**
 * Phase 5C — E2E smoke для очереди «Нужна переаттестация».
 *
 * По конвенциям проекта (см. admin-bulk-enrollment.e2e.test.ts): routing/permission
 * через evaluateRouteAccess + getVisibleNavigation + smoke-import экрана. Реальный
 * React mount нет (RTL не в зависимостях); бизнес-логика покрыта unit/contract-тестами.
 */

import { describe, expect, it } from 'vitest';

import { evaluateRouteAccess, getVisibleNavigation } from '../features/navigation/helpers';

import type { UserSession } from '../entities/session/model';

const adminWithRecert: UserSession = {
  user: {
    id: 'u_admin',
    tenantId: 'tenant_demo',
    login: 'admin',
    email: null,
    status: 'active',
    displayName: 'Admin'
  },
  tokens: { accessToken: 'a', sessionId: 's1', expiresIn: 1000 },
  roles: ['tenant_admin'],
  permissions: ['recertification.read', 'recertification.write']
};

const adminWithout: UserSession = {
  ...adminWithRecert,
  permissions: ['courses.read']
};

describe('recertification queue E2E smoke', () => {
  it('route: /admin/recertification needs recertification.read', () => {
    expect(evaluateRouteAccess('/admin/recertification', adminWithRecert)).toEqual({ kind: 'ok' });
    expect(evaluateRouteAccess('/admin/recertification', adminWithout)).toEqual({
      kind: 'forbidden'
    });
    expect(evaluateRouteAccess('/admin/recertification', null)).toEqual({
      kind: 'redirect-login'
    });
  });

  it('nav: «Переаттестация» visible only with recertification.read', () => {
    expect(getVisibleNavigation(adminWithRecert).map((i) => i.href)).toContain(
      '/admin/recertification'
    );
    expect(getVisibleNavigation(adminWithout).map((i) => i.href)).not.toContain(
      '/admin/recertification'
    );
  });

  it('smoke: RecertificationQueueScreen module loads (no broken imports)', async () => {
    const mod = await import('../features/recertification/screens');
    expect(typeof mod.RecertificationQueueScreen).toBe('function');
  });

  it('smoke: hooks module loads', async () => {
    const mod = await import('../features/recertification/hooks');
    expect(typeof mod.useRecertificationQueue).toBe('function');
    expect(typeof mod.useRecertificationMutations).toBe('function');
  });
});
```

- [x] **Step 2: Run the e2e test**

Run: `pnpm --filter @cdoprof/frontend exec vitest run src/e2e/recertification-queue.e2e.test.ts --no-file-parallelism`
Expected: PASS (4 tests) — confirms Task 7 wiring (route + nav) and module imports.

- [x] **Step 3: Lint + commit**

```bash
npx eslint apps/frontend/src/e2e/recertification-queue.e2e.test.ts --max-warnings=0
git add apps/frontend/src/e2e/recertification-queue.e2e.test.ts
git commit -m "test(frontend): recertification queue e2e smoke (route + nav + imports)"
```

---

## Task 9: Полная верификация + документация

**Files:**

- Modify: `README.md` (§2 AI Agent State)
- Modify: `LMS_AGENT_HANDOFF.md` (§5.XX — next sequential number)
- Modify: `docs/superpowers/plans/2026-06-07-phase-5c-recertification-queue.md` (tick checkboxes)

- [x] **Step 1: Run the full targeted test set**

```bash
pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/reminders/reminder-recipients.test.ts src/modules/mvp/recertification/recertification.service.test.ts --no-file-parallelism
pnpm --filter @cdoprof/frontend exec vitest run src/features/recertification/format.test.ts src/features/recertification/api.contract.test.ts src/e2e/recertification-queue.e2e.test.ts --no-file-parallelism
```

Expected: all PASS.

- [x] **Step 2: Whole-repo typecheck**

Run: `pnpm typecheck`
Expected: PASS (8/8 tasks).

- [x] **Step 3: Update README §2 «AI Agent State»**

Update `Current Stage` / `Last Completed Task` / `Current Task` / `Next Task` / `Last Updated At` / `By` to reflect: Phase 5C — recertification queue UI implemented (enriched list endpoint + `/admin/recertification` + nav). Next task: deferred 5C-2 (approve/auto-enroll) or other Phase-5 tails.

- [x] **Step 4: Append `### 5.XX` to `LMS_AGENT_HANDOFF.md`**

Add a sequentially-numbered entry (after the current highest §5.NN): summary, files changed, test status (targeted suites green, typecheck 8/8), deviations (none / note any), and cross-link this plan + the spec.

- [x] **Step 5: Tick the checkboxes in this plan file** (Tasks 1–9), then commit docs.

```bash
git add README.md LMS_AGENT_HANDOFF.md docs/superpowers/plans/2026-06-07-phase-5c-recertification-queue.md
git commit -m "docs: record Phase 5C recertification queue (handoff 5.XX)"
```

---

## Self-Review

**1. Spec coverage** (against [the spec](../specs/2026-06-07-phase-5c-recertification-queue-design.md)):

- §1.2 backend enrichment (`learnerName`/`courseTitle`/`learnerSnils?`) → Tasks 1–2 ✅
- §1.2 feature-модуль (`types`/`api`/`hooks`/`format`/`screens`) → Tasks 3–6 ✅
- §1.2 страница `/admin/recertification` → Task 7 ✅
- §1.2 навигация (`routeMeta` + `navigationModel`) → Task 7 ✅
- §3.3 экран (фильтр статуса, колонки, «Убрать», «Проверить сейчас», пустое/ошибка/загрузка) → Task 6 ✅
- §3.1 «НЕ включаем `sourceDocumentNumber`» → respected (no task fetches it) ✅
- §2 «Только список» — нет approve/auto-enroll в UI → respected (reject + scan only) ✅
- §6 тесты (service enrichment, api.contract, format, e2e route/nav) → Tasks 2, 3, 4, 8 ✅
- §5 права (`read` для просмотра, `write` для reject/scan) → routeMeta uses `recertification.read`; backend endpoints already enforce write (unchanged) ✅

**2. Placeholder scan:** No `TBD`/`TODO`/«handle errors» — every code step shows full code. §5.XX in Task 9 is intentionally the next sequential handoff number (resolved at execution). ✅

**3. Type consistency:**

- Backend `RecertificationDraftView extends RecertificationDraftRow` (Task 2) — frontend mirror `RecertificationDraftView extends RecertificationDraft` (Task 3) with matching enriched fields `learnerName`/`learnerSnils?`/`courseTitle`. ✅
- `resolveLearnerDisplay(state, tenantId, learnerId) → { name; snils? }` (Task 1) consumed in Task 2 with `learner.name` / `learner.snils`. ✅
- `recertificationApi.list → RecertificationDraftView[]`, `reject → RecertificationDraft`, `scan → RecertScanSummary` (Task 4) consumed by hooks (Task 5) and screen (Task 6) with matching names (`rejectDraft`/`runScan`/`rejectPending`/`scanPending`). ✅
- Screen uses `RECERT_STATUS_LABELS`, `formatRemaining`, `formatSnils` exactly as exported in Tasks 3. ✅

No issues found.

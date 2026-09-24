import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as ReadinessModule from './issue-readiness';
import type { UserSession } from '../../entities/session/model';

const fetchMock = vi.fn();

const session: UserSession = {
  user: {
    id: 'u1',
    tenantId: 'tenant_demo',
    login: 'curator',
    email: 'c@example.com',
    displayName: 'Куратор',
    status: 'active'
  },
  tokens: { accessToken: 'token', sessionId: 's1', expiresIn: 300 },
  roles: ['curator'],
  permissions: ['groups.read']
};

const report = (over: Partial<ReadinessModule.IssueReadinessReport> = {}) => ({
  ready: false,
  center: [],
  group: [],
  learners: [],
  totals: { learners: 12, learnersReady: 12 },
  consentRequired: false,
  ...over
});

describe('что мешает выпустить документы (МГ-F5.1, срез 20.1)', () => {
  let mod: typeof ReadinessModule;

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL ??= 'http://localhost:3001/api/v1';
    process.env.NEXT_PUBLIC_REALTIME_URL ??= 'ws://localhost:3002';
    process.env.PUBLIC_BASE_URL ??= 'http://localhost:3000';
    mod = await import('./issue-readiness');
  });

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('GET /groups/:id/issue-readiness разворачивает конверт', async () => {
    const body = report({
      learners: [
        {
          learnerId: 'l1',
          learnerName: 'Иванов Иван',
          issues: [{ code: 'learner_birth_date_missing', message: 'Не указана дата рождения' }]
        }
      ],
      totals: { learners: 12, learnersReady: 11 }
    });
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: body,
          meta: { requestId: 'r', correlationId: 'c', timestamp: '2026-09-24T10:00:00.000Z' }
        }),
        { status: 200 }
      )
    );
    await expect(mod.issueReadinessApi.fetch(session, 'g1')).resolves.toEqual(body);
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/groups\/g1\/issue-readiness$/);
  });

  it('сводка отвечает «можно ли выпускать» словами', () => {
    expect(mod.readinessSummary(report({ ready: true }))).toBe(
      'Всё готово к выпуску документов: слушателей — 12.'
    );
    expect(
      mod.readinessSummary(report({ ready: true, totals: { learners: 0, learnersReady: 0 } }))
    ).toContain('нет слушателей');
    expect(
      mod.readinessSummary(
        report({
          center: [{ code: 'center_license_missing', message: 'Нужно добавить лицензию' }],
          totals: { learners: 12, learnersReady: 9 }
        })
      )
    ).toBe('Выпуск пока не пройдёт: центр настроен не до конца; не готовы слушатели: 3 из 12.');
  });
});

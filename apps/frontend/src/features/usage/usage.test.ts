import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { FEATURE_LABELS, formatGb, usageLevel, usagePercent } from './types';

import type { usageApi as UsageApi } from './api';
import type { UserSession } from '../../entities/session/model';

describe('usage helpers (ФТ-D4.2)', () => {
  it('пороги тревоги: 80% предупреждение, 95% критично, 100% исчерпано', () => {
    expect(usageLevel(79, 100)).toBe('ok');
    expect(usageLevel(80, 100)).toBe('warning');
    expect(usageLevel(94, 100)).toBe('warning');
    expect(usageLevel(95, 100)).toBe('critical');
    expect(usageLevel(100, 100)).toBe('exceeded');
    expect(usageLevel(150, 100)).toBe('exceeded');
  });

  it('безлимит: null или неположительный лимит', () => {
    expect(usageLevel(1000, null)).toBe('unlimited');
    expect(usageLevel(5, 0)).toBe('unlimited');
    expect(usagePercent(5, null)).toBeNull();
  });

  it('процент не перелетает за 100 (для ширины прогресс-бара)', () => {
    expect(usagePercent(150, 100)).toBe(100);
    expect(usagePercent(50, 100)).toBe(50);
  });

  it('formatGb и подписи флагов', () => {
    expect(formatGb(4 * 1024 ** 3)).toBe('4.0 ГБ');
    expect(Object.keys(FEATURE_LABELS).sort()).toEqual(['api', 'proctoring', 'scorm', 'webinars']);
  });
});

describe('usage api contract (ФТ-D4.2)', () => {
  const fetchMock = vi.fn();
  let usageApi: typeof UsageApi;

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL ??= 'http://localhost:3001/api/v1';
    process.env.NEXT_PUBLIC_REALTIME_URL ??= 'ws://localhost:3002';
    process.env.PUBLIC_BASE_URL ??= 'http://localhost:3000';
    usageApi = (await import('./api')).usageApi;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('get разворачивает конверт и ходит с заголовком тенанта', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            plan: { code: 'basic', name: 'Базовый', features: { scorm: true } },
            activeLearners: { used: 80, limit: 100 },
            staff: { used: 3, limit: 10 },
            storage: { usedBytes: 1024, limitBytes: null }
          },
          meta: { requestId: 'r1', correlationId: 'c1', timestamp: '2026-08-04T00:00:00.000Z' }
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );

    const session = {
      user: { id: 'u1', tenantId: 'tenant_demo' },
      tokens: { accessToken: 't' }
    } as UserSession;
    const result = await usageApi.get(session);

    expect(result.plan?.code).toBe('basic');
    expect(result.activeLearners.limit).toBe(100);
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toContain('/tenant/usage');
    expect(new Headers(init.headers).get('x-tenant-id')).toBe('tenant_demo');
  });
});

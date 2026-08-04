import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { HEALTH_LABELS, formatMoment, healthLevel, healthProblems } from './api';

import type { platformHealthApi as HealthApi, TenantHealthDto } from './api';
import type { UserSession } from '../../entities/session/model';

const tenant = (overrides: Partial<TenantHealthDto> = {}): TenantHealthDto => ({
  tenantId: 't1',
  code: 'demo',
  name: 'Демо',
  status: 'active',
  documentTasksQueued: 0,
  documentTasksFailed: 0,
  syncJobsPending: 0,
  syncJobsFailed: 0,
  deadLetters: 0,
  exportsFailed: 0,
  lastExportAt: null,
  lastActivityAt: '2026-08-04T12:30:00.000Z',
  ...overrides
});

describe('здоровье арендаторов (ФТ-D7)', () => {
  it('очередь сама по себе — НЕ поломка, это нормальная работа', () => {
    expect(healthLevel(tenant({ documentTasksQueued: 5 }))).toBe('busy');
    expect(healthProblems(tenant({ documentTasksQueued: 5 }))).toEqual([]);
  });

  it('фактические отказы дают тревогу и перечисляются человеческими словами', () => {
    const t = tenant({ documentTasksFailed: 2, deadLetters: 3 });
    expect(healthLevel(t)).toBe('broken');
    expect(healthProblems(t)).toEqual([
      'документы не выпустились: 2',
      'сообщений в карантине: 3'
    ]);
  });

  it('отказ важнее занятости: с очередью И отказом — тревога', () => {
    expect(healthLevel(tenant({ documentTasksQueued: 9, syncJobsFailed: 1 }))).toBe('broken');
  });

  it('центр без единой записи в журнале помечается как неактивный', () => {
    expect(healthLevel(tenant({ lastActivityAt: null }))).toBe('idle');
  });

  it('спокойный работающий центр — «в порядке»', () => {
    expect(healthLevel(tenant())).toBe('ok');
    expect(HEALTH_LABELS[healthLevel(tenant())]).toBe('В порядке');
  });

  it('у каждого состояния есть подпись', () => {
    expect(Object.keys(HEALTH_LABELS).sort()).toEqual(['broken', 'busy', 'idle', 'ok']);
  });

  it('время показывается по-русски, пустое — прочерком', () => {
    expect(formatMoment(null)).toBe('—');
    expect(formatMoment('мусор')).toBe('—');
    expect(formatMoment('2026-08-04T12:30:00.000Z')).toMatch(/^4 августа, \d{2}:\d{2}$/);
  });
});

describe('platform health api contract (ФТ-D7)', () => {
  const fetchMock = vi.fn();
  let platformHealthApi: typeof HealthApi;

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL ??= 'http://localhost:3001/api/v1';
    process.env.NEXT_PUBLIC_REALTIME_URL ??= 'ws://localhost:3002';
    process.env.PUBLIC_BASE_URL ??= 'http://localhost:3000';
    platformHealthApi = (await import('./api')).platformHealthApi;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('get разворачивает конверт и ходит на платформенный путь', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            tenants: [tenant({ deadLetters: 4 })],
            platformOutbox: { pending: 2, failed: 0 },
            generatedAt: '2026-08-04T15:00:00.000Z'
          },
          meta: { requestId: 'r1', correlationId: 'c1', timestamp: '2026-08-04T15:00:00.000Z' }
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );

    const session = {
      user: { id: 'u1', tenantId: 'tenant_demo' },
      tokens: { accessToken: 't' }
    } as UserSession;
    const result = await platformHealthApi.get(session);

    expect(result.tenants[0]?.deadLetters).toBe(4);
    expect(result.platformOutbox.pending).toBe(2);
    const [url] = fetchMock.mock.calls[0]! as [string];
    expect(url).toContain('/platform/health/tenants');
  });
});

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { parentCandidates } from './direction-drawer';

import type { directionsApi as DirectionsApi } from './api';
import type { UserSession } from '../../entities/session/model';
import type { Direction } from '../mvp/types';

const fetchMock = vi.fn();

const session: UserSession = {
  user: {
    id: 'u1',
    tenantId: 'tenant_demo',
    login: 'methodist',
    email: 'm@example.com',
    displayName: 'Методист',
    status: 'active'
  },
  tokens: { accessToken: 'token', sessionId: 's1', expiresIn: 300 },
  roles: ['methodist'],
  permissions: ['directions.read', 'directions.write']
};

const envelope = <T>(data: T) =>
  JSON.stringify({
    data,
    meta: { requestId: 'r', correlationId: 'c', timestamp: '2026-01-01T00:00:00.000Z' }
  });

const dir = (id: string, parentDirectionId?: string, status = 'active'): Direction =>
  ({
    id,
    tenantId: 't',
    code: id,
    name: id,
    status,
    createdAt: '',
    updatedAt: '',
    ...(parentDirectionId ? { parentDirectionId } : {})
  }) as Direction;

describe('направления (МГ-E1.1, срез 15.2)', () => {
  let api: typeof DirectionsApi;

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL ??= 'http://localhost:3001/api/v1';
    process.env.NEXT_PUBLIC_REALTIME_URL ??= 'ws://localhost:3002';
    process.env.PUBLIC_BASE_URL ??= 'http://localhost:3000';
    api = (await import('./api')).directionsApi;
  });

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('создание — POST /directions, правка и архив — PUT /directions/:id', async () => {
    fetchMock.mockImplementation(
      async () => new Response(envelope({ id: 'd1', code: 'R13', name: 'ОТ' }), { status: 200 })
    );
    await api.create(session, { code: 'R13', name: 'ОТ', sortOrder: 1 });
    await api.update(session, 'd1', { status: 'archived' });
    const calls = fetchMock.mock.calls as Array<[string, RequestInit]>;
    expect(calls[0]?.[0]).toMatch(/\/directions$/);
    expect(calls[0]?.[1].method).toBe('POST');
    expect(JSON.parse(String(calls[0]?.[1].body))).toEqual({
      code: 'R13',
      name: 'ОТ',
      sortOrder: 1
    });
    expect(calls[1]?.[0]).toMatch(/\/directions\/d1$/);
    expect(calls[1]?.[1].method).toBe('PUT');
  });

  it('родителем нельзя выбрать само направление, его вложенные и архивные', () => {
    const all = [
      dir('a'),
      dir('b', 'a'),
      dir('c', 'b'),
      dir('d'),
      dir('old', undefined, 'archived')
    ];
    expect(parentCandidates(all, 'a').map((d) => d.id)).toEqual(['d']);
    expect(parentCandidates(all).map((d) => d.id)).toEqual(['a', 'b', 'c', 'd']);
  });
});

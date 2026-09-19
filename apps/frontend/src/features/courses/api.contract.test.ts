import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { UserSession } from '../../entities/session/model';
import type { mvpApi as MvpApi } from '../mvp/api';

/**
 * Перестановка пунктов программы (ТЗ 8.4) — форма запроса и ответа.
 *
 * Здесь закреплено главное решение: порядок уходит СПИСКОМ ЦЕЛИКОМ (`{ ids: [...] }`), а не
 * сдвигом по одному. Сдвиг не идемпотентен — повтор после обрыва связи сдвинул бы ещё раз.
 * Сервер отвечает МАССИВОМ переставленных пунктов, а не конвертом со страницами: это не
 * список для показа, а подтверждение нового порядка.
 */

const fetchMock = vi.fn();

const session: UserSession = {
  user: {
    id: 'u1',
    tenantId: 'tenant_demo',
    login: 'methodist',
    email: null,
    status: 'active',
    displayName: 'Методист'
  },
  tokens: { accessToken: 'token', sessionId: 's1', expiresIn: 300 },
  roles: ['methodist'],
  permissions: ['materials.write']
};

const envelope = <T>(data: T) =>
  JSON.stringify({
    data,
    meta: { requestId: 'req-1', correlationId: 'corr-1', timestamp: '2026-09-19T00:00:00.000Z' }
  });

describe('перестановка пунктов программы (ТЗ 8.4)', () => {
  let mvpApi: typeof MvpApi;

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL ??= 'http://localhost:3001/api/v1';
    process.env.NEXT_PUBLIC_REALTIME_URL ??= 'ws://localhost:3002';
    process.env.PUBLIC_BASE_URL ??= 'http://localhost:3000';
    mvpApi = (await import('../mvp/api')).mvpApi;
  });

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('порядок модулей уходит списком целиком по адресу версии', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        envelope([
          { id: 'm2', title: 'Второй', sortOrder: 0 },
          { id: 'm1', title: 'Первый', sortOrder: 1 }
        ]),
        { status: 200 }
      )
    );

    const result = await mvpApi.reorderModules(session, 'cv1', ['m2', 'm1']);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/course-versions/cv1/modules/order');
    expect(init.method, 'замена порядка целиком — это PUT, а не POST').toBe('PUT');
    expect(JSON.parse(String(init.body))).toEqual({ ids: ['m2', 'm1'] });

    expect(
      result.map((item) => item.sortOrder),
      'ответ — новый порядок с нуля'
    ).toEqual([0, 1]);
  });

  it('порядок материалов уходит по адресу модуля', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        envelope([
          { id: 'x2', title: 'Б', sortOrder: 0 },
          { id: 'x1', title: 'А', sortOrder: 1 }
        ]),
        { status: 200 }
      )
    );

    const result = await mvpApi.reorderMaterials(session, 'm1', ['x2', 'x1']);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/modules/m1/materials/order');
    expect(JSON.parse(String(init.body))).toEqual({ ids: ['x2', 'x1'] });
    expect(result).toHaveLength(2);
  });

  it('список модулей версии просит именно свою версию', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(envelope({ items: [], page: 1, pageSize: 20, total: 0 }), { status: 200 })
    );

    await mvpApi.listModules(session, 'cv1');

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url, 'без версии дерево показало бы чужую редакцию программы').toContain(
      'course_version_id=cv1'
    );
  });
});

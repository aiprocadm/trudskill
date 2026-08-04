import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { describeCopyResult, describeLibraryCourse } from './api';

import type { libraryApi as LibraryApi, LibraryCourseDto } from './api';
import type { UserSession } from '../../entities/session/model';

const course = (overrides: Partial<LibraryCourseDto> = {}): LibraryCourseDto => ({
  id: 'lib_1',
  code: 'OT-2026',
  title: 'Охрана труда',
  description: 'Базовый курс',
  publishedAt: '2026-08-04T00:00:00.000Z',
  moduleCount: 2,
  materialsNeedingContent: 0,
  ...overrides
});

describe('library helpers (ФТ-D6)', () => {
  it('после копирования честно сказано про заготовки', () => {
    expect(
      describeCopyResult({ courseId: 'c1', code: 'OT-2026', materialsNeedingContent: 3 })
    ).toContain('Материалов без содержимого: 3');
    expect(
      describeCopyResult({ courseId: 'c1', code: 'OT-2026', materialsNeedingContent: 0 })
    ).toContain('скопирован полностью');
  });

  it('в карточке каталога видно число модулей и заготовок ДО копирования', () => {
    expect(describeLibraryCourse(course())).toBe('модулей: 2');
    expect(describeLibraryCourse(course({ materialsNeedingContent: 4 }))).toBe(
      'модулей: 2 · материалов без содержимого: 4'
    );
  });
});

describe('library api contract (ФТ-D6)', () => {
  const fetchMock = vi.fn();
  let libraryApi: typeof LibraryApi;

  const envelope = (data: unknown) =>
    new Response(
      JSON.stringify({
        data,
        meta: { requestId: 'r1', correlationId: 'c1', timestamp: '2026-08-04T00:00:00.000Z' }
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );

  const session = {
    user: { id: 'u1', tenantId: 'tenant_demo' },
    tokens: { accessToken: 't' }
  } as UserSession;

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL ??= 'http://localhost:3001/api/v1';
    process.env.NEXT_PUBLIC_REALTIME_URL ??= 'ws://localhost:3002';
    process.env.PUBLIC_BASE_URL ??= 'http://localhost:3000';
    libraryApi = (await import('./api')).libraryApi;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('list разворачивает конверт и ходит с заголовком тенанта', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValueOnce(envelope([course()]));

    const result = await libraryApi.list(session);

    expect(result[0]?.code).toBe('OT-2026');
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toContain('/library/courses');
    expect(new Headers(init.headers).get('x-tenant-id')).toBe('tenant_demo');
  });

  it('copy шлёт POST на копирование в СВОЙ центр', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValueOnce(
      envelope({ courseId: 'c_new', code: 'OT-2026', materialsNeedingContent: 2 })
    );

    const result = await libraryApi.copy(session, 'lib_1');

    expect(result.materialsNeedingContent).toBe(2);
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toContain('/library/courses/lib_1/copy');
    expect(init.method).toBe('POST');
  });

  it('публикация и снятие идут на ПЛАТФОРМЕННЫЕ пути — их права у центра нет', async () => {
    vi.stubGlobal('fetch', fetchMock);
    // Каждому вызову — СВОЙ ответ: тело Response читается один раз, переиспользовать нельзя.
    fetchMock
      .mockResolvedValueOnce(envelope({ id: 'lib_1', code: 'OT', title: 'ОТ' }))
      .mockResolvedValueOnce(envelope({ removed: true }));

    await libraryApi.publish(session, { sourceTenantId: 'tenant_demo', courseId: 'c1' });
    await libraryApi.unpublish(session, 'lib_1');

    const urls = fetchMock.mock.calls.map((call) => call[0] as string);
    expect(urls[0]).toContain('/platform/library/courses');
    expect(urls[1]).toContain('/platform/library/courses/lib_1');
    expect((fetchMock.mock.calls[1]![1] as RequestInit).method).toBe('DELETE');
  });
});

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { libraryApi as LibraryApiType } from './library/api';
import type { mvpApi as MvpApiType } from './mvp/api';
import type * as PaymentsApiType from './payments/api';
import type { platformTenantsApi as PlatformTenantsApiType } from './platform-tenants/api';
import type { reportBuilderApi as ReportBuilderApiType } from './report-builder/api';
import type * as WebinarsApiType from './webinars/api';
import type { UserSession } from '../entities/session/model';
import type { authApi as AuthApiType } from '../lib/auth/auth-api';

/**
 * Форма ответа каждой списочной ручки — записанная, а не подразумеваемая.
 *
 * Зачем этот файл. `listOtTrainingPrograms` был объявлен как «массив программ», а сервер
 * отдавал `{ items: [...] }`. Тип обещал одно, приходило другое — и на экране курса
 * `otPrograms?.map(...)` падал с «map is not a function», унося ВСЮ страницу в красный экран.
 * Та же ложь жила в чате: страница диалогов складывала объект в состояние списка и падала на
 * `dialogs.find(...)`. Оба места нашлись по жалобе владельца, а не тестом.
 *
 * Почему тип не спасает: `tsc` сверяет вызов с тем, что НАПИСАНО в аннотации, а не с тем, что
 * присылает сервер. Аннотация — утверждение о чужом поведении, и проверить его может только
 * тест, где ответ выписан целиком.
 *
 * Каждая форма ниже сверена с живым стендом 09.09.2026. Тест не заменяет сверку с сервером —
 * он фиксирует ту, что уже сделана, чтобы расхождение обнаружилось здесь, а не на экране
 * человека. Сторож `list-endpoint-shape-tested` следит, чтобы новая списочная ручка не
 * появилась без такой записи.
 */

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
  permissions: []
};

const envelope = <T>(data: T) =>
  new Response(
    JSON.stringify({
      data,
      meta: { requestId: 'req-1', correlationId: 'corr-1', timestamp: '2026-01-01T00:00:00.000Z' }
    }),
    { status: 200 }
  );

describe('форма списочных ответов сервера', () => {
  let mvpApi: typeof MvpApiType;
  let libraryApi: typeof LibraryApiType;
  let platformTenantsApi: typeof PlatformTenantsApiType;
  let reportBuilderApi: typeof ReportBuilderApiType;
  let paymentsApi: typeof PaymentsApiType;
  let webinarsApi: typeof WebinarsApiType;
  let authApi: typeof AuthApiType;

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL ??= 'http://localhost:3001/api/v1';
    process.env.NEXT_PUBLIC_REALTIME_URL ??= 'ws://localhost:3002';
    process.env.PUBLIC_BASE_URL ??= 'http://localhost:3000';
    mvpApi = (await import('./mvp/api')).mvpApi;
    libraryApi = (await import('./library/api')).libraryApi;
    platformTenantsApi = (await import('./platform-tenants/api')).platformTenantsApi;
    reportBuilderApi = (await import('./report-builder/api')).reportBuilderApi;
    paymentsApi = await import('./payments/api');
    webinarsApi = await import('./webinars/api');
    authApi = (await import('../lib/auth/auth-api')).authApi;
  });

  beforeEach(() => vi.stubGlobal('fetch', fetchMock));
  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  /** Сервер отдаёт ГОЛЫЙ массив — так и объявлено на фронте. */
  const expectsPlainArray = async (
    path: string,
    call: () => Promise<unknown>,
    sample: unknown = [{ id: 'x1' }]
  ) => {
    fetchMock.mockResolvedValueOnce(envelope(sample));
    const result = await call();
    expect(Array.isArray(result), `${path}: ожидается массив`).toBe(true);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(path);
  };

  it('/roles — массив ролей', async () => {
    await expectsPlainArray('/roles', () => mvpApi.listRoles(session));
  });

  it('/users/:id/roles — массив ролей пользователя', async () => {
    await expectsPlainArray('/users/u1/roles', () => mvpApi.getUserRoles(session, 'u1'));
  });

  it('/auth/sessions — массив сессий', async () => {
    await expectsPlainArray('/auth/sessions', () => mvpApi.listUserSessions(session, 'u1'), [
      { id: 's1', userId: 'u1' }
    ]);
  });

  it('/library/courses — массив курсов библиотеки', async () => {
    await expectsPlainArray('/library/courses', () => libraryApi.list(session));
  });

  it('/platform/plans — массив тарифов', async () => {
    await expectsPlainArray('/platform/plans', () => platformTenantsApi.listPlans(session));
  });

  it('/platform/rental-invoices — массив счетов аренды', async () => {
    await expectsPlainArray('/platform/rental-invoices', () =>
      platformTenantsApi.listInvoices(session)
    );
  });

  it('/reports/builder/templates — массив шаблонов отчётов', async () => {
    await expectsPlainArray('/reports/builder/templates', () =>
      reportBuilderApi.listTemplates(session)
    );
  });

  it('/me/orders — массив заказов', async () => {
    await expectsPlainArray('/me/orders', () => paymentsApi.listMyOrders());
  });

  it('/webinars/mine — массив вебинаров', async () => {
    await expectsPlainArray('/webinars/mine', () => webinarsApi.listMyWebinars());
  });

  it('/users/:id/roles через слой входа — тоже массив', async () => {
    await expectsPlainArray('/users/u1/roles', () => authApi.userRoles('u1', 'token'));
  });
});

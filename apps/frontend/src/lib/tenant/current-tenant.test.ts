import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { LEGACY_TENANT_CODE_COOKIE, TENANT_CODE_COOKIE } from './host-resolve';

import type {
  readTenantCodeCookie as ReadCookie,
  resetTenantResolution as ResetResolution,
  resolveCurrentTenantId as ResolveTenant
} from './current-tenant';

describe('current tenant (ФТ-D3.2)', () => {
  const fetchMock = vi.fn();
  let readTenantCodeCookie: typeof ReadCookie;
  let resolveCurrentTenantId: typeof ResolveTenant;
  let resetTenantResolution: typeof ResetResolution;

  const envelope = (data: unknown) =>
    new Response(
      JSON.stringify({
        data,
        meta: { requestId: 'r1', correlationId: 'c1', timestamp: '2026-08-04T00:00:00.000Z' }
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL ??= 'http://localhost:3001/api/v1';
    process.env.NEXT_PUBLIC_REALTIME_URL ??= 'ws://localhost:3002';
    process.env.PUBLIC_BASE_URL ??= 'http://localhost:3000';
    const mod = await import('./current-tenant');
    readTenantCodeCookie = mod.readTenantCodeCookie;
    resolveCurrentTenantId = mod.resolveCurrentTenantId;
    resetTenantResolution = mod.resetTenantResolution;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
    resetTenantResolution();
  });

  it('код читается из cookie среди прочих', () => {
    expect(readTenantCodeCookie(`a=1; ${TENANT_CODE_COOKIE}=demo; b=2`)).toBe('demo');
    expect(readTenantCodeCookie('a=1; b=2')).toBeNull();
    expect(readTenantCodeCookie(`${TENANT_CODE_COOKIE}=`)).toBeNull();
    expect(readTenantCodeCookie(undefined)).toBeNull();
  });

  it('без cookie — арендатор из настроек, сервер не дёргается', async () => {
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('document', { cookie: '' });
    await expect(resolveCurrentTenantId()).resolves.toBe('tenant_demo');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('код из поддомена меняется на идентификатор публичной ручкой', async () => {
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('document', { cookie: `${TENANT_CODE_COOKIE}=acme` });
    fetchMock.mockResolvedValueOnce(
      envelope({ id: 'tenant_acme', code: 'acme', name: 'Акме', status: 'active' })
    );

    await expect(resolveCurrentTenantId()).resolves.toBe('tenant_acme');
    const [url] = fetchMock.mock.calls[0]! as [string];
    expect(url).toContain('/public/tenants/by-code/acme');
  });

  it('резолв запоминается: повторный вызов не ходит на сервер', async () => {
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('document', { cookie: `${TENANT_CODE_COOKIE}=acme` });
    fetchMock.mockResolvedValue(
      envelope({ id: 'tenant_acme', code: 'acme', name: 'Акме', status: 'active' })
    );

    await resolveCurrentTenantId();
    await resolveCurrentTenantId();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('сбой резолва не закрывает вход — берётся арендатор из настроек', async () => {
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('document', { cookie: `${TENANT_CODE_COOKIE}=acme` });
    fetchMock.mockRejectedValueOnce(new Error('network down'));
    await expect(resolveCurrentTenantId()).resolves.toBe('tenant_demo');
  });

  it('на сервере (без document) — значение из настроек, без обращения к сети', async () => {
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('document', undefined);
    await expect(resolveCurrentTenantId()).resolves.toBe('tenant_demo');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

/*
 * BR-020/BR-022 — период двойного чтения cookie арендатора: у человека, зашедшего
 * по адресу своего центра до выкатки, код лежит под прежним именем.
 *
 * Модуль подгружается динамически (как в блоке выше): он читает переменные окружения
 * на импорте, поэтому статический import сломал бы тест.
 */
describe('cookie арендатора: период двойного чтения (BR-020)', () => {
  let readCookie: typeof ReadCookie;

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL ??= 'http://localhost:3001/api/v1';
    process.env.NEXT_PUBLIC_REALTIME_URL ??= 'ws://localhost:3002';
    process.env.PUBLIC_BASE_URL ??= 'http://localhost:3000';
    const mod = await import('./current-tenant');
    readCookie = mod.readTenantCodeCookie;
  });

  it('читает ПРЕЖНЕЕ имя, когда нового нет', () => {
    expect(readCookie(`${LEGACY_TENANT_CODE_COOKIE}=demo`)).toBe('demo');
  });

  it('когда пришли оба — берёт НОВОЕ', () => {
    expect(readCookie(`${LEGACY_TENANT_CODE_COOKIE}=old; ${TENANT_CODE_COOKIE}=new`)).toBe('new');
  });

  it('имена: новое по бренду, прежнее сохранено', () => {
    expect(TENANT_CODE_COOKIE).toBe('trudskill_tenant_code');
    expect(LEGACY_TENANT_CODE_COOKIE).toBe('cdoprof_tenant_code');
  });
});

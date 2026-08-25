import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';

import { PlatformTenantsController } from './platform-tenants.controller.js';

import type { RequestContext } from '../../common/context/request-context.js';

/**
 * Срез 3 (§5.230): вход «от имени» из UI. Как и обычный логин, impersonate обязан
 * (1) ставить refresh+csrf cookie — иначе сессия «от имени» живёт только TTL
 * access-токена (15 мин) и не переживает перезагрузку страницы; (2) НЕ возвращать
 * refreshToken в теле ответа — он ходит только cookie, как у /auth/login.
 */
describe('PlatformTenantsController.impersonate (срез 3)', () => {
  const context = {
    tenantId: 'tenant_platform',
    userId: 'u_platform_admin',
    requestId: 'req1',
    correlationId: 'cor1'
  } as RequestContext;

  const issuedSession = {
    accessToken: 'access_token_value',
    refreshToken: 'refresh_token_value',
    csrfToken: 'csrf_token_value',
    sessionId: 's_target',
    expiresIn: 900,
    claims: { sub: 'u_target', tenant_id: 't1', session_id: 's_target', roles: ['tenant_admin'] }
  };

  const makeController = () => {
    const service = {
      impersonate: vi.fn().mockResolvedValue({
        tenantId: 't1',
        userId: 'u_target',
        session: issuedSession
      })
    };
    const controller = new PlatformTenantsController(service as never);
    return { controller, service };
  };

  const makeResponse = () => {
    const setHeader = vi.fn();
    return { response: { setHeader } as never, setHeader };
  };

  it('ставит refresh и csrf cookie, как обычный логин', async () => {
    const { controller } = makeController();
    const { response, setHeader } = makeResponse();

    await controller.impersonate(context, 't1', {}, response);

    expect(setHeader).toHaveBeenCalledTimes(1);
    const [name, value] = setHeader.mock.calls[0] as [string, string[]];
    expect(name).toBe('Set-Cookie');
    expect(value.some((c) => c.startsWith('trudskill_refresh_token=refresh_token_value'))).toBe(
      true
    );
    expect(value.some((c) => c.startsWith('trudskill_csrf_token=csrf_token_value'))).toBe(true);
  });

  it('не возвращает refreshToken/csrfToken в теле — только публичные поля токенов', async () => {
    const { controller } = makeController();
    const { response } = makeResponse();

    const result = await controller.impersonate(context, 't1', {}, response);

    expect(result.tenantId).toBe('t1');
    expect(result.userId).toBe('u_target');
    expect(result.session).toEqual({
      accessToken: 'access_token_value',
      sessionId: 's_target',
      expiresIn: 900,
      claims: issuedSession.claims
    });
    expect('refreshToken' in result.session).toBe(false);
    expect('csrfToken' in result.session).toBe(false);
  });
});

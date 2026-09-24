import { type ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { type Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

import { REQUIRED_PERMISSIONS } from './permission.decorator.js';
import { PermissionGuard } from './permission.guard.js';

const buildContext = (headers: Record<string, string>) => {
  const request: Record<string, unknown> = {
    ip: '127.0.0.1',
    header: (name: string) => headers[name.toLowerCase()]
  };
  return {
    getHandler: () => 'handler',
    getClass: () => 'class',
    switchToHttp: () => ({
      getRequest: () => request
    })
  };
};

describe('PermissionGuard session checks', () => {
  it('blocks request when required LMS permission is missing', async () => {
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue(['courses.write'])
    } as unknown as Reflector;
    const iamService = {
      resolvePermissions: vi.fn().mockResolvedValue(['courses.read']),
      resolveActorScope: async (t: string, u: string) => ({
        permissions: await iamService.resolvePermissions(t, u)
      })
    };
    const authService = { isSessionActive: vi.fn().mockResolvedValue(true) };
    const guard = new PermissionGuard(reflector, iamService as never, authService as never);

    const context = buildContext({});
    const request = context.switchToHttp().getRequest();
    request.context = {
      requestId: 'req_missing_perm',
      correlationId: 'corr_missing_perm',
      tenantId: 'tenant_demo',
      userId: 'u_learner_1',
      sessionId: 's_active_1'
    };

    await expect(guard.canActivate(context as unknown as ExecutionContext)).rejects.toThrow(
      ForbiddenException
    );
    expect(iamService.resolvePermissions).toHaveBeenCalledWith('tenant_demo', 'u_learner_1');
  });

  it('blocks request when token session is revoked', async () => {
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue(['documents.read'])
    } as unknown as Reflector;
    const iamService = {
      resolvePermissions: vi.fn().mockResolvedValue(['documents.read']),
      resolveActorScope: async (t: string, u: string) => ({
        permissions: await iamService.resolvePermissions(t, u)
      })
    };
    const authService = { isSessionActive: vi.fn().mockResolvedValue(false) };
    const guard = new PermissionGuard(reflector, iamService as never, authService as never);

    const context = buildContext({});
    const request = context.switchToHttp().getRequest();
    request.context = {
      requestId: 'req_1',
      correlationId: 'corr_1',
      tenantId: 'tenant_demo',
      userId: 'u_tenant_admin',
      sessionId: 's_revoked'
    };

    await expect(guard.canActivate(context as unknown as ExecutionContext)).rejects.toThrow(
      ForbiddenException
    );
    expect(authService.isSessionActive).toHaveBeenCalledWith(
      'tenant_demo',
      'u_tenant_admin',
      's_revoked'
    );
  });

  it('allows request with active session and required permissions', async () => {
    const reflector = {
      getAllAndOverride: vi
        .fn()
        .mockImplementation((key: string) =>
          key === REQUIRED_PERMISSIONS ? ['documents.read'] : []
        )
    } as unknown as Reflector;
    const iamService = {
      resolvePermissions: vi.fn().mockResolvedValue(['documents.read']),
      resolveActorScope: async (t: string, u: string) => ({
        permissions: await iamService.resolvePermissions(t, u)
      })
    };
    const authService = { isSessionActive: vi.fn().mockResolvedValue(true) };
    const guard = new PermissionGuard(reflector, iamService as never, authService as never);

    const context = buildContext({});
    const request = context.switchToHttp().getRequest();
    request.context = {
      requestId: 'req_2',
      correlationId: 'corr_2',
      tenantId: 'tenant_demo',
      userId: 'u_tenant_admin',
      sessionId: 's_active'
    };

    await expect(guard.canActivate(context as unknown as ExecutionContext)).resolves.toBe(true);
  });

  it('представитель заказчика без привязки к компании получает отказ, а не весь центр (журнал 647)', async () => {
    const reflector = {
      getAllAndOverride: vi
        .fn()
        .mockImplementation((key: string) => (key === REQUIRED_PERMISSIONS ? ['portal.read'] : []))
    } as unknown as Reflector;
    const iamService = {
      resolveActorScope: vi
        .fn()
        .mockResolvedValue({ permissions: ['portal.read'], unlinkedRepresentative: true })
    };
    const authService = { isSessionActive: vi.fn().mockResolvedValue(true) };
    const guard = new PermissionGuard(reflector, iamService as never, authService as never);

    const context = buildContext({});
    const request = context.switchToHttp().getRequest();
    request.context = {
      requestId: 'req_rep',
      correlationId: 'corr_rep',
      tenantId: 'tenant_demo',
      userId: 'u_rep_unlinked',
      sessionId: 's_active'
    };

    await expect(guard.canActivate(context as unknown as ExecutionContext)).rejects.toMatchObject({
      response: { code: 'counterparty_link_missing' }
    });
    expect(request.context).not.toHaveProperty('counterpartyId');
  });

  it('blocks unauthenticated request before permission checks', async () => {
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue(['courses.read'])
    } as unknown as Reflector;
    const iamService = { resolvePermissions: vi.fn() };
    const authService = { isSessionActive: vi.fn() };
    const guard = new PermissionGuard(reflector, iamService as never, authService as never);

    const context = buildContext({});
    const request = context.switchToHttp().getRequest();
    request.context = {
      requestId: 'req_auth_required',
      correlationId: 'corr_auth_required'
    };

    /*
     * Ревизия 2026-09-06 (§5.423): здесь стоял `ForbiddenException`. Сессии нет вовсе, и код
     * ответа — `auth_required` («войдите заново»); 403 говорит человеку «вам сюда нельзя»,
     * то есть отвечает не на то. Инвариант изменён осознанно: один код — один статус.
     */
    await expect(guard.canActivate(context as unknown as ExecutionContext)).rejects.toThrow(
      UnauthorizedException
    );
    expect(authService.isSessionActive).not.toHaveBeenCalled();
    expect(iamService.resolvePermissions).not.toHaveBeenCalled();
  });
});

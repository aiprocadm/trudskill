import { UnauthorizedException } from '@nestjs/common';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { issueSignedAccessToken } from '../../modules/iam/crypto.util.js';

import type { TenantGuard } from './tenant.guard.js';

vi.mock('../../env.js', () => ({
  backendEnv: {
    AUTH_JWT_SECRET: 'dev-jwt-secret-12345'
  }
}));

let TenantGuardClass: { new (): TenantGuard };

const makeExecutionContext = (headers: Record<string, string>, path = '/api/v1/documents') => ({
  switchToHttp: () => ({
    getRequest: () => ({
      ip: '127.0.0.1',
      path,
      header: (name: string) => headers[name.toLowerCase()]
    })
  })
});

describe('TenantGuard', () => {
  beforeAll(async () => {
    ({ TenantGuard: TenantGuardClass } = await import('./tenant.guard.js'));
  });

  it('rejects spoofed x-user-id/x-tenant-id headers without bearer token', () => {
    const guard = new TenantGuardClass({
      getJwtSigningSecret: () => 'dev-jwt-secret-12345'
    } as never);
    const context = makeExecutionContext({ 'x-user-id': 'u_admin', 'x-tenant-id': 'tenant_demo' });

    expect(() => guard.canActivate(context as never)).toThrow(UnauthorizedException);
  });

  it('resolves tenant and user only from a signed bearer token', () => {
    const guard = new TenantGuardClass({
      getJwtSigningSecret: () => 'dev-jwt-secret-12345'
    } as never);
    const accessToken = issueSignedAccessToken(
      {
        sub: 'u_tenant_admin',
        tenant_id: 'tenant_demo',
        session_id: 's_1',
        roles: ['iam.manage_roles']
      },
      'dev-jwt-secret-12345',
      300
    );

    const context = makeExecutionContext({
      authorization: `Bearer ${accessToken}`,
      'x-tenant-id': 'tenant_demo'
    });
    expect(guard.canActivate(context as never)).toBe(true);
  });

  it('rejects expired access token', () => {
    const guard = new TenantGuardClass({
      getJwtSigningSecret: () => 'dev-jwt-secret-12345'
    } as never);
    const accessToken = issueSignedAccessToken(
      {
        sub: 'u_tenant_admin',
        tenant_id: 'tenant_demo',
        session_id: 's_1',
        roles: ['iam.manage_roles']
      },
      'dev-jwt-secret-12345',
      -1
    );

    const context = makeExecutionContext({
      authorization: `Bearer ${accessToken}`,
      'x-tenant-id': 'tenant_demo'
    });
    expect(() => guard.canActivate(context as never)).toThrow(UnauthorizedException);
  });
});

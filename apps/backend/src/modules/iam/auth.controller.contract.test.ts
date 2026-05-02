import { describe, expect, it } from 'vitest';

import type { RequestContext } from '../../common/context/request-context.js';

const requiredEnv: Record<string, string> = {
  NODE_ENV: 'test',
  PORT: '3000',
  DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/postgres',
  REDIS_URL: 'redis://localhost:6379',
  RABBITMQ_URL: 'amqp://guest:guest@localhost:5672',
  S3_ENDPOINT: 'http://localhost:9000',
  S3_ACCESS_KEY: 'minio',
  S3_SECRET_KEY: 'minio123',
  S3_BUCKET: 'test',
  AUTH_JWT_SECRET: 'secret_value_123',
  SESSION_SECRET: 'session_secret_123',
  CORS_ORIGIN: 'http://localhost:3000',
  PUBLIC_BASE_URL: 'http://localhost:3000',
  REALTIME_PUBLIC_URL: 'ws://localhost:3000',
  REALTIME_PUBLISH_KEY: 'test-realtime-publish-key'
};

for (const [key, value] of Object.entries(requiredEnv)) {
  process.env[key] ??= value;
}

const context: RequestContext = {
  requestId: 'req_contract_1',
  correlationId: 'corr_contract_1',
  tenantId: 'tenant_demo',
  userId: 'u_tenant_admin',
  ip: '127.0.0.1',
  userAgent: 'vitest'
};

describe('AuthController public user contract', () => {
  const makeController = async () => {
    const [
      { AuditService },
      { AuthController },
      { AuthService },
      { IamService },
      { SecretsService }
    ] = await Promise.all([
      import('../audit/audit.service.js'),
      import('./auth.controller.js'),
      import('./services/auth.service.js'),
      import('./services/iam.service.js'),
      import('../../infrastructure/secrets/secrets.service.js')
    ]);
    const audit = new AuditService();
    const iamService = new IamService(audit);
    const authService = new AuthService(iamService, audit, new SecretsService());

    return new AuthController(authService, iamService);
  };

  it('does not leak passwordHash in /auth/me', async () => {
    const controller = await makeController();

    const response = await controller.me(context);

    expect(response).not.toHaveProperty('passwordHash');
    expect(response).toMatchInlineSnapshot(`
      {
        "displayName": "Tenant Admin",
        "email": "tenant@demo.local",
        "id": "u_tenant_admin",
        "login": "tenant_admin",
        "status": "active",
        "tenantId": "tenant_demo",
      }
    `);
  }, 15_000);

  it('does not leak refresh/session internals in /auth/sessions', async () => {
    const controller = await makeController();

    const sessions = await controller.sessions(context);

    for (const session of sessions) {
      expect(session).not.toHaveProperty('refreshTokenHash');
      expect(session).not.toHaveProperty('csrfTokenHash');
      expect(session).not.toHaveProperty('jti');
      expect(session).not.toHaveProperty('parentJti');
      expect(session).not.toHaveProperty('rotatedAt');
      expect(session).not.toHaveProperty('consumedAt');
      expect(session).not.toHaveProperty('revokeReason');
    }
  });

  it('does not leak refresh token in auth response payload', async () => {
    const [{ authCookie }] = await Promise.all([import('./auth-cookie.util.js')]);

    const response = authCookie.toPublicTokens({
      accessToken: 'access',
      sessionId: 'session',
      expiresIn: 900,
      refreshToken: 'refresh-secret',
      csrfToken: 'csrf-secret',
      claims: {
        tenant_id: 'tenant_demo',
        role_codes: ['tenant_admin'],
        permission_codes: ['iam.manage_roles'],
        session_id: 'session'
      }
    });

    expect(response).not.toHaveProperty('refreshToken');
    expect(response).not.toHaveProperty('csrfToken');
    expect(response).toMatchObject({
      accessToken: 'access',
      sessionId: 'session',
      expiresIn: 900
    });
  });

  it('does not leak passwordHash in /users and /users/:id', async () => {
    const controller = await makeController();

    const list = await controller.users(context);
    const user = await controller.user(context, 'u_tenant_admin');

    expect(list.items.length).toBeGreaterThan(0);
    expect(list.items.every((item) => !('passwordHash' in item))).toBe(true);
    expect(user).not.toHaveProperty('passwordHash');
    expect(user).toMatchObject({
      id: 'u_tenant_admin',
      tenantId: 'tenant_demo',
      login: 'tenant_admin',
      email: 'tenant@demo.local',
      status: 'active',
      displayName: 'Tenant Admin'
    });
  });
});

import { BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { issueSignedAccessToken } from '../../modules/iam/crypto.util.js';

import type { TenantGuard } from './tenant.guard.js';
import type { TenantScopedRepository } from '../../infrastructure/database/tenant-repository.js';

/**
 * Контракт изоляции тенантов на границе запроса (ФТ-D1, ТЗ «Арендная СДО» Фаза 0).
 *
 * Проверяем ключевой инвариант аренды: эффективный тенант запроса берётся ТОЛЬКО из
 * подписанного токена, и его нельзя подменить/повысить заголовком `x-tenant-id`. Плюс
 * data-layer `enforceTenantScope` (fail-closed при чужом/пустом tenantId).
 *
 * Уровень — юнит (как в tenant.guard.test.ts): guard создаётся с мок-`SecretsService`,
 * `env.js` мокается, чтобы валидация окружения не падала при импорте. Полный HTTP-стек
 * с реальными интерсепторами уже покрыт mvp.http.integration.test.ts.
 */

const SECRET = 'dev-jwt-secret-12345';

// env.js валидирует всё окружение при импорте (иначе бросает) — мок как в tenant.guard.test.ts.
vi.mock('../../env.js', () => ({
  backendEnv: { AUTH_JWT_SECRET: SECRET }
}));

let TenantGuardClass: { new (secrets?: unknown): TenantGuard };
let TenantScopedRepositoryClass: { new (): TenantScopedRepository };

type Headers = Record<string, string>;

/** Стабильный (не пересоздаваемый на каждый вызов) request — чтобы прочитать разрешённый tenantId после guard. */
function makeContext(headers: Headers, path = '/api/v1/learners') {
  const req = {
    ip: '127.0.0.1',
    path,
    header: (name: string) => headers[name.toLowerCase()],
    context: undefined as { tenantId?: string; userId?: string } | undefined
  };
  return { req, execution: { switchToHttp: () => ({ getRequest: () => req }) } };
}

const newGuard = () => new TenantGuardClass({ getJwtSigningSecret: () => SECRET });

const tokenFor = (tenantId: string, sub = 'u1', ttlSeconds = 300) =>
  issueSignedAccessToken(
    { sub, tenant_id: tenantId, session_id: 's1', roles: ['learners.read'] },
    SECRET,
    ttlSeconds
  );

/** Код ошибки из брошенного HttpException (`{ code, message }`), либо undefined если не бросил. */
function thrownCode(fn: () => unknown): string | undefined {
  try {
    fn();
    return undefined;
  } catch (error) {
    const response = (error as { getResponse?: () => unknown }).getResponse?.();
    return (response as { code?: string } | undefined)?.code;
  }
}

describe('Изоляция тенантов: контракт TenantGuard (ФТ-D1)', () => {
  beforeAll(async () => {
    ({ TenantGuard: TenantGuardClass } = await import('./tenant.guard.js'));
    ({ TenantScopedRepository: TenantScopedRepositoryClass } =
      await import('../../infrastructure/database/tenant-repository.js'));
  });

  it('заголовок x-tenant-id ЧУЖОГО тенанта при валидном токене → 400 tenant_header_mismatch', () => {
    const { execution } = makeContext({
      authorization: `Bearer ${tokenFor('tenant_A')}`,
      'x-tenant-id': 'tenant_B'
    });
    const guard = newGuard();
    expect(() => guard.canActivate(execution as never)).toThrow(BadRequestException);
    expect(thrownCode(() => newGuard().canActivate(execution as never))).toBe(
      'tenant_header_mismatch'
    );
  });

  it('эффективный тенант берётся ТОЛЬКО из токена — заголовком его не сменить', () => {
    // Совпадающий заголовок — проходит, тенант = из токена.
    const okMatch = makeContext({
      authorization: `Bearer ${tokenFor('tenant_A')}`,
      'x-tenant-id': 'tenant_A'
    });
    expect(newGuard().canActivate(okMatch.execution as never)).toBe(true);
    expect(okMatch.req.context?.tenantId).toBe('tenant_A');

    // Без заголовка — тенант всё равно из токена: «опустить x-tenant-id» не даёт сменить тенант.
    const okNoHeader = makeContext({ authorization: `Bearer ${tokenFor('tenant_A')}` });
    expect(newGuard().canActivate(okNoHeader.execution as never)).toBe(true);
    expect(okNoHeader.req.context?.tenantId).toBe('tenant_A');
  });

  it('без bearer-токена (даже со спуфом x-user-id/x-tenant-id) → 401 auth_required', () => {
    const { execution } = makeContext({ 'x-user-id': 'u_admin', 'x-tenant-id': 'tenant_A' });
    expect(() => newGuard().canActivate(execution as never)).toThrow(UnauthorizedException);
    expect(thrownCode(() => newGuard().canActivate(execution as never))).toBe('auth_required');
  });

  it('битый/поддельный по форме токен → 401 invalid_token', () => {
    const { execution } = makeContext({
      authorization: 'Bearer not.a.jwt',
      'x-tenant-id': 'tenant_A'
    });
    expect(() => newGuard().canActivate(execution as never)).toThrow(UnauthorizedException);
  });

  it('токен, подписанный ЧУЖИМ секретом → 401 invalid_token', () => {
    const forged = issueSignedAccessToken(
      { sub: 'u1', tenant_id: 'tenant_A', session_id: 's1', roles: [] },
      'attacker-secret',
      300
    );
    const { execution } = makeContext({
      authorization: `Bearer ${forged}`,
      'x-tenant-id': 'tenant_A'
    });
    expect(() => newGuard().canActivate(execution as never)).toThrow(UnauthorizedException);
  });

  it('истёкший токен → 401', () => {
    const { execution } = makeContext({
      authorization: `Bearer ${tokenFor('tenant_A', 'u1', -1)}`,
      'x-tenant-id': 'tenant_A'
    });
    expect(() => newGuard().canActivate(execution as never)).toThrow(UnauthorizedException);
  });

  describe('data-layer: TenantScopedRepository.enforceTenantScope (fail-closed)', () => {
    it('чужой tenantId сущности → 403 tenant_scope_violation', () => {
      const repo = new TenantScopedRepositoryClass();
      expect(() => repo.enforceTenantScope('tenant_A', 'tenant_B')).toThrow(ForbiddenException);
      expect(thrownCode(() => repo.enforceTenantScope('tenant_A', 'tenant_B'))).toBe(
        'tenant_scope_violation'
      );
    });

    it('совпадающий tenantId → без исключения', () => {
      const repo = new TenantScopedRepositoryClass();
      expect(() => repo.enforceTenantScope('tenant_A', 'tenant_A')).not.toThrow();
    });

    it('пустой ожидаемый tenantId → 403 (не «пропускаем всё»)', () => {
      const repo = new TenantScopedRepositoryClass();
      expect(() => repo.enforceTenantScope('', 'tenant_A')).toThrow(ForbiddenException);
    });
  });
});

// apps/backend/src/modules/mvp/esia/esia.controller.test.ts
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { describe, expect, it, vi } from 'vitest';

import { EsiaController } from './esia.controller.js';

import type { RequestContext } from '../../../common/context/request-context.js';

/**
 * Direct unit tests of the real controller's security boundaries (no Nest boot). The TenantGuard
 * now lets `/auth/esia/*` routes through (browser navigations), so the controller itself is the
 * authorization boundary for the authenticated identity-authorize entry — this locks that contract.
 */
const makeController = () => {
  const esia = {
    startAuthorize: vi.fn().mockReturnValue({ authorizeUrl: 'https://esia/aas?state=x' })
  };
  const authService = {};
  const iamService = {};
  const mvp = { getLinkedLearnerForUser: vi.fn().mockReturnValue({ id: 'lrn_1' }) };
  const controller = new EsiaController(
    esia as never,
    authService as never,
    iamService as never,
    mvp as never
  );
  return { controller, esia, mvp };
};

describe('EsiaController security boundaries', () => {
  it('identityAuthorize rejects an unauthenticated request (no session → 401)', () => {
    const { controller, mvp } = makeController();
    const ctx = { tenantId: 't1', requestId: 'r' } as RequestContext; // userId absent
    expect(() => controller.identityAuthorize(ctx)).toThrow(UnauthorizedException);
    // The learner is never resolved when the session is missing — no learnerId leaks into state.
    expect(mvp.getLinkedLearnerForUser).not.toHaveBeenCalled();
  });

  it('identityAuthorize mints a state bound to the caller’s own linked learner', () => {
    const { controller, esia, mvp } = makeController();
    const ctx = { tenantId: 't1', userId: 'u1', requestId: 'r' } as RequestContext;
    const result = controller.identityAuthorize(ctx);
    expect(result).toEqual({ authorizeUrl: 'https://esia/aas?state=x' });
    expect(mvp.getLinkedLearnerForUser).toHaveBeenCalledWith('t1', 'u1');
    // learnerId comes from the server-resolved learner, never from client input.
    expect(esia.startAuthorize).toHaveBeenCalledWith('identity', 't1', 'lrn_1');
  });

  it('authorize (login) requires tenant_id (400 when missing)', () => {
    const { controller } = makeController();
    const response = { redirect: vi.fn() } as never;
    expect(() => controller.authorize(undefined, response)).toThrow(BadRequestException);
  });
});

describe('EsiaController rate limit (ФТ-G2)', () => {
  // Журнал 339: `auth/esia/*` — та же дверь входа, что и `auth/login` (25/мин), но TenantGuard
  // пропускает её без bearer, а предела частоты у неё не было. Глобального ThrottlerGuard нет —
  // без @UseGuards(ThrottlerGuard) на методе любой @Throttle «спит».
  it.each(['authorize', 'callback', 'identityAuthorize'] as const)(
    '%s применяет ThrottlerGuard и объявляет 25/мин, как auth/login',
    (method) => {
      const handler = EsiaController.prototype[method];
      const guards =
        (Reflect.getMetadata('__guards__', handler) as Array<{ name?: string }> | undefined) ?? [];
      expect(guards.some((g) => g === ThrottlerGuard || g?.name === 'ThrottlerGuard')).toBe(true);
      expect(Reflect.getMetadata('THROTTLER:LIMITdefault', handler)).toBe(25);
      expect(Reflect.getMetadata('THROTTLER:TTLdefault', handler)).toBe(60_000);
    }
  );
});

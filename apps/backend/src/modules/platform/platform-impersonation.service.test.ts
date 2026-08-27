import { ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { PlatformTenantsService } from './platform-tenants.service.js';

import type { RequestContext } from '../../common/context/request-context.js';
import type { DatabaseService } from '../../infrastructure/database/database.service.js';
import type { AuditService } from '../audit/audit.service.js';
import type { AuthService } from '../iam/services/auth.service.js';

/**
 * ФТ-D2.2 (Фаза 4 Task 3, срез 2): вход «от имени». Именно запись в аудите отличает
 * поддержку от злоупотребления, поэтому она ОБЯЗАТЕЛЬНА и идёт ДО выдачи сессии:
 * сбой журнала отменяет вход. Лучше след без входа, чем вход без следа.
 */

const ctx = {
  tenantId: 'tenant_platform',
  requestId: 'r1',
  correlationId: 'c1',
  userId: 'u_platform_admin',
  ip: '10.0.0.1',
  userAgent: 'vitest'
} as RequestContext;

function makeHarness(overrides?: {
  tenantRows?: unknown[];
  adminRows?: unknown[];
  auditFails?: boolean;
}) {
  const calls: string[] = [];
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('from core.tenants where id')) {
      return overrides?.tenantRows ?? [{ id: 't1', code: 'c1', name: 'Центр', status: 'active' }];
    }
    if (sql.includes("r.code = 'tenant_admin'")) {
      return overrides?.adminRows ?? [{ id: 'u_target_admin' }];
    }
    return [];
  });
  const writeCritical = vi.fn(async () => {
    calls.push('audit');
    if (overrides?.auditFails) throw new Error('audit db down');
    return {} as never;
  });
  const issueImpersonatedSession = vi.fn(async () => {
    calls.push('session');
    return { accessToken: 'a', refreshToken: 'r', sessionId: 's1' } as never;
  });
  const service = new PlatformTenantsService(
    { query } as unknown as DatabaseService,
    { writeCritical } as unknown as AuditService,
    { issueImpersonatedSession } as unknown as AuthService
  );
  return { service, query, writeCritical, issueImpersonatedSession, calls };
}

describe('PlatformTenantsService.impersonate', () => {
  it('аудит пишется ДО выдачи сессии, с актором платформы и целью', async () => {
    const { service, writeCritical, issueImpersonatedSession, calls } = makeHarness();
    const result = await service.impersonate('u_platform_admin', 't1', undefined, ctx);
    expect(calls).toEqual(['audit', 'session']);
    expect(result.userId).toBe('u_target_admin');
    expect(writeCritical).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 't1',
        actorId: 'u_platform_admin',
        action: 'platform.impersonation_started',
        entityId: 'u_target_admin',
        metadata: expect.objectContaining({
          impersonation: true,
          platformTenantId: 'tenant_platform'
        }),
        ip: '10.0.0.1',
        userAgent: 'vitest'
      })
    );
    /*
     * Порция 33 (журнал 270): третьим аргументом идёт КТО из поддержки вошёл. Признак
     * доезжает до сессии и оттуда помечает каждое последующее действие в журнале —
     * без него действия поддержки неотличимы от действий самого центра.
     */
    expect(issueImpersonatedSession).toHaveBeenCalledWith(
      't1',
      'u_target_admin',
      'u_platform_admin'
    );
  });

  it('сбой журнала ОТМЕНЯЕТ вход — сессия не выдаётся', async () => {
    const { service, issueImpersonatedSession } = makeHarness({ auditFails: true });
    await expect(service.impersonate('u_platform_admin', 't1', undefined, ctx)).rejects.toThrow(
      'audit db down'
    );
    expect(issueImpersonatedSession).not.toHaveBeenCalled();
  });

  it('явно указанный пользователь имеет приоритет над tenant_admin по умолчанию', async () => {
    const { service, issueImpersonatedSession } = makeHarness();
    const result = await service.impersonate('u_platform_admin', 't1', 'u_custom', ctx);
    expect(result.userId).toBe('u_custom');
    expect(issueImpersonatedSession).toHaveBeenCalledWith('t1', 'u_custom', 'u_platform_admin');
  });

  it('архивный тенант — отказ: офбординг замораживает кабинет', async () => {
    const { service } = makeHarness({
      tenantRows: [{ id: 't1', code: 'c1', name: 'Центр', status: 'archived' }]
    });
    await expect(service.impersonate('u_platform_admin', 't1', undefined, ctx)).rejects.toThrow(
      ConflictException
    );
  });

  it('несуществующий тенант — not found', async () => {
    const { service } = makeHarness({ tenantRows: [] });
    await expect(
      service.impersonate('u_platform_admin', 'missing', undefined, ctx)
    ).rejects.toThrow(NotFoundException);
  });

  it('в тенанте нет активного tenant_admin и цель не указана — понятная ошибка', async () => {
    const { service } = makeHarness({ adminRows: [] });
    await expect(service.impersonate('u_platform_admin', 't1', undefined, ctx)).rejects.toThrow(
      NotFoundException
    );
  });
});

import { ConflictException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { PlatformTenantsService } from './platform-tenants.service.js';

import type { RequestContext } from '../../common/context/request-context.js';
import type { DatabaseService } from '../../infrastructure/database/database.service.js';
import type { AuditService } from '../audit/audit.service.js';
import type { AuthService } from '../iam/services/auth.service.js';

const authStub = { issueImpersonatedSession: vi.fn() } as unknown as AuthService;

/**
 * ФТ-D2.2 (Фаза 4 Task 3): платформенная админка тенантов — список, создание,
 * смена статуса. Только для platform_admin (право `platform.tenants.*`, миграция 0073).
 */

const ctx = {
  tenantId: 'tenant_platform',
  requestId: 'r1',
  correlationId: 'c1',
  userId: 'u_platform_admin'
} as RequestContext;

function makeHarness(rowsBySqlFragment: Record<string, unknown[] | (() => unknown[])>) {
  const query = vi.fn(async (sql: string) => {
    const hit = Object.entries(rowsBySqlFragment).find(([fragment]) => sql.includes(fragment));
    if (!hit) return [];
    return typeof hit[1] === 'function' ? hit[1]() : hit[1];
  });
  const writeCritical = vi.fn(async () => ({}) as never);
  const service = new PlatformTenantsService(
    { query } as unknown as DatabaseService,
    { writeCritical } as unknown as AuditService,
    authStub
  );
  return { service, query, writeCritical };
}

describe('PlatformTenantsService.listTenants', () => {
  it('отдаёт все тенанты платформы — это кросс-тенантный список', async () => {
    const { service } = makeHarness({
      'from core.tenants': [
        { id: 't1', code: 'c1', name: 'Центр 1', status: 'active' },
        { id: 't2', code: 'c2', name: 'Центр 2', status: 'suspended' }
      ]
    });
    const list = await service.listTenants();
    expect(list.map((t) => t.id)).toEqual(['t1', 't2']);
  });

  it('без БД — честная 503, как у TenantService (ФТ-D2.1)', async () => {
    const service = new PlatformTenantsService(
      undefined,
      { writeCritical: vi.fn() } as unknown as AuditService,
      authStub
    );
    await expect(service.listTenants()).rejects.toThrow(ServiceUnavailableException);
  });
});

describe('PlatformTenantsService.createTenant', () => {
  it('создаёт тенант со статусом trial по умолчанию и пишет аудит', async () => {
    const { service, query, writeCritical } = makeHarness({
      'select id from core.tenants where code': [],
      'insert into core.tenants': []
    });
    const tenant = await service.createTenant(
      'u_platform_admin',
      { code: 'uc1', name: 'Новый центр' },
      ctx
    );
    expect(tenant.status).toBe('trial');
    expect(tenant.id).toMatch(/^t_/);
    // Роли нового тенанта клонируются с тенанта платформы БЕЗ platform_admin —
    // платформенная роль существует только у владельца платформы.
    const createSql = String(
      query.mock.calls.find(([sql]) => String(sql).includes('insert into core.tenants'))?.[0]
    );
    expect(createSql).toContain("<> 'platform_admin'");
    expect(writeCritical).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'platform.tenant_created', entityId: tenant.id })
    );
  });

  it('дубль кода — конфликт, а не второй тенант с тем же кодом', async () => {
    const { service } = makeHarness({
      'select id from core.tenants where code': [{ id: 't_existing' }]
    });
    await expect(
      service.createTenant('u_platform_admin', { code: 'uc1', name: 'Дубль' }, ctx)
    ).rejects.toThrow(ConflictException);
  });
});

describe('PlatformTenantsService.changeStatus', () => {
  it('меняет статус и пишет old/new в аудит', async () => {
    const { service, writeCritical } = makeHarness({
      'select id, code, name, status from core.tenants where id': [
        { id: 't1', code: 'c1', name: 'Центр', status: 'active' }
      ],
      'update core.tenants': []
    });
    const updated = await service.changeStatus('u_platform_admin', 't1', 'suspended', ctx);
    expect(updated.status).toBe('suspended');
    expect(writeCritical).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'platform.tenant_status_changed',
        oldValues: expect.objectContaining({ status: 'active' }),
        newValues: expect.objectContaining({ status: 'suspended' })
      })
    );
  });

  it('несуществующий тенант — not found', async () => {
    const { service } = makeHarness({});
    await expect(
      service.changeStatus('u_platform_admin', 'missing', 'suspended', ctx)
    ).rejects.toThrow(NotFoundException);
  });
});

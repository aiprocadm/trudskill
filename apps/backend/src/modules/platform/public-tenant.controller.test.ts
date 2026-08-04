import 'reflect-metadata';
import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { PlatformTenantsService } from './platform-tenants.service.js';
import { PublicTenantController } from './public-tenant.controller.js';

/** ФТ-D3.2: публичный резолв арендатора по коду из поддомена. */
describe('PublicTenantController (ФТ-D3.2)', () => {
  const makeService = (queryImpl: (sql: string, params?: unknown[]) => Promise<unknown[]>) => {
    const query = vi.fn(queryImpl);
    const service = new PlatformTenantsService(
      { query } as never,
      { writeCritical: vi.fn() } as never,
      {} as never
    );
    return { service, query };
  };

  it('существующий код → идентификатор, код, название и статус', async () => {
    const { service } = makeService(async () => [
      { id: 'tenant_demo', code: 'demo', name: 'Демо', status: 'active' }
    ]);
    const controller = new PublicTenantController(service);
    await expect(controller.byCode('demo')).resolves.toEqual({
      id: 'tenant_demo',
      code: 'demo',
      name: 'Демо',
      status: 'active'
    });
  });

  it('архивный арендатор не отдаётся вовсе — офбординг не подтверждаем посторонним', async () => {
    const { service, query } = makeService(async () => []);
    const controller = new PublicTenantController(service);
    await expect(controller.byCode('gone')).rejects.toBeInstanceOf(NotFoundException);
    expect(query.mock.calls[0]![0]).toContain("status <> 'archived'");
  });

  it('приостановленный отдаётся со статусом: слушателю нужна причина отказа', async () => {
    const { service } = makeService(async () => [
      { id: 'tenant_x', code: 'x', name: 'Икс', status: 'suspended' }
    ]);
    const controller = new PublicTenantController(service);
    await expect(controller.byCode('x')).resolves.toMatchObject({ status: 'suspended' });
  });

  it('мусорный код отвергается ДО запроса в базу', async () => {
    const { service, query } = makeService(async () => {
      throw new Error('база не должна вызываться');
    });
    const controller = new PublicTenantController(service);
    for (const bad of ['ПРИМЕР', '-demo', 'de_mo', "' or 1=1--", 'x'.repeat(41)]) {
      await expect(controller.byCode(bad)).rejects.toBeInstanceOf(NotFoundException);
    }
    expect(query).not.toHaveBeenCalled();
  });

  it('код подставляется параметром, а не склейкой строк', async () => {
    const { service, query } = makeService(async () => []);
    const controller = new PublicTenantController(service);
    await expect(controller.byCode('demo')).rejects.toBeInstanceOf(NotFoundException);
    const [sql, params] = query.mock.calls[0]! as [string, unknown[]];
    expect(sql).toContain('$1');
    expect(params).toEqual(['demo']);
  });
});

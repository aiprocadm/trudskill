import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { TenantService } from './tenant.service.js';

import type { DatabaseService } from '../../infrastructure/database/database.service.js';

/**
 * ФТ-D2.1 (Фаза 4 Task 2): единственный источник тенантов — БД. Раньше сервис держал
 * `tenant_demo` в памяти как фоллбек: платформа «знала» тенанта, которого нет в базе,
 * и любой сбой конфигурации БД тихо подменял арендатора демо-данными.
 */

const repo = { enforceTenantScope: () => undefined } as never;

function makeDb(rowsBySqlFragment: Record<string, unknown[]>) {
  const query = vi.fn(async (sql: string) => {
    const hit = Object.entries(rowsBySqlFragment).find(([fragment]) => sql.includes(fragment));
    return hit ? hit[1] : [];
  });
  return { db: { query } as unknown as DatabaseService, query };
}

describe('TenantService без БД (ФТ-D2.1: демо-фоллбека больше нет)', () => {
  it('getTenantById — понятная ошибка недоступности хранилища, а не «демо-тенант»', async () => {
    const service = new TenantService(repo);
    await expect(service.getTenantById('tenant_demo')).rejects.toThrow(ServiceUnavailableException);
  });

  it('listActiveTenantIds — не выдумывает ни одного тенанта', async () => {
    const service = new TenantService(repo);
    await expect(service.listActiveTenantIds()).rejects.toThrow(ServiceUnavailableException);
  });

  it('настройки и реквизиты без БД тоже не подменяются демо-данными', async () => {
    const service = new TenantService(repo);
    await expect(service.getSettings('t1')).rejects.toThrow(ServiceUnavailableException);
    await expect(service.getRequisites('t1')).rejects.toThrow(ServiceUnavailableException);
    await expect(service.updateSettings('t1', { locale: 'ru-RU' })).rejects.toThrow(
      ServiceUnavailableException
    );
  });

  it('комиссия без БД — недоступность, а не выдуманные «Иванов/Петров»', async () => {
    const service = new TenantService(repo);
    await expect(service.getCommission('t1')).rejects.toThrow(ServiceUnavailableException);
  });
});

describe('TenantService с БД', () => {
  it('getTenantById возвращает строку БД, включая новые статусы trial/archived', async () => {
    const { db } = makeDb({
      'from core.tenants where id': [{ id: 't1', code: 'c1', name: 'Центр', status: 'trial' }]
    });
    const service = new TenantService(repo, db);
    await expect(service.getTenantById('t1')).resolves.toEqual({
      id: 't1',
      code: 'c1',
      name: 'Центр',
      status: 'trial'
    });
  });

  it('отсутствующий тенант — tenant_not_found, без какого-либо фоллбека', async () => {
    const { db } = makeDb({});
    const service = new TenantService(repo, db);
    await expect(service.getTenantById('missing')).rejects.toThrow(NotFoundException);
  });

  it('listActiveTenantIds включает trial: пробный центр учится и получает напоминания', async () => {
    const { db, query } = makeDb({ 'from core.tenants where status': [{ id: 't1' }] });
    const service = new TenantService(repo, db);
    await expect(service.listActiveTenantIds()).resolves.toEqual(['t1']);
    const sql = String(query.mock.calls[0]?.[0]);
    expect(sql).toContain("'trial'");
    expect(sql).toContain("'active'");
    expect(sql).not.toContain("'suspended'");
    expect(sql).not.toContain("'archived'");
  });

  it('комиссия без строк в БД — пустая, а не демо-состав', async () => {
    const { db } = makeDb({});
    const service = new TenantService(repo, db);
    await expect(service.getCommission('t1')).resolves.toEqual({ tenantId: 't1', members: [] });
  });
});

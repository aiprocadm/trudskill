import 'reflect-metadata';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { PlatformPlansService, readPlanFeatures } from './platform-plans.service.js';

import type { RequestContext } from '../../common/context/request-context.js';

const context = { requestId: 'r1', correlationId: 'c1' } as RequestContext;

/*
 * §5.429: смена тарифа идёт под транзакцией — снять прежнюю подписку и завести новую это одно
 * событие. Подделка базы обязана уметь то же, что настоящая: выдать клиента и откатить всё,
 * если внутри бросили. Иначе тест проверял бы не то, что работает в бою.
 */
function make(queryImpl: (sql: string, params?: unknown[]) => Promise<unknown[]>) {
  const query = vi.fn(queryImpl);
  const committed: string[] = [];
  const withTransaction = async <T>(fn: (client: { query: typeof query }) => Promise<T>) => {
    const before = query.mock.calls.length;
    const result = await fn({ query });
    for (const call of query.mock.calls.slice(before)) committed.push(String(call[0]));
    return result;
  };
  const audit = { writeCritical: vi.fn().mockResolvedValue({}) };
  const service = new PlatformPlansService({ query, withTransaction } as never, audit as never);
  return { service, query, audit, committed };
}

describe('PlatformPlansService (ФТ-D4)', () => {
  it('readPlanFeatures: не-boolean и неизвестные ключи отбрасываются', () => {
    // `api` с 01.09.2026 не входит в список возможностей и отбрасывается как неизвестный
    // ключ (журнал 325): у него, в отличие от остальных, нет определённого смысла — что
    // именно он открывает, не сказано ни в ТЗ, ни в документации, поэтому соблюсти его
    // нельзя. Старые тарифы со значением `api` от этого не ломаются: чтение терпимое.
    expect(readPlanFeatures({ proctoring: true, scorm: 'да', magic: true, api: false })).toEqual({
      proctoring: true
    });
    expect(readPlanFeatures(null)).toEqual({});
    expect(readPlanFeatures([true])).toEqual({});
  });

  it('createPlan: занятый code — 409 plan_code_taken, INSERT не выполняется', async () => {
    const { service, query } = make(async (sql) => {
      if (sql.includes('select id from core.plans where code')) return [{ id: 'plan_basic' }];
      throw new Error('unexpected query');
    });
    await expect(
      service.createPlan('u1', { code: 'basic', name: 'Базовый' }, context)
    ).rejects.toMatchObject({ constructor: ConflictException });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('createPlan: пишет план, аудит и возвращает нормализованные features', async () => {
    const inserted: unknown[][] = [];
    const { service, audit } = make(async (sql, params) => {
      if (sql.includes('select id from core.plans where code')) return [];
      if (sql.startsWith('insert into core.plans')) {
        inserted.push(params!);
        return [];
      }
      return [
        {
          id: 'plan_basic',
          code: 'basic',
          name: 'Базовый',
          activeLearnersLimit: 100,
          staffLimit: null,
          storageLimitBytes: null,
          features: { scorm: true, magic: true }
        }
      ];
    });
    const plan = await service.createPlan(
      'u1',
      { code: 'basic', name: 'Базовый', activeLearnersLimit: 100, features: { scorm: true } },
      context
    );
    expect(plan.features).toEqual({ scorm: true });
    expect(JSON.parse(inserted[0]![6] as string)).toEqual({ scorm: true });
    expect(audit.writeCritical).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'platform.plan_created', tenantId: 'platform' })
    );
  });

  it('assignPlan: отменяет прежнюю активную подписку, создаёт новую, аудит в журнал тенанта', async () => {
    const calls: string[] = [];
    const { service, audit } = make(async (sql) => {
      calls.push(sql.trim().split(/\s+/).slice(0, 2).join(' '));
      if (sql.includes('from core.plans') || sql.includes('from core.tenants')) {
        return [{ id: 'x' }];
      }
      return [];
    });
    const result = await service.assignPlan('u_admin', 't1', 'plan_basic', context);
    expect(result.status).toBe('active');
    expect(calls).toContain('update core.tenant_subscriptions');
    expect(calls).toContain('insert into');
    expect(audit.writeCritical).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'platform.plan_assigned', tenantId: 't1' })
    );
  });

  it('assignPlan: несуществующий план — 404 plan_not_found', async () => {
    const { service } = make(async (sql) =>
      sql.includes('from core.plans') ? [] : [{ id: 't1' }]
    );
    await expect(service.assignPlan('u1', 't1', 'plan_none', context)).rejects.toMatchObject({
      constructor: NotFoundException
    });
  });

  it('getActivePlan: нет активной подписки — null (все лимиты = безлимит)', async () => {
    const { service } = make(async () => []);
    await expect(service.getActivePlan('t1')).resolves.toBeNull();
  });
  /*
   * §5.429. Снять прежнюю подписку и завести новую — одно событие. Порознь между двумя
   * запросами есть окно, в котором у центра НЕТ действующего тарифа. Если на этом месте
   * оборвалось соединение, окно перестаёт быть мгновением: возможности закрыты, пределы не
   * считаются, и центр стоит, пока кто-нибудь не заметит.
   */
  it('падение на новой подписке не оставляет центр без тарифа', async () => {
    const { service, committed } = make(async (sql) => {
      if (sql.includes('select id from core.plans where id')) return [{ id: 'plan_pro' }];
      if (sql.includes('select id from core.tenants where id')) return [{ id: 't1' }];
      if (sql.includes('insert into core.tenant_subscriptions')) {
        throw new Error('обрыв соединения на новой подписке');
      }
      return [];
    });

    await expect(service.assignPlan('u1', 't1', 'plan_pro', context)).rejects.toThrow(
      'обрыв соединения'
    );
    // Отмена прежней подписки не доехала до базы — центр остался на прежнем тарифе.
    expect(committed).toEqual([]);
  });
});

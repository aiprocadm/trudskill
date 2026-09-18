import { describe, expect, it } from 'vitest';

import { AuditService } from './audit.service.js';

/**
 * Служебные события журнала скрыты по умолчанию, но остаются в базе (ТЗ 5.12.2).
 *
 * «Сеанс продлён» пишется при каждом обновлении токена — сотни строк в день на одного
 * сотрудника. Журнал, где дела людей тонут в служебном, перестают открывать (журнал 478).
 *
 * Запись НЕ удаляется: журнал действий — доказательство при разборе спора, а не лента
 * новостей. Скрывается только показ, и по запросу возвращается.
 */

const TENANT = 'tenant_demo';

const makeService = (): AuditService => new AuditService();

const record = (service: AuditService, action: string): void => {
  service.write({
    tenantId: TENANT,
    actorId: 'u_admin',
    action,
    entityType: 'session',
    entityId: 'e1'
  });
};

describe('журнал действий: служебные события (ТЗ 5.12.2)', () => {
  it('по умолчанию продление сеанса не показывается', async () => {
    const service = makeService();
    record(service, 'auth.refresh');
    record(service, 'learning.learner_created');

    const page = await service.listPage(TENANT, {});
    expect(page.items.map((one) => one.action)).toEqual(['learning.learner_created']);
  });

  it('по запросу оно возвращается — запись никуда не делась', async () => {
    const service = makeService();
    record(service, 'auth.refresh');

    const page = await service.listPage(TENANT, { includeService: true });
    expect(page.items.map((one) => one.action)).toEqual(['auth.refresh']);
  });

  it('счётчик страницы считает то же, что показывает', async () => {
    // Иначе человек видит «1 из 250» при одной строке на экране и ищет пропавшие 249.
    const service = makeService();
    record(service, 'auth.refresh');
    record(service, 'auth.refresh');
    record(service, 'documents.group_order_issued');

    const page = await service.listPage(TENANT, {});
    expect(page.total).toBe(1);
    expect(page.items).toHaveLength(1);
  });

  it('скрытие служебного не мешает остальным отборам', async () => {
    const service = makeService();
    record(service, 'auth.refresh');
    record(service, 'learning.learner_created');
    record(service, 'documents.group_order_issued');

    const page = await service.listPage(TENANT, { action: 'documents' });
    expect(page.items.map((one) => one.action)).toEqual(['documents.group_order_issued']);
  });
});

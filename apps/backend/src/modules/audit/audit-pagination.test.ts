import { describe, expect, it } from 'vitest';

import { AuditService } from './audit.service.js';

/**
 * Постраничный журнал аудита (ФТ-I4, Фаза 6 Task 9).
 *
 * РАНЬШЕ журнал читался ЦЕЛИКОМ: `select ... where tenant_id = $1 order by created_at desc`
 * без предела, а фильтры применялись уже в памяти — то есть поиск по одному действию всё
 * равно вытаскивал весь журнал центра. У работающего центра это сотни тысяч строк.
 */
const makeService = (rowCount: number) => {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  const db = {
    query: async (sql: string, params: unknown[]) => {
      queries.push({ sql, params });
      const limit = Number(params[8] ?? 100);
      return Array.from({ length: Math.min(limit, rowCount) }, (_, i) => ({
        id: `a_${i}`,
        tenant_id: 'tenant_a',
        actor_id: 'u1',
        action: 'learning.learner_created',
        entity_type: 'learner',
        entity_id: 'l1',
        old_values: null,
        new_values: null,
        metadata: null,
        request_id: 'req',
        ip: null,
        user_agent: null,
        created_at: '2026-08-08T10:00:00.000Z',
        total_count: String(rowCount)
      }));
    }
  };
  return { service: new AuditService(db as never), queries };
};

describe('журнал аудита читается страницами', () => {
  it('в запросе есть предел и смещение', async () => {
    const { service, queries } = makeService(100_000);

    await service.listPage('tenant_a', { limit: 50, offset: 100 });

    expect(queries[0]?.sql).toContain('limit $9 offset $10');
    expect(queries[0]?.params[8]).toBe(50);
    expect(queries[0]?.params[9]).toBe(100);
  });

  it('предел ограничен сверху — «дай миллион» не вернёт нас к чтению всего журнала', async () => {
    const { service, queries } = makeService(100_000);

    const page = await service.listPage('tenant_a', { limit: 1_000_000 });

    expect(queries[0]?.params[8]).toBe(500);
    expect(page.limit).toBe(500);
  });

  it('фильтры уходят в SQL, а не применяются в памяти', async () => {
    const { service, queries } = makeService(10);

    await service.listPage('tenant_a', {
      action: 'documents.',
      actor: 'u1',
      createdFrom: '2026-08-01T00:00:00.000Z'
    });

    const [call] = queries;
    expect(call?.sql).toContain("action like '%' || $4 || '%'");
    expect(call?.sql).toContain('created_at >= $7');
    expect(call?.params[3]).toBe('documents.');
    expect(call?.params[1]).toBe('u1');
  });

  it('общее число строк возвращается вместе со страницей', async () => {
    const { service } = makeService(1234);

    const page = await service.listPage('tenant_a', { limit: 10 });

    expect(page.total).toBe(1234);
    expect(page.items).toHaveLength(10);
  });

  it('без центра журнал не отдаётся вовсе — защита от чтения чужого', async () => {
    const { service, queries } = makeService(10);

    const page = await service.listPage('   ');

    expect(page.items).toEqual([]);
    expect(page.total).toBe(0);
    expect(queries).toHaveLength(0);
  });
});

describe('режим без базы ведёт себя так же', () => {
  it('фильтрует и режет на страницы в памяти', async () => {
    const service = new AuditService();
    for (let i = 0; i < 30; i += 1) {
      service.write({
        tenantId: 'tenant_a',
        action: i % 2 === 0 ? 'documents.issued' : 'learning.enrolled',
        entityType: 'doc',
        entityId: `d_${i}`
      });
    }

    const page = await service.listPage('tenant_a', { action: 'documents.', limit: 5 });

    expect(page.total).toBe(15);
    expect(page.items).toHaveLength(5);
    expect(page.items.every((item) => item.action.startsWith('documents.'))).toBe(true);
  });
});

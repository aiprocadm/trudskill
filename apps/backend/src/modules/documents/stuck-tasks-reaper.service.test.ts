import { describe, expect, it } from 'vitest';

import { StuckTasksReaperService } from './stuck-tasks-reaper.service.js';
import { getSchedulerRuns, resetSchedulerRuns } from '../../common/metrics/scheduler-heartbeat.js';

/**
 * Реапер зависших задач (ФТ-I1, Фаза 6 Task 7).
 *
 * Задача переходит в `running`, когда воркер берёт её в работу. Если воркер в этот момент
 * умирает, задача остаётся `running` НАВСЕГДА: сообщение из очереди забрано, повторить
 * её некому. Слушатель ждёт удостоверение, которое никто не выпустит.
 */
const makeService = (
  stuckRows: Array<{ tenant_id: string; id: string; started_at: string | null }>,
  options: { lockTaken?: boolean; failUpdate?: boolean } = {}
) => {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  const published: Array<{ tenantId: string; taskId: string }> = [];

  const db = {
    query: async (sql: string, params: unknown[]) => {
      queries.push({ sql, params });
      if (sql.includes('pg_try_advisory_xact_lock')) {
        return [{ locked: !options.lockTaken }];
      }
      if (options.failUpdate) {
        throw new Error('db down');
      }
      return stuckRows;
    },
    withTransaction: async (cb: (client: unknown) => Promise<unknown>) => cb({})
  };
  const enqueue = {
    publishGenerationJob: async (tenantId: string, taskId: string) => {
      published.push({ tenantId, taskId });
      return true;
    }
  };

  return {
    service: new StuckTasksReaperService(db as never, enqueue as never),
    queries,
    published
  };
};

const STUCK = [{ tenant_id: 'tenant_a', id: 'task_1', started_at: '2026-08-08T10:00:00.000Z' }];

describe('возврат зависших задач в очередь', () => {
  it('оживлённая задача заново публикуется в очередь', async () => {
    // Без публикации задача просто снова лежала бы в `queued` и опять никто бы её не взял.
    const { service, published } = makeService(STUCK);

    const revived = await service.runSweep();

    expect(revived).toBe(1);
    expect(published).toEqual([{ tenantId: 'tenant_a', taskId: 'task_1' }]);
  });

  it('берутся только задачи с отметкой начала старше порога', async () => {
    const { service, queries } = makeService(STUCK);
    await service.runSweep();

    const update = queries.find((q) => q.sql.includes('update documents.runtime_documents'));
    expect(update?.sql).toContain("data->>'status' = 'running'");
    expect(update?.sql).toContain("data->>'startedAt' is not null");
    expect(update?.sql).toContain('minutes');
  });

  it('счётчик оживлений растёт — по нему видно задачу, которую чинят по кругу', async () => {
    const { service, queries } = makeService(STUCK);
    await service.runSweep();

    const update = queries.find((q) => q.sql.includes('update documents.runtime_documents'));
    expect(update?.sql).toContain('reviveCount');
    // Отметка начала снимается: иначе задача осталась бы «зависшей» и на следующем прогоне.
    expect(update?.sql).toContain("data - 'startedAt'");
  });

  it('второй экземпляр бэкенда не гребёт то же самое', async () => {
    const { service, published } = makeService(STUCK, { lockTaken: true });

    const revived = await service.runSweep();

    expect(revived).toBe(0);
    expect(published).toHaveLength(0);
  });
});

describe('отметка планировщика', () => {
  it('успешный прогон помечается — молчание реапера видно снаружи', async () => {
    resetSchedulerRuns();
    const { service } = makeService([]);

    await service.handleSweep();

    const [run] = getSchedulerRuns();
    expect(run?.job).toBe('stuck-document-tasks-reaper');
    expect(run?.failures).toBe(0);
  });

  it('падение прогона не роняет процесс, но видно в отметке', async () => {
    // Планировщик, тихо падающий каждые пять минут, раньше был неотличим от исправного.
    resetSchedulerRuns();
    const { service } = makeService(STUCK, { failUpdate: true });

    await expect(service.handleSweep()).resolves.toBeUndefined();

    const [run] = getSchedulerRuns();
    expect(run?.failures).toBe(1);
    expect(run?.lastSuccessAt).toBeNull();
  });
});

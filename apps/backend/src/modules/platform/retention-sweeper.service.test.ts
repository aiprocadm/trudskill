import { describe, expect, it } from 'vitest';

import { RetentionSweeperService } from './retention-sweeper.service.js';
import { getSchedulerRuns, resetSchedulerRuns } from '../../common/metrics/scheduler-heartbeat.js';

/**
 * Чистка разрастающихся таблиц (ФТ-I4, Фаза 6 Task 9).
 *
 * Четыре таблицы росли без единой чистки: на стенде уже лежало 117 сессий, из них
 * 15 просроченных и 20 отозванных, и ни одна никогда не удалялась. Диск общий с
 * бэкапами — переполнение означает, что ночная копия не снимется.
 */
const makeService = (options: { lockTaken?: boolean; batches?: number[]; fail?: boolean } = {}) => {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  const batches = options.batches ?? [];
  let deleteCall = 0;

  const db = {
    query: async (sql: string, params: unknown[]) => {
      queries.push({ sql, params });
      if (sql.includes('pg_try_advisory_lock')) {
        return [{ locked: !options.lockTaken }];
      }
      if (sql.includes('pg_advisory_unlock')) {
        return [];
      }
      if (options.fail) {
        throw new Error('db down');
      }
      const count = batches[deleteCall] ?? 0;
      deleteCall += 1;
      return [{ count: String(count) }];
    }
  };

  return { service: new RetentionSweeperService(db as never), queries };
};

describe('чистка таблиц', () => {
  it('чистит сессии, ссылки входа и отметки обработанных сообщений', async () => {
    const { service, queries } = makeService();

    const result = await service.runSweep();

    const deletes = queries.filter((q) => q.sql.includes('delete from')).map((q) => q.sql);
    expect(deletes.some((sql) => sql.includes('iam.sessions'))).toBe(true);
    expect(deletes.some((sql) => sql.includes('iam.magic_link_tokens'))).toBe(true);
    expect(deletes.some((sql) => sql.includes('core.processed_message_ids'))).toBe(true);
    expect(result.sessions).toBe(0);
  });

  it('журнал аудита по умолчанию НЕ трогается', async () => {
    // Срок хранения журнала аудита — решение владельца, а не разработчика: удалять его
    // «на всякий случай» нельзя. Значение по умолчанию `AUDIT_RETENTION_DAYS=0`.
    const { service, queries } = makeService();

    const result = await service.runSweep();

    expect(queries.some((q) => q.sql.includes('audit.audit_log'))).toBe(false);
    expect(result.auditEntries).toBe(0);
  });

  it('отозванные сессии удаляются не сразу, а по сроку хранения', async () => {
    // Иначе при разборе инцидента «кто и когда вошёл» смотреть будет нечего.
    const { service, queries } = makeService();
    await service.runSweep();

    const sessionsDelete = queries.find((q) => q.sql.includes('iam.sessions'));
    expect(sessionsDelete?.sql).toContain("revoked_at < now() - ($1 || ' days')::interval");
    expect(sessionsDelete?.params[0]).toBe('30');
  });

  it('отметки обработанных сообщений живут дольше окна повторов', async () => {
    // Удалить отметку раньше времени = разрешить повторную обработку старого сообщения,
    // то есть выпустить второе удостоверение.
    const { service, queries } = makeService();
    await service.runSweep();

    const processed = queries.find((q) => q.sql.includes('core.processed_message_ids'));
    expect(Number(processed?.params[0])).toBeGreaterThanOrEqual(14);
  });

  it('удаление идёт порциями — один большой delete держал бы блокировки минутами', async () => {
    const { service, queries } = makeService();
    await service.runSweep();

    const sessionsDelete = queries.find((q) => q.sql.includes('iam.sessions'));
    expect(sessionsDelete?.sql).toContain('limit 5000');
    expect(sessionsDelete?.sql).toContain('ctid in (');
  });

  it('порции повторяются, пока не кончатся', async () => {
    // 5000 = полная порция, значит есть ещё; 3 = последняя.
    const { service } = makeService({ batches: [5000, 3] });

    const result = await service.runSweep();

    expect(result.sessions).toBe(5003);
  });

  it('второй экземпляр не чистит одновременно с первым', async () => {
    const { service, queries } = makeService({ lockTaken: true });

    const result = await service.runSweep();

    expect(result).toEqual({
      sessions: 0,
      magicLinkTokens: 0,
      processedMessages: 0,
      auditEntries: 0
    });
    expect(queries.some((q) => q.sql.includes('delete from'))).toBe(false);
  });

  it('блокировка снимается даже при ошибке — иначе чистка не пойдёт больше никогда', async () => {
    const { service, queries } = makeService({ fail: true });

    await expect(service.runSweep()).rejects.toThrow('db down');

    expect(queries.some((q) => q.sql.includes('pg_advisory_unlock'))).toBe(true);
  });
});

describe('отметка планировщика', () => {
  it('успешный прогон помечается', async () => {
    resetSchedulerRuns();
    const { service } = makeService();

    await service.handleSweep();

    expect(getSchedulerRuns()[0]?.job).toBe('retention-sweeper');
    expect(getSchedulerRuns()[0]?.failures).toBe(0);
  });

  it('падение не роняет процесс, но видно в отметке', async () => {
    resetSchedulerRuns();
    const { service } = makeService({ fail: true });

    await expect(service.handleSweep()).resolves.toBeUndefined();

    expect(getSchedulerRuns()[0]?.failures).toBe(1);
  });
});

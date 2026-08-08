import { describe, expect, it } from 'vitest';

import { type QueryRunner, storeQuarantinedMessage } from './quarantine-store.js';
import { parseQuarantinedMessage } from './retry-policy.js';

/**
 * Карантин упавших задач (ФТ-I1, Фаза 6 Task 7).
 *
 * Очередь `jobs.dead-letter` наполнялась с Фазы 0, но читать её было некому: ни
 * консьюмера, ни таблицы, ни экрана. Неудавшийся выпуск удостоверения пропадал молча.
 */
const makeDb = () => {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const db: QueryRunner = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      return { rowCount: 1 };
    }
  };
  return { db, calls };
};

const AT = () => new Date('2026-08-08T12:00:00.000Z');

describe('запись сообщения в карантин', () => {
  it('сохраняет тенанта, вид задачи, тело и последнюю ошибку', async () => {
    const { db, calls } = makeDb();
    const parsed = parseQuarantinedMessage(
      Buffer.from(
        JSON.stringify({
          messageId: 'msg_1',
          tenantId: 'tenant_demo',
          jobType: 'document',
          payload: { taskId: 'task_1' }
        })
      ),
      { headers: { 'x-retry-count': 10, 'x-last-error': 'gotenberg timeout' } },
      'documents.generate'
    );

    await storeQuarantinedMessage(
      db,
      { ...parsed, queueName: 'jobs.dead-letter', headers: { 'x-retry-count': 10 } },
      AT
    );

    const [call] = calls;
    expect(call?.params[1]).toBe('tenant_demo');
    expect(call?.params[2]).toBe('msg_1');
    expect(call?.params[3]).toBe('document');
    expect(call?.params[4]).toBe('jobs.dead-letter');
    expect(call?.params[10]).toBe('gotenberg timeout');
    expect(call?.params[9]).toBe(10);
  });

  it('повторное попадание обновляет строку, а не плодит дубли', async () => {
    // Иначе список карантина превратился бы в ленту повторов, и было бы не видно,
    // сколько на самом деле застрявших задач.
    const { db, calls } = makeDb();
    const parsed = parseQuarantinedMessage('{"messageId":"msg_1"}', null);

    await storeQuarantinedMessage(db, { ...parsed, queueName: 'jobs.dead-letter', headers: null });

    const sql = calls[0]?.sql ?? '';
    expect(sql).toContain('on conflict (message_id)');
    expect(sql).toContain('do update set');
    // Разобранное ранее сообщение, упавшее снова, снова становится «в карантине».
    expect(sql).toContain("status = 'quarantined'");
    expect(sql).toContain('resolved_at = null');
  });

  it('мусор без идентификатора всё равно сохраняется — именно он важен при разборе', async () => {
    const { db, calls } = makeDb();
    const parsed = parseQuarantinedMessage('не json вовсе', null);

    await storeQuarantinedMessage(db, { ...parsed, queueName: 'jobs.dead-letter', headers: null });

    const [call] = calls;
    expect(call?.params[2]).toBeNull();
    expect(call?.params[6]).toBe('не json вовсе');
    expect(call?.params[7]).toBeNull();
  });

  it('тело и заголовки уходят в jsonb строками — иначе драйвер запишет [object Object]', async () => {
    const { db, calls } = makeDb();
    const parsed = parseQuarantinedMessage(
      '{"messageId":"m","payload":{"taskId":"t1"}}',
      { headers: { 'x-retry-count': 3 } },
      'documents.generate'
    );

    await storeQuarantinedMessage(db, {
      ...parsed,
      queueName: 'jobs.dead-letter',
      headers: { 'x-retry-count': 3 }
    });

    expect(calls[0]?.params[7]).toBe('{"taskId":"t1"}');
    expect(calls[0]?.params[8]).toBe('{"x-retry-count":3}');
  });
});

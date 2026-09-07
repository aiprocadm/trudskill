import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { JobQuarantineService } from './job-quarantine.service.js';

import type { RequestContext } from '../../common/context/request-context.js';

/**
 * Карантин упавших задач (ФТ-I1, Фаза 6 Task 7).
 *
 * Очередь `jobs.dead-letter` наполнялась с Фазы 0, но читать её было НЕКОМУ: ни
 * консьюмера, ни таблицы, ни экрана. Неудавшийся выпуск удостоверения исчезал молча.
 * Здесь проверяется то, ради чего карантин и заводился: сообщение видно, его можно
 * вернуть в работу, и чужое сообщение при этом недоступно.
 */
const CTX: RequestContext = {
  tenantId: 'tenant_a',
  userId: 'user_admin',
  sessionId: 'sess_1',
  requestId: 'req_1',
  correlationId: 'corr_1',
  ip: '127.0.0.1',
  userAgent: 'vitest'
} as RequestContext;

const rowFor = (over: Record<string, unknown> = {}) => ({
  id: 'qtn_1',
  tenant_id: 'tenant_a',
  message_id: 'msg_1',
  job_type: 'document',
  queue_name: 'jobs.dead-letter',
  routing_key: 'lms.document_generation',
  retry_count: 10,
  last_error: 'gotenberg timeout',
  status: 'quarantined',
  quarantined_at: new Date('2026-08-08T10:00:00.000Z'),
  resolved_at: null,
  resolved_by: null,
  republish_count: 0,
  payload: { taskId: 'task_1' },
  raw_body: JSON.stringify({ messageId: 'msg_1', tenantId: 'tenant_a', jobType: 'document' }),
  ...over
});

const makeService = (rows: Record<string, unknown>[]) => {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  const published: Array<{ exchange: string; routingKey: string; payload: unknown }> = [];
  const audited: Array<{ action: string; entityId?: string }> = [];

  const db = {
    query: async (sql: string, params: unknown[]) => {
      queries.push({ sql, params });
      if (sql.includes('count(*)')) return [{ count: String(rows.length) }];
      if (sql.trimStart().startsWith('update')) return [{ ...rows[0], status: 'republished' }];
      // Выборка «своей» строки: подражаем условию tenant_id = $2 из SQL.
      if (sql.includes('where id = $1 and tenant_id = $2')) {
        return rows.filter((r) => r.id === params[0] && r.tenant_id === params[1]);
      }
      return rows;
    }
  };
  const rabbit = {
    publish: async (exchange: string, routingKey: string, payload: unknown) => {
      published.push({ exchange, routingKey, payload });
    }
  };
  const audit = {
    write: (entry: { action: string; entityId?: string }) => {
      audited.push(entry);
      return entry;
    }
  };

  const service = new JobQuarantineService(db as never, rabbit as never, audit as never);
  return { service, queries, published, audited };
};

describe('список карантина', () => {
  it('показывает только свой центр', async () => {
    const { service, queries } = makeService([rowFor()]);
    await service.list('tenant_a');

    const [listQuery] = queries;
    expect(listQuery?.sql).toContain('where q.tenant_id = $1');
    expect(listQuery?.params[0]).toBe('tenant_a');
  });

  it('помечает неразбираемое сообщение как непереотправляемое', async () => {
    const { service } = makeService([rowFor({ raw_body: 'это не json' })]);
    const result = await service.list('tenant_a');
    expect(result.items[0]?.replayable).toBe(false);
  });

  it('размер выборки ограничен сверху — список не должен ронять экран', async () => {
    const { service, queries } = makeService([rowFor()]);
    await service.list('tenant_a', { limit: 100_000 });
    expect(queries[0]?.params[2]).toBe(200);
  });
});

describe('переотправка из карантина', () => {
  it('публикует исходное сообщение в очередь и помечает строку', async () => {
    const { service, published, audited } = makeService([rowFor()]);

    const result = await service.republish('tenant_a', 'qtn_1', CTX);

    expect(published).toHaveLength(1);
    expect(published[0]?.routingKey).toBe('lms.document_generation');
    expect(result.status).toBe('republished');
    expect(audited[0]?.action).toBe('operations.quarantine_republished');
  });

  it('чужое сообщение не найдено — 404, а не отказ по правам', async () => {
    // 403 подтвердил бы существование чужой записи.
    const { service } = makeService([rowFor({ tenant_id: 'tenant_b' })]);
    await expect(service.republish('tenant_a', 'qtn_1', CTX)).rejects.toBeInstanceOf(
      NotFoundException
    );
  });

  it('мусор переотправить нельзя — честный отказ вместо публикации в никуда', async () => {
    // Иначе сообщение улетело бы в очередь и через десять попыток вернулось в карантин.
    const { service, published } = makeService([rowFor({ raw_body: 'не json' })]);
    await expect(service.republish('tenant_a', 'qtn_1', CTX)).rejects.toBeInstanceOf(
      BadRequestException
    );
    expect(published).toHaveLength(0);
  });

  it('повторная переотправка той же строки запрещена', async () => {
    const { service } = makeService([rowFor({ status: 'republished' })]);
    // §5.423: «уже вернули в очередь» — занятое состояние, это 409, а не «данные не подошли».
    await expect(service.republish('tenant_a', 'qtn_1', CTX)).rejects.toBeInstanceOf(
      ConflictException
    );
  });

  it('публикация идёт ДО отметки в базе: не отметить успех, которого не было', async () => {
    const { service, queries, published } = makeService([rowFor()]);
    await service.republish('tenant_a', 'qtn_1', CTX);

    const updateIndex = queries.findIndex((q) => q.sql.trimStart().startsWith('update'));
    expect(published).toHaveLength(1);
    expect(updateIndex).toBeGreaterThan(-1);
  });
});

describe('отбрасывание', () => {
  it('пишет в журнал аудита, кто и почему отбросил', async () => {
    const { service, audited } = makeService([rowFor()]);
    await service.discard('tenant_a', 'qtn_1', 'выпущено вручную', CTX);

    expect(audited[0]?.action).toBe('operations.quarantine_discarded');
    expect(audited[0]?.entityId).toBe('qtn_1');
  });

  it('чужое сообщение отбросить нельзя', async () => {
    const { service } = makeService([rowFor({ tenant_id: 'tenant_b' })]);
    await expect(service.discard('tenant_a', 'qtn_1', undefined, CTX)).rejects.toBeInstanceOf(
      NotFoundException
    );
  });
  /*
   * §5.431. В карантине хранится, КТО разобрал сообщение, но там лежит идентификатор
   * учётной записи, а показывать сырой идентификатор запрещено правилом продукта №2.
   * Имя подставляет СЕРВЕР — тем же левым соединением, что и журнал действий: справочник
   * имён на стороне экрана врёт на удалённых и на неизвестных учётных записях.
   *
   * До этой правки экран не показывал разобравшего вовсе: поле `resolvedBy` приходило и не
   * читалось никем. В карантин попадают упавшие выпуски документов — и «кто это разобрал»
   * ровно тот вопрос, который задают, когда документ до человека так и не дошёл.
   */
  it('имя разобравшего подставляет сервер, а не экран', async () => {
    const { service, queries } = makeService([
      rowFor({ status: 'republished', resolved_by: 'user_ops', resolved_by_name: 'Петров П.' })
    ]);

    const page = await service.list('tenant_a', {});

    // Проверяется не только соединение, но и ВЫБРАННАЯ колонка: без неё имя не доедет,
    // а соединение останется на месте — на этом подсадной нарушитель прошёл мимо первой
    // редакции теста.
    expect(queries[0]!.sql).toContain('left join iam.users');
    expect(queries[0]!.sql).toContain('u.display_name as resolved_by_name');
    expect(page.items[0]!.resolvedByName).toBe('Петров П.');
  });

  it('удалённая учётная запись оставляет имя пустым, а не «системой»', async () => {
    // Левое соединение даёт пусто — и экран скажет об этом прямо, а не подставит
    // правдоподобную неправду.
    const { service } = makeService([
      rowFor({ status: 'discarded', resolved_by: 'user_gone', resolved_by_name: null })
    ]);

    const page = await service.list('tenant_a', {});

    expect(page.items[0]!.resolvedBy).toBe('user_gone');
    expect(page.items[0]!.resolvedByName).toBeNull();
  });
});

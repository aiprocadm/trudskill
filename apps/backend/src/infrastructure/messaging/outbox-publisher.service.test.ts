import { describe, expect, it, vi } from 'vitest';

import { OutboxPublisherService } from './outbox-publisher.service.js';

import type { RabbitMqService } from './rabbitmq.service.js';
import type { DatabaseService } from '../database/database.service.js';

vi.mock('../../env.js', () => ({
  backendEnv: {
    OUTBOX_PUBLISHER_ENABLED: true,
    OUTBOX_POLL_INTERVAL_MS: 3600000,
    OUTBOX_BATCH_SIZE: 10,
    OUTBOX_MAX_RETRIES: 3
  }
}));

/**
 * Издатель outbox (покрытие 0% → полное). Смысл паттерна: событие сначала пишется в БД
 * той же транзакцией, что и данные, а брокеру отправляется ПОТОМ — сбой брокера не
 * теряет событие, а откладывает его с экспоненциальной паузой до предела попыток.
 */
type Call = { sql: string; params: unknown[] };

function harness(rows: unknown[] = [], publishError?: Error) {
  const calls: Call[] = [];
  const query = async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    return sql.includes('returning e.id') ? rows : [];
  };
  const db = {
    query,
    withTransaction: async (fn: (client: unknown) => Promise<unknown>) => fn({})
  } as unknown as DatabaseService;
  const publish = publishError
    ? vi.fn().mockRejectedValue(publishError)
    : vi.fn().mockResolvedValue(undefined);
  const service = new OutboxPublisherService(db, { publish } as unknown as RabbitMqService);
  return { service, calls, publish };
}

const claimed = {
  id: 'evt_1',
  exchange: 'lms.events',
  routing_key: 'enrollment.completed',
  payload_json: { enrollmentId: 'enr_1' },
  retry_count: 0
};

describe('OutboxPublisherService', () => {
  it('забор пачки: for update skip locked — два экземпляра не заберут одно событие', async () => {
    const { service, calls } = harness([claimed]);
    await service.onModuleInit();
    await service.onModuleDestroy();

    const claim = calls.find((c) => c.sql.includes('for update skip locked'))!;
    expect(claim).toBeDefined();
    expect(claim.params[0]).toBe(10); // размер пачки из конфигурации
  });

  it('успешная публикация: событие уходит в брокер и помечается published', async () => {
    const { service, calls, publish } = harness([claimed]);
    await service.onModuleInit();
    await service.onModuleDestroy();

    expect(publish).toHaveBeenCalledWith('lms.events', 'enrollment.completed', {
      enrollmentId: 'enr_1'
    });
    const mark = calls.find((c) => c.params[1] === 'published')!;
    expect(mark.sql).toContain('locked_at = null');
  });

  it('сбой брокера НЕ теряет событие: pending с ростом retry_count', async () => {
    const { service, calls } = harness([claimed], new Error('amqp down'));
    await service.onModuleInit();
    await service.onModuleDestroy();

    const retry = calls.find((c) => c.sql.includes('next_attempt_at = case'))!;
    expect(retry.params[1]).toBe('pending');
    expect(retry.params[2]).toBe(1); // retry_count + 1
    expect(retry.params[3]).toBe('amqp down');
    // Экспоненциальная пауза с потолком — брокер не долбится в бесконечном цикле.
    expect(retry.sql).toContain('least(3600, power(2');
  });

  it('исчерпание попыток: событие помечается failed, а не крутится вечно', async () => {
    const { service, calls } = harness(
      [{ ...claimed, retry_count: 2 }], // 2 + 1 = 3 = OUTBOX_MAX_RETRIES
      new Error('amqp down')
    );
    await service.onModuleInit();
    await service.onModuleDestroy();

    const mark = calls.find((c) => c.sql.includes('next_attempt_at = case'))!;
    expect(mark.params[1]).toBe('failed');
  });

  it('падение одного события не мешает следующему в пачке', async () => {
    // Первое падает в брокере, второе обязано уйти.
    const publish = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(undefined);
    const calls: Call[] = [];
    const db = {
      query: async (sql: string, params: unknown[] = []) => {
        calls.push({ sql, params });
        return sql.includes('returning e.id') ? [claimed, { ...claimed, id: 'evt_2' }] : [];
      },
      withTransaction: async (fn: (client: unknown) => Promise<unknown>) => fn({})
    } as unknown as DatabaseService;
    const service = new OutboxPublisherService(db, { publish } as unknown as RabbitMqService);
    await service.onModuleInit();
    await service.onModuleDestroy();

    expect(publish).toHaveBeenCalledTimes(2);
    expect(calls.some((c) => c.params[1] === 'published' && c.params[0] === 'evt_2')).toBe(true);
  });

  it('повторный destroy безопасен', async () => {
    const { service } = harness([]);
    await service.onModuleInit();
    await service.onModuleDestroy();
    await expect(service.onModuleDestroy()).resolves.toBeUndefined();
  });
});

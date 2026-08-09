import { describe, expect, it, vi } from 'vitest';

import { DatabaseService } from './database.service.js';

/**
 * Блокировка вокруг миграций (ФТ-I4, Фаза 6 Task 9).
 *
 * ЗАЧЕМ. Миграции накатывались без всякой блокировки. При одновременном старте двух
 * экземпляров (перевыкатка, перезапуск после сбоя) оба читали список применённых, оба
 * видели одну и ту же новую миграцию и оба начинали её применять. В лучшем случае второй
 * падал на «таблица уже существует» и контейнер уходил в цикл перезапусков; в худшем —
 * миграция без `IF NOT EXISTS` обрывалась на середине.
 */
const makeService = (options: { failInside?: boolean } = {}) => {
  const calls: string[] = [];
  const lockClient = {
    query: vi.fn(async (sql: string) => {
      calls.push(sql);
      return { rows: [] };
    }),
    release: vi.fn()
  };
  const pool = { connect: vi.fn(async () => lockClient) };

  const service = new DatabaseService();
  // Подменяем пул: поднимать настоящую базу ради проверки порядка блокировки не нужно.
  (service as unknown as { pool: unknown }).pool = pool;
  (service as unknown as { runMigrationsUnderLock: () => Promise<void> }).runMigrationsUnderLock =
    async () => {
      calls.push('MIGRATIONS');
      if (options.failInside) {
        throw new Error('migration failed');
      }
    };

  return { service, calls, lockClient, pool };
};

describe('миграции под блокировкой', () => {
  it('блокировка берётся ДО миграций и снимается ПОСЛЕ', async () => {
    const { service, calls } = makeService();

    await service.runMigrations();

    const lockAt = calls.findIndex((sql) => sql.includes('pg_advisory_lock'));
    const migrationsAt = calls.indexOf('MIGRATIONS');
    const unlockAt = calls.findIndex((sql) => sql.includes('pg_advisory_unlock'));

    expect(lockAt).toBeGreaterThan(-1);
    expect(lockAt).toBeLessThan(migrationsAt);
    expect(migrationsAt).toBeLessThan(unlockAt);
  });

  it('упавшая миграция всё равно снимает блокировку', async () => {
    // Иначе следующий старт бэкенда встанет в ожидание навсегда.
    const { service, calls, lockClient } = makeService({ failInside: true });

    await expect(service.runMigrations()).rejects.toThrow('migration failed');

    expect(calls.some((sql) => sql.includes('pg_advisory_unlock'))).toBe(true);
    expect(lockClient.release).toHaveBeenCalled();
  });

  it('используется блокировка уровня сеанса, а не транзакции', async () => {
    // Транзакционная снялась бы на первом же COMMIT — то есть после первой миграции,
    // и второй экземпляр влез бы в середину.
    const { service, calls } = makeService();

    await service.runMigrations();

    expect(calls.some((sql) => sql.includes('pg_advisory_xact_lock'))).toBe(false);
    expect(calls.some((sql) => sql.includes('pg_advisory_lock'))).toBe(true);
  });

  it('соединение возвращается в пул', async () => {
    const { service, lockClient } = makeService();
    await service.runMigrations();
    expect(lockClient.release).toHaveBeenCalledTimes(1);
  });
});

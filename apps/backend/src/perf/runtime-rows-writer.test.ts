import { describe, expect, it } from 'vitest';

import {
  RUNTIME_DOCUMENTS_TABLE,
  poolTransactions,
  writeRuntimeRows
} from './runtime-rows-writer.js';

import type { SqlClient, TransactionRunner } from './runtime-rows-writer.js';
import type { RuntimeRow } from './synthetic-cdoprof-tenant.js';
import type { Pool } from 'pg';

const rowsOf = (count: number, collection = 'groups'): RuntimeRow[] =>
  Array.from({ length: count }, (_, i) => ({
    collection,
    id: `${collection}_${i}`,
    data: { id: `${collection}_${i}`, n: i }
  }));

/** Заглушка транзакции: записывает вызовы; при `failOn` первый совпавший запрос падает. */
const recordingRunner = (failOn?: string) => {
  const calls: Array<{ text: string; values?: unknown[] }> = [];
  let transactions = 0;
  const client: SqlClient = {
    async query(text, values) {
      calls.push({ text, values });
      if (failOn && text.startsWith(failOn)) throw new Error(`boom on ${failOn}`);
      return undefined;
    }
  };
  const db: TransactionRunner = {
    async withTransaction(callback) {
      transactions += 1;
      return callback(client);
    }
  };
  return { db, calls, transactions: () => transactions };
};

describe('writeRuntimeRows', () => {
  it('в одной транзакции удаляет только свои коллекции тенанта и вставляет пачками', async () => {
    const { db, calls, transactions } = recordingRunner();
    const rows = [...rowsOf(5, 'groups'), ...rowsOf(3, 'learners')];

    const result = await writeRuntimeRows(db, 't_perf', rows, { batchSize: 4 });

    expect(result).toEqual({
      deletedCollections: ['groups', 'learners'],
      inserted: 8,
      batches: 2
    });
    expect(transactions()).toBe(1);
    expect(calls.map((c) => c.text.split(' ')[0])).toEqual(['delete', 'insert', 'insert']);
    const del = calls[0];
    expect(del?.text).toContain(`delete from ${RUNTIME_DOCUMENTS_TABLE} where tenant_id = $1`);
    expect(del?.text).toContain('collection = any($2)');
    expect(del?.values).toEqual(['t_perf', ['groups', 'learners']]);
    const firstInsert = calls[1];
    expect(firstInsert?.values).toHaveLength(4 * 4);
    expect(firstInsert?.values?.slice(0, 4)).toEqual([
      't_perf',
      'groups',
      'groups_0',
      JSON.stringify({ id: 'groups_0', n: 0 })
    ]);
    expect((firstInsert?.text.match(/\$\d+::jsonb/g) ?? []).length).toBe(4);
  });

  it('ошибка внутри транзакции пробрасывается наружу', async () => {
    const { db } = recordingRunner('insert');

    await expect(writeRuntimeRows(db, 't', rowsOf(2))).rejects.toThrow('boom on insert');
  });

  it('пустой набор — удаление своих коллекций (их нет) без вставок', async () => {
    const { db, calls } = recordingRunner();

    const result = await writeRuntimeRows(db, 't', []);

    expect(result).toEqual({ deletedCollections: [], inserted: 0, batches: 0 });
    expect(calls.map((c) => c.text.split(' ')[0])).toEqual(['delete']);
  });
});

describe('poolTransactions', () => {
  const fakePool = (failOn?: string) => {
    const calls: string[] = [];
    let released = 0;
    const client = {
      async query(text: string) {
        calls.push(text);
        if (failOn && text.startsWith(failOn)) throw new Error(`boom on ${failOn}`);
        return undefined;
      },
      release() {
        released += 1;
      }
    };
    const pool = { connect: async () => client } as unknown as Pool;
    return { pool, calls, released: () => released };
  };

  it('begin → работа → commit, соединение возвращается', async () => {
    const { pool, calls, released } = fakePool();

    const result = await poolTransactions(pool).withTransaction(async (client) => {
      await client.query('insert into x values (1)');
      return 42;
    });

    expect(result).toBe(42);
    expect(calls).toEqual(['begin', 'insert into x values (1)', 'commit']);
    expect(released()).toBe(1);
  });

  it('при ошибке — rollback, проброс и возврат соединения', async () => {
    const { pool, calls, released } = fakePool('insert');

    await expect(
      poolTransactions(pool).withTransaction(async (client) => {
        await client.query('insert into x values (1)');
      })
    ).rejects.toThrow('boom on insert');

    expect(calls.at(-1)).toBe('rollback');
    expect(released()).toBe(1);
  });
});

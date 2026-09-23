import { describe, expect, it } from 'vitest';

import { RUNTIME_DOCUMENTS_TABLE, writeRuntimeRows } from './runtime-rows-writer.js';

import type { SqlClient } from './runtime-rows-writer.js';
import type { RuntimeRow } from './synthetic-cdoprof-tenant.js';

const rowsOf = (count: number, collection = 'groups'): RuntimeRow[] =>
  Array.from({ length: count }, (_, i) => ({
    collection,
    id: `${collection}_${i}`,
    data: { id: `${collection}_${i}`, n: i }
  }));

const recordingClient = (failOn?: string) => {
  const calls: Array<{ text: string; values?: unknown[] }> = [];
  const client: SqlClient = {
    async query(text, values) {
      calls.push({ text, values });
      if (failOn && text.startsWith(failOn)) throw new Error(`boom on ${failOn}`);
      return undefined;
    }
  };
  return { client, calls };
};

describe('writeRuntimeRows', () => {
  it('в одной транзакции удаляет только свои коллекции тенанта и вставляет пачками', async () => {
    const { client, calls } = recordingClient();
    const rows = [...rowsOf(5, 'groups'), ...rowsOf(3, 'learners')];

    const result = await writeRuntimeRows(client, 't_perf', rows, { batchSize: 4 });

    expect(result).toEqual({
      deletedCollections: ['groups', 'learners'],
      inserted: 8,
      batches: 2
    });
    expect(calls.map((c) => c.text.split(' ')[0])).toEqual([
      'begin',
      'delete',
      'insert',
      'insert',
      'commit'
    ]);
    const del = calls[1];
    expect(del?.text).toContain(`delete from ${RUNTIME_DOCUMENTS_TABLE} where tenant_id = $1`);
    expect(del?.text).toContain('collection = any($2)');
    expect(del?.values).toEqual(['t_perf', ['groups', 'learners']]);
    const firstInsert = calls[2];
    expect(firstInsert?.values).toHaveLength(4 * 4);
    expect(firstInsert?.values?.slice(0, 4)).toEqual([
      't_perf',
      'groups',
      'groups_0',
      JSON.stringify({ id: 'groups_0', n: 0 })
    ]);
    expect((firstInsert?.text.match(/\$\d+::jsonb/g) ?? []).length).toBe(4);
  });

  it('при ошибке откатывает транзакцию и пробрасывает её', async () => {
    const { client, calls } = recordingClient('insert');

    await expect(writeRuntimeRows(client, 't', rowsOf(2))).rejects.toThrow('boom on insert');

    expect(calls.at(-1)?.text).toBe('rollback');
  });

  it('пустой набор — только удаление своих коллекций (их нет) и commit', async () => {
    const { client, calls } = recordingClient();

    const result = await writeRuntimeRows(client, 't', []);

    expect(result).toEqual({ deletedCollections: [], inserted: 0, batches: 0 });
    expect(calls.map((c) => c.text.split(' ')[0])).toEqual(['begin', 'delete', 'commit']);
  });
});

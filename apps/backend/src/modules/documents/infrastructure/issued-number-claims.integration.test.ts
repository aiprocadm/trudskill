import { afterAll, describe, expect, it } from 'vitest';

import { DuplicateDocumentNumberError, claimIssuedNumbers } from './issued-number-claims.js';
import { isDockerAvailable, stopTestDb, withTestDb } from '../../../testing/with-test-db.js';

/**
 * Линия обороны 2 программы 272 на НАСТОЯЩЕЙ базе.
 *
 * Уникальность номера держалась на проверке в ПАМЯТИ процесса: два экземпляра приложения
 * могли выпустить два удостоверения с одним номером. Для регулируемой нумерации это худший
 * из возможных дефектов — у проверяющего два разных документа с одинаковым номером.
 */

const dockerAvailable = isDockerAvailable();

afterAll(async () => {
  if (dockerAvailable) await stopTestDb();
}, 60_000);

const TEST_DB = {
  migrations: [
    '0001_backend_foundation.sql',
    '0005_documents_domain.sql',
    '0088_documents_issued_number_claims.sql'
  ]
};

async function seedTenant(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown[]> },
  tenantId: string
): Promise<void> {
  await db.query(
    `insert into core.tenants (id, code, name, status)
     values ($1, $1, $1, 'active')
     on conflict (id) do nothing`,
    [tenantId]
  );
}

describe.skipIf(!dockerAvailable)('заявка на номер документа (журнал 272)', () => {
  it('первая заявка проходит', async () => {
    await withTestDb(TEST_DB, async (db) => {
      await seedTenant(db, 't_first');

      await expect(
        db.withTransaction((client) =>
          claimIssuedNumbers(client, 't_first', [{ id: 'nres_1', reservedNumber: 'CERT-000001' }])
        )
      ).resolves.toBeUndefined();
    });
  });

  it('ВТОРОЕ резервирование того же номера не проходит — дубля быть не может', async () => {
    await withTestDb(TEST_DB, async (db) => {
      await seedTenant(db, 't_dup');

      await db.withTransaction((client) =>
        claimIssuedNumbers(client, 't_dup', [{ id: 'nres_a', reservedNumber: 'CERT-000001' }])
      );

      // Второй экземпляр приложения выпустил СВОЁ резервирование с тем же номером.
      await expect(
        db.withTransaction((client) =>
          claimIssuedNumbers(client, 't_dup', [{ id: 'nres_b', reservedNumber: 'CERT-000001' }])
        )
      ).rejects.toBeInstanceOf(DuplicateDocumentNumberError);
    });
  });

  it('повторная заявка ТЕМ ЖЕ резервированием законна — освобождённый номер переиспользуется', async () => {
    await withTestDb(TEST_DB, async (db) => {
      await seedTenant(db, 't_reuse');
      const same = [{ id: 'nres_same', reservedNumber: 'CERT-000007' }];

      await db.withTransaction((client) => claimIssuedNumbers(client, 't_reuse', same));

      // Задача упала, номер освобождён и переиспользован ТЕМ ЖЕ резервированием —
      // заявка та же, и мешать выпуску она не имеет права.
      await expect(
        db.withTransaction((client) => claimIssuedNumbers(client, 't_reuse', same))
      ).resolves.toBeUndefined();
    });
  });

  it('номера разных арендаторов не мешают друг другу', async () => {
    await withTestDb(TEST_DB, async (db) => {
      await seedTenant(db, 't_one');
      await seedTenant(db, 't_two');

      await db.withTransaction((client) =>
        claimIssuedNumbers(client, 't_one', [{ id: 'nres_x', reservedNumber: 'CERT-000001' }])
      );

      await expect(
        db.withTransaction((client) =>
          claimIssuedNumbers(client, 't_two', [{ id: 'nres_y', reservedNumber: 'CERT-000001' }])
        )
      ).resolves.toBeUndefined();
    });
  });

  it('пачка заявок падает целиком, если хотя бы один номер чужой', async () => {
    await withTestDb(TEST_DB, async (db) => {
      await seedTenant(db, 't_batch');

      await db.withTransaction((client) =>
        claimIssuedNumbers(client, 't_batch', [{ id: 'nres_own', reservedNumber: 'CERT-000002' }])
      );

      await expect(
        db.withTransaction((client) =>
          claimIssuedNumbers(client, 't_batch', [
            { id: 'nres_new', reservedNumber: 'CERT-000003' },
            { id: 'nres_other', reservedNumber: 'CERT-000002' }
          ])
        )
      ).rejects.toBeInstanceOf(DuplicateDocumentNumberError);

      // Транзакция откачена целиком: «хорошая» заявка из той же пачки тоже не осела.
      const rows = await db.query<{ reserved_number: string }>(
        `select reserved_number from documents.issued_number_claims where tenant_id = $1`,
        ['t_batch']
      );
      expect(rows.map((row) => row.reserved_number)).toEqual(['CERT-000002']);
    });
  });

  it('ошибка называет номер и говорит, что делать', async () => {
    const error = new DuplicateDocumentNumberError('t1', 'CERT-000009');
    const body = error.getResponse() as { code: string; message: string };

    expect(body.code).toBe('duplicate_document_number');
    expect(body.message).toContain('CERT-000009');
    expect(body.message).toContain('повторите выпуск');
    expect(error.getStatus()).toBe(409);
  });
});

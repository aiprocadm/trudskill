import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { PostgresGeneratedDocumentsRepository } from './postgres-generated-documents.repository.js';
import { isDockerAvailable, stopTestDb, withTestDb } from '../../../../testing/with-test-db.js';
import {
  TABLE_SPECS,
  emptyContext,
  projectEntity
} from '../../../migration/backfill/normalized/normalized-projection.js';
import { upsertRows } from '../../../migration/backfill/normalized/normalized-upsert.js';

import type { DatabaseService } from '../../../../infrastructure/database/database.service.js';

/**
 * SQL-репозиторий документов на НАСТОЯЩЕЙ базе (Фаза 1, срез 5b, МГ-A2.1): форма ответа равна
 * снимку (снапшот подстановки расшифрован, выдуманных полей нет), поиск по названию/номеру/типу
 * и не по ПДн (РМ43), книга выдачи по дате документа по убыванию, изоляция центров.
 */

const dockerAvailable = isDockerAvailable();

afterAll(async () => {
  if (dockerAvailable) await stopTestDb();
}, 60_000);

function allMigrationFiles(): string[] {
  const dir = [
    join(process.cwd(), 'migrations'),
    join(process.cwd(), 'apps/backend/migrations')
  ].find((candidate) => existsSync(candidate));
  if (!dir) throw new Error('Каталог миграций не найден');
  return readdirSync(dir)
    .filter((file) => file.endsWith('.sql'))
    .sort();
}

const TEST_DB = { migrations: allMigrationFiles() };
const T = 't_docs_repo';
const T2 = 't_docs_repo_other';

const doc = (id: string, tenantId: string, extra: Record<string, unknown> = {}) => ({
  id,
  tenantId,
  templateId: 'tpl',
  templateVersionId: 'tplv',
  documentType: 'certificate',
  name: `Удостоверение ${id}`,
  sourceEntityType: 'enrollment',
  sourceEntityId: 'e1',
  fileId: 'f_missing',
  status: 'final',
  isFinal: true,
  documentNumber: `АБ-${id}`,
  documentDate: '2026-09-10',
  generatedAt: `2026-09-10T10:00:0${id.length}.000Z`,
  variablesSnapshot: { passport: '4500 123456', fio: 'Иванов Иван' },
  ...extra
});

describe.skipIf(!dockerAvailable)('репозиторий документов на живой базе (срез 5b)', () => {
  it('форма как у снимка, поиск не по ПДн, книга выдачи, изоляция', async () => {
    await withTestDb(TEST_DB, async (db) => {
      for (const tenant of [T, T2]) {
        await db.query(
          `insert into core.tenants (id, code, name, status) values ($1, $1, $1, 'active') on conflict (id) do nothing`,
          [tenant]
        );
      }
      const rows = [
        doc('d1', T),
        doc('d2', T, {
          documentType: 'protocol',
          name: 'Протокол',
          sourceEntityType: 'group',
          sourceEntityId: 'g1',
          documentDate: '2026-09-12'
        }),
        doc('d3', T, {
          status: 'revoked',
          documentDate: '2026-09-11',
          groupOrderDocumentId: 'ord1'
        }),
        doc('d9', T2)
      ];
      await db.withTransaction(async (client) => {
        for (const tenant of [T, T2]) {
          await upsertRows(
            client,
            TABLE_SPECS.generatedDocuments,
            rows
              .filter((r) => r.tenantId === tenant)
              .map((r) => projectEntity('generatedDocuments', tenant, r, emptyContext()))
          );
        }
      });
      const repo = new PostgresGeneratedDocumentsRepository(db as DatabaseService);

      // Форма ответа: как у снимка — снапшот расшифрован, ссылок/подстановок нет, fileId исходный.
      const all = await repo.list(T, { page: 1, pageSize: 20 });
      expect(all.items.map((d) => d.id)).toEqual(['d1', 'd2', 'd3']);
      expect(all.total).toBe(3);
      expect(all.items[0]).toEqual(rows[0]);
      expect(all.items[2]).toEqual(rows[2]);

      // Фильтры и страница.
      expect(
        (await repo.list(T, { page: 1, pageSize: 20, documentType: 'protocol' })).items.map(
          (d) => d.id
        )
      ).toEqual(['d2']);
      expect(
        (await repo.list(T, { page: 2, pageSize: 1, sourceEntityType: 'enrollment' })).items.map(
          (d) => d.id
        )
      ).toEqual(['d3']);

      // Поиск: по названию, номеру, типу; по ПДн из бланка — не находит (РМ43).
      expect(
        (await repo.list(T, { page: 1, pageSize: 20, search: 'прото' })).items.map((d) => d.id)
      ).toEqual(['d2']);
      expect((await repo.list(T, { page: 1, pageSize: 20, search: 'АБ-d3' })).total).toBe(1);
      expect((await repo.list(T, { page: 1, pageSize: 20, search: '4500 123456' })).total).toBe(0);

      // Карточка: чужой центр — как несуществующий.
      expect((await repo.get(T, 'd2'))?.name).toBe('Протокол');
      expect(await repo.get(T, 'd9')).toBeNull();

      // Книга выдачи.
      const journal = await repo.listIssued(T, {});
      expect(journal.items.map((d) => d.id)).toEqual(['d2', 'd3', 'd1']);
      expect(journal.total).toBe(3);
      expect(
        (await repo.listIssued(T, { from: '2026-09-11', to: '2026-09-11' })).items.map((d) => d.id)
      ).toEqual(['d3']);
      expect((await repo.listIssued(T, { types: ['protocol', 'order'] })).total).toBe(1);
      expect((await repo.listIssued(T, { status: 'revoked' })).items.map((d) => d.id)).toEqual([
        'd3'
      ]);
      expect((await repo.listIssued(T, { groupOrderDocumentId: 'ord1' })).total).toBe(1);
      const page = await repo.listIssued(T, { limit: 1, offset: 1 });
      expect(page.items.map((d) => d.id)).toEqual(['d3']);
      expect(page.total).toBe(3);
    });
  }, 180_000);
});

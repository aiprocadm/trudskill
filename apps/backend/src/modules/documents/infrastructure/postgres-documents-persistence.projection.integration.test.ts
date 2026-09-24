import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { PostgresDocumentsPersistenceBackend } from './postgres-documents-persistence.backend.js';
import { isDockerAvailable, stopTestDb, withTestDb } from '../../../testing/with-test-db.js';
import { InMemoryMvpState } from '../../mvp/infrastructure/in-memory-mvp.state.js';
import { PostgresMvpPersistenceBackend } from '../../mvp/infrastructure/postgres-mvp-persistence.backend.js';
import { InMemoryDocumentsState } from '../in-memory-documents.state.js';

import type { DatabaseService } from '../../../infrastructure/database/database.service.js';
import type { GeneratedDocumentEntity, TemplateEntity } from '../documents.types.js';

/**
 * Фаза 1, срез 5a: документы проецируются в `documents.generated_documents` при сохранении
 * снимка документов. На живой базе проверяется то, чего мок не видит: ключи на слушателя,
 * группу, контрагента и файл (0003/0105), CHECK `is_final ⇒ status='final'`, документ без
 * зачисления в таблицах, и отвязка документов при удалении слушателя в домене MVP.
 */

const dockerAvailable = isDockerAvailable();

afterAll(async () => {
  if (dockerAvailable) await stopTestDb();
});

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
const T = 't_documents_projection';
const AT = { createdAt: '2026-09-01T10:00:00.000Z', updatedAt: '2026-09-02T10:00:00.000Z' };

type Db = Pick<DatabaseService, 'query' | 'withTransaction'>;

const documentRows = async (db: Db) =>
  db.query<{
    id: string;
    learner_id: string | null;
    group_id: string | null;
    counterparty_id: string | null;
    enrollment_id: string | null;
    storage_file_id: string | null;
    status: string;
    is_final: boolean;
    updated_at: Date;
    payload: Record<string, unknown>;
  }>(
    `select id, learner_id, group_id, counterparty_id, enrollment_id, storage_file_id, status,
            is_final, updated_at, payload
       from documents.generated_documents where tenant_id = $1 order by id`,
    [T]
  );
const failures = async (db: Db) =>
  db.query<{ entity_id: string | null; details: { message: string } }>(
    `select entity_id, details from documents.reconciliation_log
      where tenant_id = $1 and issue_type = 'projection_failed' order by id`,
    [T]
  );

const document = (id: string, sourceEntityId: string, fileId: string): GeneratedDocumentEntity =>
  ({
    id,
    tenantId: T,
    templateId: 'tpl_1',
    templateVersionId: 'tplv_1',
    documentType: 'certificate',
    name: 'Удостоверение',
    sourceEntityType: 'enrollment',
    sourceEntityId,
    fileId,
    status: 'final',
    isFinal: true,
    documentNumber: `АБ-${id}`,
    documentDate: '2026-09-10',
    generatedAt: '2026-09-10T10:00:00.000Z'
  }) as GeneratedDocumentEntity;

describe.skipIf(!dockerAvailable)('проекция документов на живой базе (Фаза 1, срез 5a)', () => {
  it('выпуск, документ без зачисления, отзыв, правка бланка, отвязка при удалении слушателя', async () => {
    await withTestDb(TEST_DB, async (db) => {
      await db.query(
        `insert into core.tenants (id, code, name, status) values ($1, $1, $1, 'active') on conflict (id) do nothing`,
        [T]
      );
      await db.query(
        `insert into storage.files (id, tenant_id, storage_key, original_name, mime_type, size_bytes, bucket_name, antivirus_status)
         values ('f1', $1, 'k/f1.pdf', 'f1.pdf', 'application/pdf', 1, 'default', 'clean')`,
        [T]
      );

      // 1. Соседи документа приходят из таблиц MVP (проекция срезов 1–3).
      const mvp = new PostgresMvpPersistenceBackend(db as DatabaseService);
      const first = new InMemoryMvpState();
      await mvp.loadIntoState(T, first);
      first.counterparties.push({
        id: 'cp1',
        tenantId: T,
        ...AT,
        code: 'CP-1',
        name: 'Ромашка',
        status: 'active'
      } as never);
      first.learners.push({
        id: 'l1',
        tenantId: T,
        ...AT,
        firstName: 'Иван',
        lastName: 'Иванов',
        status: 'active'
      } as never);
      first.groups.push({
        id: 'g1',
        tenantId: T,
        ...AT,
        code: 'G-1',
        name: 'Группа',
        status: 'active',
        counterpartyId: 'cp1'
      } as never);
      first.enrollments.push({
        id: 'e1',
        tenantId: T,
        ...AT,
        groupId: 'g1',
        learnerId: 'l1',
        status: 'completed',
        enrolledAt: AT.createdAt
      } as never);
      await mvp.saveFromState(T, first);

      // 2. Выпуск: документ на зачисление и документ на зачисление, которого в таблицах нет.
      const docs = new PostgresDocumentsPersistenceBackend(db as DatabaseService);
      const s1 = new InMemoryDocumentsState();
      await docs.loadIntoState(T, s1);
      s1.generatedDocuments.push(
        document('d1', 'e1', 'f1'),
        document('d_orphan', 'e_missing', 'f_missing')
      );
      await docs.saveFromState(T, s1);

      const rows1 = await documentRows(db);
      expect(rows1.map((r) => r.id)).toEqual(['d1', 'd_orphan']);
      const d1 = rows1[0]!;
      expect([d1.learner_id, d1.group_id, d1.counterparty_id, d1.enrollment_id]).toEqual([
        'l1',
        'g1',
        'cp1',
        'e1'
      ]);
      expect(d1.storage_file_id).toBe('f1');
      expect(d1.is_final).toBe(true);
      const orphan = rows1[1]!;
      expect([
        orphan.learner_id,
        orphan.group_id,
        orphan.enrollment_id,
        orphan.storage_file_id
      ]).toEqual([null, null, null, null]);
      expect(orphan.payload.fileId).toBe('f_missing');
      expect(await failures(db)).toEqual([]);

      // 3. Отзыв: снимок держит isFinal=true, таблица — is_final=false с исходным флагом в payload.
      const s2 = new InMemoryDocumentsState();
      await docs.loadIntoState(T, s2);
      const revoked = s2.generatedDocuments.find((d) => d.id === 'd1')!;
      revoked.status = 'revoked';
      revoked.revokedAt = '2026-09-12T10:00:00.000Z';
      revoked.revocationReason = 'ошибка в ФИО';
      await docs.saveFromState(T, s2);
      const rows2 = await documentRows(db);
      expect(rows2[0]!.status).toBe('revoked');
      expect(rows2[0]!.is_final).toBe(false);
      expect(rows2[0]!.payload.isFinal).toBe(true);
      const orphanUpdatedAt = rows2[1]!.updated_at.toISOString();

      // 4. Правка бланка не трогает строки документов.
      const s3 = new InMemoryDocumentsState();
      await docs.loadIntoState(T, s3);
      s3.templates.push({
        id: 'tpl_new',
        tenantId: T,
        ...AT,
        name: 'Бланк',
        templateType: 'certificate',
        status: 'active'
      } as TemplateEntity);
      await docs.saveFromState(T, s3);
      expect((await documentRows(db))[1]!.updated_at.toISOString()).toBe(orphanUpdatedAt);

      // 5. Удаление слушателя в MVP: документ отвязывается, слушатель удаляется, снимок документов цел.
      const second = new InMemoryMvpState();
      await mvp.loadIntoState(T, second);
      second.enrollments.splice(0, second.enrollments.length);
      second.learners.splice(0, second.learners.length);
      await mvp.saveFromState(T, second);
      expect(
        (await db.query(`select id from learning.learners where tenant_id = $1`, [T])).length
      ).toBe(0);
      const rows5 = await documentRows(db);
      expect(rows5[0]!.learner_id).toBeNull();
      expect(rows5[0]!.group_id).toBe('g1');
      expect((rows5[0]!.payload.__detached as Record<string, unknown>).learner_id).toBe('l1');
      const s5 = new InMemoryDocumentsState();
      await docs.loadIntoState(T, s5);
      expect(s5.generatedDocuments.find((d) => d.id === 'd1')?.sourceEntityId).toBe('e1');

      // 6. Удаление документа из снимка убирает строку.
      s5.generatedDocuments = s5.generatedDocuments.filter((d) => d.id !== 'd_orphan');
      await docs.saveFromState(T, s5);
      expect((await documentRows(db)).map((r) => r.id)).toEqual(['d1']);
    });
  }, 240_000);
});

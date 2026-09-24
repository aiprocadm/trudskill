import { describe, expect, it, vi } from 'vitest';

import { PostgresDocumentsPersistenceBackend } from './postgres-documents-persistence.backend.js';
import { InMemoryDocumentsState } from '../in-memory-documents.state.js';

import type { DatabaseService } from '../../../infrastructure/database/database.service.js';
import type { GeneratedDocumentEntity, TemplateEntity } from '../documents.types.js';

/**
 * Правило «чтение не должно ничего писать» (журнал 299) и версия снимка (журнал 272/292).
 *
 * К состоянию mvp это правило применили ещё в Фазе 6, а к документам — нет: снимок
 * переписывался на КАЖДЫЙ запрос, включая обычный показ списка («удалить всё и вставить
 * заново»). Заодно такая запись двигала версию снимка, то есть запрос, ничего не менявший,
 * мог отобрать право записи у того, кто менял.
 */

interface RecordedQuery {
  sql: string;
  params: unknown[];
}

/** База-двойник: помнит, что у неё спрашивали, и отдаёт пустые выборки. */
function makeRecordingDb(failWhen?: (sql: string) => boolean) {
  const queries: RecordedQuery[] = [];
  const client = {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params });
      if (failWhen?.(sql)) throw new Error('duplicate key value violates unique constraint');
      // rowCount по числу кортежей: сверка версии проходит (1), проекция пачкой — «все записаны».
      return { rows: [], rowCount: (sql.match(/\)\s*,\s*\(/g) ?? []).length + 1 };
    })
  };
  const db = {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params });
      return [];
    }),
    withTransaction: async (fn: (c: typeof client) => Promise<unknown>) => fn(client)
  };
  return { queries, db: db as unknown as DatabaseService };
}

const document = (id: string): GeneratedDocumentEntity =>
  ({
    id,
    tenantId: 't1',
    templateId: 'tpl_1',
    templateVersionId: 'tplv_1',
    documentType: 'certificate',
    name: 'Удостоверение',
    sourceEntityType: 'enrollment',
    sourceEntityId: 'e1',
    fileId: 'f1',
    status: 'final',
    isFinal: true,
    documentNumber: 'АБ-1',
    documentDate: '2026-09-24',
    generatedAt: '2026-09-24T10:00:00.000Z'
  }) as GeneratedDocumentEntity;

const template = (id: string): TemplateEntity =>
  ({
    id,
    tenantId: 't1',
    name: 'Бланк',
    templateType: 'certificate',
    status: 'active',
    createdAt: '2026-08-29T00:00:00.000Z',
    updatedAt: '2026-08-29T00:00:00.000Z'
  }) as TemplateEntity;

describe('PostgresDocumentsPersistenceBackend', () => {
  it('запрос, ничего не менявший, НЕ пишет снимок и не двигает версию', async () => {
    const { queries, db } = makeRecordingDb();
    const backend = new PostgresDocumentsPersistenceBackend(db);
    const state = new InMemoryDocumentsState();

    await backend.loadIntoState('t1', state);
    queries.length = 0;

    await backend.saveFromState('t1', state);

    expect(queries, 'показ списка обязан быть немым для базы').toEqual([]);
  });

  it('изменённое состояние пишется и сверяет версию снимка', async () => {
    const { queries, db } = makeRecordingDb();
    const backend = new PostgresDocumentsPersistenceBackend(db);
    const state = new InMemoryDocumentsState();

    await backend.loadIntoState('t1', state);
    state.templates.push(template('tpl_1'));
    queries.length = 0;

    await backend.saveFromState('t1', state);

    const versionGuard = queries.find((q) => q.sql.includes('core.tenant_state_versions'));
    expect(versionGuard, 'запись обязана сверить версию снимка').toBeDefined();
    expect(versionGuard?.params).toEqual(['t1', 'documents', 0]);
    expect(queries.some((q) => q.sql.includes('insert into documents.runtime_documents'))).toBe(
      true
    );
  });

  it('версия сверяется ТОЙ, что была на чтении', async () => {
    const { queries, db } = makeRecordingDb();
    // Читаем состояние арендатора, у которого снимок уже писали семь раз.
    (db.query as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => [
      { version: 7 }
    ]);
    const backend = new PostgresDocumentsPersistenceBackend(db);
    const state = new InMemoryDocumentsState();

    await backend.loadIntoState('t1', state);
    expect(state.stateVersionAtLoad).toBe(7);

    state.templates.push(template('tpl_2'));
    queries.length = 0;
    await backend.saveFromState('t1', state);

    const versionGuard = queries.find((q) => q.sql.includes('core.tenant_state_versions'));
    expect(versionGuard?.params).toEqual(['t1', 'documents', 7]);
  });

  describe('проекция документов в documents.generated_documents (Фаза 1, срез 5a, РМ41)', () => {
    const touches = (queries: RecordedQuery[], table: string) =>
      queries.filter((q) => q.sql.includes(table));

    it('правка бланка не трогает таблицу документов и не читает контекст', async () => {
      const { queries, db } = makeRecordingDb();
      const backend = new PostgresDocumentsPersistenceBackend(db);
      const state = new InMemoryDocumentsState();
      await backend.loadIntoState('t1', state);
      state.templates.push(template('tpl_1'));
      queries.length = 0;

      await backend.saveFromState('t1', state);

      expect(touches(queries, 'documents.generated_documents')).toEqual([]);
      expect(touches(queries, 'learning.enrollments')).toEqual([]);
    });

    it('новый документ проецируется после снимка: контекст из таблиц, вставка одной пачкой', async () => {
      const { queries, db } = makeRecordingDb();
      const backend = new PostgresDocumentsPersistenceBackend(db);
      const state = new InMemoryDocumentsState();
      await backend.loadIntoState('t1', state);
      state.generatedDocuments.push(document('doc_1'));
      queries.length = 0;

      await backend.saveFromState('t1', state);

      const sqls = queries.map((q) => q.sql.trimStart());
      const snapshotInsert = sqls.findIndex((s) =>
        s.startsWith('insert into documents.runtime_documents')
      );
      const contextRead = sqls.findIndex((s) => s.includes('from learning.enrollments'));
      const projection = sqls.findIndex((s) =>
        s.startsWith('insert into documents.generated_documents')
      );
      expect(snapshotInsert).toBeGreaterThanOrEqual(0);
      expect(contextRead).toBeGreaterThan(snapshotInsert);
      expect(projection).toBeGreaterThan(contextRead);
      expect(queries[projection]!.params).toContain('doc_1');
      expect(sqls.some((s) => s.includes('from storage.files'))).toBe(true);
      // Снимок — источник правды: проекция идёт в точке сохранения и её освобождает.
      expect(sqls).toContain('release savepoint projection_batch');
    });

    it('отказ проекции одного документа не роняет снимок: откат до точки сохранения и журнал сверки', async () => {
      const { queries, db } = makeRecordingDb((sql) =>
        sql.trimStart().startsWith('insert into documents.generated_documents')
      );
      const backend = new PostgresDocumentsPersistenceBackend(db);
      const state = new InMemoryDocumentsState();
      await backend.loadIntoState('t1', state);
      state.generatedDocuments.push(document('doc_bad'));
      queries.length = 0;

      await expect(backend.saveFromState('t1', state)).resolves.toBeUndefined();

      const sqls = queries.map((q) => q.sql.trimStart());
      expect(sqls.some((s) => s.startsWith('insert into documents.runtime_documents'))).toBe(true);
      expect(sqls).toContain('rollback to savepoint projection_batch');
      expect(sqls).toContain('rollback to savepoint projection_row');
      const journal = queries.find((q) => q.sql.includes('documents.reconciliation_log'));
      expect(journal?.params.slice(1, 4)).toEqual([
        'projection_failed',
        'generatedDocuments',
        'doc_bad'
      ]);
    });

    it('удалённый из снимка документ уходит и из таблицы', async () => {
      const { queries, db } = makeRecordingDb();
      // Снимок с одним документом: чтение отдаёт его, отпечаток запоминает.
      (db.query as unknown as ReturnType<typeof vi.fn>).mockImplementation(
        async (sql: string, params: unknown[] = []) => {
          queries.push({ sql, params });
          return sql.includes("'generatedDocuments'") || params.includes('generatedDocuments')
            ? [{ data: document('doc_gone') }]
            : [];
        }
      );
      const backend = new PostgresDocumentsPersistenceBackend(db);
      const state = new InMemoryDocumentsState();
      await backend.loadIntoState('t1', state);
      expect(state.generatedDocuments.map((d) => d.id)).toEqual(['doc_gone']);
      state.generatedDocuments.splice(0, 1);
      queries.length = 0;

      await backend.saveFromState('t1', state);

      const del = queries.find((q) =>
        q.sql.trimStart().startsWith('delete from documents.generated_documents')
      );
      expect(del?.params).toEqual(['t1', ['doc_gone']]);
    });
  });
});

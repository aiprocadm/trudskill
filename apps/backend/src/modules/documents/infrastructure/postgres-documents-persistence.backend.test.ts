import { describe, expect, it, vi } from 'vitest';

import { PostgresDocumentsPersistenceBackend } from './postgres-documents-persistence.backend.js';
import { InMemoryDocumentsState } from '../in-memory-documents.state.js';

import type { DatabaseService } from '../../../infrastructure/database/database.service.js';
import type { TemplateEntity } from '../documents.types.js';

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
function makeRecordingDb() {
  const queries: RecordedQuery[] = [];
  const client = {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params });
      // rowCount = 1: сверка версии проходит — тут проверяется не она.
      return { rows: [], rowCount: 1 };
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
});

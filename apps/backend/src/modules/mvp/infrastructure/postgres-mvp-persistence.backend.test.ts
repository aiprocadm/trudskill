import { EventEmitter2 } from '@nestjs/event-emitter';
import { describe, expect, it, vi } from 'vitest';

import { InMemoryMvpState } from './in-memory-mvp.state.js';
import { PostgresMvpPersistenceBackend } from './postgres-mvp-persistence.backend.js';
import { TenantScopedRepository } from '../../../infrastructure/database/tenant-repository.js';
import { AuditService } from '../../audit/audit.service.js';
import { MvpService } from '../mvp.service.js';

import type { DocumentsService } from '../../documents/documents.service.js';
import type { FilesService } from '../../files/files.service.js';

const noopDocumentsService = {} as unknown as DocumentsService;
const noopFilesService = {} as unknown as FilesService;

function makeMvp(state: InMemoryMvpState): MvpService {
  return new MvpService(
    state,
    new TenantScopedRepository(),
    new AuditService(),
    noopDocumentsService,
    noopFilesService,
    new EventEmitter2()
  );
}

/**
 * Fake DatabaseService whose `id` column is NOT NULL — mirrors the real
 * `learning.mvp_runtime_documents` schema (PK = tenant_id, collection, id).
 * Any INSERT with a null/undefined id throws, exactly as Postgres would.
 */
function makeFakeDb(inserts: Array<{ collection: string; id: unknown }>) {
  const client = {
    query: vi.fn(async (sql: string, params: unknown[]) => {
      if (sql.trimStart().startsWith('insert into')) {
        const id = params[2];
        inserts.push({ collection: params[1] as string, id });
        if (id === undefined || id === null) {
          throw new Error('null value in column "id" violates not-null constraint');
        }
      }
      return [];
    })
  };
  return {
    withTransaction: async (fn: (c: typeof client) => Promise<void>) => fn(client),
    query: vi.fn(async () => [])
  };
}

describe('PostgresMvpPersistenceBackend snapshot serialization', () => {
  it('persists bulkImportIdempotency records with a non-null id (NOT NULL PK constraint)', async () => {
    const state = new InMemoryMvpState();
    const mvp = makeMvp(state);

    // Real producer path: a successful bulk-import saves its outcome under the
    // idempotency key (learners-bulk-import.service.ts → saveBulkImportOutcome).
    mvp.saveBulkImportOutcome('tenant_demo', 'idem-key-1', {
      idempotencyKey: 'idem-key-1',
      groupId: 'group_1',
      total: 1,
      created: 1,
      reused: 0,
      enrolled: 0,
      failed: 0,
      rows: []
    });

    const inserts: Array<{ collection: string; id: unknown }> = [];
    const backend = new PostgresMvpPersistenceBackend(makeFakeDb(inserts) as never);

    // Must not throw: every persisted MVP collection entity needs a non-null id.
    await expect(backend.writeLegacy('tenant_demo', state)).resolves.toBeUndefined();

    const idemInsert = inserts.find((i) => i.collection === 'bulkImportIdempotency');
    expect(idemInsert).toBeDefined();
    expect(typeof idemInsert?.id).toBe('string');
    expect((idemInsert?.id as string).length).toBeGreaterThan(0);
  });
});

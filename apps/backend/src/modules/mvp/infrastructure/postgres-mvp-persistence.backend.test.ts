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

describe('PII at-rest encryption (ФТ-C3.3, Фаза 0 Task 7)', () => {
  /** Fake DB: записывает вставленные jsonb-строки и отдаёт их обратно на select. */
  function makeRoundTripDb() {
    const stored = new Map<string, unknown[]>();
    const client = {
      query: vi.fn(async (sql: string, params: unknown[]) => {
        if (sql.trimStart().startsWith('insert into')) {
          const col = params[1] as string;
          const list = stored.get(col) ?? [];
          list.push(JSON.parse(params[3] as string));
          stored.set(col, list);
        }
        return [];
      })
    };
    return {
      stored,
      db: {
        withTransaction: async (fn: (c: typeof client) => Promise<void>) => fn(client),
        /*
         * Чтение состояния идёт ОДНИМ запросом на весь тенант (§12.1, 2026-08-09):
         * раньше на каждую из ~50 коллекций уходил отдельный `select`, то есть полсотни
         * обращений к базе на каждый запрос пользователя. Подделка отвечает так же, как
         * настоящая база: строки с указанием коллекции.
         */
        query: vi.fn(async () =>
          [...stored.entries()].flatMap(([collection, items]) =>
            items.map((data) => ({ collection, data }))
          )
        )
      }
    };
  }

  const learnerWithSnils = {
    id: 'learner_pii_1',
    tenantId: 'tenant_demo',
    code: 'L1',
    name: 'Иванов Иван',
    snils: '112-233-445 95',
    status: 'active',
    createdAt: '2026-07-26T00:00:00.000Z',
    updatedAt: '2026-07-26T00:00:00.000Z'
  };

  it('stores snils only as ciphertext + blind hash; load decrypts it back', async () => {
    const { stored, db } = makeRoundTripDb();
    const backend = new PostgresMvpPersistenceBackend(db as never);

    const state = new InMemoryMvpState();
    state.learners.push(learnerWithSnils as never);
    await backend.writeLegacy('tenant_demo', state);

    const atRest = (stored.get('learners') ?? [])[0] as Record<string, unknown>;
    expect(String(atRest.snils)).toMatch(/^enc:/);
    expect(JSON.stringify(atRest)).not.toContain('11223344595');
    expect(JSON.stringify(atRest)).not.toContain('112-233-445');
    expect(atRest.snilsHash).toMatch(/^[0-9a-f]{64}$/);
    // Память не мутирована — рантайм продолжает видеть открытый СНИЛС.
    expect(state.learners[0]!.snils).toBe('112-233-445 95');

    const restoredState = new InMemoryMvpState();
    await backend.loadIntoState('tenant_demo', restoredState);
    expect(restoredState.learners[0]!.snils).toBe('112-233-445 95');
    expect('snilsHash' in (restoredState.learners[0] as object)).toBe(false);
  });

  it('legacy plaintext rows load as-is and get re-encrypted on the next save', async () => {
    const { stored, db } = makeRoundTripDb();
    const backend = new PostgresMvpPersistenceBackend(db as never);
    // Строка, записанная ДО Task 7: снилс открытым текстом.
    stored.set('learners', [{ ...learnerWithSnils, snils: '11223344595' }]);

    const state = new InMemoryMvpState();
    await backend.loadIntoState('tenant_demo', state);
    expect(state.learners[0]!.snils).toBe('11223344595');

    stored.delete('learners');
    await backend.writeLegacy('tenant_demo', state);
    const atRest = (stored.get('learners') ?? [])[0] as Record<string, unknown>;
    expect(String(atRest.snils)).toMatch(/^enc:/);
  });

  it('learners without snils are stored untouched', async () => {
    const { stored, db } = makeRoundTripDb();
    const backend = new PostgresMvpPersistenceBackend(db as never);
    const state = new InMemoryMvpState();
    state.learners.push({ ...learnerWithSnils, id: 'l2', snils: undefined } as never);
    await backend.writeLegacy('tenant_demo', state);
    const atRest = (stored.get('learners') ?? [])[0] as Record<string, unknown>;
    expect('snils' in atRest).toBe(false);
    expect('snilsHash' in atRest).toBe(false);
  });
});

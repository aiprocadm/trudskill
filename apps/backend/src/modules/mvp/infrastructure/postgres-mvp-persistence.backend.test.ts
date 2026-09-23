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
 * Вставка СНИМКА состояния, а не любая вставка вообще. Запись состояния делает ещё одну —
 * версию снимка (журнал 272/292), у неё другая форма параметров, и двойник, ловивший всё
 * подряд, разбирал её как JSON и падал.
 */
function isSnapshotInsert(sql: string): boolean {
  return /^insert into \S*runtime_documents/i.test(sql.trimStart());
}

/**
 * Fake DatabaseService whose `id` column is NOT NULL — mirrors the real
 * `learning.mvp_runtime_documents` schema (PK = tenant_id, collection, id).
 * Any INSERT with a null/undefined id throws, exactly as Postgres would.
 */
function makeFakeDb(inserts: Array<{ collection: string; id: unknown }>) {
  const client = {
    query: vi.fn(async (sql: string, params: unknown[]) => {
      if (isSnapshotInsert(sql)) {
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
        if (isSnapshotInsert(sql)) {
          const col = params[1] as string;
          const list = stored.get(col) ?? [];
          list.push(JSON.parse(params[3] as string));
          stored.set(col, list);
        }
        // Проекция слушателей в learning.learners (срез 2a): мок отвечает «записано».
        if (/^insert into learning\.learners/i.test(sql.trimStart())) {
          return { rows: [], rowCount: (sql.match(/\)\s*,\s*\(/g) ?? []).length + 1 };
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

describe('проекция контрагентов и групп в нормализованные таблицы (Фаза 1, срез 1a, РМ35)', () => {
  const isProjectionWrite = (sql: string): boolean =>
    /^(insert into|delete from) (crm\.counterparties|learning\.groups|learning\.group_courses|learning\.learners|learning\.enrollments|learning\.enrollment_status_history|assessment\.exam_results)\b/i.test(
      sql.trimStart()
    );

  /** Мок базы, который помнит запросы проекции и умеет «уронить» одну из них. */
  function makeProjectionDb(failWhen?: (sql: string, params: unknown[]) => boolean) {
    const projection: Array<{ sql: string; params: unknown[] }> = [];
    const client = {
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        if (isProjectionWrite(sql)) {
          if (failWhen?.(sql, params))
            throw new Error(
              'duplicate key value violates unique constraint "learning_groups_tenant_id_code_key"'
            );
          projection.push({ sql: sql.trimStart(), params });
          // Мок отвечает «все строки записаны»: столько, сколько кортежей в запросе.
          return { rows: [], rowCount: (sql.match(/\)\s*,\s*\(/g) ?? []).length + 1 };
        }
        return [];
      })
    };
    const issues: unknown[][] = [];
    return {
      projection,
      issues,
      db: {
        withTransaction: async (fn: (c: typeof client) => Promise<void>) => fn(client),
        query: vi.fn(async (sql: string, params: unknown[] = []) => {
          if (/mvp_reconciliation_log/.test(sql)) issues.push(params);
          return [];
        })
      }
    };
  }

  const snapshot = () =>
    new Map<string, unknown[]>([
      [
        'counterparties',
        [{ id: 'cp1', tenantId: 'tenant_demo', code: 'CP-1', name: 'Ромашка', status: 'active' }]
      ],
      [
        'groups',
        [
          {
            id: 'g1',
            tenantId: 'tenant_demo',
            code: 'G-1',
            name: 'Первая',
            status: 'active',
            counterpartyId: 'cp1'
          },
          { id: 'g2', tenantId: 'tenant_demo', code: 'G-2', name: 'Вторая', status: 'active' }
        ]
      ]
    ]);

  it('пишет только изменённые сущности, контрагентов раньше групп, удаления — после', async () => {
    const { db, projection } = makeProjectionDb();
    const backend = new PostgresMvpPersistenceBackend(db as never);
    const state = new InMemoryMvpState();
    state.setRawSnapshot(snapshot(), (_c, raw) => [...raw]);

    state.counterparties.push({
      id: 'cp2',
      tenantId: 'tenant_demo',
      code: 'CP-2',
      name: 'Лютик',
      status: 'active'
    } as never);
    (state.groups[1] as { name: string }).name = 'Переименованная';
    state.groups.splice(0, 1); // g1 удалена

    await backend.writeLegacy('tenant_demo', state);

    const kinds = projection.map((p) => p.sql.split('\n')[0]!.replace(/\s+/g, ' ').slice(0, 40));
    expect(kinds[0]).toMatch(/^insert into crm\.counterparties/);
    expect(kinds[1]).toMatch(/^insert into learning\.groups/);
    expect(kinds[2]).toMatch(/^delete from learning\.groups/);
    expect(projection).toHaveLength(3);
    // Контрагент — один новый, группа — одна изменённая, удаление — g1 по имени.
    expect(projection[0]!.params).toContain('cp2');
    expect(projection[0]!.params).not.toContain('cp1');
    expect(projection[1]!.params).toContain('g2');
    expect(projection[1]!.params).not.toContain('g1');
    expect(projection[2]!.params).toEqual(['tenant_demo', ['g1']]);
  });

  it('нетронутые коллекции не проецируются вовсе', async () => {
    const { db, projection } = makeProjectionDb();
    const backend = new PostgresMvpPersistenceBackend(db as never);
    const state = new InMemoryMvpState();
    state.setRawSnapshot(snapshot(), (_c, raw) => [...raw]);
    // Курсы центра не проецируются (остаются в снимке) — их правка не должна трогать таблицы.
    state.courses.push({
      id: 'c_new',
      tenantId: 'tenant_demo',
      title: 'Новый курс',
      status: 'draft'
    } as never);

    await backend.writeLegacy('tenant_demo', state);
    expect(projection).toHaveLength(0);
  });

  it('отказ одной группы не роняет сохранение снимка: пачка → по одной, плохая — в журнал сверки', async () => {
    const { db, projection, issues } = makeProjectionDb(
      (sql, params) => /learning\.groups/.test(sql) && params.includes('g_dup')
    );
    const backend = new PostgresMvpPersistenceBackend(db as never);
    const state = new InMemoryMvpState();
    state.setRawSnapshot(snapshot(), (_c, raw) => [...raw]);
    (state.groups[1] as { name: string }).name = 'Переименованная';
    state.groups.push({
      id: 'g_dup',
      tenantId: 'tenant_demo',
      code: 'G-1',
      name: 'Дубль кода',
      status: 'active'
    } as never);

    await expect(backend.writeLegacy('tenant_demo', state)).resolves.toBeUndefined();

    // Пачка из двух упала (в ней g_dup), затем g2 записана отдельно, g_dup — нет.
    const groupInserts = projection.filter((p) => /^insert into learning\.groups/.test(p.sql));
    expect(groupInserts).toHaveLength(1);
    expect(groupInserts[0]!.params).toContain('g2');
    expect(issues).toHaveLength(1);
    expect(issues[0]).toEqual([
      'tenant_demo',
      'projection_failed',
      'groups',
      'g_dup',
      expect.stringContaining('unique')
    ]);
  });

  it('присвоение коллекции целиком — полный upsert и удаление лишнего из таблицы', async () => {
    const { db, projection } = makeProjectionDb();
    const backend = new PostgresMvpPersistenceBackend(db as never);
    const state = new InMemoryMvpState();
    state.setRawSnapshot(snapshot(), (_c, raw) => [...raw]);
    state.groups = [
      {
        id: 'g9',
        tenantId: 'tenant_demo',
        code: 'G-9',
        name: 'Единственная',
        status: 'active'
      } as never
    ];

    await backend.writeLegacy('tenant_demo', state);

    expect(projection.map((p) => p.sql.split(' ').slice(0, 3).join(' '))).toEqual([
      'insert into learning.groups',
      'delete from learning.groups'
    ]);
    expect(projection[1]!.sql).toMatch(/not \(id = any/);
    expect(projection[1]!.params).toEqual(['tenant_demo', ['g9']]);
  });
});

describe('проекция слушателей (Фаза 1, срез 2a): ПДн только шифртекстом', () => {
  const isLearnersWrite = (sql: string): boolean =>
    /^(insert into|delete from) learning\.learners\b/i.test(sql.trimStart());

  function makeLearnersDb() {
    const writes: Array<{ sql: string; params: unknown[] }> = [];
    const client = {
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        if (isLearnersWrite(sql)) {
          writes.push({ sql: sql.trimStart(), params });
          return { rows: [], rowCount: (sql.match(/\)\s*,\s*\(/g) ?? []).length + 1 };
        }
        if (/^select id from iam\.users/i.test(sql.trimStart())) {
          return { rows: [{ id: 'u_known' }], rowCount: 1 };
        }
        return [];
      })
    };
    return {
      writes,
      db: {
        withTransaction: async (fn: (c: typeof client) => Promise<void>) => fn(client),
        query: vi.fn(async () => [])
      }
    };
  }

  const learner = {
    id: 'l1',
    tenantId: 'tenant_demo',
    firstName: 'Иван',
    lastName: 'Иванов',
    snils: '112-233-445 95',
    email: 'ivan@example.com',
    phone: '+7 900 000-00-00',
    dateOfBirth: '1990-01-01',
    linkedIamUserId: 'u_known',
    status: 'active',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z'
  };

  it('в параметрах записи нет открытого СНИЛС, почты и телефона; слепой индекс — 64 hex; учётная запись из контекста', async () => {
    const { db, writes } = makeLearnersDb();
    const backend = new PostgresMvpPersistenceBackend(db as never);
    const state = new InMemoryMvpState();
    state.setRawSnapshot(new Map([['learners', []]]), (_c, raw) => [...raw]);
    state.learners.push(learner as never);

    await backend.writeLegacy('tenant_demo', state);

    expect(writes).toHaveLength(1);
    const text = JSON.stringify(writes[0]!.params);
    expect(text).not.toContain('11223344595');
    expect(text).not.toContain('112-233-445');
    expect(text).not.toContain('ivan@example.com');
    expect(text).not.toContain('900 000');
    expect(text).not.toContain('1990-01-01');
    expect(
      writes[0]!.params.filter((p) => typeof p === 'string' && p.startsWith('enc:'))
    ).toHaveLength(4);
    expect(writes[0]!.params.some((p) => typeof p === 'string' && /^[0-9a-f]{64}$/.test(p))).toBe(
      true
    );
    expect(writes[0]!.params).toContain('u_known');
    // Память не тронута: рантайм видит открытый СНИЛС.
    expect(state.learners[0]!.snils).toBe('112-233-445 95');
  });

  it('стирание ПДн (152-ФЗ) обнуляет колонки шифртекста и слепой индекс', async () => {
    const { db, writes } = makeLearnersDb();
    const backend = new PostgresMvpPersistenceBackend(db as never);
    const state = new InMemoryMvpState();
    state.setRawSnapshot(new Map([['learners', [learner]]]), (_c, raw) =>
      raw.map((r) => ({ ...(r as object) }))
    );
    Object.assign(state.learners[0]!, {
      snils: undefined,
      email: undefined,
      phone: undefined,
      dateOfBirth: undefined,
      linkedIamUserId: undefined,
      firstName: 'Удалено',
      lastName: 'Удалено'
    });

    await backend.writeLegacy('tenant_demo', state);

    expect(writes).toHaveLength(1);
    const params = writes[0]!.params;
    expect(params.filter((p) => typeof p === 'string' && p.startsWith('enc:'))).toHaveLength(0);
    expect(params.some((p) => typeof p === 'string' && /^[0-9a-f]{64}$/.test(p))).toBe(false);
    expect(params).toContain('Удалено');
  });
});

describe('проекция зачислений и истории (Фаза 1, срез 3a)', () => {
  const isWrite = (sql: string): boolean =>
    /^(insert into|delete from) (crm\.counterparties|learning\.groups|learning\.group_courses|learning\.learners|learning\.enrollments|learning\.enrollment_status_history|assessment\.exam_results)\b/i.test(
      sql.trimStart()
    );

  function makeDb() {
    const writes: string[] = [];
    const client = {
      query: vi.fn(async (sql: string) => {
        if (isWrite(sql)) {
          writes.push(sql.trimStart().split(/\s+/).slice(0, 3).join(' '));
          return { rows: [], rowCount: (sql.match(/\)\s*,\s*\(/g) ?? []).length + 1 };
        }
        return [];
      })
    };
    return {
      writes,
      db: {
        withTransaction: async (fn: (c: typeof client) => Promise<void>) => fn(client),
        query: vi.fn(async () => [])
      }
    };
  }

  const AT = { createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-02T00:00:00.000Z' };
  const snapshot = () =>
    new Map<string, unknown[]>([
      [
        'counterparties',
        [{ id: 'cp1', tenantId: 'tenant_demo', ...AT, code: 'CP-1', name: 'Р', status: 'active' }]
      ],
      [
        'learners',
        [
          {
            id: 'l1',
            tenantId: 'tenant_demo',
            ...AT,
            firstName: 'А',
            lastName: 'Б',
            status: 'active'
          }
        ]
      ],
      [
        'groups',
        [{ id: 'g1', tenantId: 'tenant_demo', ...AT, code: 'G-1', name: 'Г', status: 'active' }]
      ],
      [
        'enrollments',
        [
          {
            id: 'e1',
            tenantId: 'tenant_demo',
            ...AT,
            groupId: 'g1',
            learnerId: 'l1',
            status: 'active',
            enrolledAt: AT.createdAt
          }
        ]
      ],
      [
        'enrollmentStatusHistory',
        [
          {
            id: 'h1',
            tenantId: 'tenant_demo',
            enrollmentId: 'e1',
            status: 'active',
            changedAt: AT.createdAt
          }
        ]
      ],
      [
        'groupCourses',
        [
          {
            id: 'gc1',
            tenantId: 'tenant_demo',
            ...AT,
            groupId: 'g1',
            courseId: 'c1',
            sortOrder: 0,
            status: 'active'
          }
        ]
      ],
      [
        'examResults',
        [
          {
            id: 'r1',
            tenantId: 'tenant_demo',
            ...AT,
            enrollmentId: 'e1',
            learnerId: 'l1',
            testId: 't1',
            attemptsCount: 1,
            maxScore: 10,
            passed: false,
            status: 'active'
          }
        ]
      ]
    ]);

  it('порядок записи: контрагенты → слушатели → группы → курсы группы → зачисления → история → результаты', async () => {
    const { db, writes } = makeDb();
    const backend = new PostgresMvpPersistenceBackend(db as never);
    const state = new InMemoryMvpState();
    state.setRawSnapshot(snapshot(), (_c, raw) => raw.map((r) => ({ ...(r as object) })));
    (state.counterparties[0] as { name: string }).name = 'Ромашка';
    (state.learners[0] as { firstName: string }).firstName = 'Анна';
    (state.groups[0] as { name: string }).name = 'Группа';
    (state.enrollments[0] as { status: string }).status = 'completed';
    state.enrollmentStatusHistory.push({
      id: 'h2',
      tenantId: 'tenant_demo',
      enrollmentId: 'e1',
      status: 'completed',
      changedAt: AT.updatedAt
    } as never);
    (state.groupCourses[0] as { requiresProctoring?: boolean }).requiresProctoring = true;
    (state.examResults[0] as { passed: boolean }).passed = true;

    await backend.writeLegacy('tenant_demo', state);

    expect(writes).toEqual([
      'insert into crm.counterparties',
      'insert into learning.learners',
      'insert into learning.groups',
      'insert into learning.group_courses',
      'insert into learning.enrollments',
      'insert into learning.enrollment_status_history',
      'insert into assessment.exam_results'
    ]);
  });

  it('пересдача (срез 4a): результат меняется на месте — одна запись, не вторая строка', async () => {
    const { db, writes } = makeDb();
    const backend = new PostgresMvpPersistenceBackend(db as never);
    const state = new InMemoryMvpState();
    state.setRawSnapshot(snapshot(), (_c, raw) => raw.map((r) => ({ ...(r as object) })));
    const result = state.examResults[0] as { attemptsCount: number; bestScore?: number };
    result.attemptsCount = 2;
    result.bestScore = 9;

    await backend.writeLegacy('tenant_demo', state);

    expect(writes).toEqual(['insert into assessment.exam_results']);
    expect(state.examResults).toHaveLength(1);
  });

  it('удаление группы целиком: результаты → история → зачисления → курсы группы → группа', async () => {
    const { db, writes } = makeDb();
    const backend = new PostgresMvpPersistenceBackend(db as never);
    const state = new InMemoryMvpState();
    state.setRawSnapshot(snapshot(), (_c, raw) => [...raw]);
    state.examResults.splice(0, 1);
    state.enrollmentStatusHistory.splice(0, 1);
    state.enrollments.splice(0, 1);
    state.groupCourses.splice(0, 1);
    state.groups.splice(0, 1);

    await backend.writeLegacy('tenant_demo', state);

    expect(writes).toEqual([
      'delete from assessment.exam_results',
      'delete from learning.enrollment_status_history',
      // Перед удалением зачислений их история подчищается ещё раз (detach) — так было и в срезе 3a.
      'delete from learning.enrollment_status_history',
      'delete from learning.enrollments',
      'delete from learning.group_courses',
      'delete from learning.groups'
    ]);
  });

  it('удаление зачисления: сначала его история, потом само зачисление', async () => {
    const { db, writes } = makeDb();
    const backend = new PostgresMvpPersistenceBackend(db as never);
    const state = new InMemoryMvpState();
    state.setRawSnapshot(snapshot(), (_c, raw) => [...raw]);
    state.enrollments.splice(0, 1);

    await backend.writeLegacy('tenant_demo', state);

    expect(writes).toEqual([
      'delete from learning.enrollment_status_history',
      'delete from learning.enrollments'
    ]);
  });
});

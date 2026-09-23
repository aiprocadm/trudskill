import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { NormalizedBackfillService } from './normalized-backfill.service.js';
import { snilsBlindIndex } from '../../../../infrastructure/crypto/pii-crypto.js';
import { isDockerAvailable, stopTestDb, withTestDb } from '../../../../testing/with-test-db.js';
import { BackfillService } from '../backfill.service.js';

import type { DatabaseService } from '../../../../infrastructure/database/database.service.js';

/**
 * Бэкфилл «снимок → нормализованные таблицы» на НАСТОЯЩЕЙ базе после всей цепочки миграций
 * (Фаза 1, срез 0b). Снимок собран руками и нарочно «грязный» — ровно те случаи, на которых
 * разведка обещала падение: два слушателя без учётной записи в одном центре, открытый СНИЛС,
 * ИНН не по формату, статус вне списка, ссылка на несуществующего контрагента, завершённое
 * зачисление без даты, результат экзамена `needs_review` без балла, отозванный «финальный»
 * документ, зачисление в несуществующую группу (должно стать отказом, а не остановкой),
 * служебная строка `idem` в снимке документов и второй центр, который не должен смешаться.
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
const T1 = 't_bf1';
const T2 = 't_bf2';
const SNILS = '112-233-445 95';
const AT = { createdAt: '2026-09-01T10:00:00.000Z', updatedAt: '2026-09-02T10:00:00.000Z' };

type Db = Pick<DatabaseService, 'query' | 'withTransaction'>;

async function seedSnapshot(db: Db): Promise<void> {
  for (const tenant of [T1, T2]) {
    await db.query(
      `insert into core.tenants (id, code, name, status) values ($1, $1, $1, 'active') on conflict (id) do nothing`,
      [tenant]
    );
  }
  const mvp: Array<[string, string, string, Record<string, unknown>]> = [
    [
      T1,
      'counterparties',
      'cp1',
      { code: 'CP-1', name: 'Ромашка', inn: '7707083893', status: 'active' }
    ],
    [T1, 'counterparties', 'cp2', { code: 'CP-2', name: 'Лютик', inn: 'bad', status: 'blocked' }],
    [
      T1,
      'learners',
      'l1',
      {
        firstName: 'Иван',
        lastName: 'Иванов',
        snils: SNILS,
        email: 'ivan@example.com',
        status: 'active'
      }
    ],
    [T1, 'learners', 'l2', { firstName: 'Пётр', lastName: 'Петров', status: 'active' }],
    [T1, 'learners', 'l3', { firstName: 'Анна', lastName: 'Сидорова', status: 'active' }],
    [
      T1,
      'groups',
      'g1',
      { code: 'G-1', name: 'Группа 1', status: 'active', counterpartyId: 'cp1' }
    ],
    [
      T1,
      'groups',
      'g2',
      { code: 'G-2', name: 'Группа 2', status: 'closed', counterpartyId: 'cp_missing' }
    ],
    [T1, 'groupCourses', 'gc1', { groupId: 'g1', courseId: 'c1', sortOrder: 1, status: 'active' }],
    [
      T1,
      'groupCourses',
      'gc2',
      { groupId: 'g2', courseId: 'c1', sortOrder: 1, status: 'archived', durationDays: 40 }
    ],
    [
      T1,
      'enrollments',
      'e1',
      { groupId: 'g1', learnerId: 'l1', status: 'active', enrolledAt: AT.createdAt }
    ],
    [
      T1,
      'enrollments',
      'e2',
      { groupId: 'g2', learnerId: 'l2', status: 'completed', enrolledAt: AT.createdAt }
    ],
    [
      T1,
      'enrollments',
      'e3',
      { groupId: 'g_missing', learnerId: 'l3', status: 'pending', enrolledAt: AT.createdAt }
    ],
    [
      T1,
      'enrollmentStatusHistory',
      'h1',
      { enrollmentId: 'e1', status: 'active', changedAt: AT.createdAt }
    ],
    [
      T1,
      'enrollmentStatusHistory',
      'h2',
      { enrollmentId: 'e2', status: 'completed', changedAt: AT.updatedAt, reason: 'экзамен сдан' }
    ],
    [
      T1,
      'examResults',
      'x1',
      {
        enrollmentId: 'e1',
        learnerId: 'l1',
        testId: 't1',
        status: 'needs_review',
        passed: false,
        attemptsCount: 1,
        maxScore: 20
      }
    ],
    [
      T1,
      'examResults',
      'x2',
      {
        enrollmentId: 'e2',
        learnerId: 'l2',
        testId: 't1',
        status: 'final',
        passed: true,
        attemptsCount: 2,
        finalScore: 18,
        maxScore: 20,
        passingScore: 14
      }
    ],
    [T2, 'groups', 'g9', { code: 'G-9', name: 'Чужая группа', status: 'active' }]
  ];
  for (const [tenant, collection, id, body] of mvp) {
    await db.query(
      `insert into learning.mvp_runtime_documents (tenant_id, collection, id, data, created_at, updated_at)
       values ($1, $2, $3, $4::jsonb, now(), now())`,
      [tenant, collection, id, JSON.stringify({ id, tenantId: tenant, ...AT, ...body })]
    );
  }
  const docs: Array<[string, string, Record<string, unknown>]> = [
    [
      'generatedDocuments',
      'd1',
      {
        id: 'd1',
        tenantId: T1,
        templateId: 'tpl',
        sourceEntityType: 'enrollment',
        sourceEntityId: 'e1',
        fileId: 'f_missing',
        status: 'revoked',
        isFinal: true,
        documentNumber: 'АБ-1',
        documentDate: '2026-09-02',
        generatedAt: AT.updatedAt,
        variablesSnapshot: { learner: 'x' },
        documentType: 'certificate',
        name: 'Удостоверение',
        revokedAt: '2026-09-03T10:00:00.000Z',
        revocationReason: 'ошибка в ФИО'
      }
    ],
    [
      'generatedDocuments',
      'd2',
      {
        id: 'd2',
        tenantId: T1,
        sourceEntityType: 'group',
        sourceEntityId: 'g1',
        status: 'final',
        isFinal: true,
        documentNumber: 'АБ-2',
        generatedAt: AT.updatedAt,
        documentType: 'protocol',
        name: 'Протокол'
      }
    ],
    ['idem', '_', { keys: {} }]
  ];
  for (const [collection, id, body] of docs) {
    await db.query(
      `insert into documents.runtime_documents (tenant_id, collection, id, data, created_at, updated_at)
       values ($1, $2, $3, $4::jsonb, now(), now())`,
      [T1, collection, id, JSON.stringify(body)]
    );
  }
}

const tableCounts = async (db: Db, tenant: string): Promise<Record<string, number>> => {
  const rows = await db.query<{ t: string; n: string }>(
    `select 'counterparties' as t, count(*)::text as n from crm.counterparties where tenant_id = $1
     union all select 'learners', count(*)::text from learning.learners where tenant_id = $1
     union all select 'groups', count(*)::text from learning.groups where tenant_id = $1
     union all select 'group_courses', count(*)::text from learning.group_courses where tenant_id = $1
     union all select 'enrollments', count(*)::text from learning.enrollments where tenant_id = $1
     union all select 'history', count(*)::text from learning.enrollment_status_history where tenant_id = $1
     union all select 'exam_results', count(*)::text from assessment.exam_results where tenant_id = $1
     union all select 'documents', count(*)::text from documents.generated_documents where tenant_id = $1`,
    [tenant]
  );
  return Object.fromEntries(rows.map((r) => [r.t, Number(r.n)]));
};

const makeService = (db: Db): BackfillService =>
  new BackfillService(db as DatabaseService, new NormalizedBackfillService(db as DatabaseService));

describe.skipIf(!dockerAvailable)('бэкфилл lms_normalized на живой базе (Фаза 1, срез 0b)', () => {
  it('раскладывает снимок по восьми таблицам с частичным успехом, ПДн — шифртекстом, второй центр не смешивается', async () => {
    await withTestDb(TEST_DB, async (db) => {
      await seedSnapshot(db);
      const service = makeService(db);

      const first = await service.createAndRun('lms_normalized', 3);
      expect(first.completed).toBe(true);
      expect(first.run.status).toBe('completed');

      expect(await tableCounts(db, T1)).toEqual({
        counterparties: 2,
        learners: 3,
        groups: 2,
        group_courses: 2,
        enrollments: 2,
        history: 2,
        exam_results: 2,
        documents: 2
      });
      expect((await tableCounts(db, T2)).groups).toBe(1);
      expect((await tableCounts(db, T2)).counterparties).toBe(0);

      // ПДн: открытого СНИЛС в таблице нет, шифртекст и слепой индекс есть.
      const [l1] = await db.query<Record<string, string | null>>(
        `select snils, email, snils_enc, snils_hash, email_enc, date_of_birth
           from learning.learners where tenant_id = $1 and id = 'l1'`,
        [T1]
      );
      expect(l1!.snils).toBeNull();
      expect(l1!.email).toBeNull();
      expect(l1!.snils_enc).toMatch(/^enc:/);
      expect(l1!.email_enc).toMatch(/^enc:/);
      expect(l1!.snils_hash).toBe(snilsBlindIndex(SNILS));

      // Безопасные значения вместо отказа, исходное — в payload.
      const [cp2] = await db.query<{
        inn: string | null;
        status: string;
        payload: Record<string, unknown>;
      }>(
        `select inn, status, payload from crm.counterparties where tenant_id = $1 and id = 'cp2'`,
        [T1]
      );
      expect(cp2).toMatchObject({
        inn: null,
        status: 'inactive',
        payload: { inn: 'bad', sourceStatus: 'blocked' }
      });
      const [g2] = await db.query<{
        status: string;
        counterparty_id: string | null;
        payload: Record<string, unknown>;
      }>(
        `select status, counterparty_id, payload from learning.groups where tenant_id = $1 and id = 'g2'`,
        [T1]
      );
      expect(g2).toMatchObject({
        status: 'closed',
        counterparty_id: null,
        payload: { counterpartyId: 'cp_missing' }
      });
      const [e2] = await db.query<{ completed_at: Date | null }>(
        `select completed_at from learning.enrollments where tenant_id = $1 and id = 'e2'`,
        [T1]
      );
      expect(e2!.completed_at).not.toBeNull();
      const [x1] = await db.query<{
        status: string;
        final_score: string | null;
        is_passed: boolean;
      }>(
        `select status, final_score, is_passed from assessment.exam_results where tenant_id = $1 and id = 'x1'`,
        [T1]
      );
      expect(x1).toEqual({ status: 'needs_review', final_score: null, is_passed: false });

      // Документы: is_final из статуса, связи из зачисления, файл без строки — в payload.
      const [d1] = await db.query<Record<string, unknown>>(
        `select is_final, learner_id, group_id, counterparty_id, enrollment_id, storage_file_id, payload, variables_snapshot
           from documents.generated_documents where tenant_id = $1 and id = 'd1'`,
        [T1]
      );
      expect(d1).toMatchObject({
        is_final: false,
        learner_id: 'l1',
        group_id: 'g1',
        counterparty_id: 'cp1',
        enrollment_id: 'e1',
        storage_file_id: null
      });
      expect((d1!.payload as Record<string, unknown>).isFinal).toBe(true);
      expect((d1!.payload as Record<string, unknown>).fileId).toBe('f_missing');
      expect(String(d1!.variables_snapshot)).toMatch(/^enc:/);
      const [d2] = await db.query<{
        is_final: boolean;
        finalized_at: Date | null;
        document_date: Date | string;
      }>(
        `select is_final, finalized_at, document_date from documents.generated_documents where tenant_id = $1 and id = 'd2'`,
        [T1]
      );
      expect(d2!.is_final).toBe(true);
      expect(d2!.finalized_at).not.toBeNull();
      expect(new Date(d2!.document_date).toISOString().slice(0, 10)).toBe('2026-09-02');

      // Отказ — одна строка, поимённо и с причиной; прогон не остановился.
      const failed = await db.query<{
        collection: string;
        entity_id: string;
        error: string;
        tenant_id: string;
      }>(
        `select tenant_id, collection, entity_id, error from migration.backfill_items where run_id = $1 and status = 'failed'`,
        [first.run.id]
      );
      expect(failed).toHaveLength(1);
      expect(failed[0]).toMatchObject({
        tenant_id: T1,
        collection: 'enrollments',
        entity_id: 'e3'
      });
      expect(failed[0]!.error).toContain('enrollments_group_tenant_fk');

      // Хэши источника и цели совпадают у каждой записанной строки.
      const [mismatch] = await db.query<{ n: string }>(
        `select count(*)::text as n from migration.backfill_items
          where run_id = $1 and status = 'processed' and source_hash is distinct from target_hash`,
        [first.run.id]
      );
      expect(Number(mismatch!.n)).toBe(0);

      // Отчёт сверки: счётчики показывают недостачу, отказ назван с причиной.
      const { report } = await service.getReport(first.run.id);
      expect(report).not.toBeNull();
      expect(report!.domain).toBe('lms_normalized');
      const enrollmentsCount = report!.counts.find(
        (c) => c.tenant_id === T1 && c.collection === 'enrollments'
      );
      expect(enrollmentsCount).toMatchObject({ source_count: 3, target_count: 2 });
      const docsCount = report!.counts.find(
        (c) => c.tenant_id === T1 && c.collection === 'generatedDocuments'
      );
      expect(docsCount).toMatchObject({ source_count: 2, target_count: 2 });
      expect(report!.missingOrMismatchedRecords).toHaveLength(1);
      expect(report!.missingOrMismatchedRecords[0]).toMatchObject({
        collection: 'enrollments',
        id: 'e3',
        reason: 'missing_in_target'
      });
      expect(report!.missingOrMismatchedRecords[0]!.error).toContain('enrollments_group_tenant_fk');
      const statusRow = report!.statusDistributions.find(
        (s) => s.tenant_id === T1 && s.collection === 'counterparties' && s.status === 'blocked'
      );
      expect(statusRow).toMatchObject({ source_status_count: 1, target_status_count: 0 });

      // Повторный прогон: без дублей, тот же результат.
      const second = await service.createAndRun('lms_normalized', 50);
      expect(second.completed).toBe(true);
      expect(await tableCounts(db, T1)).toMatchObject({
        learners: 3,
        enrollments: 2,
        documents: 2
      });
    });
  }, 180_000);
});

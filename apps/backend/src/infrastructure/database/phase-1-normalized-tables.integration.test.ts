import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { isDockerAvailable, stopTestDb, withTestDb } from '../../testing/with-test-db.js';

/**
 * Фаза 1 ТЗ перехода с CDOPROF, срез 0 — на НАСТОЯЩЕЙ базе после ВСЕЙ цепочки миграций.
 *
 * До 0104–0109 в нормализованные таблицы горячих коллекций нельзя было вставить ни одной строки:
 * внешние ключи вели на пустые по построению таблицы (`study_groups`, `core.users`,
 * `documents.templates`, `assessment.tests`), два CHECK на одну колонку пропускали только
 * пересечение списков, а `exam_results.final_score` был обязателен при необязательном
 * `finalScore` у сущности. Здесь проверяется ровно то, ради чего срез сделан: строка из снимка
 * ложится в каждую таблицу, чужая группа по-прежнему отклоняется (NOT VALID проверяет новые
 * строки), а список групп по (центр, статус, дата начала) идёт по индексу (МГ-A4.1).
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
const T = 't_phase1';

type Db = {
  query: <R extends Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<R[]>;
  withTransaction: <R>(
    cb: (client: { query: (sql: string, params?: unknown[]) => Promise<unknown> }) => Promise<R>
  ) => Promise<R>;
};

/** Ожидаемый отказ — в точке сохранения, иначе он «портит» транзакцию теста целиком. */
const attempt = (db: Db, sql: string, params: unknown[]): Promise<unknown> =>
  db.withTransaction((client) => client.query(sql, params));

async function seedTenant(db: Db): Promise<void> {
  await db.query(
    `insert into core.tenants (id, code, name, status) values ($1, $1, $1, 'active') on conflict (id) do nothing`,
    [T]
  );
}

const GROUP_INSERT = `insert into learning.groups (id, tenant_id, code, name, status, starts_at, closed_at, study_form, is_dot)
     values ($1, $2, $1, 'Группа ' || $1, $3, now(), now(), 'очно-заочная', true)`;

async function seedGroup(db: Db, id: string, status = 'closed'): Promise<void> {
  await db.query(GROUP_INSERT, [id, T, status]);
}

describe.skipIf(!dockerAvailable)(
  'Фаза 1, срез 0: нормализованные таблицы принимают строку из снимка',
  () => {
    it('по строке в каждую из восьми таблиц — без открытого СНИЛС, без пользователя core.users, без шаблона и теста в таблицах', async () => {
      await withTestDb(TEST_DB, async (db) => {
        await seedTenant(db);

        await db.query(
          `insert into crm.counterparties (id, tenant_id, code, name, status, inn, short_name, ogrn, manager_user_id)
           values ('cp1', $1, 'CP-1', 'ООО «Ромашка»', 'active', '7707083893', 'Ромашка', '1027700132195', 'u_manager')`,
          [T]
        );

        await db.query(
          `insert into learning.learners (id, tenant_id, first_name, last_name, middle_name, status, counterparty_id,
                                          snils_enc, snils_hash, email_enc, birth_date_enc, gender, consent_status)
           values ('l1', $1, 'Иван', 'Иванов', 'Иванович', 'active', 'cp1',
                   'enc:v1:...', 'a3f1', 'enc:v1:...', 'enc:v1:...', 'male', 'given')`,
          [T]
        );
        const learner = await db.query<{ snils: string | null; date_of_birth: string | null }>(
          `select snils, date_of_birth from learning.learners where tenant_id = $1 and id = 'l1'`,
          [T]
        );
        expect(learner[0]).toEqual({ snils: null, date_of_birth: null });

        // Статус `closed` ставит close-group-chain — до 0104 CHECK из 0014 его не знал.
        await seedGroup(db, 'g1', 'closed');

        // Курс живёт в снимке: ключа на learning.courses больше нет.
        await db.query(
          `insert into learning.group_courses (id, tenant_id, group_id, course_id, sort_order, teacher_user_id)
           values ('gc1', $1, 'g1', 'course_in_snapshot', 1, 'u_teacher')`,
          [T]
        );

        // Слушателя нет в core.users (0014 требовал) и статус `suspended` (0014 не знал).
        await db.query(
          `insert into learning.enrollments (id, tenant_id, group_id, learner_id, status, result_code,
                                             certificate_series, certificate_number, protocol_number, protocol_date)
           values ('e1', $1, 'g1', 'l1', 'suspended', 'absent', 'АБ', '000123', 'П-7', '2026-09-01')`,
          [T]
        );
        // Завершённое зачисление без completion_state (CHECK 0003 снят, РМ31).
        await db.query(
          `insert into learning.enrollments (id, tenant_id, group_id, learner_id, status, completed_at, result_code)
           values ('e2', $1, 'g1', 'l1', 'completed', now(), 'passed')
           on conflict do nothing`,
          [T]
        );

        await db.query(
          `insert into learning.enrollment_status_history (id, tenant_id, enrollment_id, status, reason)
           values ('h1', $1, 'e1', 'suspended', 'не явился на экзамен')`,
          [T]
        );

        // Тест и попытка — в снимке; итоговый балл необязателен.
        await db.query(
          `insert into assessment.exam_results (id, tenant_id, enrollment_id, learner_id, test_id, best_attempt_id,
                                                is_passed, attempts_count, best_score, max_score, passing_score)
           values ('x1', $1, 'e1', 'l1', 'test_in_snapshot', 'attempt_in_snapshot', false, 2, 12.5, 20, 14)`,
          [T]
        );

        // Шаблон — в снимке; статус `archived` из кода не проходил ни один из двух старых CHECK.
        await db.query(
          `insert into documents.generated_documents (id, tenant_id, template_id, template_version_id,
                                                      source_entity_type, source_entity_id, learner_id, group_id,
                                                      enrollment_id, status, is_final, kind_code, document_type, name,
                                                      document_number, document_date, archived_at)
           values ('d1', $1, 'tpl_in_snapshot', 'tplv_in_snapshot', 'enrollment', 'e1', 'l1', 'g1', 'e1',
                   'archived', false, 'certificate', 'certificate', 'Удостоверение', 'АБ-000123', '2026-09-02', now())`,
          [T]
        );
        for (const status of ['revoked', 'issued', 'void', 'generated']) {
          await db.query(
            `insert into documents.generated_documents (id, tenant_id, source_entity_type, source_entity_id, status)
             values ($2, $1, 'enrollment', 'e1', $3)`,
            [T, `d_${status}`, status]
          );
        }

        const counts = await db.query<{ table_name: string; n: string }>(
          `select 'counterparties' as table_name, count(*)::text as n from crm.counterparties where tenant_id = $1
           union all select 'learners', count(*)::text from learning.learners where tenant_id = $1
           union all select 'groups', count(*)::text from learning.groups where tenant_id = $1
           union all select 'group_courses', count(*)::text from learning.group_courses where tenant_id = $1
           union all select 'enrollments', count(*)::text from learning.enrollments where tenant_id = $1
           union all select 'history', count(*)::text from learning.enrollment_status_history where tenant_id = $1
           union all select 'exam_results', count(*)::text from assessment.exam_results where tenant_id = $1
           union all select 'documents', count(*)::text from documents.generated_documents where tenant_id = $1`,
          [T]
        );
        expect(Object.fromEntries(counts.map((r) => [r.table_name, Number(r.n)]))).toEqual({
          counterparties: 1,
          learners: 1,
          groups: 1,
          group_courses: 1,
          enrollments: 1,
          history: 1,
          exam_results: 1,
          documents: 5
        });
      });
    }, 120_000);

    it('зачисление в несуществующую группу отклоняется уже сейчас: NOT VALID проверяет новые строки', async () => {
      await withTestDb(TEST_DB, async (db) => {
        await seedTenant(db);
        await db.query(
          `insert into learning.learners (id, tenant_id, first_name, last_name) values ('l9', $1, 'Пётр', 'Петров')`,
          [T]
        );
        await expect(
          attempt(
            db,
            `insert into learning.enrollments (id, tenant_id, group_id, learner_id, status)
           values ('e9', $1, 'g_missing', 'l9', 'pending')`,
            [T]
          )
        ).rejects.toMatchObject({ code: '23503', constraint: 'enrollments_group_tenant_fk' });
      });
    }, 120_000);

    it('группа с чужим статусом и документ с is_final без status=final отклоняются', async () => {
      await withTestDb(TEST_DB, async (db) => {
        await seedTenant(db);
        await expect(attempt(db, GROUP_INSERT, ['g_bad', T, 'whatever'])).rejects.toMatchObject({
          code: '23514',
          constraint: 'learning_groups_status_chk'
        });
        await expect(
          attempt(
            db,
            `insert into documents.generated_documents (id, tenant_id, source_entity_type, source_entity_id, status,
                                                      is_final, document_number, document_date, finalized_at)
           values ('d_bad', $1, 'enrollment', 'e0', 'archived', true, 'АБ-1', '2026-09-02', now())`,
            [T]
          )
        ).rejects.toMatchObject({
          code: '23514',
          constraint: 'generated_documents_final_state_chk'
        });
      });
    }, 120_000);

    it('список групп по (центр, статус, дата начала) идёт по индексу, а не полным проходом (МГ-A4.1)', async () => {
      await withTestDb(TEST_DB, async (db) => {
        await seedTenant(db);
        await db.query(
          `insert into learning.groups (id, tenant_id, code, name, status, starts_at)
         select 'g_' || i, $1, 'G-' || i, 'Группа ' || i,
                (array['draft','recruiting','active','in_progress','exam','documents','closed','archived'])[1 + i % 8],
                now() - (i || ' days')::interval
         from generate_series(1, 4000) as i`,
          [T]
        );
        await db.query('analyze learning.groups');
        const rows = await db.query<{ 'QUERY PLAN': unknown }>(
          `explain (format json) select id, code, name, starts_at from learning.groups
         where tenant_id = $1 and status = $2 order by starts_at limit 50`,
          [T, 'exam']
        );
        const plan = JSON.stringify(rows[0]!['QUERY PLAN']);
        expect(plan).toContain('groups_tenant_status_starts_idx');
        expect(plan).not.toMatch(/"Node Type":\s*"Seq Scan"/);

        const trgm = await db.query<{ indexname: string }>(
          `select indexname from pg_indexes where schemaname = 'learning' and tablename = 'groups' and indexname like '%trgm%'`
        );
        expect(trgm.map((r) => r.indexname).sort()).toEqual([
          'groups_code_trgm_idx',
          'groups_name_trgm_idx'
        ]);
      });
    }, 120_000);
  }
);

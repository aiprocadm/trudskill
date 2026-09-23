import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { InMemoryMvpState } from './in-memory-mvp.state.js';
import { PostgresMvpPersistenceBackend } from './postgres-mvp-persistence.backend.js';
import { isDockerAvailable, stopTestDb, withTestDb } from '../../../testing/with-test-db.js';

import type { DatabaseService } from '../../../infrastructure/database/database.service.js';

/**
 * Фаза 1, срез 4a: курсы группы и результаты экзаменов проецируются при сохранении снимка.
 * Проверяет на живой базе то, чего мок не видит: внешние ключи (группа, зачисление, слушатель),
 * UNIQUE по (центр, зачисление, тест) при пересдаче, NOT NULL `finalized_at` и полное присваивание.
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
const T = 't_gc_er_projection';
const AT = { createdAt: '2026-09-01T10:00:00.000Z', updatedAt: '2026-09-02T10:00:00.000Z' };

type Db = Pick<DatabaseService, 'query' | 'withTransaction'>;

const groupCourseRows = async (db: Db) =>
  db.query<{
    id: string;
    group_id: string;
    sort_order: number;
    requires_proctoring: boolean;
    status: string;
    payload: Record<string, unknown>;
  }>(
    `select id, group_id, sort_order, requires_proctoring, status, payload
       from learning.group_courses where tenant_id = $1 order by id`,
    [T]
  );
const examResultRows = async (db: Db) =>
  db.query<{
    id: string;
    enrollment_id: string;
    attempts_count: number;
    best_score: string | null;
    is_passed: boolean;
    status: string;
    finalized_at: Date;
  }>(
    `select id, enrollment_id, attempts_count, best_score, is_passed, status, finalized_at
       from assessment.exam_results where tenant_id = $1 order by id`,
    [T]
  );
const failures = async (db: Db) =>
  db.query<{ collection: string; entity_id: string | null; details: { message: string } }>(
    `select collection, entity_id, details from learning.mvp_reconciliation_log
      where tenant_id = $1 and issue_type = 'projection_failed' order by id`,
    [T]
  );

describe.skipIf(!dockerAvailable)(
  'проекция курсов группы и результатов экзаменов на живой базе (Фаза 1, срез 4a)',
  () => {
    it('создание, пересдача на месте, отказы поимённо, присваивание целиком', async () => {
      await withTestDb(TEST_DB, async (db) => {
        await db.query(
          `insert into core.tenants (id, code, name, status) values ($1, $1, $1, 'active') on conflict (id) do nothing`,
          [T]
        );
        const backend = new PostgresMvpPersistenceBackend(db as DatabaseService);

        // 1. Группа, курс группы без флагов, слушатель, зачисление и результат — в одном сохранении.
        const first = new InMemoryMvpState();
        await backend.loadIntoState(T, first);
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
          status: 'active'
        } as never);
        first.groupCourses.push(
          // Курс и его версия остаются в снимке (0105) — ссылки на них таблица не проверяет.
          { id: 'gc1', tenantId: T, ...AT, groupId: 'g1', courseId: 'c1', sortOrder: 0 } as never,
          // Группы g_missing нет: ссылка не обнуляется — отказ поимённо.
          { id: 'gc_bad', tenantId: T, ...AT, groupId: 'g_missing', courseId: 'c1' } as never
        );
        first.enrollments.push({
          id: 'e1',
          tenantId: T,
          ...AT,
          groupId: 'g1',
          learnerId: 'l1',
          status: 'active',
          enrolledAt: AT.createdAt
        } as never);
        first.examResults.push(
          {
            id: 'r1',
            tenantId: T,
            ...AT,
            enrollmentId: 'e1',
            learnerId: 'l1',
            testId: 't1',
            attemptsCount: 1,
            bestScore: 5,
            finalScore: 5,
            maxScore: 10,
            passingScore: 7,
            passed: false,
            status: 'active'
          } as never,
          // Зачисления e_missing нет в таблице — результат по нему отказ поимённо, снимок сохранён.
          {
            id: 'r_bad',
            tenantId: T,
            ...AT,
            enrollmentId: 'e_missing',
            learnerId: 'l1',
            testId: 't1',
            attemptsCount: 1,
            maxScore: 10,
            passed: false,
            status: 'active'
          } as never
        );
        await backend.saveFromState(T, first);

        const gc1 = await groupCourseRows(db);
        expect(gc1.map((r) => r.id)).toEqual(['gc1']);
        expect(gc1[0]!.requires_proctoring).toBe(false);
        expect(gc1[0]!.status).toBe('active');
        // Флаги и статус выдуманы ради NOT NULL — обратная проекция их не отдаст.
        expect(gc1[0]!.payload.__synthesized).toEqual([
          'requiresPreExamAuth',
          'requiresIdentityVerification',
          'requiresProctoring',
          'status'
        ]);

        const er1 = await examResultRows(db);
        expect(er1.map((r) => r.id)).toEqual(['r1']);
        expect(er1[0]!.attempts_count).toBe(1);
        expect(er1[0]!.is_passed).toBe(false);
        expect(er1[0]!.finalized_at.toISOString()).toBe(AT.updatedAt);

        const failed1 = await failures(db);
        expect(failed1.map((f) => `${f.collection}:${f.entity_id}`)).toEqual([
          'groupCourses:gc_bad',
          'examResults:r_bad'
        ]);
        expect(failed1[0]!.details.message).toMatch(/group_courses_group_tenant_fk/);
        expect(failed1[1]!.details.message).toMatch(/exam_results_enrollment/);

        // Снимок хранит и плохие записи — таблицы догоняют, а не режут данные.
        const reloaded = new InMemoryMvpState();
        await backend.loadIntoState(T, reloaded);
        expect(reloaded.groupCourses.map((g) => g.id)).toEqual(['gc1', 'gc_bad']);
        expect(reloaded.examResults.map((r) => r.id)).toEqual(['r1', 'r_bad']);

        // 2. Пересдача: тот же результат меняется на месте — одна строка, счётчик и балл новые.
        const second = new InMemoryMvpState();
        await backend.loadIntoState(T, second);
        const r1 = second.examResults.find((r) => r.id === 'r1')!;
        r1.attemptsCount = 2;
        r1.bestScore = 9;
        r1.finalScore = 9;
        r1.passed = true;
        r1.updatedAt = '2026-09-05T10:00:00.000Z';
        // Второй результат по той же паре (зачисление, тест) — нарушает UNIQUE, отказ поимённо.
        second.examResults.push({
          id: 'r_dup',
          tenantId: T,
          ...AT,
          enrollmentId: 'e1',
          learnerId: 'l1',
          testId: 't1',
          attemptsCount: 1,
          maxScore: 10,
          passed: false,
          status: 'active'
        } as never);
        await backend.saveFromState(T, second);

        const er2 = await examResultRows(db);
        expect(er2.map((r) => r.id)).toEqual(['r1']);
        expect(er2[0]!.attempts_count).toBe(2);
        expect(Number(er2[0]!.best_score)).toBe(9);
        expect(er2[0]!.is_passed).toBe(true);
        expect(er2[0]!.finalized_at.toISOString()).toBe('2026-09-05T10:00:00.000Z');
        const failed2 = await failures(db);
        expect(failed2.find((f) => f.entity_id === 'r_dup')!.details.message).toMatch(
          /exam_results_tenant_enrollment_test_uniq/
        );

        // 3. Присваивание курсов группы целиком: новый список — старые строки уходят.
        const third = new InMemoryMvpState();
        await backend.loadIntoState(T, third);
        third.groupCourses = [
          {
            id: 'gc2',
            tenantId: T,
            ...AT,
            groupId: 'g1',
            courseId: 'c2',
            sortOrder: 1,
            requiresProctoring: true,
            status: 'active'
          } as never
        ];
        await backend.saveFromState(T, third);

        const gc3 = await groupCourseRows(db);
        expect(gc3.map((r) => [r.id, r.requires_proctoring, r.sort_order])).toEqual([
          ['gc2', true, 1]
        ]);
        expect(gc3[0]!.payload.__synthesized).toEqual([
          'requiresPreExamAuth',
          'requiresIdentityVerification'
        ]);

        // 4. Удаление зачисления, на которое ссылается результат, из снимка вместе с результатом:
        // сначала уходит результат, потом зачисление.
        const fourth = new InMemoryMvpState();
        await backend.loadIntoState(T, fourth);
        fourth.examResults = fourth.examResults.filter((r) => r.id !== 'r1');
        fourth.enrollments.splice(
          fourth.enrollments.findIndex((e) => e.id === 'e1'),
          1
        );
        await backend.saveFromState(T, fourth);
        expect(await examResultRows(db)).toEqual([]);
        expect(
          (await db.query(`select id from learning.enrollments where tenant_id = $1`, [T])).length
        ).toBe(0);
      });
    }, 240_000);
  }
);

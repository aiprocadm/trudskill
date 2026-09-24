import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import {
  COUNTERPARTY_SORT_COLUMNS,
  PostgresCounterpartiesRepository
} from './postgres-counterparties.repository.js';
import {
  PostgresEnrollmentsRepository,
  parseEnrollmentListQuery
} from './postgres-enrollments.repository.js';
import {
  PostgresExamResultsRepository,
  parseExamResultListQuery
} from './postgres-exam-results.repository.js';
import {
  PostgresGroupCoursesRepository,
  parseGroupCourseListQuery
} from './postgres-group-courses.repository.js';
import { GROUP_SORT_COLUMNS, PostgresGroupsRepository } from './postgres-groups.repository.js';
import {
  LEARNER_SORT_COLUMNS,
  PostgresLearnersRepository
} from './postgres-learners.repository.js';
import { parseRegistryListQuery } from './registry-list-query.js';
import { decryptLearnerPiiAtRest } from '../../../../infrastructure/crypto/pii-crypto.js';
import { isDockerAvailable, stopTestDb, withTestDb } from '../../../../testing/with-test-db.js';
import {
  TABLE_SPECS,
  emptyContext,
  projectEntity
} from '../../../migration/backfill/normalized/normalized-projection.js';
import { upsertRows } from '../../../migration/backfill/normalized/normalized-upsert.js';

import type { DatabaseService } from '../../../../infrastructure/database/database.service.js';

/**
 * SQL-репозитории контрагентов и групп на НАСТОЯЩЕЙ базе (Фаза 1, срез 1b, МГ-A2.1): страница
 * базы, `total`, поиск по коду/названию/ИНН/полям импорта, статус, сортировка по белому списку с
 * добивкой по `id`, изоляция центров, скоуп портала, форма ответа равна снимку (поля импорта из
 * `payload`, исходный статус).
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
const T = 't_repo';
const T2 = 't_repo_other';
const at = (day: number) => ({
  createdAt: `2026-09-${String(day).padStart(2, '0')}T10:00:00.000Z`,
  updatedAt: `2026-09-${String(day).padStart(2, '0')}T10:00:00.000Z`
});

type Db = Pick<DatabaseService, 'query' | 'withTransaction'>;

async function seed(db: Db): Promise<void> {
  for (const tenant of [T, T2]) {
    await db.query(
      `insert into core.tenants (id, code, name, status) values ($1, $1, $1, 'active') on conflict (id) do nothing`,
      [tenant]
    );
  }
  const cps = [
    {
      id: 'cp1',
      tenantId: T,
      ...at(1),
      code: 'CP-1',
      name: 'Ромашка',
      status: 'active',
      inn: '7707083893',
      contractNumber: 'Д-7'
    },
    {
      id: 'cp2',
      tenantId: T,
      ...at(2),
      code: 'CP-2',
      name: 'Лютик',
      status: 'blocked',
      inn: 'bad'
    },
    { id: 'cp3', tenantId: T, ...at(3), code: 'CP-3', name: 'Василёк', status: 'archived' },
    { id: 'cp9', tenantId: T2, ...at(1), code: 'CP-1', name: 'Ромашка чужая', status: 'active' }
  ];
  const groups = [
    {
      id: 'g1',
      tenantId: T,
      ...at(1),
      code: '2024-01',
      name: 'Охрана труда',
      status: 'active',
      counterpartyId: 'cp1'
    },
    {
      id: 'g2',
      tenantId: T,
      ...at(2),
      code: '2024-02',
      name: 'Пожарная безопасность',
      status: 'closed',
      counterpartyId: 'cp2',
      legacyNumber: '77',
      comment: 'вечерняя смена'
    },
    {
      id: 'g3',
      tenantId: T,
      ...at(3),
      code: '2025-01',
      name: 'Электробезопасность',
      status: 'active'
    },
    { id: 'g9', tenantId: T2, ...at(1), code: '2024-01', name: 'Чужая', status: 'active' }
  ];
  await db.withTransaction(async (client) => {
    for (const tenant of [T, T2]) {
      await upsertRows(
        client,
        TABLE_SPECS.counterparties,
        cps
          .filter((c) => c.tenantId === tenant)
          .map((c) => projectEntity('counterparties', tenant, c, emptyContext()))
      );
    }
    const ctx = emptyContext();
    ctx.counterparties.add('cp1');
    ctx.counterparties.add('cp2');
    for (const tenant of [T, T2]) {
      await upsertRows(
        client,
        TABLE_SPECS.groups,
        groups
          .filter((g) => g.tenantId === tenant)
          .map((g) => projectEntity('groups', tenant, g, ctx))
      );
    }
  });
}

const q = (
  query: Record<string, unknown>,
  scope?: { counterpartyId?: string },
  sortColumns = GROUP_SORT_COLUMNS
) => parseRegistryListQuery(query as never, sortColumns, scope);

describe.skipIf(!dockerAvailable)('SQL-репозитории контрагентов и групп (Фаза 1, срез 1b)', () => {
  it('списки, поиск, статус, сортировка, страницы, изоляция и скоуп — на живой базе', async () => {
    await withTestDb(TEST_DB, async (db) => {
      await seed(db);
      const groupsRepo = new PostgresGroupsRepository(db as DatabaseService);
      const cpRepo = new PostgresCounterpartiesRepository(db as DatabaseService);

      // Изоляция центров и порядок по умолчанию (created_at asc, id asc).
      const all = await groupsRepo.list(T, q({}));
      expect(all.items.map((g) => g.id)).toEqual(['g1', 'g2', 'g3']);
      expect(all).toMatchObject({ page: 1, pageSize: 50, total: 3 });

      // Форма ответа равна снимку: поля импорта из payload, исходный статус контрагента.
      expect(all.items[1]).toMatchObject({
        id: 'g2',
        tenantId: T,
        code: '2024-02',
        name: 'Пожарная безопасность',
        status: 'closed',
        counterpartyId: 'cp2',
        legacyNumber: '77',
        createdAt: '2026-09-02T10:00:00.000Z'
      });
      const cp2 = await cpRepo.get(T, 'cp2');
      expect(cp2).toMatchObject({ id: 'cp2', status: 'blocked', inn: 'bad' });
      expect(await cpRepo.get(T2, 'cp2')).toBeNull();
      expect(await groupsRepo.get(T, 'g9')).toBeNull();

      // Страницы и total.
      const page2 = await groupsRepo.list(T, q({ page: '2', page_size: '2' }));
      expect(page2.items.map((g) => g.id)).toEqual(['g3']);
      expect(page2).toMatchObject({ page: 2, pageSize: 2, total: 3 });

      // Поиск: по коду, по названию без учёта регистра, по полю импорта из payload.
      expect((await groupsRepo.list(T, q({ q: '2024-0' }))).items.map((g) => g.id)).toEqual([
        'g1',
        'g2'
      ]);
      expect((await groupsRepo.list(T, q({ q: 'ЭЛЕКТРО' }))).items.map((g) => g.id)).toEqual([
        'g3'
      ]);
      expect((await groupsRepo.list(T, q({ q: '77' }))).items.map((g) => g.id)).toEqual(['g2']);
      expect((await groupsRepo.list(T, q({ q: 'вечерн' }))).items.map((g) => g.id)).toEqual(['g2']);
      expect(
        (await cpRepo.list(T, q({ q: 'Д-7' }, undefined, COUNTERPARTY_SORT_COLUMNS))).items.map(
          (c) => c.id
        )
      ).toEqual(['cp1']);
      expect(
        (await cpRepo.list(T, q({ q: '7707' }, undefined, COUNTERPARTY_SORT_COLUMNS))).items.map(
          (c) => c.id
        )
      ).toEqual(['cp1']);
      // Спецсимвол шаблона экранируется: «%» ничего не находит, а не всё подряд.
      expect((await groupsRepo.list(T, q({ q: '%' }))).total).toBe(0);

      // Статус и сортировка по белому списку.
      expect((await groupsRepo.list(T, q({ status: 'active' }))).items.map((g) => g.id)).toEqual([
        'g1',
        'g3'
      ]);
      expect((await groupsRepo.list(T, q({ sort: 'name:desc' }))).items.map((g) => g.name)).toEqual(
        ['Электробезопасность', 'Пожарная безопасность', 'Охрана труда']
      );
      expect(
        (
          await cpRepo.list(T, q({ sort: 'inn:asc' }, undefined, COUNTERPARTY_SORT_COLUMNS))
        ).items.map((c) => c.id)
      ).toEqual(['cp1', 'cp2', 'cp3']);

      // Скоуп портала: только группы своего контрагента; группа без контрагента не видна.
      expect(
        (await groupsRepo.list(T, q({}, { counterpartyId: 'cp1' }))).items.map((g) => g.id)
      ).toEqual(['g1']);
      expect(
        (
          await cpRepo.list(T, q({}, { counterpartyId: 'cp1' }, COUNTERPARTY_SORT_COLUMNS))
        ).items.map((c) => c.id)
      ).toEqual(['cp1']);

      // Lookup: id, подпись, статус.
      expect((await groupsRepo.lookup(T, q({ q: 'охрана' }))).items).toEqual([
        { id: 'g1', label: 'Охрана труда', status: 'active' }
      ]);
    });
  }, 180_000);

  it('слушатели (срез 2b): ФИО через триграммы, номер, точный СНИЛС по слепому индексу, шифртекст в ответе', async () => {
    await withTestDb(TEST_DB, async (db) => {
      for (const tenant of [T, T2]) {
        await db.query(
          `insert into core.tenants (id, code, name, status) values ($1, $1, $1, 'active') on conflict (id) do nothing`,
          [tenant]
        );
      }
      const learners = [
        {
          id: 'l1',
          tenantId: T,
          ...at(1),
          firstName: 'Иван',
          lastName: 'Иванов',
          middleName: 'Иванович',
          learnerNo: 'Т-001',
          snils: '112-233-445 95',
          email: 'ivan@example.com',
          status: 'active'
        },
        {
          id: 'l2',
          tenantId: T,
          ...at(2),
          firstName: 'Пётр',
          lastName: 'Петров',
          learnerNo: 'Т-002',
          status: 'inactive'
        },
        {
          id: 'l3',
          tenantId: T,
          ...at(3),
          firstName: 'Анна',
          lastName: 'Иванова',
          snils: '112-233-445 96',
          status: 'active'
        },
        {
          id: 'l9',
          tenantId: T2,
          ...at(1),
          firstName: 'Иван',
          lastName: 'Иванов',
          snils: '112-233-445 95',
          status: 'active'
        }
      ];
      await db.withTransaction(async (client) => {
        for (const tenant of [T, T2]) {
          await upsertRows(
            client,
            TABLE_SPECS.learners,
            learners
              .filter((l) => l.tenantId === tenant)
              .map((l) => projectEntity('learners', tenant, l, emptyContext()))
          );
        }
      });
      const repo = new PostgresLearnersRepository(db as DatabaseService);
      const lq = (query: Record<string, unknown>) =>
        parseRegistryListQuery(query as never, LEARNER_SORT_COLUMNS);

      // Изоляция и порядок по умолчанию; ПДн — шифртекстом, расшифровка даёт исходник.
      const all = await repo.list(T, lq({}));
      expect(all.items.map((l) => l.id)).toEqual(['l1', 'l2', 'l3']);
      expect(String(all.items[0]!.snils)).toMatch(/^enc:/);
      expect(decryptLearnerPiiAtRest(all.items[0]) as Record<string, unknown>).toMatchObject({
        snils: '112-233-445 95',
        email: 'ivan@example.com'
      });
      expect(await repo.get(T2, 'l1')).toBeNull();

      // ФИО без учёта регистра (триграммы), по отчеству, по номеру.
      expect((await repo.list(T, lq({ q: 'иванов' }))).items.map((l) => l.id)).toEqual([
        'l1',
        'l3'
      ]);
      expect((await repo.list(T, lq({ q: 'Иванович' }))).items.map((l) => l.id)).toEqual(['l1']);
      expect((await repo.list(T, lq({ q: 'Т-002' }))).items.map((l) => l.id)).toEqual(['l2']);

      // Точный СНИЛС в двух написаниях — по слепому индексу, только свой центр; частичный — пусто.
      expect((await repo.list(T, lq({ q: '112-233-445 95' }))).items.map((l) => l.id)).toEqual([
        'l1'
      ]);
      expect((await repo.list(T, lq({ q: '11223344595' }))).items.map((l) => l.id)).toEqual(['l1']);
      expect((await repo.list(T, lq({ q: '112-233' }))).total).toBe(0);
      expect((await repo.findBySnils(T, '112 233 445 96')).map((l) => l.id)).toEqual(['l3']);
      expect(await repo.findBySnils(T, '')).toEqual([]);

      // Статус, сортировка по белому списку, lookup.
      expect((await repo.list(T, lq({ status: 'inactive' }))).items.map((l) => l.id)).toEqual([
        'l2'
      ]);
      expect((await repo.list(T, lq({ sort: 'lastName:desc' }))).items.map((l) => l.id)).toEqual([
        'l2',
        'l3',
        'l1'
      ]);
      expect((await repo.lookup(T, lq({ q: 'анна' }))).items).toEqual([
        { id: 'l3', label: 'Анна Иванова', status: 'active' }
      ]);
    });
  }, 180_000);

  it('зачисления (срез 3b): anti-IDOR, скоуп заказчика через группы, фильтры, история, изоляция', async () => {
    await withTestDb(TEST_DB, async (db) => {
      await seed(db);
      const learners = [
        {
          id: 'l1',
          tenantId: T,
          ...at(1),
          firstName: 'Иван',
          lastName: 'Иванов',
          status: 'active',
          linkedIamUserId: 'u_ivan'
        },
        {
          id: 'l2',
          tenantId: T,
          ...at(2),
          firstName: 'Пётр',
          lastName: 'Петров',
          status: 'active'
        },
        {
          id: 'l9',
          tenantId: T2,
          ...at(1),
          firstName: 'Чужой',
          lastName: 'Чужой',
          status: 'active'
        }
      ];
      const enrollments = [
        {
          id: 'e1',
          tenantId: T,
          ...at(1),
          groupId: 'g1',
          learnerId: 'l1',
          status: 'active',
          enrolledAt: at(1).createdAt,
          plannedEndAt: '2026-10-01T00:00:00.000Z'
        },
        {
          id: 'e2',
          tenantId: T,
          ...at(2),
          groupId: 'g2',
          learnerId: 'l2',
          status: 'completed',
          enrolledAt: at(2).createdAt,
          completedAt: '2026-09-15T00:00:00.000Z'
        },
        {
          id: 'e3',
          tenantId: T,
          ...at(3),
          groupId: 'g3',
          learnerId: 'l1',
          status: 'cancelled',
          enrolledAt: at(3).createdAt
        },
        {
          id: 'e9',
          tenantId: T2,
          ...at(1),
          groupId: 'g9',
          learnerId: 'l9',
          status: 'active',
          enrolledAt: at(1).createdAt
        }
      ];
      const history = [
        {
          id: 'h1',
          tenantId: T,
          enrollmentId: 'e1',
          status: 'pending',
          changedAt: at(1).createdAt
        },
        {
          id: 'h2',
          tenantId: T,
          enrollmentId: 'e1',
          status: 'active',
          changedAt: at(2).createdAt,
          reason: 'оплачено'
        }
      ];
      await db.withTransaction(async (client) => {
        for (const tenant of [T, T2]) {
          await upsertRows(
            client,
            TABLE_SPECS.learners,
            learners
              .filter((l) => l.tenantId === tenant)
              .map((l) => projectEntity('learners', tenant, l, emptyContext()))
          );
          await upsertRows(
            client,
            TABLE_SPECS.enrollments,
            enrollments
              .filter((e) => e.tenantId === tenant)
              .map((e) => projectEntity('enrollments', tenant, e, emptyContext()))
          );
        }
        await upsertRows(
          client,
          TABLE_SPECS.enrollmentStatusHistory,
          history.map((h) => projectEntity('enrollmentStatusHistory', T, h, emptyContext()))
        );
      });
      const repo = new PostgresEnrollmentsRepository(db as DatabaseService);
      const learnersRepo = new PostgresLearnersRepository(db as DatabaseService);
      const eq = (
        query: Record<string, unknown>,
        learnerIds: string[] | null = null,
        scope?: { counterpartyId?: string }
      ) => parseEnrollmentListQuery(query as never, learnerIds, scope);

      // Изоляция, порядок по умолчанию, форма (даты не выдуманы).
      const all = await repo.list(T, eq({}));
      expect(all.items.map((e) => e.id)).toEqual(['e1', 'e2', 'e3']);
      expect(all.items[0]).toMatchObject({
        groupId: 'g1',
        learnerId: 'l1',
        status: 'active',
        plannedEndAt: '2026-10-01T00:00:00.000Z'
      });
      expect('completedAt' in all.items[0]!).toBe(false);
      expect(await repo.get(T2, 'e1')).toBeNull();

      // Anti-IDOR: только свои; пустой список — ничего; привязка через колонку 0111.
      expect(await learnersRepo.learnerIdsByUser(T, 'u_ivan')).toEqual(['l1']);
      expect((await repo.list(T, eq({}, ['l1']))).items.map((e) => e.id)).toEqual(['e1', 'e3']);
      expect((await repo.list(T, eq({}, []))).total).toBe(0);

      // Скоуп заказчика через группы: cp1 → g1; группа без контрагента (g3) не видна.
      expect(
        (await repo.list(T, eq({}, null, { counterpartyId: 'cp1' }))).items.map((e) => e.id)
      ).toEqual(['e1']);
      // Срез 3c: слушатели представителя через зачисления и группы — l1 (g1 → cp1), но не l2 (g2 → cp2) и не l1 по g3 без контрагента.
      expect(
        (
          await learnersRepo.list(
            T,
            parseRegistryListQuery({} as never, LEARNER_SORT_COLUMNS, { counterpartyId: 'cp1' })
          )
        ).items.map((l) => l.id)
      ).toEqual(['l1']);
      expect(
        (
          await learnersRepo.list(
            T,
            parseRegistryListQuery({} as never, LEARNER_SORT_COLUMNS, { counterpartyId: 'cp_none' })
          )
        ).total
      ).toBe(0);

      // Фильтры и сортировка.
      expect((await repo.list(T, eq({ status: 'completed' }))).items.map((e) => e.id)).toEqual([
        'e2'
      ]);
      expect((await repo.list(T, eq({ group_id: 'g3' }))).items.map((e) => e.id)).toEqual(['e3']);
      expect(
        (await repo.list(T, eq({ planned_end_from: '2026-09-20' }))).items.map((e) => e.id)
      ).toEqual(['e1']);
      expect(
        (await repo.list(T, eq({ created_from: '2026-09-02T00:00:00Z' }))).items.map((e) => e.id)
      ).toEqual(['e2', 'e3']);
      expect((await repo.list(T, eq({ sort: 'enrolledAt:desc' }))).items.map((e) => e.id)).toEqual([
        'e3',
        'e2',
        'e1'
      ]);

      // История: по порядку смены, без выдуманного createdAt; неизвестное зачисление — пусто.
      const h = await repo.history(T, 'e1');
      expect(h.map((r) => [r.status, r.reason])).toEqual([
        ['pending', undefined],
        ['active', 'оплачено']
      ]);
      expect('createdAt' in h[0]!).toBe(false);
      expect(await repo.history(T, 'e_missing')).toEqual([]);
    });
  }, 180_000);

  it('курсы группы и результаты (срез 4b): фильтры, anti-IDOR, форма без выдуманных полей, изоляция', async () => {
    await withTestDb(TEST_DB, async (db) => {
      await seed(db);
      const learners = [
        {
          id: 'l1',
          tenantId: T,
          ...at(1),
          firstName: 'Иван',
          lastName: 'Иванов',
          status: 'active'
        },
        {
          id: 'l2',
          tenantId: T,
          ...at(2),
          firstName: 'Пётр',
          lastName: 'Петров',
          status: 'active'
        },
        {
          id: 'l9',
          tenantId: T2,
          ...at(1),
          firstName: 'Чужой',
          lastName: 'Чужой',
          status: 'active'
        }
      ];
      const enrollments = [
        { id: 'e1', tenantId: T, ...at(1), groupId: 'g1', learnerId: 'l1', status: 'active' },
        { id: 'e2', tenantId: T, ...at(2), groupId: 'g2', learnerId: 'l2', status: 'completed' },
        { id: 'e9', tenantId: T2, ...at(1), groupId: 'g9', learnerId: 'l9', status: 'active' }
      ];
      const groupCourses = [
        // Без флагов и статуса — колонки получат подстановки, ответ их не отдаст.
        { id: 'gc1', tenantId: T, ...at(1), groupId: 'g1', courseId: 'c1', sortOrder: 0 },
        {
          id: 'gc2',
          tenantId: T,
          ...at(2),
          groupId: 'g2',
          courseId: 'c2',
          courseVersionId: 'cv2',
          sortOrder: 1,
          requiresProctoring: true,
          status: 'active'
        },
        { id: 'gc9', tenantId: T2, ...at(1), groupId: 'g9', courseId: 'c1', sortOrder: 0 }
      ];
      const examResults = [
        {
          id: 'r1',
          tenantId: T,
          ...at(1),
          enrollmentId: 'e1',
          learnerId: 'l1',
          testId: 't_final',
          attemptsCount: 1,
          bestAttemptId: 'a1',
          bestScore: 9.5,
          finalScore: 9.5,
          maxScore: 10,
          passingScore: 7,
          passed: true,
          status: 'active'
        },
        {
          id: 'r2',
          tenantId: T,
          ...at(2),
          enrollmentId: 'e2',
          learnerId: 'l2',
          testId: 't_final',
          attemptsCount: 2,
          bestScore: 5,
          finalScore: 5,
          maxScore: 10,
          passed: false,
          status: 'needs_review'
        },
        {
          id: 'r9',
          tenantId: T2,
          ...at(1),
          enrollmentId: 'e9',
          learnerId: 'l9',
          testId: 't_final',
          attemptsCount: 1,
          maxScore: 10,
          passed: true,
          status: 'active'
        }
      ];
      await db.withTransaction(async (client) => {
        for (const tenant of [T, T2]) {
          const own = <R extends { tenantId: string }>(rows: R[]) =>
            rows.filter((r) => r.tenantId === tenant);
          await upsertRows(
            client,
            TABLE_SPECS.learners,
            own(learners).map((l) => projectEntity('learners', tenant, l, emptyContext()))
          );
          await upsertRows(
            client,
            TABLE_SPECS.groupCourses,
            own(groupCourses).map((g) => projectEntity('groupCourses', tenant, g, emptyContext()))
          );
          await upsertRows(
            client,
            TABLE_SPECS.enrollments,
            own(enrollments).map((e) => projectEntity('enrollments', tenant, e, emptyContext()))
          );
          await upsertRows(
            client,
            TABLE_SPECS.examResults,
            own(examResults).map((r) => projectEntity('examResults', tenant, r, emptyContext()))
          );
        }
      });

      // Курсы группы: изоляция, порядок, форма без выдуманных полей, фильтры, сортировка.
      const gcRepo = new PostgresGroupCoursesRepository(db as DatabaseService);
      const gq = (query: Record<string, unknown>) => parseGroupCourseListQuery(query as never);
      const gcAll = await gcRepo.list(T, gq({}));
      expect(gcAll.items.map((g) => g.id)).toEqual(['gc1', 'gc2']);
      expect(gcAll.items[0]).toEqual(groupCourses[0]);
      expect(gcAll.items[1]).toEqual(groupCourses[1]);
      expect((await gcRepo.list(T, gq({ group_id: 'g2' }))).items.map((g) => g.id)).toEqual([
        'gc2'
      ]);
      expect((await gcRepo.list(T, gq({ course_version_id: 'cv2' }))).total).toBe(1);
      expect((await gcRepo.list(T, gq({ sort: 'sortOrder:desc' }))).items.map((g) => g.id)).toEqual(
        ['gc2', 'gc1']
      );
      expect(await gcRepo.get(T, 'gc9')).toBeNull();
      expect((await gcRepo.get(T, 'gc1'))?.courseId).toBe('c1');

      // Результаты: anti-IDOR, фильтры, баллы числами (сотые сохраняются), форма без finalizedAt.
      const erRepo = new PostgresExamResultsRepository(db as DatabaseService);
      const rq = (query: Record<string, unknown>, learnerIds: string[] | null = null) =>
        parseExamResultListQuery(query as never, learnerIds);
      const erAll = await erRepo.list(T, rq({}));
      expect(erAll.items.map((r) => r.id)).toEqual(['r1', 'r2']);
      expect(erAll.items[0]).toEqual(examResults[0]);
      expect(erAll.items[1]).toEqual(examResults[1]);
      expect((await erRepo.list(T, rq({}, ['l1']))).items.map((r) => r.id)).toEqual(['r1']);
      expect((await erRepo.list(T, rq({}, []))).total).toBe(0);
      expect((await erRepo.list(T, rq({ status: 'needs_review' }))).items.map((r) => r.id)).toEqual(
        ['r2']
      );
      expect((await erRepo.list(T, rq({ test_id: 't_final', learner_id: 'l2' }))).total).toBe(1);
      expect((await erRepo.list(T, rq({ sort: 'bestScore:desc' }))).items.map((r) => r.id)).toEqual(
        ['r1', 'r2']
      );
      expect(await erRepo.get(T, 'r9')).toBeNull();
      expect((await erRepo.byEnrollment(T, 'e1')).map((r) => r.id)).toEqual(['r1']);
      expect(await erRepo.byEnrollment(T, 'e9')).toEqual([]);
    });
  }, 180_000);
});

import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { InMemoryMvpState } from './in-memory-mvp.state.js';
import { PostgresMvpPersistenceBackend } from './postgres-mvp-persistence.backend.js';
import { isDockerAvailable, stopTestDb, withTestDb } from '../../../testing/with-test-db.js';

import type { DatabaseService } from '../../../infrastructure/database/database.service.js';

/**
 * Проекция зачислений и истории статусов при сохранении снимка — на НАСТОЯЩЕЙ базе после всей
 * цепочки миграций (Фаза 1, срез 3a). Доказывается то, что мок не может: составные ключи на
 * группу и слушателя, уникальность пары «группа + слушатель», каскад истории при удалении,
 * `completed_at` при смене статуса и отказы поимённо без отката снимка.
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
const T = 't_enrollments_projection';
const AT = { createdAt: '2026-09-01T10:00:00.000Z', updatedAt: '2026-09-02T10:00:00.000Z' };

type Db = Pick<DatabaseService, 'query' | 'withTransaction'>;

const enrollmentRows = async (db: Db) =>
  db.query<{ id: string; status: string; completed_at: Date | null; enrolled_at: Date }>(
    `select id, status, completed_at, enrolled_at from learning.enrollments where tenant_id = $1 order by id`,
    [T]
  );
const historyRows = async (db: Db) =>
  db.query<{ id: string; enrollment_id: string; status: string; reason: string | null }>(
    `select id, enrollment_id, status, reason from learning.enrollment_status_history where tenant_id = $1 order by changed_at, id`,
    [T]
  );
const failures = async (db: Db) =>
  db.query<{ collection: string; entity_id: string | null; details: { message: string } }>(
    `select collection, entity_id, details from learning.mvp_reconciliation_log
      where tenant_id = $1 and issue_type = 'projection_failed' order by id`,
    [T]
  );

describe.skipIf(!dockerAvailable)('проекция зачислений на живой базе (Фаза 1, срез 3a)', () => {
  it('создание, смена статуса, отказы поимённо, удаление с каскадом истории', async () => {
    await withTestDb(TEST_DB, async (db) => {
      await db.query(
        `insert into core.tenants (id, code, name, status) values ($1, $1, $1, 'active') on conflict (id) do nothing`,
        [T]
      );
      const backend = new PostgresMvpPersistenceBackend(db as DatabaseService);

      // 1. Слушатель, группа и зачисление с историей в одном сохранении — порядок ключей соблюдён.
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
      first.enrollments.push(
        {
          id: 'e1',
          tenantId: T,
          ...AT,
          groupId: 'g1',
          learnerId: 'l1',
          status: 'pending',
          enrolledAt: AT.createdAt
        } as never,
        // Группы g_missing в снимке нет: ссылка не обнуляется — это ошибка данных, отказ поимённо.
        {
          id: 'e_bad',
          tenantId: T,
          ...AT,
          groupId: 'g_missing',
          learnerId: 'l1',
          status: 'pending',
          enrolledAt: AT.createdAt
        } as never
      );
      first.enrollmentStatusHistory.push(
        {
          id: 'h1',
          tenantId: T,
          enrollmentId: 'e1',
          status: 'pending',
          changedAt: AT.createdAt
        } as never,
        {
          id: 'h_bad',
          tenantId: T,
          enrollmentId: 'e_bad',
          status: 'pending',
          changedAt: AT.createdAt
        } as never
      );
      await backend.saveFromState(T, first);

      expect((await enrollmentRows(db)).map((r) => r.id)).toEqual(['e1']);
      expect((await historyRows(db)).map((r) => r.id)).toEqual(['h1']);
      const failed1 = await failures(db);
      expect(failed1.map((f) => `${f.collection}:${f.entity_id}`)).toEqual([
        'enrollments:e_bad',
        'enrollmentStatusHistory:h_bad'
      ]);
      expect(failed1[0]!.details.message).toMatch(/enrollments_group_tenant_fk/);

      // 2. Завершение: completed_at и вторая запись истории с причиной; дубль пары — отказ поимённо.
      const second = new InMemoryMvpState();
      await backend.loadIntoState(T, second);
      const e1 = second.enrollments.find((e) => e.id === 'e1')!;
      e1.status = 'completed';
      e1.completedAt = '2026-09-10T10:00:00.000Z';
      second.enrollmentStatusHistory.push({
        id: 'h2',
        tenantId: T,
        enrollmentId: 'e1',
        status: 'completed',
        changedAt: '2026-09-10T10:00:00.000Z',
        reason: 'экзамен сдан'
      } as never);
      second.enrollments.push({
        id: 'e_dup',
        tenantId: T,
        ...AT,
        groupId: 'g1',
        learnerId: 'l1',
        status: 'pending',
        enrolledAt: AT.createdAt
      } as never);
      await backend.saveFromState(T, second);

      const rows2 = await enrollmentRows(db);
      expect(rows2.map((r) => r.id)).toEqual(['e1']);
      expect(rows2[0]!.status).toBe('completed');
      expect(rows2[0]!.completed_at).not.toBeNull();
      expect((await historyRows(db)).map((r) => [r.id, r.status, r.reason])).toEqual([
        ['h1', 'pending', null],
        ['h2', 'completed', 'экзамен сдан']
      ]);
      const failed2 = await failures(db);
      expect(failed2.map((f) => f.entity_id)).toContain('e_dup');
      expect(failed2.find((f) => f.entity_id === 'e_dup')!.details.message).toMatch(
        /enrollments_group_learner_uniq|tenant_group_learner_uniq/
      );

      // 3. Удаление зачисления из снимка: сначала уходит его история, потом оно само.
      const third = new InMemoryMvpState();
      await backend.loadIntoState(T, third);
      third.enrollments.splice(
        third.enrollments.findIndex((e) => e.id === 'e1'),
        1
      );
      third.enrollmentStatusHistory.splice(0, third.enrollmentStatusHistory.length);
      await backend.saveFromState(T, third);

      expect(await enrollmentRows(db)).toEqual([]);
      expect(await historyRows(db)).toEqual([]);
    });
  }, 240_000);
});

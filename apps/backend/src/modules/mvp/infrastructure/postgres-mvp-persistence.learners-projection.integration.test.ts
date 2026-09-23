import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { InMemoryMvpState } from './in-memory-mvp.state.js';
import { PostgresMvpPersistenceBackend } from './postgres-mvp-persistence.backend.js';
import {
  decryptLearnerPiiAtRest,
  snilsBlindIndex
} from '../../../infrastructure/crypto/pii-crypto.js';
import { isDockerAvailable, stopTestDb, withTestDb } from '../../../testing/with-test-db.js';

import type { DatabaseService } from '../../../infrastructure/database/database.service.js';

/**
 * Проекция слушателей при сохранении снимка — на НАСТОЯЩЕЙ базе после всей цепочки миграций
 * (Фаза 1, срез 2a). Что доказывается только так: в таблице нет открытых ПДн, а шифртекст
 * расшифровывается тем же ключом; учётная запись пишется только существующая, а два слушателя
 * на одну учётную запись — отказ поимённо без отката снимка (`learners_tenant_user_uniq_idx`,
 * 0110); стирание по 152-ФЗ обнуляет колонки ПДн; полный upsert двух тысяч слушателей — секунды.
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
const T = 't_learners_projection';
const AT = { createdAt: '2026-09-01T10:00:00.000Z', updatedAt: '2026-09-02T10:00:00.000Z' };
const SNILS = '112-233-445 95';

type Db = Pick<DatabaseService, 'query' | 'withTransaction'>;
type LearnerRow = Record<string, unknown>;

const rowOf = async (db: Db, id: string): Promise<LearnerRow | undefined> =>
  (
    await db.query<LearnerRow>(
      `select id, first_name, last_name, snils, email, phone, birth_date, date_of_birth, snils_enc, snils_hash,
              email_enc, phone_enc, birth_date_enc, user_id, status, payload
         from learning.learners where tenant_id = $1 and id = $2`,
      [T, id]
    )
  )[0];

const failures = async (db: Db) =>
  db.query<{ entity_id: string | null; details: { message: string } }>(
    `select entity_id, details from learning.mvp_reconciliation_log
      where tenant_id = $1 and issue_type = 'projection_failed' and collection = 'learners' order by id`,
    [T]
  );

describe.skipIf(!dockerAvailable)('проекция слушателей на живой базе (Фаза 1, срез 2a)', () => {
  it('ПДн только шифртекстом, учётная запись по контексту, отказ поимённо, стирание, полный upsert', async () => {
    await withTestDb(TEST_DB, async (db) => {
      await db.query(
        `insert into core.tenants (id, code, name, status) values ($1, $1, $1, 'active') on conflict (id) do nothing`,
        [T]
      );
      await db.query(
        `insert into iam.users (id, tenant_id, login, password_hash, status, display_name)
         values ('u1', $1, 'u1', 'x', 'active', 'Пользователь 1')`,
        [T]
      );
      const backend = new PostgresMvpPersistenceBackend(db as DatabaseService);

      // 1. Открытый СНИЛС в памяти → шифртекст и слепой индекс в таблице; учётная запись u1 есть.
      const first = new InMemoryMvpState();
      await backend.loadIntoState(T, first);
      first.learners.push(
        {
          id: 'l1',
          tenantId: T,
          ...AT,
          firstName: 'Иван',
          lastName: 'Иванов',
          snils: SNILS,
          email: 'ivan@example.com',
          phone: '+7 900 000-00-00',
          dateOfBirth: '1990-01-01',
          linkedIamUserId: 'u1',
          status: 'active'
        } as never,
        {
          id: 'l2',
          tenantId: T,
          ...AT,
          firstName: 'Пётр',
          lastName: 'Петров',
          linkedIamUserId: 'u_missing',
          status: 'active'
        } as never
      );
      await backend.saveFromState(T, first);

      const l1 = (await rowOf(db, 'l1'))!;
      expect(l1).toMatchObject({
        snils: null,
        email: null,
        phone: null,
        birth_date: null,
        date_of_birth: null,
        user_id: 'u1'
      });
      expect(String(l1.snils_enc)).toMatch(/^enc:/);
      expect(l1.snils_hash).toBe(snilsBlindIndex(SNILS));
      const decrypted = decryptLearnerPiiAtRest({
        snils: l1.snils_enc,
        email: l1.email_enc,
        phone: l1.phone_enc,
        dateOfBirth: l1.birth_date_enc
      }) as Record<string, unknown>;
      expect(decrypted).toEqual({
        snils: SNILS,
        email: 'ivan@example.com',
        phone: '+7 900 000-00-00',
        dateOfBirth: '1990-01-01'
      });
      const l2 = (await rowOf(db, 'l2'))!;
      expect(l2.user_id).toBeNull();
      expect((l2.payload as Record<string, unknown>).linkedIamUserId).toBe('u_missing');

      // 2. Второй слушатель на ту же учётную запись — отказ поимённо, снимок сохранён.
      const second = new InMemoryMvpState();
      await backend.loadIntoState(T, second);
      expect(second.learners.find((l) => l.id === 'l1')!.snils).toBe(SNILS);
      second.learners.push({
        id: 'l3',
        tenantId: T,
        ...AT,
        firstName: 'Анна',
        lastName: 'Сидорова',
        linkedIamUserId: 'u1',
        status: 'active'
      } as never);
      await backend.saveFromState(T, second);

      const snapshotIds = await db.query<{ id: string }>(
        `select id from learning.mvp_runtime_documents where tenant_id = $1 and collection = 'learners' order by id`,
        [T]
      );
      expect(snapshotIds.map((r) => r.id)).toEqual(['l1', 'l2', 'l3']);
      expect(await rowOf(db, 'l3')).toBeUndefined();
      const failed = await failures(db);
      expect(failed.map((f) => f.entity_id)).toEqual(['l3']);
      expect(failed[0]!.details.message).toMatch(/learners_tenant_user_uniq_idx/);

      // 3. Стирание ПДн по 152-ФЗ (как learner-pii.service: Object.assign в состоянии).
      const third = new InMemoryMvpState();
      await backend.loadIntoState(T, third);
      Object.assign(third.learners.find((l) => l.id === 'l1')!, {
        firstName: 'Удалено',
        lastName: 'Удалено',
        middleName: undefined,
        snils: undefined,
        email: undefined,
        phone: undefined,
        dateOfBirth: undefined,
        linkedIamUserId: undefined
      });
      await backend.saveFromState(T, third);

      const erased = (await rowOf(db, 'l1'))!;
      expect(erased).toMatchObject({
        first_name: 'Удалено',
        snils_enc: null,
        snils_hash: null,
        email_enc: null,
        phone_enc: null,
        birth_date_enc: null,
        user_id: null
      });

      // 4. Присвоение коллекции целиком (как markDirty): 2 000 слушателей — полный upsert за секунды.
      const fourth = new InMemoryMvpState();
      await backend.loadIntoState(T, fourth);
      fourth.learners = Array.from({ length: 2000 }, (_, i) => ({
        id: `bulk_${i}`,
        tenantId: T,
        ...AT,
        firstName: `Имя${i}`,
        lastName: `Фамилия${i}`,
        snils: `${String(100000000 + i).slice(0, 9)}00`,
        status: 'active'
      })) as never;
      const started = Date.now();
      await backend.saveFromState(T, fourth);
      const seconds = (Date.now() - started) / 1000;
      const [{ n }] = await db.query<{ n: string }>(
        `select count(*)::text as n from learning.learners where tenant_id = $1`,
        [T]
      );
      expect(Number(n)).toBe(2000);
      expect(seconds).toBeLessThan(30);
    });
  }, 240_000);
});

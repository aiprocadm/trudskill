import { describe, expect, it } from 'vitest';

import { PostgresWebinarsRepository } from './postgres-webinars.repository.js';

import type { WebinarRow } from './in-memory-webinars.state.js';
import type { DatabaseService } from '../../infrastructure/database/database.service.js';

/**
 * Маппинг `communication.webinars` / `webinar_participants` (покрытие 0% → полное):
 * пагинация с total через window-функцию, направление сортировки НЕ из
 * пользовательской строки, upsert посещаемости по вебхуку провайдера.
 */
type Call = { sql: string; params: unknown[] };
function fakeDb(routes: Array<{ match: string; rows: unknown[] }>) {
  const calls: Call[] = [];
  const db = {
    query: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      const route = routes.find((r) => sql.includes(r.match));
      return route ? route.rows : [];
    }
  } as unknown as DatabaseService;
  return { db, calls };
}

const webinarRow = {
  id: 'w1',
  tenant_id: 't1',
  group_id: null,
  course_id: 'c1',
  title: 'Вводный вебинар',
  description: null,
  provider_code: 'jitsi',
  provider_session_id: 'sess1',
  planned_start_at: 's',
  planned_end_at: 'e',
  join_url: null,
  host_url: null,
  status: 'scheduled',
  created_by: 'u1',
  created_at: 'c',
  updated_at: 'u',
  total_count: '7'
};

const webinar: WebinarRow = {
  id: 'w1',
  tenantId: 't1',
  title: 'Вводный вебинар',
  plannedStartAt: 's',
  plannedEndAt: 'e',
  status: 'scheduled',
  createdBy: 'u1',
  createdAt: 'c',
  updatedAt: 'u'
};

describe('PostgresWebinarsRepository — маппинг и параметры', () => {
  it('list: total берётся из window-функции, null → отсутствующее поле', async () => {
    const { db, calls } = fakeDb([{ match: 'from communication.webinars', rows: [webinarRow] }]);
    const page = await new PostgresWebinarsRepository(db).list('t1', { page: 2, pageSize: 5 });

    expect(page.total).toBe(7);
    expect(page.items[0]).toMatchObject({ courseId: 'c1', providerCode: 'jitsi' });
    expect(page.items[0]!.groupId).toBeUndefined();
    // Пагинация: страница 2 по 5 → offset 5.
    expect(calls[0]!.params).toEqual(['t1', null, 5, 5]);
  });

  it('list: сортировка НЕ подставляется из пользовательской строки', async () => {
    // В SQL попадают ровно два фиксированных варианта — защита от инъекции через sort.
    const { db, calls } = fakeDb([{ match: 'webinars', rows: [] }]);
    const repo = new PostgresWebinarsRepository(db);
    await repo.list('t1', { sort: 'updatedAt:asc' });
    await repo.list('t1', { sort: "updatedAt'; drop table x; --" as never });

    expect(calls[0]!.sql).toContain('order by updated_at asc');
    expect(calls[1]!.sql).toContain('order by updated_at desc');
    expect(calls[1]!.sql).not.toContain('drop table');
  });

  it('list: пустой результат → total 0, а не NaN', async () => {
    const { db } = fakeDb([]);
    const page = await new PostgresWebinarsRepository(db).list('t1');
    expect(page).toEqual({ items: [], total: 0 });
  });

  it('create: необязательные поля уходят как null', async () => {
    const { db, calls } = fakeDb([]);
    await new PostgresWebinarsRepository(db).create(webinar);
    const params = calls[0]!.params;
    expect(params[2]).toBeNull(); // group_id
    expect(params[5]).toBeNull(); // description
  });

  it('patch: несуществующий вебинар → null без update-запроса', async () => {
    const { db, calls } = fakeDb([]);
    const out = await new PostgresWebinarsRepository(db).patch('t1', 'nope', { title: 'X' });
    expect(out).toBeNull();
    expect(calls.some((c) => c.sql.includes('update'))).toBe(false);
  });

  it('patch: слияние поверх текущей строки, where по tenant+id', async () => {
    const { db, calls } = fakeDb([
      { match: 'select * from communication.webinars', rows: [webinarRow] }
    ]);
    const out = await new PostgresWebinarsRepository(db).patch('t1', 'w1', { title: 'Новый' });
    expect(out!.title).toBe('Новый');
    const upd = calls.find((c) => c.sql.includes('update communication.webinars'))!;
    expect(upd.sql).toContain('where tenant_id = $11 and id = $12');
  });

  it('listParticipants: null-поля участника не попадают в сущность', async () => {
    const { db } = fakeDb([
      {
        match: 'from communication.webinar_participants',
        rows: [
          {
            webinar_id: 'w1',
            tenant_id: 't1',
            user_id: null,
            learner_id: 'l1',
            role_code: 'attendee',
            attendance_status: 'joined',
            joined_at: 'j',
            left_at: null,
            duration_seconds: null,
            total_count: '1'
          }
        ]
      }
    ]);
    const page = await new PostgresWebinarsRepository(db).listParticipants('t1', 'w1');
    expect(page.items[0]).toMatchObject({ learnerId: 'l1', joinedAt: 'j' });
    expect(page.items[0]!.userId).toBeUndefined();
    expect(page.items[0]!.durationSeconds).toBeUndefined();
  });

  it('upsertParticipantAttendance: существующий участник обновляется, новый — вставляется', async () => {
    // Вебхук провайдера может прийти раньше, чем участник заведён вручную.
    const { db: withExisting, calls: c1 } = fakeDb([
      { match: 'select id from communication.webinar_participants', rows: [{ id: 'wp_1' }] }
    ]);
    await new PostgresWebinarsRepository(withExisting).upsertParticipantAttendance('t1', 'w1', {
      participantRef: 'l1',
      attendanceStatus: 'joined'
    });
    expect(c1.some((c) => c.sql.includes('update communication.webinar_participants'))).toBe(true);

    const { db: empty, calls: c2 } = fakeDb([]);
    await new PostgresWebinarsRepository(empty).upsertParticipantAttendance('t1', 'w1', {
      participantRef: 'l1',
      attendanceStatus: 'joined'
    });
    const insert = c2.find((c) =>
      c.sql.includes('insert into communication.webinar_participants')
    )!;
    expect(insert.sql).toContain("'attendee'");
  });

  it('findByProviderSessionId: вебхук ищет по идентификатору провайдера без тенанта', async () => {
    // Вебхук снаружи не знает наших тенантов — это единственный запрос без tenant_id.
    const { db, calls } = fakeDb([{ match: 'provider_session_id', rows: [webinarRow] }]);
    const found = await new PostgresWebinarsRepository(db).findByProviderSessionId('sess1');
    expect(found!.tenantId).toBe('t1');
    expect(calls[0]!.params).toEqual(['sess1']);
  });
});

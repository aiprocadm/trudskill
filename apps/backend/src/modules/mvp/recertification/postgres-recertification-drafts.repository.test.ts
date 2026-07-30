import { describe, expect, it } from 'vitest';

import { PostgresRecertificationDraftsRepository } from './postgres-recertification-drafts.repository.js';

import type { DatabaseService } from '../../../infrastructure/database/database.service.js';

/**
 * Маппинг `learning.recertification_drafts` (покрытие 0% → полное). Главное —
 * идемпотентность создания: сканер переобучения ходит кроном, и повторный проход
 * не должен плодить второй черновик на ту же пару (слушатель, документ).
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

const row = {
  id: 'recert_1',
  tenant_id: 't1',
  learner_id: 'l1',
  source_document_id: 'gd_1',
  course_version_id: 'cv_1',
  valid_until: '2026-12-31',
  status: 'pending',
  resulting_enrollment_id: null,
  reason: null,
  decided_at: null,
  decided_by: null,
  created_at: 'c',
  updated_at: 'u'
};

const seed = {
  tenantId: 't1',
  learnerId: 'l1',
  sourceDocumentId: 'gd_1',
  courseVersionId: 'cv_1',
  validUntil: '2026-12-31'
};

describe('PostgresRecertificationDraftsRepository — маппинг и параметры', () => {
  it('create: новый черновик → created=true', async () => {
    const { db, calls } = fakeDb([{ match: 'insert into', rows: [row] }]);
    const out = await new PostgresRecertificationDraftsRepository(db).create(seed);

    expect(out.created).toBe(true);
    expect(out.row).toMatchObject({ status: 'pending', validUntil: '2026-12-31' });
    expect(calls[0]!.sql).toContain('on conflict (tenant_id, learner_id, source_document_id)');
  });

  it('create: конфликт по кроновому повтору → created=false и СУЩЕСТВУЮЩИЙ черновик', async () => {
    // insert … do nothing вернул пусто — берём уже созданный, а не плодим дубль.
    const { db } = fakeDb([
      { match: 'insert into', rows: [] },
      { match: 'select * from learning.recertification_drafts', rows: [row] }
    ]);
    const out = await new PostgresRecertificationDraftsRepository(db).create(seed);

    expect(out.created).toBe(false);
    expect(out.row.id).toBe('recert_1');
  });

  it('list: сортировка по сроку — истекающие первыми; статус опционален', async () => {
    const { db, calls } = fakeDb([]);
    const repo = new PostgresRecertificationDraftsRepository(db);
    await repo.list('t1', {});
    await repo.list('t1', { status: 'pending' });

    expect(calls[0]!.sql).toContain('order by valid_until asc');
    expect(calls[0]!.sql).not.toContain('status = $2');
    expect(calls[1]!.sql).toContain('status = $2');
  });

  it('markApproved: пишет зачисление и решившего, null-поля не попадают в сущность', async () => {
    const approved = {
      ...row,
      status: 'approved',
      resulting_enrollment_id: 'enr_9',
      decided_at: 'd',
      decided_by: 'u_mgr'
    };
    const { db, calls } = fakeDb([{ match: "status = 'approved'", rows: [approved] }]);
    const out = await new PostgresRecertificationDraftsRepository(db).markApproved(
      't1',
      'recert_1',
      'enr_9',
      'u_mgr'
    );

    expect(out).toMatchObject({ resultingEnrollmentId: 'enr_9', decidedBy: 'u_mgr' });
    expect(calls[0]!.params).toEqual(['t1', 'recert_1', 'enr_9', 'u_mgr']);
  });

  it('markRejected: причина опциональна и уходит как null', async () => {
    const { db, calls } = fakeDb([
      { match: "status = 'rejected'", rows: [{ ...row, status: 'rejected' }] }
    ]);
    await new PostgresRecertificationDraftsRepository(db).markRejected('t1', 'recert_1', undefined);
    expect(calls[0]!.params[2]).toBeNull();
  });

  it('getById / markApproved на несуществующем → null', async () => {
    const { db } = fakeDb([]);
    const repo = new PostgresRecertificationDraftsRepository(db);
    await expect(repo.getById('t1', 'x')).resolves.toBeNull();
    await expect(repo.markApproved('t1', 'x', 'enr_1')).resolves.toBeNull();
  });

  it('pending-черновик без решения: полей решения нет в сущности', async () => {
    const { db } = fakeDb([{ match: 'where tenant_id = $1 and id = $2', rows: [row] }]);
    const draft = await new PostgresRecertificationDraftsRepository(db).getById('t1', 'recert_1');
    expect(draft).not.toHaveProperty('decidedAt');
    expect(draft).not.toHaveProperty('decidedBy');
    expect(draft).not.toHaveProperty('reason');
    expect(draft).not.toHaveProperty('resultingEnrollmentId');
  });
});

import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { TenantStaffLimitService } from './tenant-staff-limit.service.js';

import type { DatabaseService } from '../database/database.service.js';

/**
 * Лимит сотрудников из тарифа (журнал 306).
 *
 * Тариф объявлял `staff_limit`, экран использования его показывал — и не соблюдал никто:
 * центр с тарифом «10 сотрудников» заводил пятьдесят, а экран показывал «50 из 10» как
 * свершившийся факт. У слушателей такой гейт есть с самого начала.
 */

/** База-двойник: первый запрос — тариф, второй — счёт сотрудников. */
function makeDb(plan: unknown[], staffCount: number) {
  const query = vi.fn(async (sql: string) =>
    sql.includes('core.plans') ? plan : [{ count: staffCount }]
  );
  return { db: { query } as unknown as DatabaseService, query };
}

describe('лимит сотрудников', () => {
  it('под лимитом — пропускает', async () => {
    const { db } = makeDb([{ staffLimit: 10, name: 'Базовый' }], 9);
    await expect(new TenantStaffLimitService(db).assertCanAddStaff('t1')).resolves.toBeUndefined();
  });

  it('на границе — не пускает: лимит «10» значит десять, а не одиннадцать', async () => {
    const { db } = makeDb([{ staffLimit: 10, name: 'Базовый' }], 10);
    await expect(new TenantStaffLimitService(db).assertCanAddStaff('t1')).rejects.toBeInstanceOf(
      ConflictException
    );
  });

  it('ошибка называет тариф и числа, а не просто «нельзя»', async () => {
    const { db } = makeDb([{ staffLimit: 3, name: 'Базовый' }], 5);
    const error = await new TenantStaffLimitService(db)
      .assertCanAddStaff('t1')
      .catch((err: ConflictException) => err);
    const body = (error as ConflictException).getResponse() as { code: string; message: string };

    expect(body.code).toBe('staff_limit_reached');
    expect(body.message).toContain('Базовый');
    expect(body.message).toContain('5 из 3');
    // Правило продукта: сказать не только «нельзя», но и что при этом продолжает работать.
    expect(body.message).toContain('продолжают работать');
  });

  it('нет тарифа — безлимит, как и в отчёте использования', async () => {
    const { db } = makeDb([], 1000);
    await expect(new TenantStaffLimitService(db).assertCanAddStaff('t1')).resolves.toBeUndefined();
  });

  it('статья не ограничена — безлимит', async () => {
    const { db } = makeDb([{ staffLimit: null, name: 'Безлимитный' }], 1000);
    await expect(new TenantStaffLimitService(db).assertCanAddStaff('t1')).resolves.toBeUndefined();
  });

  it('лимит, пришедший СТРОКОЙ, понимается как число', async () => {
    // pg отдаёт bigint строкой — на этом уже обжигались при разборе тарифов платформы.
    const { db } = makeDb([{ staffLimit: '2', name: 'Базовый' }], 2);
    await expect(new TenantStaffLimitService(db).assertCanAddStaff('t1')).rejects.toBeInstanceOf(
      ConflictException
    );
  });

  it('без базы молчит: гейт, который не может посчитать, не имеет права запрещать', async () => {
    await expect(new TenantStaffLimitService().assertCanAddStaff('t1')).resolves.toBeUndefined();
  });

  it('считает только НЕ-слушательские роли — слушатели лимита не занимают', async () => {
    const { db, query } = makeDb([{ staffLimit: 10, name: 'Базовый' }], 1);
    await new TenantStaffLimitService(db).assertCanAddStaff('t1');

    const countSql = query.mock.calls.map(([sql]) => sql).find((sql) => sql.includes('iam.users'));
    expect(countSql).toContain("r.code not in ('learner', 'counterparty_rep')");
    expect(countSql).toContain("u.status = 'active'");
  });
});

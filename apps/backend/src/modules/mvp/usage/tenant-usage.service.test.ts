import 'reflect-metadata';
import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { TenantUsageService } from './tenant-usage.service.js';

const makePlan = (overrides: Record<string, unknown> = {}) => ({
  id: 'plan_basic',
  code: 'basic',
  name: 'Базовый',
  activeLearnersLimit: 100,
  staffLimit: 10,
  storageLimitBytes: 50 * 1024 ** 3,
  features: { scorm: true },
  ...overrides
});

function make({
  plan = null as unknown,
  learners = 0,
  staff = 0,
  storage = {
    usedBytes: 0,
    limitBytes: null as number | null,
    remainingBytes: null as number | null
  }
} = {}) {
  const db = {
    query: vi.fn(async (sql: string) => {
      if (sql.includes('learning.enrollments')) return [{ count: learners }];
      if (sql.includes('iam.users')) return [{ count: staff }];
      throw new Error(`unexpected sql: ${sql}`);
    })
  };
  const plans = { getActivePlan: vi.fn().mockResolvedValue(plan) };
  const storageService = { getUsage: vi.fn().mockResolvedValue(storage) };
  const service = new TenantUsageService(db as never, plans as never, storageService as never);
  return { service, db, plans };
}

describe('TenantUsageService (ФТ-D4)', () => {
  it('без тарифа: счётчики есть, лимиты null, хранилище берёт прежний ручной лимит', async () => {
    const { service } = make({
      learners: 7,
      staff: 3,
      storage: { usedBytes: 100, limitBytes: 500, remainingBytes: 400 }
    });
    const usage = await service.getUsage('t1');
    expect(usage.plan).toBeNull();
    expect(usage.activeLearners).toEqual({ used: 7, limit: null });
    expect(usage.staff).toEqual({ used: 3, limit: null });
    expect(usage.storage).toEqual({ usedBytes: 100, limitBytes: 500 });
  });

  it('с тарифом: лимиты из тарифа; лимит хранилища тарифа главнее ручного', async () => {
    const { service } = make({
      plan: makePlan(),
      learners: 80,
      staff: 5,
      storage: { usedBytes: 100, limitBytes: 500, remainingBytes: 400 }
    });
    const usage = await service.getUsage('t1');
    expect(usage.plan).toEqual({ code: 'basic', name: 'Базовый', features: { scorm: true } });
    expect(usage.activeLearners).toEqual({ used: 80, limit: 100 });
    expect(usage.staff).toEqual({ used: 5, limit: 10 });
    expect(usage.storage.limitBytes).toBe(50 * 1024 ** 3);
  });

  it('assertCanAddLearners: без тарифа или без лимита — пропускает без запроса счётчика', async () => {
    const noPlan = make({ plan: null });
    await expect(noPlan.service.assertCanAddLearners('t1')).resolves.toBeUndefined();
    expect(noPlan.db.query).not.toHaveBeenCalled();

    const unlimited = make({ plan: makePlan({ activeLearnersLimit: null }) });
    await expect(unlimited.service.assertCanAddLearners('t1')).resolves.toBeUndefined();
  });

  it('assertCanAddLearners: под лимитом — пропускает, на лимите — 409 learner_limit_reached', async () => {
    const under = make({ plan: makePlan({ activeLearnersLimit: 100 }), learners: 99 });
    await expect(under.service.assertCanAddLearners('t1')).resolves.toBeUndefined();

    const at = make({ plan: makePlan({ activeLearnersLimit: 100 }), learners: 100 });
    await expect(at.service.assertCanAddLearners('t1')).rejects.toMatchObject({
      constructor: ConflictException,
      response: { code: 'learner_limit_reached' }
    });
  });

  it('формула активных слушателей: незавершённые + завершившие в текущем месяце', async () => {
    const { service, db } = make({ plan: makePlan(), learners: 1 });
    await service.assertCanAddLearners('t1');
    const sql = db.query.mock.calls[0]![0] as string;
    expect(sql).toContain("e.status in ('pending', 'active')");
    expect(sql).toContain(
      "e.status = 'completed' and e.completed_at >= date_trunc('month', now())"
    );
  });

  it('сотрудники: активные пользователи с НЕ-слушательской ролью', async () => {
    const { service, db } = make({ staff: 4 });
    const usage = await service.getUsage('t1');
    expect(usage.staff.used).toBe(4);
    const staffSql = db.query.mock.calls.find((call) =>
      (call[0] as string).includes('iam.users')
    )![0] as string;
    expect(staffSql).toContain("r.code <> 'learner'");
    expect(staffSql).toContain("u.status = 'active'");
  });
});

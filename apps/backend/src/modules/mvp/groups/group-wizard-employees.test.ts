import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_GROUP_CREATION_SETTINGS } from './group-defaults.js';
import { GroupWizardService } from './group-wizard.service.js';
import { TenantScopedRepository } from '../../../infrastructure/database/tenant-repository.js';
import { AuditService } from '../../audit/audit.service.js';
import { CounterpartyPeopleService } from '../counterparty-people/counterparty-people.service.js';
import { InMemoryCounterpartyPeopleRepository } from '../counterparty-people/in-memory-counterparty-people.repository.js';
import { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';
import { MvpService } from '../mvp.service.js';

import type { GroupWizardRequest } from './group-wizard.dto.js';
import type { RequestContext } from '../../../common/context/request-context.js';

/**
 * Мастер группы «из сотрудников компании» (МГ-D2.1, срез 14.4, РМ120): сотрудник без слушателя
 * становится слушателем, найденный по почте — переиспользуется, связь пишется в обе стороны;
 * уволенный, чужой и группа без компании — отказ строкой, группа создаётся всё равно.
 */
const T = 'tenant_demo';
const ctx = {
  requestId: 'r',
  correlationId: 'c',
  tenantId: T,
  userId: 'u_curator'
} as RequestContext;

async function setup() {
  const state = new InMemoryMvpState();
  const audit = { write: vi.fn() };
  const mvp = new MvpService(
    state,
    new TenantScopedRepository(),
    audit as never,
    { listDocuments: () => ({ items: [], page: 1, pageSize: 50, total: 0 }) } as never,
    {} as never,
    { emit: vi.fn() } as never
  );
  const course = mvp.createCourse(T, ctx.userId, { code: 'OT-1', title: 'Охрана труда' }, ctx);
  const company = mvp.createCounterpartyExtended(
    T,
    ctx.userId,
    { code: 'ROM', name: 'Ромашка' },
    ctx
  );
  const existing = mvp.createLearnerExtended(
    T,
    ctx.userId,
    { firstName: 'Пётр', lastName: 'Петров', email: 'petr@romashka.ru' },
    ctx
  );
  const repo = new InMemoryCounterpartyPeopleRepository();
  const people = new CounterpartyPeopleService(state, repo, new AuditService());
  const wizard = new GroupWizardService(mvp, audit as never, people);
  const fresh = await people.createEmployee(
    T,
    company.id,
    { lastName: 'Иванов', firstName: 'Иван', email: 'ivan@romashka.ru', position: 'Электромонтёр' },
    ctx
  );
  const byEmail = await people.createEmployee(
    T,
    company.id,
    { lastName: 'Петров', firstName: 'Пётр', email: 'petr@romashka.ru' },
    ctx
  );
  const gone = await people.createEmployee(
    T,
    company.id,
    { lastName: 'Орлов', firstName: 'Олег' },
    ctx
  );
  await people.updateEmployee(T, company.id, gone.id, { status: 'dismissed' }, ctx);
  return { state, mvp, wizard, repo, course, company, existing, fresh, byEmail, gone };
}

const request = (
  courseId: string,
  counterpartyId: string | undefined,
  employeeIds: string[],
  key = 'wiz-emp-1'
): GroupWizardRequest =>
  ({
    idempotencyKey: key,
    group: {
      name: 'Группа из сотрудников',
      startDate: '2099-01-10',
      ...(counterpartyId ? { counterpartyId } : {})
    },
    courses: [{ courseId }],
    learners: { employeeIds },
    access: { mode: 'later' }
  }) as GroupWizardRequest;

describe('мастер группы «из сотрудников компании» (МГ-D2.1, срез 14.4)', () => {
  it('новый — слушатель со связью, по почте — переиспользован, уволенный и чужой — отказ строкой', async () => {
    const env = await setup();
    const out = await env.wizard.complete(
      T,
      ctx.userId,
      request(env.course.id, env.company.id, [
        env.fresh.id,
        env.byEmail.id,
        env.gone.id,
        'ce_ghost'
      ]),
      ctx,
      DEFAULT_GROUP_CREATION_SETTINGS
    );
    const byEmployee = new Map(out.enrollments.rows.map((row) => [row.employeeId, row]));

    const created = byEmployee.get(env.fresh.id)!;
    expect(created).toMatchObject({ status: 'created', rowNumber: 0 });
    expect(created.enrollmentId).toBeTruthy();
    const learner = env.state.learners.find((l) => l.id === created.learnerId)!;
    expect(learner).toMatchObject({
      firstName: 'Иван',
      lastName: 'Иванов',
      counterpartyId: env.company.id,
      counterpartyEmployeeId: env.fresh.id
    });
    expect((await env.repo.getEmployee(T, env.company.id, env.fresh.id))?.learnerId).toBe(
      learner.id
    );

    expect(byEmployee.get(env.byEmail.id)).toMatchObject({
      status: 'reused',
      learnerId: env.existing.id
    });
    expect(env.state.learners.find((l) => l.id === env.existing.id)?.counterpartyEmployeeId).toBe(
      env.byEmail.id
    );

    expect(byEmployee.get(env.gone.id)).toMatchObject({
      status: 'failed',
      errorCode: 'employee_not_active'
    });
    expect(byEmployee.get('ce_ghost')).toMatchObject({
      status: 'failed',
      errorCode: 'employee_not_found'
    });
    expect(out.enrollments).toMatchObject({ total: 4, created: 1, reused: 1, failed: 2 });
  });

  it('повторный выбор того же сотрудника — тот же слушатель, второй не заводится', async () => {
    const env = await setup();
    await env.wizard.complete(
      T,
      ctx.userId,
      request(env.course.id, env.company.id, [env.fresh.id]),
      ctx,
      DEFAULT_GROUP_CREATION_SETTINGS
    );
    const before = env.state.learners.length;
    const again = await env.wizard.complete(
      T,
      ctx.userId,
      request(env.course.id, env.company.id, [env.fresh.id], 'wiz-emp-2'),
      ctx,
      DEFAULT_GROUP_CREATION_SETTINGS
    );
    expect(env.state.learners.length).toBe(before);
    expect(again.enrollments.rows[0]).toMatchObject({ status: 'reused', employeeId: env.fresh.id });
  });

  it('у группы нет компании — сотрудники отказом строкой, группа всё равно создана', async () => {
    const env = await setup();
    const out = await env.wizard.complete(
      T,
      ctx.userId,
      request(env.course.id, undefined, [env.fresh.id]),
      ctx,
      DEFAULT_GROUP_CREATION_SETTINGS
    );
    expect(out.group.id).toBeTruthy();
    expect(out.enrollments.rows).toEqual([
      expect.objectContaining({
        employeeId: env.fresh.id,
        status: 'failed',
        errorCode: 'wizard_employees_need_counterparty'
      })
    ]);
  });
});

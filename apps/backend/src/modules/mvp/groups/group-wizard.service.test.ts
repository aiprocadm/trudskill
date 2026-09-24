import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_GROUP_CREATION_SETTINGS } from './group-defaults.js';
import { GroupWizardService } from './group-wizard.service.js';
import { TenantScopedRepository } from '../../../infrastructure/database/tenant-repository.js';
import { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';
import { MvpService } from '../mvp.service.js';

import type { GroupWizardRequest } from './group-wizard.dto.js';
import type { RequestContext } from '../../../common/context/request-context.js';

/**
 * Мастер группы (МГ-B2): одна транзакция снимка, группа создаётся всегда, слушатели — с
 * частичным успехом, статус — по дате начала (РМ49), письма — только при `email` (РМ50),
 * повтор ключа — прежний результат.
 */
const T = 'tenant_demo';
const ctx = {
  requestId: 'r',
  correlationId: 'c',
  tenantId: T,
  userId: 'u_curator'
} as RequestContext;

function setup() {
  const state = new InMemoryMvpState();
  const audit = { write: vi.fn() };
  const events = { emit: vi.fn() };
  const mvp = new MvpService(
    state,
    new TenantScopedRepository(),
    audit as never,
    { listDocuments: () => ({ items: [], page: 1, pageSize: 50, total: 0 }) } as never,
    {} as never,
    events as never
  );
  const course = mvp.createCourse(T, ctx.userId, { code: 'OT-1', title: 'Охрана труда' }, ctx);
  const existing = mvp.createLearnerExtended(
    T,
    ctx.userId,
    { firstName: 'Пётр', lastName: 'Петров', snils: '112-233-445 95', email: 'petr@x.ru' },
    ctx
  );
  const wizard = new GroupWizardService(mvp, audit as never);
  return { mvp, wizard, course, existing, events, audit };
}

const baseRequest = (
  courseId: string,
  extra: Partial<GroupWizardRequest> = {}
): GroupWizardRequest =>
  ({
    idempotencyKey: 'wiz-1',
    group: { name: 'Группа мастера', startDate: '2099-01-10' },
    courses: [{ courseId }],
    learners: {
      rows: [
        { rowNumber: 1, fullName: 'Иванов Иван Иванович', email: 'ivan@x.ru' },
        { rowNumber: 2, fullName: 'Петров Пётр', snils: '112-233-445 95' },
        { rowNumber: 3, fullName: 'Сидоров', email: 'sidor@x.ru' }
      ]
    },
    access: { mode: 'email' },
    ...extra
  }) as GroupWizardRequest;

const invitesOf = (events: { emit: ReturnType<typeof vi.fn> }) =>
  events.emit.mock.calls.filter(([name]) => String(name).includes('invited'));

describe('GroupWizardService', () => {
  it('создаёт группу с кодом по шаблону, курсом и слушателями: новый — created, по СНИЛС — reused, плохая строка — failed', async () => {
    const { wizard, course, existing, mvp, audit } = setup();
    const out = await wizard.complete(
      T,
      ctx.userId,
      baseRequest(course.id),
      ctx,
      DEFAULT_GROUP_CREATION_SETTINGS
    );
    expect(out.group.status).toBe('recruiting');
    expect(out.group.code).toMatch(/^\d{6}$/);
    expect(out.coursesAssigned).toBe(1);
    expect(out.enrollments).toMatchObject({ total: 3, created: 1, reused: 1, failed: 1 });
    const byRow = Object.fromEntries(out.enrollments.rows.map((r) => [r.rowNumber, r]));
    expect(byRow[1]).toMatchObject({ status: 'created' });
    expect(byRow[2]).toMatchObject({ status: 'reused', learnerId: existing.id });
    expect(byRow[3]).toMatchObject({ status: 'failed', errorCode: 'fullname_invalid' });
    const enrollments = mvp.listEnrollments(T, { group_id: out.group.id }).items;
    expect(enrollments).toHaveLength(2);
    expect(enrollments.every((e) => e.status === 'active')).toBe(true);
    // письма — обоим зачисленным с почтой: новому Иванову и переиспользованному Петрову
    expect(out.access).toEqual({ mode: 'email', sent: 2, sheetFileId: null, deferred: false });
    expect(audit.write).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'learning.group_wizard_completed', entityId: out.group.id })
    );
  });

  it('начало обучения в прошлом — группа сразу «учатся»; без курсов — 400', async () => {
    const { wizard, course } = setup();
    const out = await wizard.complete(
      T,
      ctx.userId,
      baseRequest(course.id, {
        group: { name: 'Вчера', startDate: '2020-01-01', endDate: '2020-02-01' }
      }),
      ctx,
      DEFAULT_GROUP_CREATION_SETTINGS
    );
    expect(out.group.status).toBe('in_progress');
    await expect(
      wizard.complete(
        T,
        ctx.userId,
        baseRequest(course.id, { idempotencyKey: 'wiz-2', courses: [] }),
        ctx,
        DEFAULT_GROUP_CREATION_SETTINGS
      )
    ).rejects.toThrow(BadRequestException);
  });

  it('доступы «позже» — приглашения не уходят; «email» — событие приглашения на каждого с почтой', async () => {
    const { wizard, course, events } = setup();
    await wizard.complete(
      T,
      ctx.userId,
      baseRequest(course.id, { access: { mode: 'later' } }),
      ctx,
      DEFAULT_GROUP_CREATION_SETTINGS
    );
    expect(invitesOf(events)).toHaveLength(0);
    await wizard.complete(
      T,
      ctx.userId,
      baseRequest(course.id, { idempotencyKey: 'wiz-3', group: { name: 'С письмами' } }),
      ctx,
      DEFAULT_GROUP_CREATION_SETTINGS
    );
    expect(invitesOf(events)).toHaveLength(2);
  });

  it('копия группы (МГ-B6.1): источник пишется в аудит; чужой или несуществующий источник — 404', async () => {
    const { wizard, course, mvp, audit } = setup();
    const source = mvp.createGroup(T, ctx.userId, { name: 'Исходная' }, ctx);
    await wizard.complete(
      T,
      ctx.userId,
      baseRequest(course.id, { idempotencyKey: 'wiz-copy', copyOfGroupId: source.id }),
      ctx,
      DEFAULT_GROUP_CREATION_SETTINGS
    );
    expect(audit.write).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'learning.group_wizard_completed',
        newValues: expect.objectContaining({ copyOfGroupId: source.id })
      })
    );
    await expect(
      wizard.complete(
        T,
        ctx.userId,
        baseRequest(course.id, { idempotencyKey: 'wiz-copy-2', copyOfGroupId: 'grp_missing' }),
        ctx,
        DEFAULT_GROUP_CREATION_SETTINGS
      )
    ).rejects.toThrow(NotFoundException);
    expect(mvp.listGroups(T, {}).total).toBe(2);
  });

  it('повтор с тем же ключом — прежний результат, вторая группа не создаётся; черновик достраивается', async () => {
    const { wizard, course, mvp } = setup();
    const first = await wizard.complete(
      T,
      ctx.userId,
      baseRequest(course.id),
      ctx,
      DEFAULT_GROUP_CREATION_SETTINGS
    );
    const again = await wizard.complete(
      T,
      ctx.userId,
      baseRequest(course.id),
      ctx,
      DEFAULT_GROUP_CREATION_SETTINGS
    );
    expect(again).toBe(first);
    expect(mvp.listGroups(T, {}).total).toBe(1);

    const draft = mvp.createGroup(T, ctx.userId, { name: 'Черновик', comment: 'из шага 1' }, ctx);
    const completed = await wizard.complete(
      T,
      ctx.userId,
      baseRequest(course.id, {
        idempotencyKey: 'wiz-4',
        group: { draftId: draft.id, name: 'Достроена', startDate: '2099-03-01' }
      }),
      ctx,
      DEFAULT_GROUP_CREATION_SETTINGS
    );
    expect(completed.group.id).toBe(draft.id);
    expect(completed.group).toMatchObject({
      name: 'Достроена',
      status: 'recruiting',
      comment: 'из шага 1'
    });
    await expect(
      wizard.complete(
        T,
        ctx.userId,
        baseRequest(course.id, { idempotencyKey: 'wiz-5', group: { draftId: draft.id } }),
        ctx,
        DEFAULT_GROUP_CREATION_SETTINGS
      )
    ).rejects.toThrow(ConflictException);
  });
});

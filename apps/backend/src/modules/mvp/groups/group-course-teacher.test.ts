import { describe, expect, it, vi } from 'vitest';

import { TenantScopedRepository } from '../../../infrastructure/database/tenant-repository.js';
import {
  emptyContext,
  projectEntity,
  rowToEntity
} from '../../migration/backfill/normalized/normalized-projection.js';
import { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';
import { MvpService } from '../mvp.service.js';

import type { RequestContext } from '../../../common/context/request-context.js';

const T = 'tenant_demo';
const ctx = {
  requestId: 'r',
  correlationId: 'c',
  tenantId: T,
  userId: 'u_curator'
} as RequestContext;

describe('преподаватель курса группы (МГ-E4.5, срез 17.1)', () => {
  it('назначается при создании и правке, снимается null; правка — в журнал', () => {
    const audit = { write: vi.fn() };
    const mvp = new MvpService(
      new InMemoryMvpState(),
      new TenantScopedRepository(),
      audit as never,
      { listDocuments: () => ({ items: [], page: 1, pageSize: 50, total: 0 }) } as never,
      {} as never,
      { emit: vi.fn() } as never
    );
    const course = mvp.createCourse(T, ctx.userId, { code: 'R13.Б', title: 'ОТ Б' }, ctx);
    const group = mvp.createGroup(T, ctx.userId, { name: 'Группа' }, ctx);
    const gc = mvp.createGroupCourse(
      T,
      { groupId: group.id, courseId: course.id, teacherUserId: 'u_teacher' },
      ctx.userId,
      ctx
    );
    expect(gc.teacherUserId).toBe('u_teacher');
    mvp.updateGroupCourse(T, ctx.userId, gc.id, { teacherUserId: 'u_teacher_2' }, ctx);
    expect(mvp.getGroupCourse(T, gc.id).teacherUserId).toBe('u_teacher_2');
    mvp.updateGroupCourse(T, ctx.userId, gc.id, { teacherUserId: null }, ctx);
    expect(mvp.getGroupCourse(T, gc.id).teacherUserId).toBeUndefined();
    expect(audit.write).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'learning.group_course_updated', entityId: gc.id })
    );
  });

  it('проекция в learning.group_courses: колонка teacher_user_id (0105) и обратное чтение', () => {
    const entity = {
      id: 'gc1',
      tenantId: T,
      createdAt: '2026-09-24T10:00:00.000Z',
      updatedAt: '2026-09-24T10:00:00.000Z',
      groupId: 'g1',
      courseId: 'c1',
      sortOrder: 0,
      requiresPreExamAuth: false,
      requiresIdentityVerification: false,
      requiresProctoring: false,
      status: 'active',
      teacherUserId: 'u_teacher'
    };
    const context = emptyContext();
    context.groups.set('g1', { counterpartyId: null });
    const row = projectEntity('groupCourses', T, entity, context);
    expect(row.columns.teacher_user_id).toBe('u_teacher');
    expect(row.payload).toEqual({});
    expect(rowToEntity('groupCourses', { ...row.columns, payload: row.payload })).toMatchObject({
      teacherUserId: 'u_teacher'
    });
  });
});

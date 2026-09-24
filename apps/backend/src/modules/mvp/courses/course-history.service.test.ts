import { describe, expect, it, vi } from 'vitest';

import { CourseHistoryService } from './course-history.service.js';
import { TenantScopedRepository } from '../../../infrastructure/database/tenant-repository.js';
import { AuditService } from '../../audit/audit.service.js';
import { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';
import { MvpService } from '../mvp.service.js';

import type { RequestContext } from '../../../common/context/request-context.js';

const T = 'tenant_demo';
const ctx = {
  requestId: 'r',
  correlationId: 'c',
  tenantId: T,
  userId: 'u_methodist'
} as RequestContext;

describe('история курса (МГ-E2.3, срез 16.4)', () => {
  it('курс и его версии — одной лентой, новые сверху; чужой центр и чужой курс не попадают', async () => {
    const state = new InMemoryMvpState();
    const audit = new AuditService();
    const mvp = new MvpService(
      state,
      new TenantScopedRepository(),
      audit,
      { listDocuments: () => ({ items: [], page: 1, pageSize: 50, total: 0 }) } as never,
      {} as never,
      { emit: vi.fn() } as never
    );
    const course = mvp.createCourse(T, ctx.userId, { code: 'R13.Б', title: 'ОТ Б' }, ctx);
    const other = mvp.createCourse(T, ctx.userId, { code: 'R15', title: 'ПБ' }, ctx);
    mvp.createCourseVersion(T, course.id, ctx.userId, ctx);
    mvp.updateCourse(T, ctx.userId, course.id, { title: 'ОТ Б (2026)' }, ctx);
    mvp.updateCourse(T, ctx.userId, other.id, { title: 'ПБ (2026)' }, ctx);

    const history = await new CourseHistoryService(state, audit).compose(T, course.id);
    expect(history.items.map((item) => item.action).sort()).toEqual([
      'learning.course_created',
      'learning.course_updated',
      'learning.course_version_created'
    ]);
    const times = history.items.map((item) => item.createdAt);
    expect([...times].sort().reverse()).toEqual(times);
    expect(history.truncated).toBe(false);

    await expect(
      new CourseHistoryService(state, audit).compose('t_other', course.id)
    ).rejects.toMatchObject({
      status: 404
    });
  });
});

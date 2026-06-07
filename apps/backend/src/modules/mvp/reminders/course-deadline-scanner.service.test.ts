import { Logger } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { CourseDeadlineScanner } from './course-deadline-scanner.service.js';

const ASOF = '2026-06-05';

function state(over: Record<string, unknown> = {}) {
  return {
    enrollments: [
      {
        id: 'enr1',
        tenantId: 't1',
        learnerId: 'l1',
        groupId: 'g1',
        status: 'active',
        plannedEndAt: '2026-06-15T00:00:00.000Z' // 10 days out → 14-day milestone
      }
    ],
    learners: [
      { id: 'l1', tenantId: 't1', firstName: 'Иван', lastName: 'Иванов', email: 'ivan@example.com' }
    ],
    groupCourses: [
      { id: 'gc1', tenantId: 't1', groupId: 'g1', courseId: 'c1', courseVersionId: 'cv1' }
    ],
    groups: [{ id: 'g1', tenantId: 't1', name: 'Группа 1' }],
    counterparties: [],
    courseVersions: [{ id: 'cv1', tenantId: 't1', courseId: 'c1' }],
    courses: [{ id: 'c1', tenantId: 't1', title: 'Охрана труда' }],
    ...over
  };
}

function make(dispatch = vi.fn().mockResolvedValue(undefined)) {
  const scanner = new CourseDeadlineScanner({ dispatch } as never);
  return { scanner, dispatch };
}

describe('CourseDeadlineScanner.scanTenant', () => {
  it('dispatches a course_deadline reminder with the 14-day dedupKey', async () => {
    const { scanner, dispatch } = make();
    const summary = await scanner.scanTenant('t1', ASOF, state() as never);
    expect(summary.remindersDispatched).toBe(1);
    const arg = dispatch.mock.calls[0]![0];
    expect(arg.templateKey).toBe('course_deadline');
    expect(arg.recipients[0].email).toBe('ivan@example.com');
    expect(arg.variables.deadline).toBe('2026-06-15');
    expect(arg.dedupKey).toBe('deadline:enr1:14');
  });

  it('ignores completed enrollments and enrollments beyond the window', async () => {
    const { scanner } = make();
    const completed = state({
      enrollments: [
        {
          id: 'e1',
          tenantId: 't1',
          learnerId: 'l1',
          groupId: 'g1',
          status: 'completed',
          plannedEndAt: '2026-06-07T00:00:00.000Z'
        },
        {
          id: 'e2',
          tenantId: 't1',
          learnerId: 'l1',
          groupId: 'g1',
          status: 'active',
          plannedEndAt: '2026-09-01T00:00:00.000Z'
        }
      ]
    });
    const summary = await scanner.scanTenant('t1', ASOF, completed as never);
    expect(summary.remindersDispatched).toBe(0);
  });

  it('skips enrollments without a plannedEndAt', async () => {
    const { scanner } = make();
    const noDate = state({
      enrollments: [{ id: 'e3', tenantId: 't1', learnerId: 'l1', groupId: 'g1', status: 'active' }]
    });
    const summary = await scanner.scanTenant('t1', ASOF, noDate as never);
    expect(summary.remindersDispatched).toBe(0);
  });

  it('tolerates a dispatch failure without throwing', async () => {
    const dispatch = vi.fn().mockRejectedValue(new Error('smtp down'));
    const errorSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { scanner } = make(dispatch);
    const summary = await scanner.scanTenant('t1', ASOF, state() as never);
    expect(summary.remindersDispatched).toBe(0);
    errorSpy.mockRestore();
  });
});

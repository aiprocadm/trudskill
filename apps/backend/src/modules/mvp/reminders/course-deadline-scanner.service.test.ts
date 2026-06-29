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

function make(
  dispatch = vi
    .fn()
    .mockImplementation((input) =>
      Promise.resolve({ sent: input.recipients.length, skipped: 0, failed: 0 })
    )
) {
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
    expect(arg.dedupKey).toBe('deadline:enr1:2026-06-15:14');
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

  it('progresses through the 14 → 7 → 1 dedupKeys as the deadline approaches', async () => {
    const { scanner, dispatch } = make(); // enr1 plannedEndAt = 2026-06-15
    await scanner.scanTenant('t1', '2026-06-05', state() as never); // 10 days out → 14
    await scanner.scanTenant('t1', '2026-06-10', state() as never); // 5 days out  → 7
    await scanner.scanTenant('t1', '2026-06-14', state() as never); // 1 day out   → 1
    const milestones = dispatch.mock.calls.map((c) => String(c[0].dedupKey).split(':').pop());
    expect(milestones).toEqual(['14', '7', '1']);
  });

  it('re-reminds at the same milestone when the deadline (plannedEndAt) changes', async () => {
    // Mirrors the license-expiry scanner's renewed-term test: the dedupKey must embed
    // the deadline date, so moving plannedEndAt yields a *new* key and the milestone
    // nudge fires again for the new deadline instead of being dedup-suppressed.
    const { scanner, dispatch } = make();
    // Term A: plannedEndAt 2026-06-15, asOf 2026-06-05 → 10 days out → milestone 14.
    await scanner.scanTenant('t1', '2026-06-05', state() as never);
    // Term B: deadline extended to 2026-07-15; asOf 2026-07-05 → 10 days out → milestone 14 again.
    const extended = state({
      enrollments: [
        {
          id: 'enr1',
          tenantId: 't1',
          learnerId: 'l1',
          groupId: 'g1',
          status: 'active',
          plannedEndAt: '2026-07-15T00:00:00.000Z'
        }
      ]
    });
    await scanner.scanTenant('t1', '2026-07-05', extended as never);

    const keys = dispatch.mock.calls.map((c) => c[0].dedupKey);
    expect(keys).toEqual(['deadline:enr1:2026-06-15:14', 'deadline:enr1:2026-07-15:14']);
  });

  it('includes configured staff recipients (admin-kind) alongside the learner', async () => {
    const { scanner, dispatch } = make();
    const withStaff = state({
      notificationStaffRecipients: [{ tenantId: 't1', email: 'admin@uc.ru' }]
    });
    const summary = await scanner.scanTenant('t1', ASOF, withStaff as never);
    const arg = dispatch.mock.calls[0]![0];
    const emails = arg.recipients.map((r: { email: string }) => r.email);
    expect(emails).toContain('ivan@example.com');
    expect(emails).toContain('admin@uc.ru');
    expect(arg.recipients.find((r: { email: string }) => r.email === 'admin@uc.ru').kind).toBe(
      'admin'
    );
    expect(summary.remindersDispatched).toBe(2);
  });

  it('notifies staff even when the learner has no email', async () => {
    const { scanner, dispatch } = make();
    const noLearnerEmail = state({
      learners: [{ id: 'l1', tenantId: 't1', firstName: 'Иван', lastName: 'Иванов' }],
      notificationStaffRecipients: [{ tenantId: 't1', email: 'admin@uc.ru' }]
    });
    const summary = await scanner.scanTenant('t1', ASOF, noLearnerEmail as never);
    expect(summary.remindersDispatched).toBe(1);
    expect(dispatch.mock.calls[0]![0].recipients.map((r: { email: string }) => r.email)).toEqual([
      'admin@uc.ru'
    ]);
  });

  it('sends the 1-day reminder for an already-overdue active enrollment', async () => {
    const { scanner, dispatch } = make();
    const overdue = state({
      enrollments: [
        {
          id: 'enr1',
          tenantId: 't1',
          learnerId: 'l1',
          groupId: 'g1',
          status: 'active',
          plannedEndAt: '2026-05-01T00:00:00.000Z' // already past ASOF 2026-06-05
        }
      ]
    });
    const summary = await scanner.scanTenant('t1', '2026-06-05', overdue as never);
    expect(summary.remindersDispatched).toBe(1);
    expect(dispatch.mock.calls[0]![0].dedupKey).toBe('deadline:enr1:2026-05-01:1');
  });
});

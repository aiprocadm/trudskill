import { describe, expect, it, vi } from 'vitest';

import { CourseDeadlineScanner } from './course-deadline-scanner.service.js';
import { ReminderSettingsService } from './reminder-settings.service.js';

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

/*
 * ТЗ 11.3: сканер больше не отправляет сам, а КЛАДЁТ повод в копилку — письма уходят одним на
 * человека в конце обхода. Проверяемые свойства не изменились: кому, о чём и с каким ключом
 * подавления повтора; изменилось только то, КУДА это кладётся. Устойчивость самой отправки
 * переехала в копилку и проверяется её тестом.
 */
function make() {
  const queued: Array<Record<string, unknown>> = [];
  const queue = vi.fn((_tenantId: string, item: Record<string, unknown>) => {
    queued.push(item);
  });
  const scanner = new CourseDeadlineScanner({ queue } as never, new ReminderSettingsService());
  return { scanner, queue, queued };
}

describe('CourseDeadlineScanner.scanTenant', () => {
  it('queues a course_deadline reminder with the 14-day dedupKey', async () => {
    const { scanner, queued } = make();
    const summary = await scanner.scanTenant('t1', ASOF, state() as never);
    expect(summary.remindersQueued).toBe(1);
    const arg = queued[0]! as {
      templateKey: string;
      variables: { deadline: string };
      digest: { email: string; dedupKey: string };
    };
    expect(arg.templateKey).toBe('course_deadline');
    expect(arg.digest.email).toBe('ivan@example.com');
    expect(arg.variables.deadline).toBe('2026-06-15');
    expect(arg.digest.dedupKey).toBe('deadline:enr1:2026-06-15:14');
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
    expect(summary.remindersQueued).toBe(0);
  });

  it('skips enrollments without a plannedEndAt', async () => {
    const { scanner } = make();
    const noDate = state({
      enrollments: [{ id: 'e3', tenantId: 't1', learnerId: 'l1', groupId: 'g1', status: 'active' }]
    });
    const summary = await scanner.scanTenant('t1', ASOF, noDate as never);
    expect(summary.remindersQueued).toBe(0);
  });

  it('поводы не теряются: сколько насчитано, столько и положено в копилку', async () => {
    /*
     * Прежде здесь проверялся частичный успех отправки: отказ почтовика не ронял обход. С
     * переходом на копилку (ТЗ 11.3) сканер не отправляет вовсе — устойчивость отправки
     * переехала в копилку и проверяется её тестом. За сканером остаётся другое: не потерять
     * ни одного повода.
     */
    const { scanner, queued } = make();
    const summary = await scanner.scanTenant('t1', ASOF, state() as never);
    expect(summary.remindersQueued).toBe(queued.length);
  });

  /*
   * Инвариант ИЗМЕНЁН осознанно (ТЗ 11.3, журнал 513): было 14 → 7 → 1, стало 14 → 3 → 1.
   * Решение владельца Р11 называет «за 14, 3 и 1 день»; семёрка в коде была расхождением с
   * ним, и его никто не замечал. Три дня и семь — разные вещи: за три дня человек ещё успевает
   * дочитать курс, за семь он про письмо забывает. Проверка не ослаблена: она по-прежнему
   * требует ровно три ступени в строгом порядке.
   */
  it('progresses through the 14 → 3 → 1 dedupKeys as the deadline approaches', async () => {
    const { scanner, queued } = make(); // enr1 plannedEndAt = 2026-06-15
    await scanner.scanTenant('t1', '2026-06-05', state() as never); // 10 days out → 14
    await scanner.scanTenant('t1', '2026-06-13', state() as never); // 2 days out  → 3
    await scanner.scanTenant('t1', '2026-06-14', state() as never); // 1 day out   → 1
    const milestones = queued.map((item) =>
      String((item.digest as { dedupKey: string }).dedupKey)
        .split(':')
        .pop()
    );
    expect(milestones).toEqual(['14', '3', '1']);
  });

  it('re-reminds at the same milestone when the deadline (plannedEndAt) changes', async () => {
    // Mirrors the license-expiry scanner's renewed-term test: the dedupKey must embed
    // the deadline date, so moving plannedEndAt yields a *new* key and the milestone
    // nudge fires again for the new deadline instead of being dedup-suppressed.
    const { scanner, queued } = make();
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

    const keys = queued.map((item) => (item.digest as { dedupKey: string }).dedupKey);
    expect(keys).toEqual(['deadline:enr1:2026-06-15:14', 'deadline:enr1:2026-07-15:14']);
  });

  it('includes configured staff recipients (admin-kind) alongside the learner', async () => {
    const { scanner, queued } = make();
    const withStaff = state({
      notificationStaffRecipients: [{ tenantId: 't1', email: 'admin@uc.ru' }]
    });
    const summary = await scanner.scanTenant('t1', ASOF, withStaff as never);
    const digests = queued.map((item) => item.digest as { email: string; recipientKind: string });
    const emails = digests.map((one) => one.email);
    expect(emails).toContain('ivan@example.com');
    expect(emails).toContain('admin@uc.ru');
    expect(digests.find((one) => one.email === 'admin@uc.ru')!.recipientKind).toBe('admin');
    expect(summary.remindersQueued).toBe(2);
  });

  it('notifies staff even when the learner has no email', async () => {
    const { scanner, queued } = make();
    const noLearnerEmail = state({
      learners: [{ id: 'l1', tenantId: 't1', firstName: 'Иван', lastName: 'Иванов' }],
      notificationStaffRecipients: [{ tenantId: 't1', email: 'admin@uc.ru' }]
    });
    const summary = await scanner.scanTenant('t1', ASOF, noLearnerEmail as never);
    expect(summary.remindersQueued).toBe(1);
    expect(queued.map((item) => (item.digest as { email: string }).email)).toEqual(['admin@uc.ru']);
  });

  it('sends the 1-day reminder for an already-overdue active enrollment', async () => {
    const { scanner, queued } = make();
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
    expect(summary.remindersQueued).toBe(1);
    expect((queued[0]!.digest as { dedupKey: string }).dedupKey).toBe('deadline:enr1:2026-05-01:1');
  });
});

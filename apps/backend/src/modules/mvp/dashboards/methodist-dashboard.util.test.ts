import { describe, expect, it } from 'vitest';

import { buildMethodistDashboard } from './methodist-dashboard.util.js';

import type { MethodistDashboardInput } from './methodist-dashboard.util.js';

const T = 'tenant_demo';
const base = { tenantId: T, status: 'active', createdAt: '2026-07-01', updatedAt: '2026-07-01' };
const ASOF = '2026-08-05T00:00:00.000Z';

const input = (over: Partial<MethodistDashboardInput> = {}): MethodistDashboardInput => ({
  groups: [{ ...base, id: 'grp_1', code: 'Г-1', name: 'Группа 1' }] as never,
  groupCourses: [],
  enrollments: [],
  courses: [
    { ...base, id: 'crs_1', code: 'К-1', title: 'Охрана труда', isArchived: false }
  ] as never,
  tests: [],
  ...over
});

const enrollment = (id: string, plannedEndAt?: string, status = 'active') =>
  ({
    ...base,
    id,
    groupId: 'grp_1',
    learnerId: `lrn_${id}`,
    status,
    enrolledAt: ASOF,
    plannedEndAt
  }) as never;

describe('buildMethodistDashboard (ФТ-H2, Фаза 5 Task 2)', () => {
  it('ближайшие дедлайны попадают в горизонт, дальние — нет', () => {
    const result = buildMethodistDashboard(
      input({ enrollments: [enrollment('e1', '2026-08-10'), enrollment('e2', '2026-10-01')] }),
      ASOF,
      14
    );

    expect(result.upcomingDeadlines).toHaveLength(1);
    expect(result.upcomingDeadlines[0]).toMatchObject({ groupId: 'grp_1', daysLeft: 5 });
  });

  it('просроченные учитываются отдельно и НЕ дублируются в ближайших', () => {
    const result = buildMethodistDashboard(
      input({ enrollments: [enrollment('e1', '2026-07-20')] }),
      ASOF
    );

    expect(result.overdueGroups).toHaveLength(1);
    expect(result.overdueGroups[0]).toMatchObject({ daysOverdue: 16, learnersCount: 1 });
    // Иначе одно и то же дело считалось бы дважды и завышало объём работы.
    expect(result.upcomingDeadlines).toHaveLength(0);
  });

  it('зачисление без плановой даты не превращается в дедлайн', () => {
    // Пустой срок — это ненастроенное зачисление, а не «бессрочное». Придумывать
    // за методиста дату нельзя.
    const result = buildMethodistDashboard(input({ enrollments: [enrollment('e1')] }), ASOF);
    expect(result.upcomingDeadlines).toHaveLength(0);
    expect(result.overdueGroups).toHaveLength(0);
  });

  it('завершённые и отменённые зачисления дедлайнов не создают', () => {
    const result = buildMethodistDashboard(
      input({
        enrollments: [
          enrollment('e1', '2026-07-01', 'completed'),
          enrollment('e2', '2026-07-01', 'cancelled')
        ]
      }),
      ASOF
    );
    expect(result.overdueGroups).toHaveLength(0);
    expect(result.totals.activeGroups).toBe(0);
  });

  it('курс без ОПУБЛИКОВАННОГО итогового теста попадает в список пробелов', () => {
    const result = buildMethodistDashboard(
      input({
        groupCourses: [
          { ...base, id: 'gc1', groupId: 'grp_1', courseId: 'crs_1', sortOrder: 1 }
        ] as never
      }),
      ASOF
    );

    expect(result.coursesWithoutExam).toHaveLength(1);
    expect(result.coursesWithoutExam[0]).toMatchObject({
      courseTitle: 'Охрана труда',
      groupName: 'Группа 1'
    });
  });

  it('тест модуля не считается итоговым экзаменом', () => {
    // Промежуточный тест внутри модуля программу не закрывает — если считать его
    // экзаменом, пробел исчезнет с экрана, а слушатели упрутся в него вживую.
    const result = buildMethodistDashboard(
      input({
        groupCourses: [
          { ...base, id: 'gc1', groupId: 'grp_1', courseId: 'crs_1', sortOrder: 1 }
        ] as never,
        tests: [
          {
            ...base,
            id: 'tst_mod',
            courseId: 'crs_1',
            moduleId: 'mod_1',
            title: 'Тест модуля',
            rules: {},
            isArchived: false,
            publishedAt: '2026-07-02'
          }
        ] as never
      }),
      ASOF
    );

    expect(result.coursesWithoutExam).toHaveLength(1);
  });

  it('неопубликованный итоговый тест пробел не закрывает', () => {
    const result = buildMethodistDashboard(
      input({
        groupCourses: [
          { ...base, id: 'gc1', groupId: 'grp_1', courseId: 'crs_1', sortOrder: 1 }
        ] as never,
        tests: [
          { ...base, id: 'tst', courseId: 'crs_1', title: 'Экзамен', rules: {}, isArchived: false }
        ] as never
      }),
      ASOF
    );
    expect(result.coursesWithoutExam).toHaveLength(1);
  });

  it('опубликованный итоговый тест убирает курс из пробелов', () => {
    const result = buildMethodistDashboard(
      input({
        groupCourses: [
          { ...base, id: 'gc1', groupId: 'grp_1', courseId: 'crs_1', sortOrder: 1 }
        ] as never,
        tests: [
          {
            ...base,
            id: 'tst',
            courseId: 'crs_1',
            title: 'Экзамен',
            rules: {},
            isArchived: false,
            publishedAt: '2026-07-02'
          }
        ] as never
      }),
      ASOF
    );
    expect(result.coursesWithoutExam).toHaveLength(0);
  });

  it('дедлайны отсортированы по срочности, просрочки — по глубине', () => {
    const result = buildMethodistDashboard(
      input({
        groups: [
          { ...base, id: 'grp_1', code: 'Г-1', name: 'Группа 1' },
          { ...base, id: 'grp_2', code: 'Г-2', name: 'Группа 2' }
        ] as never,
        enrollments: [
          enrollment('e1', '2026-08-12'),
          {
            ...base,
            id: 'e2',
            groupId: 'grp_2',
            learnerId: 'l2',
            enrolledAt: ASOF,
            plannedEndAt: '2026-08-06'
          } as never
        ]
      }),
      ASOF
    );

    expect(result.upcomingDeadlines.map((item) => item.groupId)).toEqual(['grp_2', 'grp_1']);
  });

  it('одна и та же пара «группа-курс» не дублируется', () => {
    const result = buildMethodistDashboard(
      input({
        groupCourses: [
          { ...base, id: 'gc1', groupId: 'grp_1', courseId: 'crs_1', sortOrder: 1 },
          { ...base, id: 'gc2', groupId: 'grp_1', courseId: 'crs_1', sortOrder: 2 }
        ] as never
      }),
      ASOF
    );
    expect(result.coursesWithoutExam).toHaveLength(1);
  });

  it('итоги считают людей, а не зачисления', () => {
    const result = buildMethodistDashboard(
      input({
        enrollments: [
          { ...base, id: 'e1', groupId: 'grp_1', learnerId: 'lrn_1', enrolledAt: ASOF } as never,
          { ...base, id: 'e2', groupId: 'grp_1', learnerId: 'lrn_1', enrolledAt: ASOF } as never
        ]
      }),
      ASOF
    );
    // Один человек на двух программах — это один занятый слушатель, а не два.
    expect(result.totals.activeLearners).toBe(1);
  });
});

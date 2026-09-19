import { describe, expect, it } from 'vitest';

import {
  MANAGER_DASHBOARD_DEFAULTS,
  buildManagerDashboard,
  managerDashboardSettings
} from './manager-dashboard.util.js';

import type { ManagerDashboardInput } from './manager-dashboard.util.js';
import type {
  Counterparty,
  CourseProgress,
  Enrollment,
  GroupEntity,
  Learner
} from '../mvp.types.js';

/**
 * Панель руководителя (ТЗ 8.3) считается на конкретную дату, поэтому и проверяется на
 * конкретную дату. «Сегодня» в тесте — 1 июня 2026 года.
 */
const ASOF = '2026-06-01T09:00:00.000Z';

const company = (id: string, name: string): Counterparty =>
  ({ id, tenantId: 't1', code: id, name, status: 'active' }) as Counterparty;

const group = (id: string, name: string, counterpartyId?: string): GroupEntity =>
  ({
    id,
    tenantId: 't1',
    code: id,
    name,
    status: 'active',
    ...(counterpartyId ? { counterpartyId } : {})
  }) as GroupEntity;

const learner = (id: string, lastName: string, firstName: string): Learner =>
  ({ id, tenantId: 't1', lastName, firstName, status: 'active' }) as Learner;

const enrollment = (
  id: string,
  groupId: string,
  learnerId: string,
  extra: Partial<Enrollment> = {}
): Enrollment =>
  ({
    id,
    tenantId: 't1',
    groupId,
    learnerId,
    status: 'active',
    enrolledAt: '2026-05-01T00:00:00.000Z',
    ...extra
  }) as Enrollment;

const progress = (enrollmentId: string, progressPercent: number): CourseProgress =>
  ({
    id: `p_${enrollmentId}`,
    tenantId: 't1',
    enrollmentId,
    courseId: 'c1',
    status: 'in_progress',
    studiedSeconds: 0,
    requiredSeconds: 0,
    progressPercent
  }) as CourseProgress;

const emptyInput = (): ManagerDashboardInput => ({
  counterparties: [],
  groups: [],
  learners: [],
  enrollments: [],
  courseProgress: [],
  documents: []
});

describe('панель руководителя: «кто не успевает» (ТЗ 8.3)', () => {
  it('просроченный срок ставит человека первым в списке', () => {
    const input: ManagerDashboardInput = {
      ...emptyInput(),
      counterparties: [company('cp1', 'ООО «Мост»')],
      groups: [group('g1', 'Группа А', 'cp1')],
      learners: [learner('l1', 'Иванов', 'Пётр')],
      enrollments: [enrollment('e1', 'g1', 'l1', { plannedEndAt: '2026-05-20T00:00:00.000Z' })],
      courseProgress: [progress('e1', 30)]
    };

    const result = buildManagerDashboard(input, ASOF);

    expect(result.lagging).toHaveLength(1);
    expect(result.lagging[0]?.reason).toBe('overdue');
    expect(result.lagging[0]?.daysLeft, 'срок вышел 12 дней назад').toBe(-12);
    expect(result.lagging[0]?.learnerName).toBe('Иванов Пётр');
    expect(result.lagging[0]?.companyName).toBe('ООО «Мост»');
  });

  it('отставание от графика ловится ДО срока, а не в день срока', () => {
    /*
     * Смысл раздела — успеть вмешаться. Человек зачислен 1 мая на 60 дней, прошла половина
     * срока, а пройдено 5% — он не успеет, и звонить надо сейчас.
     */
    const input: ManagerDashboardInput = {
      ...emptyInput(),
      groups: [group('g1', 'Группа А')],
      learners: [learner('l1', 'Петров', 'Иван')],
      enrollments: [enrollment('e1', 'g1', 'l1', { plannedEndAt: '2026-06-30T00:00:00.000Z' })],
      courseProgress: [progress('e1', 5)]
    };

    const result = buildManagerDashboard(input, ASOF);

    expect(result.lagging).toHaveLength(1);
    expect(result.lagging[0]?.reason).toBe('behind');
    expect(result.lagging[0]?.daysLeft, 'срок ещё впереди').toBeGreaterThan(0);
  });

  it('идущий по графику в список не попадает', () => {
    const input: ManagerDashboardInput = {
      ...emptyInput(),
      groups: [group('g1', 'Группа А')],
      learners: [learner('l1', 'Сидоров', 'Олег')],
      enrollments: [enrollment('e1', 'g1', 'l1', { plannedEndAt: '2026-06-30T00:00:00.000Z' })],
      courseProgress: [progress('e1', 60)]
    };

    expect(buildManagerDashboard(input, ASOF).lagging).toEqual([]);
  });

  it('зачисление без плановой даты не считается отстающим', () => {
    /* Без срока не с чем сравнивать: это не отставание, а ненастроенное зачисление. */
    const input: ManagerDashboardInput = {
      ...emptyInput(),
      groups: [group('g1', 'Группа А')],
      learners: [learner('l1', 'Кузнецов', 'Юрий')],
      enrollments: [enrollment('e1', 'g1', 'l1')],
      courseProgress: [progress('e1', 0)]
    };

    expect(buildManagerDashboard(input, ASOF).lagging).toEqual([]);
  });
});

describe('панель руководителя: «что горит по срокам» (ТЗ 8.3)', () => {
  it('срок в пределах горизонта показывается, дальний — нет', () => {
    const input: ManagerDashboardInput = {
      ...emptyInput(),
      groups: [group('g1', 'Скоро'), group('g2', 'Нескоро')],
      learners: [learner('l1', 'А', 'А'), learner('l2', 'Б', 'Б')],
      enrollments: [
        enrollment('e1', 'g1', 'l1', { plannedEndAt: '2026-06-08T00:00:00.000Z' }),
        enrollment('e2', 'g2', 'l2', { plannedEndAt: '2026-09-01T00:00:00.000Z' })
      ],
      courseProgress: [progress('e1', 90), progress('e2', 90)]
    };

    const result = buildManagerDashboard(input, ASOF);

    expect(result.dueSoon.map((item) => item.groupName)).toEqual(['Скоро']);
    expect(result.dueSoon[0]?.daysLeft).toBe(7);
  });

  it('просроченные в «ближайшие сроки» не дублируются', () => {
    /* Иначе одно и то же дело считается дважды и список дел выглядит вдвое страшнее. */
    const input: ManagerDashboardInput = {
      ...emptyInput(),
      groups: [group('g1', 'Группа А')],
      learners: [learner('l1', 'А', 'А')],
      enrollments: [enrollment('e1', 'g1', 'l1', { plannedEndAt: '2026-05-20T00:00:00.000Z' })],
      courseProgress: [progress('e1', 90)]
    };

    const result = buildManagerDashboard(input, ASOF);

    expect(result.dueSoon).toEqual([]);
    expect(result.lagging).toHaveLength(1);
  });
});

describe('панель руководителя: «по компаниям» и «сколько выдано» (ТЗ 8.3)', () => {
  it('обучение и документы собираются по компании заказчика', () => {
    const input: ManagerDashboardInput = {
      ...emptyInput(),
      counterparties: [company('cp1', 'ООО «Мост»')],
      groups: [group('g1', 'Группа А', 'cp1')],
      learners: [learner('l1', 'А', 'А'), learner('l2', 'Б', 'Б')],
      enrollments: [
        enrollment('e1', 'g1', 'l1', { plannedEndAt: '2026-06-30T00:00:00.000Z' }),
        enrollment('e2', 'g1', 'l2', { status: 'completed' })
      ],
      courseProgress: [progress('e1', 90)],
      documents: [
        { sourceEntityType: 'enrollment', sourceEntityId: 'e2', isFinal: true, status: 'final' }
      ]
    };

    const result = buildManagerDashboard(input, ASOF);

    expect(result.companies).toHaveLength(1);
    expect(result.companies[0]).toMatchObject({
      companyName: 'ООО «Мост»',
      groupsCount: 1,
      learnersInTraining: 1,
      completed: 1,
      documentsIssued: 1
    });
    expect(result.totals.documentsIssued).toBe(1);
  });

  it('черновик и аннулированный документ выданными не считаются', () => {
    /*
     * Черновик человеку на руки не попадает, а аннулированный при проверке недействителен.
     * Сложить их с настоящими значило бы отчитаться бумагой, которой нет.
     */
    const input: ManagerDashboardInput = {
      ...emptyInput(),
      counterparties: [company('cp1', 'ООО «Мост»')],
      groups: [group('g1', 'Группа А', 'cp1')],
      learners: [learner('l1', 'А', 'А')],
      enrollments: [enrollment('e1', 'g1', 'l1', { status: 'completed' })],
      documents: [
        {
          sourceEntityType: 'enrollment',
          sourceEntityId: 'e1',
          isFinal: false,
          status: 'generated'
        },
        { sourceEntityType: 'enrollment', sourceEntityId: 'e1', isFinal: true, status: 'revoked' }
      ]
    };

    expect(buildManagerDashboard(input, ASOF).totals.documentsIssued).toBe(0);
  });

  it('группы без компании считаются отдельно — иначе раздел молча врёт про полноту', () => {
    const input: ManagerDashboardInput = {
      ...emptyInput(),
      counterparties: [company('cp1', 'ООО «Мост»')],
      groups: [group('g1', 'С компанией', 'cp1'), group('g2', 'Без компании')],
      learners: [learner('l1', 'А', 'А'), learner('l2', 'Б', 'Б')],
      enrollments: [enrollment('e1', 'g1', 'l1'), enrollment('e2', 'g2', 'l2')]
    };

    const result = buildManagerDashboard(input, ASOF);

    expect(result.companies).toHaveLength(1);
    expect(result.totals.groupsWithoutCompany).toBe(1);
    expect(
      result.totals.learnersInTraining,
      'в обучении считаются все, а не только у компаний'
    ).toBe(2);
  });

  it('компания с просрочкой стоит выше спокойной', () => {
    const input: ManagerDashboardInput = {
      ...emptyInput(),
      counterparties: [company('cp1', 'Альфа'), company('cp2', 'Бета')],
      groups: [group('g1', 'Г1', 'cp1'), group('g2', 'Г2', 'cp2')],
      learners: [learner('l1', 'А', 'А'), learner('l2', 'Б', 'Б')],
      enrollments: [
        enrollment('e1', 'g1', 'l1', { plannedEndAt: '2026-12-31T00:00:00.000Z' }),
        enrollment('e2', 'g2', 'l2', { plannedEndAt: '2026-05-01T00:00:00.000Z' })
      ],
      courseProgress: [progress('e1', 90), progress('e2', 90)]
    };

    const result = buildManagerDashboard(input, ASOF);

    expect(result.companies.map((item) => item.companyName)).toEqual(['Бета', 'Альфа']);
  });
});

describe('горизонт и допуск — настройка центра, а не число в коде (ТЗ 8.3)', () => {
  it('без настроек берутся умолчания', () => {
    expect(managerDashboardSettings(undefined)).toEqual(MANAGER_DASHBOARD_DEFAULTS);
    expect(managerDashboardSettings({})).toEqual(MANAGER_DASHBOARD_DEFAULTS);
  });

  it('настройка центра применяется', () => {
    expect(
      managerDashboardSettings({
        managerDashboard: { horizonDays: 30, laggingTolerancePercent: 5 }
      })
    ).toEqual({ horizonDays: 30, laggingTolerancePercent: 5 });
  });

  it('испорченное значение откатывается к умолчанию ПОШТУЧНО', () => {
    /* Сломанный допуск не должен заодно сбивать горизонт — это разные настройки. */
    expect(
      managerDashboardSettings({
        managerDashboard: { horizonDays: 21, laggingTolerancePercent: -5 }
      })
    ).toEqual({
      horizonDays: 21,
      laggingTolerancePercent: MANAGER_DASHBOARD_DEFAULTS.laggingTolerancePercent
    });
    expect(managerDashboardSettings({ managerDashboard: { horizonDays: 0 } })).toEqual(
      MANAGER_DASHBOARD_DEFAULTS
    );
    expect(managerDashboardSettings({ managerDashboard: 'сломано' })).toEqual(
      MANAGER_DASHBOARD_DEFAULTS
    );
  });

  it('настроенный горизонт действительно меняет выдачу', () => {
    const input: ManagerDashboardInput = {
      ...emptyInput(),
      groups: [group('g1', 'Через месяц')],
      learners: [learner('l1', 'А', 'А')],
      enrollments: [enrollment('e1', 'g1', 'l1', { plannedEndAt: '2026-06-25T00:00:00.000Z' })],
      courseProgress: [progress('e1', 95)]
    };

    expect(buildManagerDashboard(input, ASOF).dueSoon, 'умолчание 14 дней — далеко').toEqual([]);
    expect(
      buildManagerDashboard(input, ASOF, { horizonDays: 30, laggingTolerancePercent: 10 }).dueSoon
    ).toHaveLength(1);
  });
});

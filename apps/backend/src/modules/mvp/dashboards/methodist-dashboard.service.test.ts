import { describe, expect, it } from 'vitest';

import { MethodistDashboardService } from './methodist-dashboard.service.js';
import { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';

const T = 'tenant_demo';
const ASOF = '2026-08-05T00:00:00.000Z';
const base = { tenantId: T, status: 'active', createdAt: '2026-07-01', updatedAt: '2026-07-01' };

/**
 * Разделы гейтятся ПО ПРАВАМ актора. Живой прогон вскрыл, что у методиста нет прав
 * на группы и зачисления — сроки ему показывать нельзя, а пробелы в программах и
 * очередь проверки можно.
 */
function harness() {
  const state = new InMemoryMvpState();
  state.groups.push({ ...base, id: 'grp_1', code: 'Г-1', name: 'Группа 1' } as never);
  state.courses.push({
    ...base,
    id: 'crs_1',
    code: 'К-1',
    title: 'Охрана труда',
    isArchived: false
  } as never);
  state.groupCourses.push({
    ...base,
    id: 'gc_1',
    groupId: 'grp_1',
    courseId: 'crs_1',
    sortOrder: 1
  } as never);
  state.enrollments.push({
    ...base,
    id: 'enr_1',
    groupId: 'grp_1',
    learnerId: 'lrn_1',
    enrolledAt: ASOF,
    plannedEndAt: '2026-07-20'
  } as never);
  return new MethodistDashboardService(state);
}

const METHODIST = ['courses.read', 'assessment.tests.read', 'assessment.reviews.review'];
const MANAGER = ['courses.read', 'groups.read', 'enrollments.read'];

describe('MethodistDashboardService — гейтинг разделов по правам (ФТ-H2)', () => {
  it('методист НЕ получает сроки: прав на зачисления у него нет', () => {
    const result = harness().compose(T, METHODIST, ASOF);

    expect(result.hiddenSections).toContain('schedule');
    expect(result.overdueGroups).toHaveLength(0);
    expect(result.upcomingDeadlines).toHaveLength(0);
    expect(result.totals.activeLearners).toBe(0);
  });

  it('методист получает пробелы в программах — но БЕЗ названий групп', () => {
    const result = harness().compose(T, METHODIST, ASOF);

    expect(result.coursesWithoutExam).toHaveLength(1);
    expect(result.coursesWithoutExam[0]).toMatchObject({ courseTitle: 'Охрана труда' });
    // Название группы — это состав обучения, его методисту не выдавали.
    expect(result.coursesWithoutExam[0]?.groupName).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain('Группа 1');
  });

  it('менеджер получает и сроки, и группы в пробелах', () => {
    const result = harness().compose(T, MANAGER, ASOF);

    expect(result.hiddenSections).not.toContain('schedule');
    expect(result.overdueGroups).toHaveLength(1);
    expect(result.coursesWithoutExam[0]?.groupName).toBe('Группа 1');
  });

  it('очередь проверки приходит только проверяющему', () => {
    expect(harness().compose(T, METHODIST, ASOF).reviewQueue).toBeDefined();

    const manager = harness().compose(T, MANAGER, ASOF);
    expect(manager.reviewQueue).toBeUndefined();
    expect(manager.hiddenSections).toContain('reviewQueue');
  });

  it('актор без единого права получает пустую сводку, а не чужие данные', () => {
    const result = harness().compose(T, [], ASOF);

    expect(result.hiddenSections).toEqual(
      expect.arrayContaining(['schedule', 'coursesWithoutExam', 'reviewQueue'])
    );
    expect(result.coursesWithoutExam).toHaveLength(0);
    expect(JSON.stringify(result)).not.toContain('Охрана труда');
  });

  it('чужой тенант в выдачу не попадает', () => {
    const service = harness();
    const result = service.compose('tenant_other', MANAGER, ASOF);

    expect(result.overdueGroups).toHaveLength(0);
    expect(result.coursesWithoutExam).toHaveLength(0);
    expect(JSON.stringify(result)).not.toContain('Охрана труда');
  });
});

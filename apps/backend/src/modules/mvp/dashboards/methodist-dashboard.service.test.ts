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

// Наборы прав взяты с боевой базы (`iam.role_permissions`), а не выдуманы: именно
// расхождение выдуманных прав с настоящими и породило ошибку первой версии.
const METHODIST = ['courses.read', 'courses.write', 'assessment.reviews.review'];
const MANAGER = ['courses.read', 'groups.read', 'enrollments.read', 'assessment.reviews.review'];
/** У слушателя ЕСТЬ `courses.read` и `enrollments.read` — но только на СВОИ данные. */
const LEARNER = ['courses.read', 'enrollments.read'];

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

  it('менеджер получает сроки, но НЕ методические пробелы', () => {
    // Менеджер ведёт группы и сроки; доделывать программы — не его работа, и права
    // `courses.write` у него нет.
    const result = harness().compose(T, MANAGER, ASOF);

    expect(result.hiddenSections).not.toContain('schedule');
    expect(result.overdueGroups).toHaveLength(1);
    expect(result.hiddenSections).toContain('coursesWithoutExam');
  });

  it('администратор видит всё — и пробелы с привязкой к группам', () => {
    const admin = [...MANAGER, 'courses.write'];
    const result = harness().compose(T, admin, ASOF);

    expect(result.hiddenSections).toHaveLength(0);
    expect(result.overdueGroups).toHaveLength(1);
    expect(result.coursesWithoutExam[0]?.groupName).toBe('Группа 1');
  });

  it('очередь проверки приходит только проверяющему', () => {
    expect(harness().compose(T, METHODIST, ASOF).reviewQueue).toBeDefined();

    const noReview = harness().compose(T, ['groups.read', 'enrollments.read'], ASOF);
    expect(noReview.reviewQueue).toBeUndefined();
    expect(noReview.hiddenSections).toContain('reviewQueue');
  });

  it('СЛУШАТЕЛЬ не попадает на экран персонала — отказ, а не пустая сводка', () => {
    // У слушателя есть `enrollments.read` (свои зачисления) и `courses.read`. Гейт по
    // ним открыл бы ему сроки ВСЕХ групп центра — живой прогон это и показал.
    // Ни один раздел ему не положен, значит это чужой экран, а не пустая сводка.
    expect(() => harness().compose(T, LEARNER, ASOF)).toThrow();
  });

  it('актор без единого права получает отказ', () => {
    expect(() => harness().compose(T, [], ASOF)).toThrow();
  });

  it('чужой тенант в выдачу не попадает', () => {
    const service = harness();
    const result = service.compose('tenant_other', MANAGER, ASOF);

    expect(result.overdueGroups).toHaveLength(0);
    expect(result.coursesWithoutExam).toHaveLength(0);
    expect(JSON.stringify(result)).not.toContain('Охрана труда');
  });
});

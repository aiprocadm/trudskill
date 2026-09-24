import { ConflictException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import {
  allowedGroupTransitions,
  assertGroupStatusTransition,
  filterGroups,
  isGroupLocked,
  isoWeekBounds,
  normalizeGroupStatus
} from './group-status.js';

/** МГ-B3.1: машина состояний группы; МГ-B3.2: быстрые отборы — одна семантика для снимка и SQL. */
describe('статусы группы (МГ-B3.1)', () => {
  it('старые значения снимка трактуются как соседи по цепочке, неизвестное — null', () => {
    expect(normalizeGroupStatus('scheduled')).toBe('recruiting');
    expect(normalizeGroupStatus('active')).toBe('in_progress');
    expect(normalizeGroupStatus('completed')).toBe('closed');
    expect(normalizeGroupStatus(' exam ')).toBe('exam');
    expect(normalizeGroupStatus('whatever')).toBeNull();
    expect(normalizeGroupStatus(undefined)).toBeNull();
  });

  it('ручные переходы — только соседние; отмена до закрытия; архив из закрытой и отменённой', () => {
    expect(allowedGroupTransitions('draft')).toEqual(['recruiting', 'cancelled']);
    expect(allowedGroupTransitions('in_progress')).toEqual(['recruiting', 'exam', 'cancelled']);
    expect(allowedGroupTransitions('documents')).toEqual(['exam', 'closed', 'cancelled']);
    expect(allowedGroupTransitions('closed')).toEqual(['documents', 'archived']);
    expect(allowedGroupTransitions('cancelled')).toEqual(['archived']);
    expect(allowedGroupTransitions('archived')).toEqual(['closed']);
  });

  it('недопустимый переход — 409 с перечнем доступных; тот же статус — не ошибка', () => {
    expect(assertGroupStatusTransition('recruiting', 'in_progress')).toBe('in_progress');
    expect(assertGroupStatusTransition('active', 'exam')).toBe('exam');
    expect(assertGroupStatusTransition('exam', 'exam')).toBe('exam');
    expect(() => assertGroupStatusTransition('recruiting', 'documents')).toThrow(ConflictException);
    expect(() => assertGroupStatusTransition('recruiting', 'documents')).toThrow(
      /Из «Набор» нельзя перевести в «Ждут документов». Доступно: «Черновик», «Учатся», «Отменена»/
    );
    expect(() => assertGroupStatusTransition('closed', 'cancelled')).toThrow(ConflictException);
    expect(() => assertGroupStatusTransition('draft', 'nonsense')).toThrow(/неизвестен/);
  });

  it('закрытая, архивная и отменённая группа заблокированы для правок дат и состава', () => {
    expect(isGroupLocked('closed')).toBe(true);
    expect(isGroupLocked('completed')).toBe(true);
    expect(isGroupLocked('archived')).toBe(true);
    expect(isGroupLocked('cancelled')).toBe(true);
    expect(isGroupLocked('in_progress')).toBe(false);
    expect(isGroupLocked(undefined)).toBe(false);
  });
});

describe('быстрые отборы реестра (МГ-B3.2)', () => {
  const today = '2026-09-24'; // четверг, ISO-неделя 39: 21.09–27.09
  const groups = [
    {
      id: 'g_learn',
      status: 'in_progress',
      startDate: '2026-09-01',
      endDate: '2026-10-10',
      examDate: '2026-09-25'
    },
    { id: 'g_legacy_active', status: 'active', startDate: '2026-09-01', endDate: '2026-09-24' },
    { id: 'g_docs', status: 'documents', endDate: '2026-09-20', examDate: '2026-09-20' },
    { id: 'g_exam_next', status: 'exam', examDate: '2026-09-28', endDate: '2026-09-30' },
    { id: 'g_closed', status: 'closed', endDate: '2026-09-10', examDate: '2026-09-22' },
    { id: 'g_arch', status: 'archived', endDate: '2026-08-01' },
    { id: 'g_draft', status: 'draft', responsibleUserId: 'u1' }
  ];
  const ids = (filter: Parameters<typeof filterGroups>[1]) =>
    filterGroups(groups, filter, today).map((g) => g.id);

  it('ISO-неделя считается от понедельника', () => {
    expect(isoWeekBounds('2026-09-24')).toEqual({ from: '2026-09-21', to: '2026-09-27' });
    expect(isoWeekBounds('2026-09-27')).toEqual({ from: '2026-09-21', to: '2026-09-27' });
  });

  it('архив скрыт по умолчанию, показывается отбором или статусом', () => {
    expect(ids({})).not.toContain('g_arch');
    expect(ids({ quick: 'archive' })).toEqual(['g_arch']);
    expect(ids({ statuses: ['archived'] })).toEqual(['g_arch']);
    expect(ids({ includeArchived: true })).toContain('g_arch');
  });

  it('«Учатся» видит и старый active; «Экзамен на этой неделе» — по дате экзамена, кроме архива', () => {
    expect(ids({ quick: 'learning' })).toEqual(['g_learn', 'g_legacy_active']);
    expect(ids({ quick: 'exam_this_week' })).toEqual(['g_learn', 'g_closed']);
  });

  it('«Ждут документов», «Закончились без документов», «Заканчиваются сегодня»', () => {
    expect(ids({ quick: 'awaiting_documents' })).toEqual(['g_docs']);
    expect(ids({ quick: 'ended_without_documents' })).toEqual(['g_docs']);
    expect(ids({ quick: 'ends_today' })).toEqual(['g_legacy_active']);
  });

  it('статусы (несколько, включая старые), ответственный и периоды дат', () => {
    expect(ids({ statuses: ['exam', 'completed'] })).toEqual(['g_exam_next', 'g_closed']);
    expect(ids({ responsibleUserId: 'u1' })).toEqual(['g_draft']);
    expect(ids({ examFrom: '2026-09-25', examTo: '2026-09-30' })).toEqual([
      'g_learn',
      'g_exam_next'
    ]);
    expect(ids({ endFrom: '2026-09-24', endTo: '2026-09-30' })).toEqual([
      'g_legacy_active',
      'g_exam_next'
    ]);
    expect(ids({ startFrom: '2026-09-02' })).toEqual([]);
  });
});

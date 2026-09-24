import { describe, expect, it } from 'vitest';

import {
  GROUP_STATUS_LABEL,
  allowedGroupTransitions,
  formatPeriod,
  groupStatusLabel,
  isGroupArchivable,
  normalizeGroupStatus
} from './group-status';

/** Словарь статусов группы на экране повторяет сервер (МГ-B3, РМ45–РМ46). */
describe('статусы группы на экране', () => {
  it('старые значения снимка читаются как соседи, у каждого статуса — русская подпись', () => {
    expect(normalizeGroupStatus('active')).toBe('in_progress');
    expect(normalizeGroupStatus('scheduled')).toBe('recruiting');
    expect(normalizeGroupStatus('completed')).toBe('closed');
    expect(normalizeGroupStatus('nonsense')).toBeNull();
    for (const label of Object.values(GROUP_STATUS_LABEL)) expect(label).toMatch(/[А-Яа-яЁё]/);
    expect(groupStatusLabel('active', (s) => s)).toBe('Учатся');
    expect(groupStatusLabel('weird', (s) => `подпись ${s}`)).toBe('подпись weird');
  });

  it('переходы — как на сервере: соседи, отмена до закрытия, архив из закрытой/отменённой', () => {
    expect(allowedGroupTransitions('draft')).toEqual(['recruiting', 'cancelled']);
    expect(allowedGroupTransitions('active')).toEqual(['recruiting', 'exam', 'cancelled']);
    expect(allowedGroupTransitions('closed')).toEqual(['documents', 'archived']);
    expect(isGroupArchivable('closed')).toBe(true);
    expect(isGroupArchivable('cancelled')).toBe(true);
    expect(isGroupArchivable('in_progress')).toBe(false);
  });

  it('период показывается по-русски, без дат — прочерк', () => {
    expect(formatPeriod('2026-11-05', '2026-12-18')).toBe('05.11.2026 — 18.12.2026');
    expect(formatPeriod(undefined, '2026-12-18')).toBe('— — 18.12.2026');
    expect(formatPeriod(undefined, undefined)).toBe('—');
  });
});

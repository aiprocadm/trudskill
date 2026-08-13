import { describe, expect, it } from 'vitest';

import { ENROLLMENT_STATUS_LABEL, formatDate } from './screen-helpers';

describe('общие подписи экранов', () => {
  it('у каждого состояния зачисления есть русская подпись (TXT-006)', () => {
    const statuses = ['pending', 'active', 'suspended', 'completed', 'cancelled'];
    const missing = statuses.filter((s) => !ENROLLMENT_STATUS_LABEL[s]);
    expect(missing).toEqual([]);
  });

  it('ни одна подпись не написана латиницей', () => {
    const latin = Object.values(ENROLLMENT_STATUS_LABEL).filter((l) => /[A-Za-z]/.test(l));
    expect(latin).toEqual([]);
  });
});

describe('дата человеку', () => {
  it('машинная строка превращается в день-месяц-год', () => {
    expect(formatDate('2026-03-12T09:15:00.000Z')).toBe('12.03.2026');
  });

  it('пустая дата остаётся прочерком — выдумывать «сегодня» нельзя', () => {
    expect(formatDate(undefined)).toBe('—');
    expect(formatDate(null)).toBe('—');
    expect(formatDate('')).toBe('—');
  });

  it('нераспознанное значение показывается как есть, а не как «Invalid Date»', () => {
    expect(formatDate('не дата')).toBe('не дата');
  });
});

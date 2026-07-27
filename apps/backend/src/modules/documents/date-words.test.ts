import { describe, expect, it } from 'vitest';

import { formatRussianDateWords } from './date-words.js';

describe('formatRussianDateWords (ФТ-A2.3)', () => {
  it('formats a plain ISO date the way blanks expect it', () => {
    expect(formatRussianDateWords('2026-07-26')).toBe('26 июля 2026 г.');
    expect(formatRussianDateWords('2026-01-01')).toBe('1 января 2026 г.');
    expect(formatRussianDateWords('2026-12-31')).toBe('31 декабря 2026 г.');
  });

  it('drops the leading zero of the day (приказы пишут «1 марта», не «01 марта»)', () => {
    expect(formatRussianDateWords('2026-03-05')).toBe('5 марта 2026 г.');
  });

  it('accepts a full timestamp and uses its date part', () => {
    expect(formatRussianDateWords('2026-07-26T14:33:02.123Z')).toBe('26 июля 2026 г.');
  });

  it('uses genitive month names for every month', () => {
    const months = Array.from({ length: 12 }, (_, i) =>
      formatRussianDateWords(`2026-${String(i + 1).padStart(2, '0')}-15`)
    );
    expect(months).toEqual([
      '15 января 2026 г.',
      '15 февраля 2026 г.',
      '15 марта 2026 г.',
      '15 апреля 2026 г.',
      '15 мая 2026 г.',
      '15 июня 2026 г.',
      '15 июля 2026 г.',
      '15 августа 2026 г.',
      '15 сентября 2026 г.',
      '15 октября 2026 г.',
      '15 ноября 2026 г.',
      '15 декабря 2026 г.'
    ]);
  });

  it('returns an empty string for anything unparseable (blank must not break)', () => {
    expect(formatRussianDateWords(undefined)).toBe('');
    expect(formatRussianDateWords(null)).toBe('');
    expect(formatRussianDateWords('')).toBe('');
    expect(formatRussianDateWords('26.07.2026')).toBe('');
    expect(formatRussianDateWords('2026-13-01')).toBe('');
    expect(formatRussianDateWords('2026-00-10')).toBe('');
  });

  it('is deterministic — no dependency on runtime locale data (ФТ-A1.4)', () => {
    const first = formatRussianDateWords('2026-07-26');
    const second = formatRussianDateWords('2026-07-26');
    expect(second).toBe(first);
  });
});

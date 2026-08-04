import { describe, expect, it } from 'vitest';

import { addWorkingDays, isGraceExpired } from './rental-billing.util.js';

/** ФТ-D5.1: grace в рабочих днях. 2026-08-04 — вторник. */
describe('rental billing grace (ФТ-D5.1)', () => {
  it('0 рабочих дней = исходная дата', () => {
    expect(addWorkingDays('2026-08-04', 0)).toBe('2026-08-04');
    expect(addWorkingDays('2026-08-04', -5)).toBe('2026-08-04');
  });

  it('перешагивает выходные: пятница + 1 рабочий день = понедельник', () => {
    // 2026-08-07 — пятница, 2026-08-08/09 — выходные, 2026-08-10 — понедельник.
    expect(addWorkingDays('2026-08-07', 1)).toBe('2026-08-10');
  });

  it('10 рабочих дней от вторника = через две календарные недели', () => {
    // вт 04.08 + 10 рабочих = вт 18.08 (два уик-энда пропущены).
    expect(addWorkingDays('2026-08-04', 10)).toBe('2026-08-18');
  });

  it('счёт с субботним сроком: отсчёт всё равно по рабочим дням', () => {
    // сб 08.08 + 1 рабочий = пн 10.08.
    expect(addWorkingDays('2026-08-08', 1)).toBe('2026-08-10');
  });

  it('в последний день grace кабинет ещё живёт, приостановка — со следующего', () => {
    const due = '2026-08-04';
    const lastDay = addWorkingDays(due, 10); // 2026-08-18
    expect(isGraceExpired(due, 10, lastDay)).toBe(false);
    expect(isGraceExpired(due, 10, '2026-08-19')).toBe(true);
  });

  it('до наступления срока оплаты просрочки нет', () => {
    expect(isGraceExpired('2026-08-20', 10, '2026-08-04')).toBe(false);
  });

  it('grace = 0 — приостановка со дня после срока оплаты', () => {
    expect(isGraceExpired('2026-08-04', 0, '2026-08-04')).toBe(false);
    expect(isGraceExpired('2026-08-04', 0, '2026-08-05')).toBe(true);
  });

  it('некорректная дата — явная ошибка, а не молчаливый NaN', () => {
    expect(() => addWorkingDays('не дата', 1)).toThrow(/некорректная дата/);
  });
});

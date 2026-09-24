import { describe, expect, it } from 'vitest';

import {
  generateGroupCode,
  isValidGroupCodePattern,
  isoWeek,
  renderGroupCodePrefix
} from './group-code.js';

/** МГ-B1.2 (РМ47): код группы по шаблону центра, ISO-неделя и счётчик в поясе центра. */
describe('автономер группы (МГ-B1.2)', () => {
  const at = new Date('2026-09-24T21:30:00.000Z'); // в Москве уже 25.09 00:30

  it('ISO-неделя: границы года и четверг', () => {
    expect(isoWeek('2026-01-01')).toBe(1);
    expect(isoWeek('2026-09-24')).toBe(39);
    expect(isoWeek('2027-01-01')).toBe(53);
    expect(isoWeek('2024-12-30')).toBe(1);
  });

  it('шаблон по умолчанию {YY}{WW}{NN}: год, неделя, счётчик с двух знаков, календарь — в поясе центра', () => {
    expect(generateGroupCode({ at, timezone: 'Europe/Moscow', existingCodes: [] })).toBe('263901');
    expect(generateGroupCode({ at, timezone: 'UTC', existingCodes: [] })).toBe('263901');
    // В Владивостоке (UTC+10) уже пятница 25.09 — та же неделя, а день другой.
    expect(
      generateGroupCode({
        pattern: '{YYYY}-{MM}-{DD}-{NN}',
        at,
        timezone: 'Asia/Vladivostok',
        existingCodes: []
      })
    ).toBe('2026-09-25-01');
  });

  it('счётчик — минимальный свободный номер в префиксе; при переполнении — три знака', () => {
    expect(generateGroupCode({ at, timezone: 'UTC', existingCodes: ['263901', '263902'] })).toBe(
      '263903'
    );
    expect(generateGroupCode({ at, timezone: 'UTC', existingCodes: ['263902'] })).toBe('263901');
    const full = Array.from({ length: 99 }, (_, i) => `2639${String(i + 1).padStart(2, '0')}`);
    expect(generateGroupCode({ at, timezone: 'UTC', existingCodes: full })).toBe('2639100');
    expect(
      generateGroupCode({ pattern: '{YY}{WW}{NNN}', at, timezone: 'UTC', existingCodes: [] })
    ).toBe('2639001');
  });

  it('шаблон без счётчика получает его в конец; направление подставляется, если есть', () => {
    expect(
      generateGroupCode({ pattern: 'OT-{YYYY}', at, timezone: 'UTC', existingCodes: ['OT-202601'] })
    ).toBe('OT-202602');
    expect(
      generateGroupCode({
        pattern: '{direction.code}-{YY}{NN}',
        at,
        timezone: 'UTC',
        existingCodes: [],
        directionCode: 'ОТ'
      })
    ).toBe('ОТ-2601');
    expect(
      renderGroupCodePrefix({
        pattern: '{direction.code}{NN}',
        at,
        timezone: 'UTC',
        existingCodes: []
      }).prefix
    ).toBe('\u0000');
  });

  it('неизвестный токен или пустой шаблон — шаблон по умолчанию', () => {
    expect(isValidGroupCodePattern('{YY}{WW}{NN}')).toBe(true);
    expect(isValidGroupCodePattern('{YY}{QQ}')).toBe(false);
    expect(isValidGroupCodePattern('')).toBe(false);
    expect(generateGroupCode({ pattern: '{YY}{QQ}', at, timezone: 'UTC', existingCodes: [] })).toBe(
      '263901'
    );
  });
});

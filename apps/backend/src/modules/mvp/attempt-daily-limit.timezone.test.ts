import { describe, expect, it } from 'vitest';

import { todayIn } from '../../common/utils/tenant-calendar.js';

/**
 * Дневной лимит попыток теста сбрасывается в МЕСТНУЮ полночь (журнал 301).
 *
 * Раньше «сегодня» и дата попытки считались по UTC. Для центра в Новосибирске (UTC+7) это
 * значило, что лимит сбрасывался в 07:00 утра по местному времени, а попытки, сделанные
 * ночью, считались вчерашними. Слушатель, у которого «две попытки в день», обнаруживал их
 * потраченными или, наоборот, лишними — в зависимости от часа.
 *
 * Проверяется само правило сравнения: обе стороны считаются в ОДНОМ календаре. Без этого
 * граница суток разъезжается, даже если «сегодня» посчитано верно.
 */

describe('граница суток дневного лимита попыток (журнал 301)', () => {
  const tenantTimezone = 'Asia/Novosibirsk';

  it('попытка в 23:30 местного и «сегодня» в 23:40 местного — ОДИН день', () => {
    // 2026-05-20T16:30Z = 23:30 в Новосибирске; 16:40Z = 23:40 там же.
    const attemptStartedAt = new Date('2026-05-20T16:30:00.000Z');
    const now = new Date('2026-05-20T16:40:00.000Z');

    expect(todayIn(tenantTimezone, attemptStartedAt)).toBe(todayIn(tenantTimezone, now));
    // По UTC это тоже один день — расхождения ещё нет.
    expect(attemptStartedAt.toISOString().slice(0, 10)).toBe(now.toISOString().slice(0, 10));
  });

  it('попытка в 02:00 местного — уже НОВЫЕ сутки, хотя по UTC ещё вчерашние', () => {
    // 2026-05-20T19:00Z = 02:00 21 мая в Новосибирске.
    const attemptStartedAt = new Date('2026-05-20T19:00:00.000Z');
    const now = new Date('2026-05-20T20:00:00.000Z');

    expect(todayIn(tenantTimezone, attemptStartedAt)).toBe('2026-05-21');
    expect(todayIn(tenantTimezone, now)).toBe('2026-05-21');
    // А по UTC обе отметки — 20 мая: лимит не сбросился бы до 07:00 местного утра.
    expect(attemptStartedAt.toISOString().slice(0, 10)).toBe('2026-05-20');
  });

  it('вчерашняя попытка не считается сегодняшней', () => {
    // 12:00 местного 20 мая и 12:00 местного 21 мая.
    const yesterday = new Date('2026-05-20T05:00:00.000Z');
    const today = new Date('2026-05-21T05:00:00.000Z');

    expect(todayIn(tenantTimezone, yesterday)).not.toBe(todayIn(tenantTimezone, today));
  });
});

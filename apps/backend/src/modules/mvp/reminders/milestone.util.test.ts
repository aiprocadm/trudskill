import { describe, expect, it } from 'vitest';

import {
  COURSE_DEADLINE_MILESTONES,
  LICENSE_EXPIRY_MILESTONES,
  RECERT_MILESTONES,
  pickMilestone
} from './milestone.util.js';

const ASOF = '2026-06-05';

describe('pickMilestone', () => {
  it('returns the smallest satisfied threshold', () => {
    expect(pickMilestone(ASOF, '2026-08-01', RECERT_MILESTONES)).toBe(60);
    expect(pickMilestone(ASOF, '2026-06-30', RECERT_MILESTONES)).toBe(30);
    expect(pickMilestone(ASOF, '2026-06-08', RECERT_MILESTONES)).toBe(7);
  });

  it('returns the most-urgent milestone for an already-expired date', () => {
    expect(pickMilestone(ASOF, '2026-01-01', RECERT_MILESTONES)).toBe(7);
  });

  it('returns null when the date is beyond the largest threshold', () => {
    expect(pickMilestone(ASOF, '2027-01-01', RECERT_MILESTONES)).toBeNull();
  });

  it('normalizes an ISO timestamp target to its date part', () => {
    expect(pickMilestone(ASOF, '2026-06-15T09:00:00.000Z', COURSE_DEADLINE_MILESTONES)).toBe(14);
  });
});

// === ФТ-E4 (Фаза 4 Task 9) — окна напоминаний приведены к ТЗ ===
describe('окна напоминаний (ФТ-E4)', () => {
  it('переобучение напоминает за 60/30/7 дней — как требует ТЗ', () => {
    expect([...RECERT_MILESTONES]).toEqual([7, 30, 60]);
  });

  /*
   * ТЗ 11.3, решение Р11: сроки обучения — за 14, 3 и 1 день. В коде стояло 14/7/1, и это
   * расхождение с решением владельца никто не замечал (журнал 513). Три дня и семь — разные
   * вещи: за три дня человек ещё успевает дочитать курс, за семь он про письмо забывает.
   */
  it('сроки обучения напоминают за 14/3/1 день — решение Р11', () => {
    expect([...COURSE_DEADLINE_MILESTONES]).toEqual([1, 3, 14]);
  });

  it('лицензия центра сохраняет 90/30/7: её продление занимает месяцы', () => {
    expect([...LICENSE_EXPIRY_MILESTONES]).toEqual([7, 30, 90]);
    // Окна намеренно РАЗНЫЕ: просроченное удостоверение — повод записаться на курс,
    // просроченная лицензия останавливает выдачу документов вообще.
    expect([...LICENSE_EXPIRY_MILESTONES]).not.toEqual([...RECERT_MILESTONES]);
  });

  it('горизонт скана переобучения совпадает с самым дальним окном', async () => {
    const { RECERT_HORIZON_DAYS } =
      await import('../recertification/recertification-scanner.service.js');
    expect(RECERT_HORIZON_DAYS).toBe(Math.max(...RECERT_MILESTONES));
  });
});

import { describe, expect, it } from 'vitest';

import {
  formatDateTime,
  formatEntityStatus,
  formatNumericTolerance,
  formatQuestionScore,
  formatQuestionType,
  formatReviewerQueueItem,
  formatTestRule
} from './format';

import type { ReviewerQueueListItem, TestRuleSummary } from './types';

describe('formatQuestionType', () => {
  it('returns RU label for each of 5 types', () => {
    expect(formatQuestionType('single_choice')).toBe('Один из списка');
    expect(formatQuestionType('multiple_choice')).toBe('Несколько из списка');
    expect(formatQuestionType('number_input')).toBe('Числовой ответ');
    expect(formatQuestionType('text')).toBe('Краткий текст');
    expect(formatQuestionType('essay')).toBe('Развёрнутый ответ');
  });
});

describe('formatEntityStatus', () => {
  it('returns RU label for each status', () => {
    expect(formatEntityStatus('active')).toBe('Активный');
    expect(formatEntityStatus('draft')).toBe('Черновик');
    expect(formatEntityStatus('published')).toBe('Опубликован');
    expect(formatEntityStatus('archived')).toBe('В архиве');
  });
});

describe('formatNumericTolerance', () => {
  it('returns plain number when tolerance is undefined or 0', () => {
    expect(formatNumericTolerance(42)).toBe('42');
    expect(formatNumericTolerance(42, 0)).toBe('42');
  });

  it('returns "X ± Y" when tolerance > 0', () => {
    expect(formatNumericTolerance(42, 0.1)).toBe('42 ± 0.1');
    expect(formatNumericTolerance(100, 5)).toBe('100 ± 5');
  });
});

describe('formatQuestionScore (RU pluralization)', () => {
  it('handles 1 → "балл"', () => {
    expect(formatQuestionScore(1)).toBe('1 балл');
    expect(formatQuestionScore(21)).toBe('21 балл');
  });

  it('handles 2-4 → "балла"', () => {
    expect(formatQuestionScore(2)).toBe('2 балла');
    expect(formatQuestionScore(3)).toBe('3 балла');
    expect(formatQuestionScore(4)).toBe('4 балла');
    expect(formatQuestionScore(22)).toBe('22 балла');
  });

  it('handles 5-20 + tens → "баллов"', () => {
    expect(formatQuestionScore(5)).toBe('5 баллов');
    expect(formatQuestionScore(11)).toBe('11 баллов');
    expect(formatQuestionScore(12)).toBe('12 баллов');
    expect(formatQuestionScore(14)).toBe('14 баллов');
    expect(formatQuestionScore(20)).toBe('20 баллов');
  });

  it('handles 0', () => {
    expect(formatQuestionScore(0)).toBe('0 баллов');
  });
});

describe('formatTestRule', () => {
  const baseRule: TestRuleSummary = {
    attemptLimit: 3,
    dailyResetEnabled: false,
    randomizeQuestions: false,
    passingScore: 0.7
  };

  it('returns mandatory bullets', () => {
    const bullets = formatTestRule(baseRule);
    expect(bullets).toContain('Лимит попыток: 3');
    expect(bullets).toContain('Рандомизация: выкл');
    expect(bullets).toContain('Проходной балл: 0.7');
  });

  it('includes optional questionCount + timeLimitMinutes when set', () => {
    const bullets = formatTestRule({
      ...baseRule,
      questionCount: 10,
      timeLimitMinutes: 30,
      randomizeQuestions: true
    });
    expect(bullets).toContain('Рандомизация: вкл');
    expect(bullets).toContain('Кол-во вопросов: 10');
    expect(bullets).toContain('Лимит времени: 30 мин');
  });

  it('includes daily reset bullet when enabled', () => {
    const bullets = formatTestRule({ ...baseRule, dailyResetEnabled: true });
    expect(bullets.some((b) => b.includes('Дневной сброс'))).toBe(true);
  });
});

describe('formatReviewerQueueItem', () => {
  it('formats attempt-kind correctly', () => {
    const item: ReviewerQueueListItem = {
      kind: 'attempt',
      id: 'a1',
      tenantId: 't1',
      learnerId: 'L42',
      testId: 'test_x',
      submittedAt: '2026-05-30T10:00:00Z',
      learnerName: 'Иванов Иван Иванович',
      testTitle: 'Электробезопасность, II группа'
    };
    const result = formatReviewerQueueItem(item);
    expect(result.title).toContain('Попытка теста');
    // Ревизия 2026-08-25: в подписи должно быть название и имя, а не идентификаторы.
    expect(result.title).toContain('Электробезопасность, II группа');
    expect(result.title).not.toContain('test_x');
    expect(result.subtitle).toContain('Иванов Иван Иванович');
    expect(result.subtitle).not.toContain('L42');
  });

  it('говорит словами, когда имя или название не пришли', () => {
    const item: ReviewerQueueListItem = {
      kind: 'attempt',
      id: 'a2',
      tenantId: 't1',
      learnerId: 'L42',
      testId: 'test_x',
      submittedAt: '2026-05-30T10:00:00Z'
    };
    const result = formatReviewerQueueItem(item);
    expect(result.title).toContain('Без названия');
    expect(result.subtitle).toContain('Имя не передано');
  });

  it('formats submission-kind correctly', () => {
    const item: ReviewerQueueListItem = {
      kind: 'submission',
      id: 's1',
      tenantId: 't1',
      learnerId: 'L7',
      assignmentId: 'asn_y',
      submittedAt: '2026-05-30T10:00:00Z',
      learnerName: 'Петрова Мария Сергеевна',
      assignmentTitle: 'Отчёт по стажировке'
    };
    const result = formatReviewerQueueItem(item);
    expect(result.title).toContain('Практическая работа');
    expect(result.title).toContain('Отчёт по стажировке');
    expect(result.title).not.toContain('asn_y');
    expect(result.subtitle).toContain('Петрова Мария Сергеевна');
  });
});

describe('formatDateTime', () => {
  it('печатает дату и время в общем для приложения виде', () => {
    /*
     * ТЗ 5.12.1: формат один на всё приложение. Здесь был свой — «2026-05-30 14:30», а в
     * эксплуатации «30.05.2026, 17:30:00»: один и тот же момент на соседних экранах
     * выглядел по-разному (журнал 479). Инвариант не ослаблен — он сведён к общему.
     */
    const result = formatDateTime('2026-05-30T14:30:00Z');
    expect(result).toMatch(/^\d{2}\.\d{2}\.\d{4}, \d{2}:\d{2}:\d{2}$/);
  });

  it('returns "—" for empty input', () => {
    expect(formatDateTime('')).toBe('—');
  });

  it('returns raw string on invalid ISO', () => {
    expect(formatDateTime('not-a-date')).toBe('not-a-date');
  });
});

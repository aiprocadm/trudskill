import { describe, expect, it } from 'vitest';

import { ABANDONED_AFTER_MS, isAbandonedRecording } from './abandoned-recording.js';

/**
 * Брошенная запись прокторинга.
 *
 * Смысл проверок: администратор должен отличать экзамен, который идёт прямо сейчас, от
 * записи, оборванной две недели назад. Обе до ревизии выглядели одинаково.
 */

const NOW = '2026-08-26T18:00:00.000Z';
const ago = (ms: number) => new Date(Date.parse(NOW) - ms).toISOString();

const recording = (over: Record<string, unknown> = {}) => ({
  recordingStatus: 'recording',
  startedAt: ago(30 * 60 * 1000),
  ...over
});

describe('идущая запись не помечается зря', () => {
  it('экзамен, начатый полчаса назад, — это просто экзамен', () => {
    expect(isAbandonedRecording(recording(), NOW)).toBe(false);
  });

  it('ровно на пороге — уже брошена: шесть часов не пишет ни один экзамен', () => {
    expect(isAbandonedRecording(recording({ startedAt: ago(ABANDONED_AFTER_MS) }), NOW)).toBe(true);
  });

  it('за минуту до порога — ещё идёт', () => {
    expect(
      isAbandonedRecording(recording({ startedAt: ago(ABANDONED_AFTER_MS - 60_000) }), NOW)
    ).toBe(false);
  });
});

describe('завершённые записи не трогаются', () => {
  it('завершённая давно запись — не брошенная, а нормальная', () => {
    expect(
      isAbandonedRecording(
        recording({ recordingStatus: 'completed', startedAt: ago(30 * 24 * 60 * 60 * 1000) }),
        NOW
      )
    ).toBe(false);
  });

  it('запись со сбоем тоже не переобъявляется', () => {
    expect(
      isAbandonedRecording({ recordingStatus: 'failed', startedAt: ago(999_999_999) }, NOW)
    ).toBe(false);
  });
});

describe('неполные данные не приводят к ложному обвинению', () => {
  it('без даты начала признак не выставляется', () => {
    expect(isAbandonedRecording({ recordingStatus: 'recording' }, NOW)).toBe(false);
  });

  it('битая дата начала не считается «давно»', () => {
    expect(isAbandonedRecording({ recordingStatus: 'recording', startedAt: 'вчера' }, NOW)).toBe(
      false
    );
  });

  it('битое «сейчас» тоже не выставляет признак', () => {
    expect(isAbandonedRecording(recording({ startedAt: ago(999_999_999) }), 'не дата')).toBe(false);
  });

  it('дата создания подходит, когда нет даты начала', () => {
    expect(
      isAbandonedRecording(
        { recordingStatus: 'recording', createdAt: ago(ABANDONED_AFTER_MS + 1000) },
        NOW
      )
    ).toBe(true);
  });
});

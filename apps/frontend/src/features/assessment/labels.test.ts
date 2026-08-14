import { describe, expect, it } from 'vitest';

import {
  ATTEMPT_STATUS_LABELS,
  CATALOG_STATUS_LABELS,
  CATALOG_STATUS_OPTIONS,
  REVIEW_STATUS_LABELS,
  attemptResultText,
  statusLabel
} from './labels';

describe('подписи экрана оценивания (TXT-006)', () => {
  it('у каждого состояния из фильтра есть русская подпись', () => {
    const missing = CATALOG_STATUS_OPTIONS.filter((code) => !CATALOG_STATUS_LABELS[code]);
    expect(missing).toEqual([]);
  });

  it('ни одна подпись не написана латиницей', () => {
    const all = [
      ...Object.values(CATALOG_STATUS_LABELS),
      ...Object.values(ATTEMPT_STATUS_LABELS),
      ...Object.values(REVIEW_STATUS_LABELS)
    ];
    expect(all.filter((label) => /[A-Za-z]/.test(label))).toEqual([]);
  });

  it('незнакомый код показывается как есть, а не исчезает', () => {
    expect(statusLabel(ATTEMPT_STATUS_LABELS, 'новое_состояние')).toBe('новое_состояние');
  });
});

describe('итог попытки словами', () => {
  it('вместо машинной строки score=8/10, passed=да', () => {
    expect(attemptResultText(8, 10, true)).toBe('Зачёт: 8 из 10 баллов');
  });

  it('незачёт назван прямо, а не отсутствием слова «зачёт»', () => {
    expect(attemptResultText(3, 10, false)).toBe('Не зачтено: 3 из 10 баллов');
  });

  it('в тексте итога нет ни латиницы, ни знаков «=»', () => {
    const text = attemptResultText(5, 5, true);
    expect(/[A-Za-z=]/.test(text)).toBe(false);
  });
});

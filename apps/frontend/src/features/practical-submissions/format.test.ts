import { describe, expect, it } from 'vitest';

import { formatMaxScore, formatSubmissionStatus, isSubmissionEditable } from './format';

describe('practical-submissions format', () => {
  it('maps RU status labels', () => {
    expect(formatSubmissionStatus('returned')).toBe('Возвращено на доработку');
    expect(formatSubmissionStatus('reviewed')).toBe('Проверено');
  });
  it('treats not_started/draft/returned as editable, others not', () => {
    expect(isSubmissionEditable('returned')).toBe(true);
    expect(isSubmissionEditable('draft')).toBe(true);
    expect(isSubmissionEditable('under_review')).toBe(false);
    expect(isSubmissionEditable('reviewed')).toBe(false);
  });
  it('formats max score', () => {
    expect(formatMaxScore(10)).toBe('Макс. балл: 10');
  });
});

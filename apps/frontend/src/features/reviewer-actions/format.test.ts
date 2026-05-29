import { describe, expect, it } from 'vitest';

import { formatQueueKind, formatReviewStatus } from './format';

describe('reviewer-actions format', () => {
  it('maps RU review status labels', () => {
    expect(formatReviewStatus('pending')).toBe('Ожидает');
    expect(formatReviewStatus('in_review')).toBe('На проверке');
    expect(formatReviewStatus('completed')).toBe('Завершено');
  });

  it('maps queue kind to RU labels', () => {
    expect(formatQueueKind('attempt')).toBe('Тест (эссе)');
    expect(formatQueueKind('submission')).toBe('Практическая работа');
  });
});

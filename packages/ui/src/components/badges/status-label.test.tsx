import { describe, expect, it } from 'vitest';

import { statusAccessibleLabel } from './status-label.js';

describe('statusAccessibleLabel', () => {
  it('известные статусы → человекочитаемый текст', () => {
    expect(statusAccessibleLabel('active')).toBeTruthy();
    expect(statusAccessibleLabel('inactive')).toBeTruthy();
    expect(statusAccessibleLabel('active')).not.toBe('active');
  });
  it('неизвестный статус → сам статус как fallback', () => {
    expect(statusAccessibleLabel('weird_status')).toBe('weird_status');
  });
});

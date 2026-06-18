import { describe, expect, it } from 'vitest';

import { exportSignatureBadgeLabel } from './export-signature-badge';

describe('exportSignatureBadgeLabel (Phase 6 КЭП)', () => {
  it('signed → "Подписано КЭП"', () => {
    expect(exportSignatureBadgeLabel('signed')).toBe('Подписано КЭП');
  });
  it('failed → "Ошибка подписи"', () => {
    expect(exportSignatureBadgeLabel('failed')).toBe('Ошибка подписи');
  });
  it('unsigned / undefined → null', () => {
    expect(exportSignatureBadgeLabel('unsigned')).toBeNull();
    expect(exportSignatureBadgeLabel(undefined)).toBeNull();
  });
});

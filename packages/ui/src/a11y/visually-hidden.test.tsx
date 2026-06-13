import { describe, expect, it } from 'vitest';

import { VISUALLY_HIDDEN_CLASS, fieldId } from './visually-hidden.js';

describe('a11y helpers', () => {
  it('VISUALLY_HIDDEN_CLASS — стабильное имя класса', () => {
    expect(VISUALLY_HIDDEN_CLASS).toBe('ui-visually-hidden');
  });
  it('fieldId детерминирован по (base, suffix)', () => {
    expect(fieldId('search', 'label')).toBe('search-label');
    expect(fieldId('lookup-status', 'input')).toBe('lookup-status-input');
  });
  it('fieldId санитизирует пробелы/спецсимволы в стабильный slug', () => {
    expect(fieldId('Поиск по ФИО', 'label')).toMatch(/^[a-z0-9-]+-label$/);
  });
  it('fieldId пустой/нерелевантный base → fallback "field"', () => {
    expect(fieldId('!!!', 'input')).toBe('field-input');
  });
});

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
  it('fieldId сохраняет кириллицу (русскоязычный UI), пробелы → дефис', () => {
    expect(fieldId('Поиск по ФИО', 'label')).toBe('поиск-по-фио-label');
  });
  it('fieldId различает разные кириллические подписи (нет коллапса в один slug)', () => {
    expect(fieldId('Фамилия', 'hint')).toBe('фамилия-hint');
    expect(fieldId('Имя', 'error')).toBe('имя-error');
    expect(fieldId('Фамилия', 'hint')).not.toBe(fieldId('Имя', 'hint'));
  });
  it('fieldId пустой/нерелевантный base → fallback "field"', () => {
    expect(fieldId('!!!', 'input')).toBe('field-input');
    expect(fieldId('', 'label')).toBe('field-label');
  });
});

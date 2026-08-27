import { describe, expect, it } from 'vitest';

import { isFormDirty } from './dirty';

/*
 * Ревизия 2026-08-27 (порция 28, журнал 281): признак «есть несохранённые правки» —
 * то, чего боковой панели не хватало, чтобы спросить подтверждение перед закрытием.
 */
describe('признак несохранённых правок (порция 28)', () => {
  it('нетронутая форма — правок нет', () => {
    const initial = { firstName: 'Иван', lastName: 'Петров', status: 'active' };
    expect(isFormDirty({ ...initial }, initial)).toBe(false);
  });

  it('изменённое поле — правки есть', () => {
    const initial = { firstName: 'Иван', lastName: 'Петров' };
    expect(isFormDirty({ ...initial, firstName: 'Пётр' }, initial)).toBe(true);
  });

  it('очищенное поле — тоже правка (потерять его особенно обидно)', () => {
    const initial = { email: 'a@example.ru' };
    expect(isFormDirty({ email: '' }, initial)).toBe(true);
  });

  it('списки сравниваются по содержимому, а не по ссылке', () => {
    const initial = { optionIds: ['a', 'b'] };
    expect(isFormDirty({ optionIds: ['a', 'b'] }, initial)).toBe(false);
    expect(isFormDirty({ optionIds: ['a', 'c'] }, initial)).toBe(true);
    expect(isFormDirty({ optionIds: ['a'] }, initial)).toBe(true);
  });

  it('вложенные значения (варианты ответа) тоже видны', () => {
    const initial = { options: [{ text: 'Да', correct: true }] };
    expect(isFormDirty({ options: [{ text: 'Да', correct: true }] }, initial)).toBe(false);
    expect(isFormDirty({ options: [{ text: 'Нет', correct: true }] }, initial)).toBe(true);
  });

  it('появившееся поле — правка', () => {
    expect(isFormDirty({ a: '1', b: '2' }, { a: '1' } as Record<string, unknown>)).toBe(true);
  });

  it('null и undefined не путаются между собой', () => {
    expect(isFormDirty({ note: null }, { note: undefined } as Record<string, unknown>)).toBe(true);
  });
});

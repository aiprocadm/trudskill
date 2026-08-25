import { describe, expect, it } from 'vitest';

import { FORMS, plural, withPlural } from './plural';

describe('русское склонение после числа', () => {
  it('единица, двойка и пятёрка берут разные формы', () => {
    expect(withPlural(1, FORMS.row)).toBe('1 строка');
    expect(withPlural(2, FORMS.row)).toBe('2 строки');
    expect(withPlural(5, FORMS.row)).toBe('5 строк');
  });

  it('подростковые числа — исключение, а не правило последней цифры', () => {
    // 11–14 берут форму «строк», хотя последние цифры 1..4.
    expect(plural(11, FORMS.row)).toBe('строк');
    expect(plural(12, FORMS.row)).toBe('строк');
    expect(plural(14, FORMS.row)).toBe('строк');
  });

  it('за подростковыми числами правило возвращается', () => {
    expect(plural(21, FORMS.row)).toBe('строка');
    expect(plural(22, FORMS.row)).toBe('строки');
    expect(plural(25, FORMS.row)).toBe('строк');
    expect(plural(111, FORMS.row)).toBe('строк');
    expect(plural(121, FORMS.row)).toBe('строка');
  });

  it('ноль — «строк», как и любое множество', () => {
    expect(withPlural(0, FORMS.row)).toBe('0 строк');
  });

  it('отрицательное число не ломает разбор', () => {
    // В интерфейсе встречается «-3 дня» у просроченных сроков.
    expect(plural(-3, FORMS.row)).toBe('строки');
  });

  it('готовые наборы совпадают с обычным словоупотреблением', () => {
    expect(withPlural(1, FORMS.learner)).toBe('1 слушатель');
    expect(withPlural(3, FORMS.group)).toBe('3 группы');
    expect(withPlural(7, FORMS.document)).toBe('7 документов');
  });
});

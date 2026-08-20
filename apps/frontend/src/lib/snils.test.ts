import { describe, expect, it } from 'vitest';

import { isValidSnilsChecksum, normalizeSnils, snilsInputHint } from './snils';

/* Контрольная сумма сходится: 1·9+1·8+2·7+2·6+3·5+3·4+4·3+4·2+5·1 = 95. */
const VALID = '11223344595';
/* Те же девять цифр, контрольное число подменено — так выглядит опечатка. */
const BROKEN = '11223344500';

describe('ФТ-C4.1 · подсказка по СНИЛС в форме', () => {
  it('пустое поле молчит: СНИЛС обязателен для выгрузки, а не для карточки', () => {
    expect(snilsInputHint('')).toBeNull();
    expect(snilsInputHint('   ')).toBeNull();
  });

  it('незаконченный ввод молчит, пока человек печатает', () => {
    expect(snilsInputHint('112')).toBeNull();
    expect(snilsInputHint('112-233-445 9')).toBeNull();
  });

  it('верный номер молчит — и цифрами, и в маске', () => {
    expect(snilsInputHint(VALID)).toBeNull();
    expect(snilsInputHint('112-233-445 95')).toBeNull();
  });

  it('опечатка объясняется словами, а не «неверный формат»', () => {
    const hint = snilsInputHint(BROKEN);
    expect(hint).toMatch(/контрольной сумме/);
    expect(hint).toMatch(/карточке/);
  });

  it('лишние цифры — отдельная подсказка, а не разговор про контрольную сумму', () => {
    expect(snilsInputHint('112233445951')).toMatch(/11 цифр/);
  });

  it('нормализация снимает маску', () => {
    expect(normalizeSnils('112-233-445 95')).toBe(VALID);
    expect(isValidSnilsChecksum(VALID)).toBe(true);
    expect(isValidSnilsChecksum(BROKEN)).toBe(false);
  });
});

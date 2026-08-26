import { describe, expect, it } from 'vitest';

import { maskEmail, maskFullName, maskSnils } from './mask-pii.js';

/**
 * Маскирование для журналов. Правило: узнать запись можно, восстановить человека — нет.
 */

describe('адрес электронной почты', () => {
  it('оставляет первый знак и домен целиком', () => {
    expect(maskEmail('ivanov@example.com')).toBe('i***@example.com');
  });

  it('домен виден полностью — по нему отличают корпоративную почту центра', () => {
    expect(maskEmail('a.petrov@uc-ohrana.ru')).toBe('a***@uc-ohrana.ru');
  });

  it('пусто остаётся пустым, а не «undefined»', () => {
    expect(maskEmail(undefined)).toBe('—');
    expect(maskEmail('')).toBe('—');
  });

  it('не адрес тоже не печатается целиком', () => {
    expect(maskEmail('какая-то строка')).toBe('как***');
  });

  it('адрес с точками в имени не выдаёт длину имени', () => {
    expect(maskEmail('very.long.name.here@mail.ru')).toBe('v***@mail.ru');
  });
});

describe('СНИЛС', () => {
  it('оставляет две последние цифры — по ним отличают записи', () => {
    expect(maskSnils('123-456-789 00')).toBe('***-***-*** 00');
  });

  it('работает и без разделителей', () => {
    expect(maskSnils('12345678900')).toBe('***-***-*** 00');
  });

  it('короткий мусор не раскрывается', () => {
    expect(maskSnils('12')).toBe('***');
  });
});

describe('ФИО', () => {
  it('фамилия остаётся, имя и отчество — инициалами', () => {
    expect(maskFullName('Иванов Иван Иванович')).toBe('Иванов И. И.');
  });

  it('без отчества тоже работает', () => {
    expect(maskFullName('Петрова Мария')).toBe('Петрова М.');
  });

  it('одна фамилия остаётся как есть', () => {
    expect(maskFullName('Сидоров')).toBe('Сидоров');
  });

  it('лишние пробелы не ломают разбор', () => {
    expect(maskFullName('  Иванов   Иван  ')).toBe('Иванов И.');
  });
});

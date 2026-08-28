import { describe, expect, it } from 'vitest';

import { shuffle } from './shuffle.util.js';

/**
 * Честное перемешивание вопросов (ФТ-E2, Фаза 2 Task 12).
 *
 * Главный тест здесь — про РАВНОМЕРНОСТЬ. Прежняя реализация
 * (`sort(() => Math.random() - 0.5)`) проходила бы проверки «состав не изменился» и
 * «порядок иногда другой», но раздавала слушателям почти одинаковый порядок вопросов.
 */

describe('shuffle', () => {
  it('сохраняет состав и длину', () => {
    const source = ['a', 'b', 'c', 'd', 'e'];
    const result = shuffle(source);
    expect(result).toHaveLength(source.length);
    expect([...result].sort()).toEqual([...source].sort());
  });

  it('не портит исходный массив — он снимок вопросов попытки', () => {
    const source = ['a', 'b', 'c'];
    shuffle(source, () => 0);
    expect(source).toEqual(['a', 'b', 'c']);
  });

  it('с детерминированным источником даёт воспроизводимый результат', () => {
    const source = [1, 2, 3, 4, 5];
    const constant = () => 0;
    expect(shuffle(source, constant)).toEqual(shuffle(source, constant));
  });

  it('РАВНОМЕРНОСТЬ: каждый элемент бывает на каждой позиции примерно одинаково часто', () => {
    // Ровно то, что проваливала прежняя реализация: элементы липли к своим местам.
    const source = ['a', 'b', 'c', 'd'];
    const runs = 12_000;
    const counts = new Map<string, number[]>(source.map((item) => [item, [0, 0, 0, 0]]));

    for (let i = 0; i < runs; i += 1) {
      shuffle(source).forEach((item, position) => {
        const row = counts.get(item)!;
        row[position] = (row[position] ?? 0) + 1;
      });
    }

    const expected = runs / source.length; // 3000
    for (const [, positions] of counts) {
      for (const hits of positions) {
        // Допуск ±20% от ожидания: перекос прежней реализации был кратно больше.
        expect(hits).toBeGreaterThan(expected * 0.8);
        expect(hits).toBeLessThan(expected * 1.2);
      }
    }
  });

  it('первый элемент реально уходит с первого места', () => {
    const source = Array.from({ length: 10 }, (_, i) => i);
    const staysFirst = Array.from({ length: 2000 }, () => shuffle(source)[0]).filter(
      (value) => value === 0
    ).length;
    // При честном перемешивании это ~10%; у sort-компаратора доля была намного выше.
    expect(staysFirst).toBeLessThan(2000 * 0.2);
  });

  it('пустой и одноэлементный массив не ломают алгоритм', () => {
    expect(shuffle([])).toEqual([]);
    expect(shuffle(['single'])).toEqual(['single']);
  });

  it('сломанный источник случайности не выбрасывает элементы', () => {
    const source = ['a', 'b', 'c'];
    for (const broken of [() => 1, () => Number.NaN, () => -1]) {
      const result = shuffle(source, broken);
      expect([...result].sort()).toEqual([...source].sort());
    }
  });
});

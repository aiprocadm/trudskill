import { describe, expect, it } from 'vitest';

import { ProgramOrderError, applyOrder, movedByOne, movedTo } from './program-order.js';

/**
 * Перестановка пунктов программы (ТЗ 8.4).
 *
 * Главное, что здесь закреплено: порядок задаётся СПИСКОМ ЦЕЛИКОМ. Это делает запрос
 * идемпотентным — повторили после обрыва связи, результат тот же, — и не позволяет
 * принять «половину порядка».
 */

const item = (id: string, sortOrder: number) => ({ id, sortOrder });

describe('порядок задаётся списком целиком (ТЗ 8.4)', () => {
  it('новый порядок раскладывается по местам с нуля', () => {
    const current = [item('a', 0), item('b', 1), item('c', 2)];
    const outcome = applyOrder(current, ['c', 'a', 'b']);

    expect(outcome.items.map((row) => [row.id, row.sortOrder])).toEqual([
      ['c', 0],
      ['a', 1],
      ['b', 2]
    ]);
    expect(outcome.moved, 'все три сменили место').toBe(3);
  });

  it('повторный запрос ничего не ломает — это и есть идемпотентность', () => {
    /*
     * Ради этого порядок и передаётся целиком. Сдвиг «подними на одну позицию» при повторе
     * после обрыва связи сдвинул бы ещё раз, и программа разъехалась бы незаметно.
     */
    const current = [item('a', 0), item('b', 1), item('c', 2)];
    const once = applyOrder(current, ['b', 'a', 'c']);
    const twice = applyOrder(once.items, ['b', 'a', 'c']);

    expect(twice.items).toEqual(once.items);
    expect(twice.moved, 'второй раз двигать уже нечего').toBe(0);
  });

  it('неполный список отклоняется: половина порядка смысла не имеет', () => {
    const current = [item('a', 0), item('b', 1), item('c', 2)];
    expect(() => applyOrder(current, ['a', 'b'])).toThrow(ProgramOrderError);
    try {
      applyOrder(current, ['a', 'b']);
    } catch (error) {
      expect((error as ProgramOrderError).reason, 'отказ называет числа, а не код').toContain(
        'пунктов 3'
      );
    }
  });

  it('чужой пункт в списке отклоняется', () => {
    const current = [item('a', 0), item('b', 1)];
    expect(() => applyOrder(current, ['a', 'чужой'])).toThrow(/не из этой программы/);
  });

  it('повтор в списке отклоняется', () => {
    /* Иначе один пункт занял бы два места, а другой исчез бы из порядка молча. */
    const current = [item('a', 0), item('b', 1)];
    expect(() => applyOrder(current, ['a', 'a'])).toThrow(/повторы/);
  });

  it('дыры в прежних номерах выправляются', () => {
    /* В базе порядок мог остаться с дырами после удалений: 0, 5, 9. Приводим к 0,1,2. */
    const current = [item('a', 0), item('b', 5), item('c', 9)];
    const outcome = applyOrder(current, ['a', 'b', 'c']);
    expect(outcome.items.map((row) => row.sortOrder)).toEqual([0, 1, 2]);
  });
});

describe('кнопки «вверх» и «вниз» — запасной способ вместо перетаскивания', () => {
  it('пункт меняется местами с соседом', () => {
    expect(movedByOne(['a', 'b', 'c'], 'b', 'up')).toEqual(['b', 'a', 'c']);
    expect(movedByOne(['a', 'b', 'c'], 'b', 'down')).toEqual(['a', 'c', 'b']);
  });

  it('край списка — не ошибка, а «дальше некуда»', () => {
    /* Ругаться на «вверх» у первого пункта значило бы наказывать человека за попытку. */
    expect(movedByOne(['a', 'b'], 'a', 'up')).toEqual(['a', 'b']);
    expect(movedByOne(['a', 'b'], 'b', 'down')).toEqual(['a', 'b']);
    expect(movedByOne(['a', 'b'], 'нет такого', 'up')).toEqual(['a', 'b']);
  });
});

describe('перетаскивание', () => {
  it('пункт встаёт перед тем, на который его бросили', () => {
    expect(movedTo(['a', 'b', 'c', 'd'], 'd', 'b')).toEqual(['a', 'd', 'b', 'c']);
    expect(movedTo(['a', 'b', 'c'], 'a', 'c')).toEqual(['b', 'a', 'c']);
  });

  it('бросок на себя и на неизвестный пункт ничего не меняют', () => {
    expect(movedTo(['a', 'b'], 'a', 'a')).toEqual(['a', 'b']);
    expect(movedTo(['a', 'b'], 'a', 'нет такого')).toEqual(['a', 'b']);
  });
});

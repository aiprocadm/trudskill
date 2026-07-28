import { describe, expect, it } from 'vitest';

import {
  DEFAULT_COMPLETION_PERCENT,
  NO_SEEK_TOLERANCE_SECONDS,
  accumulateRanges,
  completionThreshold,
  coverageRatio,
  coveredSeconds,
  dropSeekedAheadRanges,
  mergeRanges
} from './video-progress.util.js';

/**
 * Математика просмотренных отрезков (ФТ-B3.1, Фаза 2 Task 6).
 * Считаем ПОКРЫТИЕ ролика, а не время на вкладке: иначе урок засчитывается тому,
 * кто открыл вкладку и ушёл пить чай.
 */

describe('mergeRanges', () => {
  it('склеивает пересекающиеся и соприкасающиеся отрезки', () => {
    expect(
      mergeRanges([
        [0, 10],
        [8, 20],
        [20, 25]
      ])
    ).toEqual([[0, 25]]);
  });

  it('оставляет разрыв там, где слушатель перемотал', () => {
    expect(
      mergeRanges([
        [0, 10],
        [50, 60]
      ])
    ).toEqual([
      [0, 10],
      [50, 60]
    ]);
  });

  it('упорядочивает отрезки, пришедшие вразнобой', () => {
    expect(
      mergeRanges([
        [50, 60],
        [0, 10]
      ])
    ).toEqual([
      [0, 10],
      [50, 60]
    ]);
  });

  it('выбрасывает мусор клиента и не падает на нём', () => {
    expect(
      mergeRanges([
        [10, 10], // нулевой
        [Number.NaN, 5],
        ['0', 10],
        [5],
        null,
        'сломай меня',
        [30, 40]
      ])
    ).toEqual([[30, 40]]);
  });

  it('перевёрнутый отрезок разворачивает, отрицательные подтягивает к нулю', () => {
    expect(mergeRanges([[20, 5]])).toEqual([[5, 20]]);
    expect(mergeRanges([[-30, 10]])).toEqual([[0, 10]]);
  });

  it('обрезает по длительности — иначе покрытие вылезет за 100%', () => {
    expect(mergeRanges([[0, 500]], 120)).toEqual([[0, 120]]);
    // Отрезок целиком за пределами ролика схлопывается в ноль и исчезает.
    expect(mergeRanges([[200, 300]], 120)).toEqual([]);
  });
});

describe('coveredSeconds и coverageRatio', () => {
  it('пересечения не считаются дважды', () => {
    const merged = mergeRanges([
      [0, 60],
      [30, 90]
    ]);
    expect(coveredSeconds(merged)).toBe(90);
  });

  it('доля считается от длительности и не превышает единицу', () => {
    expect(coverageRatio(mergeRanges([[0, 90]]), 100)).toBe(0.9);
    expect(coverageRatio(mergeRanges([[0, 200]], 100), 100)).toBe(1);
  });

  it('без известной длительности доля — ноль, а не «пройдено вслепую»', () => {
    // Видео ещё не обработано: засчитать курс было бы выдачей удостоверения ни за что.
    expect(coverageRatio(mergeRanges([[0, 1000]]), undefined)).toBe(0);
    expect(coverageRatio(mergeRanges([[0, 1000]]), 0)).toBe(0);
  });

  it('перемотанное, но не просмотренное не засчитывается', () => {
    // Слушатель посмотрел первую минуту и прыгнул в конец: покрытие 2 из 100 минут.
    const merged = mergeRanges([
      [0, 60],
      [5940, 6000]
    ]);
    expect(coverageRatio(merged, 6000)).toBeCloseTo(0.02, 5);
  });
});

describe('completionThreshold', () => {
  it('по умолчанию 90% — как в ТЗ', () => {
    expect(DEFAULT_COMPLETION_PERCENT).toBe(90);
    expect(completionThreshold(undefined)).toBe(0.9);
  });

  it('порог курса перекрывает умолчание', () => {
    expect(completionThreshold(75)).toBe(0.75);
    expect(completionThreshold(100)).toBe(1);
  });

  it('мусор и бессмысленные значения откатываются к умолчанию', () => {
    for (const bad of [0, -10, 101, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(completionThreshold(bad)).toBe(0.9);
    }
  });
});

describe('accumulateRanges', () => {
  it('покрытие не уменьшается: повторный heartbeat ничего не откатывает', () => {
    const stored = [
      [0, 60],
      [120, 180]
    ];
    const again = accumulateRanges(stored, [[0, 60]]);
    expect(coveredSeconds(again)).toBe(120);
  });

  it('запоздавший heartbeat со старым отрезком не теряет накопленное', () => {
    const stored = [[0, 300]];
    const late = accumulateRanges(stored, [[10, 20]]);
    expect(late).toEqual([[0, 300]]);
  });

  it('новый кусок добавляется к накопленному', () => {
    const merged = accumulateRanges([[0, 60]], [[60, 90]]);
    expect(merged).toEqual([[0, 90]]);
  });

  it('пустой heartbeat сохраняет накопленное', () => {
    expect(accumulateRanges([[0, 60]], [])).toEqual([[0, 60]]);
  });
});

describe('dropSeekedAheadRanges (ФТ-B3.2)', () => {
  it('выбрасывает отрезок, до которого слушатель прыгнул', () => {
    // Досмотрел до 100-й секунды, прыгнул на 3000-ю — новый отрезок далеко впереди.
    expect(
      dropSeekedAheadRanges(
        [
          [0, 100],
          [3000, 3060]
        ],
        100
      )
    ).toEqual([[0, 100]]);
  });

  it('обычное воспроизведение вперёд не режется', () => {
    // Между heartbeat-ами позиция уходит вперёд — это продолжение того же отрезка.
    expect(dropSeekedAheadRanges([[0, 112]], 100)).toEqual([[0, 112]]);
  });

  it('допуск переживает несколько потерянных heartbeat-ов', () => {
    // Три потерянных сообщения подряд: 36 секунд вперёд — честный слушатель не наказан.
    expect(dropSeekedAheadRanges([[100, 136]], 100)).toEqual([[100, 136]]);
    expect(NO_SEEK_TOLERANCE_SECONDS).toBeGreaterThanOrEqual(36);
  });

  it('отрезок ровно на границе допуска сохраняется, за границей — нет', () => {
    expect(dropSeekedAheadRanges([[160, 200]], 100)).toEqual([[160, 200]]);
    expect(dropSeekedAheadRanges([[161, 200]], 100)).toEqual([]);
  });

  it('перемотка назад разрешена — пересматривать непонятое не запрещено', () => {
    expect(dropSeekedAheadRanges([[10, 40]], 100)).toEqual([[10, 40]]);
  });

  it('мусор пропускается дальше — его отбракует mergeRanges, а не это правило', () => {
    const garbage = ['сломай', null, [1]];
    expect(dropSeekedAheadRanges(garbage, 100)).toEqual(garbage);
  });

  it('с нулевого максимума доступен только старт ролика в пределах допуска', () => {
    expect(dropSeekedAheadRanges([[0, 30]], 0)).toEqual([[0, 30]]);
    expect(dropSeekedAheadRanges([[600, 660]], 0)).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';

import { uiGlobalStyles } from './index.js';

/**
 * Запись 163 журнала расхождений: пять токенов типографики были объявлены и не применялись
 * нигде — потолок контента (`UI-017`), оба веса шрифта и оба интерлиньяжа. Потолок
 * «существовал на бумаге», а веса и межстрочные интервалы жили в стилях голыми числами:
 * 45 весов пяти разных значений (включая 650 и 800 — ступени, которых нет в шкале) и
 * одиннадцать разных интерлиньяжей от 1.1 до 1.7.
 *
 * Разнобой такого рода не виден глазом по одному месту — он копится и делает соседние
 * экраны чуть-чуть разными без причины. Сторож держит правило «ритм задаётся токенами».
 */

describe('типографика · вес шрифта задаётся токеном', () => {
  it('голых числовых весов в стилях нет', () => {
    const offenders = uiGlobalStyles
      .split('\n')
      .filter((line) => /font-weight: ?\d/.test(line))
      .map((line) => line.trim().slice(0, 80));

    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('шкала весов — три ступени: medium, semibold, bold', () => {
    const used = new Set(
      [...uiGlobalStyles.matchAll(/font-weight: var\((--ui-font-weight-[a-z]+)\)/g)].map(
        (m) => m[1]
      )
    );
    for (const token of used) {
      expect(
        ['--ui-font-weight-medium', '--ui-font-weight-semibold', '--ui-font-weight-bold'],
        `вес вне шкалы: ${token}`
      ).toContain(token);
    }
  });
});

describe('типографика · интерлиньяж задаётся токеном', () => {
  it('дробных числовых интерлиньяжей в стилях нет', () => {
    /*
     * Разрешены два не-токена, и оба — не про ритм текста:
     *  - `line-height: 1` («сплошной») — служебные элементы: значок, словный знак,
     *    стрелка в кнопке; текстом в несколько строк они не бывают;
     *  - значения в px — геометрия элемента управления (кружок-счётчик 20px), где
     *    line-height центрирует символ в фиксированной высоте.
     */
    const offenders = uiGlobalStyles
      .split('\n')
      .filter((line) => /line-height: ?\d\.\d/.test(line))
      .map((line) => line.trim().slice(0, 80));

    expect(offenders, offenders.join('\n')).toEqual([]);
  });
});

describe('UI-017 · потолок контента реально работает', () => {
  it('каркас страницы ограничен --ui-content-max', () => {
    const rule = uiGlobalStyles
      .split('\n')
      .find((line) => line.includes('.ui-page,.ui-page-container {'));

    expect(rule, 'каркас страницы не найден').toBeDefined();
    expect(rule).toContain('max-width: var(--ui-content-max)');
    // Центрирование обязательно: потолок без него прижимал бы контент к левому краю.
    expect(rule).toContain('margin-inline: auto');
  });
});

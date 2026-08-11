import { describe, expect, it } from 'vitest';

import { uiGlobalStyles } from './index.js';

// Страж дисциплины токенов: радиусы задаются ТОЛЬКО через var(--ui-radius-*).
// Захардкоженный px-радиус из шкалы (или рядом с ней) — регрессия.
describe('дисциплина токенов в CSS-слоях', () => {
  it('нет захардкоженных px-радиусов шкалы', () => {
    // Ловит и longhand-свойства (border-top-left-radius), и любую позицию в shorthand-записи.
    expect(uiGlobalStyles).not.toMatch(
      /border(?:-\w+)*-radius\s*:[^;}]*\b(?:8|10|12|13|14|16|18|20|999)px/
    );
  });

  it('CSS ссылается на переменные шкалы', () => {
    expect(uiGlobalStyles).toContain('var(--ui-radius-sm)');
    expect(uiGlobalStyles).toContain('var(--ui-radius-md)');
    expect(uiGlobalStyles).toContain('var(--ui-radius-lg)');
    expect(uiGlobalStyles).toContain('var(--ui-radius-pill)');
  });
});

/*
 * Сторож подложки. До Фазы 1 проверялись только радиусы, и один и тот же
 * rgba(15,23,42,0.45) жил в трёх местах пакета — никем не замеченный, потому что
 * ловить его было нечем. Переезд CSS каркаса сюда же (UI-020) добавил бы
 * четвёртое, узаконив хардкод.
 *
 * Проверяется НЕ «никаких цветов вообще», а именно заливка: сегодня в слоях
 * остаются литеральные цвета ещё двух классов — тени (rgba внутри box-shadow) и
 * белый текст на цветной кнопке/бейдже. Им нужны свои токены, это отдельная
 * работа, и записана она в журнал расхождений ТЗ редизайна. Обещать здесь
 * больше, чем сторож проверяет, значит обещать ложно.
 */
describe('дисциплина цвета: подложки', () => {
  it('заливка не задаётся литеральным rgb/rgba — только токеном', () => {
    const literals = uiGlobalStyles.match(/background:\s*rgba?\(\s*\d/g) ?? [];
    expect(literals).toEqual([]);
  });

  it('подложка всплывающих слоёв берётся из токена', () => {
    expect(uiGlobalStyles).toContain('var(--ui-overlay)');
  });
});

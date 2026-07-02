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

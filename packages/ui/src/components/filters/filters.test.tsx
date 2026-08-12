import { describe, expect, it } from 'vitest';

import { hasHiddenActiveFilters } from './index.js';

describe('панель фильтров (CMP-003)', () => {
  /*
   * Бюджет ТЗ — не больше трёх видимых фильтров. Остальные уезжают под «Ещё фильтры»,
   * и тогда возникает главная опасность: список отфильтрован, а человек не видит чем.
   * Поэтому счётчик активных скрытых фильтров — не украшение, а обязательный сигнал.
   */
  it('скрытые фильтры без значений не требуют сигнала', () => {
    expect(hasHiddenActiveFilters(0, false)).toBe(false);
  });

  it('активные скрытые фильтры требуют сигнала даже в свёрнутом виде', () => {
    expect(hasHiddenActiveFilters(2, false)).toBe(true);
  });

  it('в развёрнутом виде сигнал не нужен — фильтры и так видны', () => {
    expect(hasHiddenActiveFilters(2, true)).toBe(false);
  });
});

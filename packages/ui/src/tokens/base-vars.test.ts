import { describe, expect, it } from 'vitest';

import { baseVars, darkThemeVars, lightThemeVars, radius, spacing } from './index.js';

// baseVars — CSS-мост: JS-токены должны быть проброшены в --ui-* переменные 1:1.
describe('baseVars — CSS-мост токенов', () => {
  const vars: Record<string, string> = baseVars;

  it('каждый ключ spacing проброшен как --ui-space-<key> в px', () => {
    for (const [key, px] of Object.entries(spacing)) {
      expect(vars[`--ui-space-${key}`]).toBe(`${px}px`);
    }
  });

  it('каждый ключ radius проброшен как --ui-radius-<key> в px', () => {
    for (const [key, px] of Object.entries(radius)) {
      expect(vars[`--ui-radius-${key}`]).toBe(`${px}px`);
    }
  });

  it('типографическая шкала задана (размеры и веса)', () => {
    expect(vars['--ui-font-size-xs']).toBe('12px');
    expect(vars['--ui-font-size-sm']).toBe('13px');
    expect(vars['--ui-font-size-md']).toBe('15px');
    expect(vars['--ui-font-size-lg']).toBe('17px');
    expect(vars['--ui-font-size-xl']).toBe('22px');
    expect(vars['--ui-font-weight-medium']).toBe('500');
    expect(vars['--ui-font-weight-semibold']).toBe('600');
    expect(vars['--ui-font-weight-bold']).toBe('700');
    expect(vars['--ui-line-height-tight']).toBe('1.2');
    expect(vars['--ui-line-height-normal']).toBe('1.5');
  });

  it('ключи baseVars не пересекаются с ключами тем (base проигрывал бы теме)', () => {
    const themeKeys = new Set([...Object.keys(lightThemeVars), ...Object.keys(darkThemeVars)]);
    for (const key of Object.keys(baseVars)) {
      expect(themeKeys.has(key)).toBe(false);
    }
  });
});

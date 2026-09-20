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
    /*
     * Шкала в `rem` (ТЗ 14.4): при базе по умолчанию 16 px это прежние 12–34 px, вид не
     * изменился. В пикселях системная настройка «крупный шрифт» не действовала вовсе.
     */
    expect(vars['--ui-font-size-xs']).toBe('0.75rem');
    expect(vars['--ui-font-size-sm']).toBe('0.8125rem');
    expect(vars['--ui-font-size-md']).toBe('0.9375rem');
    expect(vars['--ui-font-size-lg']).toBe('1.0625rem');
    expect(vars['--ui-font-size-xl']).toBe('1.375rem');
    // UI-015: новые ступени и ширины обязаны попасть в мост CSS-переменных — иначе токен
    // объявлен в коде, а в стилях его нет, и шкала молча расходится с разметкой.
    expect(vars['--ui-font-size-2xl']).toBe('1.75rem');
    expect(vars['--ui-font-size-3xl']).toBe('2.125rem');
    expect(vars['--ui-measure']).toBe('68ch');
    expect(vars['--ui-measure-narrow']).toBe('48ch');
    expect(vars['--ui-content-max']).toBe('1280px');
    expect(vars['--ui-font-weight-medium']).toBe('500');
    expect(vars['--ui-font-weight-semibold']).toBe('600');
    expect(vars['--ui-font-weight-bold']).toBe('700');
    expect(vars['--ui-line-height-tight']).toBe('1.2');
    expect(vars['--ui-line-height-normal']).toBe('1.5');
  });

  it('подложка всплывающих слоёв объявлена в обеих темах', () => {
    expect(lightThemeVars['--ui-overlay']).toBeTruthy();
    expect(darkThemeVars['--ui-overlay']).toBeTruthy();
  });

  it('в тёмной теме подложка плотнее — под ней тёмный фон, а не светлый', () => {
    expect(darkThemeVars['--ui-overlay']).not.toBe(lightThemeVars['--ui-overlay']);
  });

  it('ключи baseVars не пересекаются с ключами тем (base проигрывал бы теме)', () => {
    const themeKeys = new Set([...Object.keys(lightThemeVars), ...Object.keys(darkThemeVars)]);
    for (const key of Object.keys(baseVars)) {
      expect(themeKeys.has(key)).toBe(false);
    }
  });
});

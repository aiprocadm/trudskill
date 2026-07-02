import { describe, expect, it } from 'vitest';

import { buildThemeVars } from './theme-provider.js';

// Страж load-bearing строки: провайдер обязан подмешивать baseVars к переменным темы.
describe('buildThemeVars', () => {
  it('light: содержит и базовый токен, и токен темы', () => {
    const vars = buildThemeVars('light') as Record<string, string>;
    expect(vars['--ui-radius-md']).toBe('12px');
    expect(vars['--ui-bg']).toBe('#f8fafc');
  });

  it('dark: тема меняется, базовые токены те же', () => {
    const vars = buildThemeVars('dark') as Record<string, string>;
    expect(vars['--ui-radius-md']).toBe('12px');
    expect(vars['--ui-bg']).toBe('#0b1120');
  });
});

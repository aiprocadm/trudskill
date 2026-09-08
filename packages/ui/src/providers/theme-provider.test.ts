import { describe, expect, it } from 'vitest';

import { UI_THEME_STORAGE_KEY } from './theme-context.js';
import { buildThemeVars, migrateThemeChoice, readStoredThemeChoice } from './theme-provider.js';

// Страж load-bearing строки: провайдер обязан подмешивать baseVars к переменным темы.
describe('buildThemeVars', () => {
  it('light: содержит и базовый токен, и токен темы', () => {
    const vars = buildThemeVars('light') as Record<string, string>;
    expect(vars['--ui-radius-md']).toBe('12px');
    /*
     * Значение изменено осознанно (UI-014): фон страницы сделан заметнее, чтобы карточка
     * отделялась ФОНОМ, а не рамкой. Прежняя пара «#f8fafc ↔ #ffffff» давала контраст 1.04 —
     * на глаз один и тот же цвет, и без рамки карточка растворялась.
     */
    expect(vars['--ui-bg']).toBe('#eef2f7');
  });

  it('dark: тема меняется, базовые токены те же', () => {
    const vars = buildThemeVars('dark') as Record<string, string>;
    expect(vars['--ui-radius-md']).toBe('12px');
    expect(vars['--ui-bg']).toBe('#0b1120');
  });
});

/*
 * `BR-023` / `UI-027`, выкатка N+1: окно двойного чтения ключа темы ЗАКРЫТО.
 *
 * Смысл проверок стал обратным прежнему. Раньше они стерегли, чтобы выбор темы не сбросился
 * у тех, кто уже включил тёмную; теперь — что прежний ключ действительно перестал
 * действовать и не пишется. Прежнее значение в браузере остаётся мёртвой строкой: чтобы его
 * стереть, пришлось бы навсегда оставить в коде чужое имя — цена больше пользы, решение
 * записано в `docs/REBRANDING_KEYS_ROLLOUT.md`.
 */
describe('readStoredThemeChoice (окно закрыто)', () => {
  const storageOf = (entries: Record<string, string>) => ({
    getItem: (key: string) => entries[key] ?? null
  });

  it('ПРЕЖНИЙ ключ больше не читается', () => {
    expect(readStoredThemeChoice(storageOf({ 'cdoprof-ui-theme': 'dark' }))).toBeNull();
  });

  it('новый ключ читается как прежде', () => {
    expect(readStoredThemeChoice(storageOf({ [UI_THEME_STORAGE_KEY]: 'dark' }))).toBe('dark');
  });

  it('пусто и мусор дают null, а не падение', () => {
    expect(readStoredThemeChoice(storageOf({}))).toBeNull();
    expect(readStoredThemeChoice(storageOf({ [UI_THEME_STORAGE_KEY]: 'неон' }))).toBeNull();
  });

  it('ключ темы назван по бренду', () => {
    expect(UI_THEME_STORAGE_KEY).toBe('trudskill-ui-theme');
  });
});

describe('migrateThemeChoice (пишется ровно один ключ)', () => {
  const makeStorage = (initial: Record<string, string> = {}) => {
    const data: Record<string, string> = { ...initial };
    return {
      data,
      getItem: (key: string) => data[key] ?? null,
      setItem: (key: string, value: string) => {
        data[key] = value;
      }
    };
  };

  it('под прежним ключом не пишется ничего', () => {
    const storage = makeStorage();
    migrateThemeChoice(storage, 'dark');
    expect(storage.data[UI_THEME_STORAGE_KEY]).toBe('dark');
    expect(Object.keys(storage.data)).toEqual([UI_THEME_STORAGE_KEY]);
  });
});

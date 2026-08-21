import { describe, expect, it } from 'vitest';

import { LEGACY_UI_THEME_STORAGE_KEY, UI_THEME_STORAGE_KEY } from './theme-context.js';
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
 * BR-023 / UI-027 — период двойного чтения ключа темы. Прямое переименование сбросило бы
 * выбор у всех, кто уже включил тёмную тему; кейсы ниже это и стерегут.
 */
describe('readStoredThemeChoice (двойное чтение ключа темы)', () => {
  const storageOf = (entries: Record<string, string>) => ({
    getItem: (key: string) => entries[key] ?? null
  });

  it('читает ПРЕЖНИЙ ключ, когда нового ещё нет', () => {
    expect(readStoredThemeChoice(storageOf({ [LEGACY_UI_THEME_STORAGE_KEY]: 'dark' }))).toBe(
      'dark'
    );
  });

  it('когда есть оба — берёт НОВЫЙ', () => {
    const storage = storageOf({
      [LEGACY_UI_THEME_STORAGE_KEY]: 'dark',
      [UI_THEME_STORAGE_KEY]: 'light'
    });
    expect(readStoredThemeChoice(storage)).toBe('light');
  });

  it('пусто и мусор дают null, а не падение', () => {
    expect(readStoredThemeChoice(storageOf({}))).toBeNull();
    expect(readStoredThemeChoice(storageOf({ [UI_THEME_STORAGE_KEY]: 'неон' }))).toBeNull();
  });

  it('новый ключ назван по бренду, прежний сохранён для совместимости', () => {
    expect(UI_THEME_STORAGE_KEY).toBe('trudskill-ui-theme');
    expect(LEGACY_UI_THEME_STORAGE_KEY).toBe('cdoprof-ui-theme');
  });
});

/*
 * Тема — единственный ключ выкатки, который не переезжает «сам собой»: снимок сессии
 * обновляется при каждом входе, cookie — на каждом запросе, а тумблер темы человек может
 * не трогать годами. Поэтому переезд обязан происходить и при ЧТЕНИИ, иначе вторая
 * выкатка сбросит оформление ровно тем, ради кого писался BR-023.
 */
describe('migrateThemeChoice (переезд ключа темы)', () => {
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

  it('пишет выбор под ОБА ключа — прежний держит откат без потерь', () => {
    const storage = makeStorage();
    migrateThemeChoice(storage, 'dark');
    expect(storage.data[UI_THEME_STORAGE_KEY]).toBe('dark');
    expect(storage.data[LEGACY_UI_THEME_STORAGE_KEY]).toBe('dark');
  });

  it('прочитанный прежний выбор переезжает на новый ключ', () => {
    const storage = makeStorage({ [LEGACY_UI_THEME_STORAGE_KEY]: 'dark' });
    const stored = readStoredThemeChoice(storage);
    expect(stored).toBe('dark');
    migrateThemeChoice(storage, stored!);
    expect(storage.data[UI_THEME_STORAGE_KEY]).toBe('dark');
  });
});

import { describe, expect, it } from 'vitest';

import { navigationModel } from './model';
import { NAV_GROUPS } from './nav-groups';
import {
  SIDEBAR_COLLAPSED_STORAGE_KEY,
  iconForHref,
  readSidebarCollapsed,
  writeSidebarCollapsed
} from './sidebar-state';

/**
 * Свёрнутая колонка меню (ТЗ «Стабилизация, UX и развитие», 3.3 / Н2).
 *
 * Колонка ехала вместе с содержимым, а свернуть её было нельзя вовсе. ТЗ просит «остаются
 * иконки» — своего значка у пункта меню нет и не было; значок берётся у блока, к которому пункт
 * принадлежит. Это не изобретение: принадлежность блоку гарантирует жёсткий инвариант
 * `ia-architecture.e2e.test.ts`.
 */

const fakeStorage = (initial: Record<string, string> = {}): Storage => {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
    clear: () => map.clear(),
    key: () => null,
    length: 0
  } as unknown as Storage;
};

const throwingStorage = (): Storage =>
  ({
    getItem: () => {
      throw new Error('приватный режим');
    },
    setItem: () => {
      throw new Error('приватный режим');
    }
  }) as unknown as Storage;

describe('память о свёрнутой колонке (ТЗ 3.3)', () => {
  it('сохранённое читается обратно', () => {
    const storage = fakeStorage();
    writeSidebarCollapsed(storage, true);
    expect(readSidebarCollapsed(storage)).toBe(true);
    writeSidebarCollapsed(storage, false);
    expect(readSidebarCollapsed(storage)).toBe(false);
  });

  it('ключ с префиксом проекта', () => {
    expect(SIDEBAR_COLLAPSED_STORAGE_KEY.startsWith('trudskill.')).toBe(true);
  });

  it('по умолчанию колонка развёрнута — как было всегда', () => {
    expect(readSidebarCollapsed(fakeStorage())).toBe(false);
    expect(readSidebarCollapsed(null)).toBe(false);
  });

  it('приватный режим не роняет меню', () => {
    const storage = throwingStorage();
    expect(readSidebarCollapsed(storage)).toBe(false);
    expect(() => writeSidebarCollapsed(storage, true)).not.toThrow();
  });

  it('мусор в значении читается как «развёрнуто»', () => {
    expect(readSidebarCollapsed(fakeStorage({ [SIDEBAR_COLLAPSED_STORAGE_KEY]: 'да' }))).toBe(
      false
    );
  });
});

describe('значки для свёрнутого вида (ТЗ 3.3)', () => {
  it('у КАЖДОГО пункта меню есть значок', () => {
    /*
     * В свёрнутой колонке пункт без значка — пустая строка, то есть исчезнувший раздел.
     * «Потеря раздела из интерфейса» названа в ТЗ §1.3 критерием провала фазы.
     */
    for (const item of navigationModel) {
      expect(iconForHref(item.href), `у пункта ${item.href} нет значка`).toBeTruthy();
    }
  });

  it('значок берётся у блока, к которому принадлежит пункт', () => {
    const group = NAV_GROUPS.find((item) => item.hrefs.length > 0);
    expect(group, 'блоки навигации не найдены — проверка смотрит в пустоту').toBeTruthy();
    expect(iconForHref(group!.hrefs[0]!)).toBe(group!.icon);
  });

  it('незнакомый адрес получает запасной значок, а не пустоту', () => {
    expect(iconForHref('/такого-раздела-нет')).toBeTruthy();
  });
});

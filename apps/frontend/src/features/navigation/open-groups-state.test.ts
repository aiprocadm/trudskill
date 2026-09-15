import { describe, expect, it } from 'vitest';

import {
  OPEN_GROUPS_STORAGE_KEY,
  type OpenGroups,
  isGroupOpen,
  readOpenGroups,
  toggleGroup,
  writeOpenGroups
} from './open-groups-state';

/**
 * Раскрытие групп меню (ТЗ «Стабилизация, UX и развитие», 3.1 / Н1).
 *
 * Меню было двухэтажным: семь пунктов роли, под ними кнопка «Ещё», а под ней девять групп и
 * около пятидесяти пунктов. Человек видел семь строк и делал единственный возможный вывод:
 * в системе семь разделов. Раскрытие при этом жило только до перехода на другую страницу.
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

describe('память о раскрытых группах (ТЗ 3.1)', () => {
  it('сохранённое читается обратно', () => {
    const storage = fakeStorage();
    writeOpenGroups(storage, { learning: true, reports: false });
    expect(readOpenGroups(storage)).toEqual({ learning: true, reports: false });
  });

  it('ключ с префиксом проекта — в домене живёт не только этот продукт', () => {
    expect(OPEN_GROUPS_STORAGE_KEY.startsWith('trudskill.')).toBe(true);
  });

  it('приватный режим не роняет меню: и чтение, и запись переживают отказ', () => {
    /*
     * Обращение к хранилищу там БРОСАЕТ исключение. Потерять память о раскрытии не жалко,
     * уронить меню целиком — да.
     */
    const storage = throwingStorage();
    expect(readOpenGroups(storage)).toEqual({});
    expect(() => writeOpenGroups(storage, { learning: true })).not.toThrow();
  });

  it('мусор в значении не ломает разбор', () => {
    expect(readOpenGroups(fakeStorage({ [OPEN_GROUPS_STORAGE_KEY]: 'не json' }))).toEqual({});
    expect(readOpenGroups(fakeStorage({ [OPEN_GROUPS_STORAGE_KEY]: '[1,2]' }))).toEqual({});
    expect(
      readOpenGroups(fakeStorage({ [OPEN_GROUPS_STORAGE_KEY]: '{"a":"да","b":true}' })),
      'нелогические значения отбрасываются поштучно, а не целым файлом'
    ).toEqual({ b: true });
  });

  it('без хранилища (сервер) отвечает пустым состоянием', () => {
    expect(readOpenGroups(null)).toEqual({});
    expect(() => writeOpenGroups(undefined, { a: true })).not.toThrow();
  });
});

describe('какая группа раскрыта (ТЗ 3.1)', () => {
  const saved: OpenGroups = {};

  it('по умолчанию все свёрнуты', () => {
    expect(isGroupOpen({ groupId: 'reports', saved, activeGroupId: null })).toBe(false);
  });

  it('группа с текущей страницей раскрывается сама', () => {
    expect(isGroupOpen({ groupId: 'reports', saved, activeGroupId: 'reports' })).toBe(true);
    expect(isGroupOpen({ groupId: 'learning', saved, activeGroupId: 'reports' })).toBe(false);
  });

  it('решение человека важнее автоматики', () => {
    /*
     * Свернул группу, в которой находится, — она остаётся свёрнутой. Навязывать раскрытие
     * значило бы спорить с человеком о его же меню; прежний эффект именно так и делал.
     */
    expect(
      isGroupOpen({ groupId: 'reports', saved: { reports: false }, activeGroupId: 'reports' })
    ).toBe(false);
    expect(
      isGroupOpen({ groupId: 'learning', saved: { learning: true }, activeGroupId: 'reports' })
    ).toBe(true);
  });

  it('нажатие переключает и запоминает решение', () => {
    const next = toggleGroup({ groupId: 'reports', saved: {}, activeGroupId: null });
    expect(next).toEqual({ reports: true });

    const back = toggleGroup({ groupId: 'reports', saved: next, activeGroupId: null });
    expect(back).toEqual({ reports: false });
  });

  it('нажатие на авто-раскрытую группу сворачивает её, а не раскрывает второй раз', () => {
    const next = toggleGroup({ groupId: 'reports', saved: {}, activeGroupId: 'reports' });
    expect(next).toEqual({ reports: false });
  });
});

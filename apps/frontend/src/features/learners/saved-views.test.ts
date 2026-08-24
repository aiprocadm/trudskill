import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { LEARNER_PRESET_VIEWS, matchesQuery, readSavedViews, writeSavedViews } from './saved-views';

/**
 * `CMP-012` · быстрые отборы реестра.
 *
 * Хранилище браузера — ненадёжная среда: приватный режим запрещает запись, чужой код
 * может положить в ключ что угодно, старая версия могла записать другой формат. Экран
 * реестра из-за этого падать не должен — в худшем случае человек не увидит своих отборов.
 */

/*
 * Хранилище подменяется так же, как в тестах сессии (`lib/auth/session-store.test.ts`):
 * тесты фронта идут в node-окружении, где `window` нет вовсе. Второй способ делать то же
 * самое разъехался бы с первым — берём готовый.
 */
const originalWindow = globalThis.window;

const createLocalStorage = () => {
  const storage = new Map<string, string>();
  return {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, value);
    },
    removeItem: (key: string) => {
      storage.delete(key);
    },
    clear: () => {
      storage.clear();
    }
  };
};

describe('быстрые отборы слушателей', () => {
  beforeAll(() => {
    Object.defineProperty(globalThis, 'window', {
      value: { localStorage: createLocalStorage() },
      configurable: true
    });
  });

  afterAll(() => {
    Object.defineProperty(globalThis, 'window', { value: originalWindow, configurable: true });
  });

  beforeEach(() => {
    window.localStorage.clear();
  });

  it('из коробки приходят три готовых отбора — пустой список бесполезен', () => {
    expect(LEARNER_PRESET_VIEWS).toHaveLength(3);
    // Предустановленные нельзя удалить: это часть экрана, а не заметка человека.
    expect(LEARNER_PRESET_VIEWS.every((view) => view.preset)).toBe(true);
  });

  it('готовые отборы опираются только на фильтры, которые у экрана есть', () => {
    const known = new Set(['q', 'status']);
    for (const view of LEARNER_PRESET_VIEWS) {
      expect(Object.keys(view.query).every((key) => known.has(key))).toBe(true);
    }
  });

  it('свой отбор переживает перезагрузку страницы', () => {
    writeSavedViews([{ id: 'own-1', label: 'Мой отбор', query: { q: 'Иванов', status: '' } }]);
    expect(readSavedViews()).toEqual([
      { id: 'own-1', label: 'Мой отбор', query: { q: 'Иванов', status: '' } }
    ]);
  });

  it('битое хранилище не роняет экран — отборов просто нет', () => {
    window.localStorage.setItem('trudskill.learners.saved-views.v1', '{не json');
    expect(readSavedViews()).toEqual([]);
  });

  it('чужой формат в ключе отбрасывается, а не показывается как отбор', () => {
    window.localStorage.setItem(
      'trudskill.learners.saved-views.v1',
      JSON.stringify([{ nonsense: true }, { id: 'ok', label: 'Годный', query: {} }])
    );
    expect(readSavedViews()).toEqual([{ id: 'ok', label: 'Годный', query: {} }]);
  });

  it('подсветка отбора совпадает по значениям, а не по ссылке', () => {
    const view = LEARNER_PRESET_VIEWS[1]!;
    expect(matchesQuery(view, { q: '', status: 'active' })).toBe(true);
    expect(matchesQuery(view, { q: 'Иванов', status: 'active' })).toBe(false);
  });

  it('пустая строка и отсутствие значения — одно и то же', () => {
    // Иначе «Все слушатели» не подсветится на свежем экране, где фильтры ещё не трогали.
    const all = LEARNER_PRESET_VIEWS[0]!;
    expect(matchesQuery(all, {})).toBe(true);
    expect(matchesQuery(all, { q: '', status: '' })).toBe(true);
  });
});

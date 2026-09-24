import { describe, expect, it } from 'vitest';

import {
  LEARNER_PRESET_VIEWS,
  LEGACY_STORAGE_KEY,
  clearLegacyViews,
  matchesQuery,
  readLegacyViews
} from './saved-views';

/**
 * `CMP-012` · быстрые отборы реестра слушателей. С МГ-H4.1 (срез 11.3) свои отборы живут на
 * сервере; здесь — готовые отборы, подсветка и разовый перенос из браузера.
 */
const storageOf = (raw: string | null) => {
  let value = raw;
  return {
    getItem: () => value,
    removeItem: () => {
      value = null;
    },
    current: () => value
  };
};

describe('быстрые отборы слушателей', () => {
  it('из коробки — готовые отборы, включая «без почты» и «ни разу не входили» (МГ-C3.2)', () => {
    expect(LEARNER_PRESET_VIEWS.every((view) => view.preset)).toBe(true);
    expect(LEARNER_PRESET_VIEWS.map((view) => view.id)).toContain('preset-no-email');
    expect(LEARNER_PRESET_VIEWS.map((view) => view.id)).toContain('preset-never-logged-in');
  });

  it('готовые отборы опираются только на фильтры, которые у экрана есть', () => {
    const known = new Set(['q', 'status', 'companyId', 'groupId', 'noEmail', 'neverLoggedIn']);
    for (const view of LEARNER_PRESET_VIEWS) {
      for (const key of Object.keys(view.query)) expect(known.has(key)).toBe(true);
    }
  });

  it('подсветка отбора совпадает по значениям, а не по ссылке; пусто и отсутствие — одно', () => {
    const view = { id: 'x', label: 'x', query: { q: '', status: 'active' } };
    expect(matchesQuery(view, { q: '', status: 'active' })).toBe(true);
    expect(matchesQuery(view, { status: 'active' })).toBe(true);
    expect(matchesQuery(view, { status: 'active', noEmail: '1' })).toBe(false);
  });

  it('перенос из браузера: битое и чужое отбрасывается, после переноса ключ очищается', () => {
    expect(readLegacyViews(undefined)).toEqual([]);
    expect(readLegacyViews(storageOf('не json'))).toEqual([]);
    expect(readLegacyViews(storageOf(JSON.stringify({ not: 'array' })))).toEqual([]);
    const storage = storageOf(
      JSON.stringify([
        { id: 'own-1', label: 'Мои', query: { q: 'Иванов', status: '' } },
        { id: 42, label: 'мусор' },
        'строка'
      ])
    );
    expect(readLegacyViews(storage)).toEqual([
      { id: 'own-1', label: 'Мои', query: { q: 'Иванов', status: '' } }
    ]);
    clearLegacyViews(storage);
    expect(storage.current()).toBeNull();
    expect(LEGACY_STORAGE_KEY).toContain('learners');
  });
});

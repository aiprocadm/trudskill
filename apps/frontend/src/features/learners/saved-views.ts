import type { SavedView } from '@trudskill/ui';

/**
 * `CMP-012` · быстрые отборы реестра слушателей.
 *
 * С МГ-H4.1 (срез 11.3, РМ106) свои отборы живут на сервере (`/saved-views?entity=learners`):
 * они видны с любого устройства и не пропадают с чисткой браузера. Здесь остаются готовые
 * отборы экрана, сравнение «какой отбор сейчас включён» и разовый перенос того, что человек
 * успел сохранить в браузере до переезда.
 */
export const LEARNERS_VIEW_ENTITY = 'learners';

/** Ключ старого хранилища браузера — читается только для переноса и затем очищается. */
export const LEGACY_STORAGE_KEY = 'trudskill.learners.saved-views.v1';

export const LEARNER_PRESET_VIEWS: SavedView[] = [
  { id: 'preset-all', label: 'Все слушатели', query: { q: '', status: '' }, preset: true },
  { id: 'preset-active', label: 'Сейчас учатся', query: { q: '', status: 'active' }, preset: true },
  { id: 'preset-archived', label: 'В архиве', query: { q: '', status: 'archived' }, preset: true },
  /* МГ-C3.2 (срез 11.2): кому нельзя выслать доступ и кто его не использовал. */
  {
    id: 'preset-no-email',
    label: 'Без почты',
    query: { q: '', status: '', noEmail: '1' },
    preset: true
  },
  {
    id: 'preset-never-logged-in',
    label: 'Ни разу не входили',
    query: { q: '', status: 'active', neverLoggedIn: '1' },
    preset: true
  }
];

/** Подсветка отбора — по значениям фильтров, пустая строка и отсутствие — одно и то же. */
export const matchesQuery = (view: SavedView, query: Record<string, string>): boolean =>
  Object.keys({ ...view.query, ...query }).every(
    (key) => (view.query[key] ?? '') === (query[key] ?? '')
  );

/**
 * Отборы, сохранённые в браузере до переезда на сервер (РМ108): читаются один раз, битое или
 * чужое отбрасывается. Пусто — переносить нечего.
 */
export const readLegacyViews = (storage: Pick<Storage, 'getItem'> | undefined): SavedView[] => {
  if (!storage) return [];
  try {
    const raw = storage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is SavedView =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as SavedView).id === 'string' &&
        typeof (item as SavedView).label === 'string' &&
        typeof (item as SavedView).query === 'object' &&
        (item as SavedView).query !== null
    );
  } catch {
    return [];
  }
};

/** После переноса ключ убирается — иначе отборы переезжали бы при каждом открытии. */
export const clearLegacyViews = (storage: Pick<Storage, 'removeItem'> | undefined): void => {
  try {
    storage?.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    /* Хранилище браузера может быть закрыто для записи — перенос всё равно состоялся. */
  }
};

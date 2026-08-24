import type { SavedView } from '@trudskill/ui';

/**
 * `CMP-012` · быстрые отборы реестра слушателей.
 *
 * **Хранение — в браузере.** ТЗ прямо ограничивает: серверное хранение потребовало бы
 * менять контракт API, а это вне границ редизайна (§14). Значит отборы живут у человека
 * на его машине и не переезжают между устройствами — это осознанное ограничение, а не
 * недоделка.
 *
 * Ключ с префиксом `trudskill.` — как у сессии (`lib/auth/session-store.ts`). Старый
 * префикс `cdoprof.` здесь не читается: отборов до ребрендинга не существовало, читать
 * нечего (`BR-020` требует двойного чтения только там, где данные могли остаться).
 */

const STORAGE_KEY = 'trudskill.learners.saved-views.v1';

/**
 * Предустановленные отборы. ТЗ: «умолчание вместо настройки» — пустой список бесполезен,
 * потому что им нельзя воспользоваться, пока сам что-нибудь не сохранишь.
 *
 * Три среза, за которыми администратор возвращается: весь реестр, кто учится сейчас и
 * архив. Они опираются только на те фильтры, что у экрана есть на самом деле, — выдумывать
 * отбор «не сдали экзамен», которого список не умеет, значит показать кнопку-обманку.
 */
export const LEARNER_PRESET_VIEWS: SavedView[] = [
  { id: 'preset-all', label: 'Все слушатели', query: { q: '', status: '' }, preset: true },
  { id: 'preset-active', label: 'Сейчас учатся', query: { q: '', status: 'active' }, preset: true },
  { id: 'preset-archived', label: 'В архиве', query: { q: '', status: 'archived' }, preset: true }
];

/** Свои отборы человека. Битое хранилище не роняет экран — просто отборов нет. */
export const readSavedViews = (): SavedView[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is SavedView =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as SavedView).id === 'string' &&
        typeof (item as SavedView).label === 'string'
    );
  } catch {
    return [];
  }
};

export const writeSavedViews = (views: SavedView[]): void => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(views));
  } catch {
    /* Приватный режим и переполненное хранилище: отбор не сохранится, но экран живёт. */
  }
};

/** Совпадает ли текущий отбор с сохранённым — по значениям, а не по ссылке. */
export const matchesQuery = (view: SavedView, query: Record<string, string>): boolean =>
  Object.keys({ ...view.query, ...query }).every(
    (key) => (view.query[key] ?? '') === (query[key] ?? '')
  );

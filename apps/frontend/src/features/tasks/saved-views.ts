import { TASK_FILTER_LABEL } from './types';

import type { TaskListFilter } from './types';
import type { SavedView } from '@trudskill/ui';

/**
 * `CMP-012` · быстрые отборы реестра задач (ТЗ перехода с CDOPROF §5.4 МГ-G2.3).
 *
 * Предустановленные — ровно те, что называет ТЗ: «Поставленные мне» (по умолчанию),
 * «Поставленные мною», «Просроченные», «Выполненные», «Все». Последний показывается только с
 * `tasks.manage_all`: сервер без права ответит 403, а кнопка-обманка хуже отсутствующей.
 *
 * Свои отборы — в браузере, как у слушателей (серверные представления — позиция 12). Ключ с
 * префиксом `trudskill.`; прежнего префикса здесь не читается — отборов задач до ребрендинга
 * не существовало.
 */
const STORAGE_KEY = 'trudskill.tasks.saved-views.v1';

export const taskPresetViews = (manageAll: boolean): SavedView[] =>
  (Object.keys(TASK_FILTER_LABEL) as TaskListFilter[])
    .filter((key) => key !== 'all' || manageAll)
    .map((key) => ({
      id: key,
      label: TASK_FILTER_LABEL[key],
      query: { filter: key },
      preset: true
    }));

export const readTaskViews = (): SavedView[] => {
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

export const writeTaskViews = (views: SavedView[]): void => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(views));
  } catch {
    /* Приватный режим или переполненное хранилище: отбор не сохранится, но экран живёт. */
  }
};

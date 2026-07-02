import { getVisibleNavigation } from './helpers';
import { NAV_GROUPS } from './nav-groups';

import type { UserSession } from '../../entities/session/model';

/** Пункт быстрого перехода в палитре. */
export interface CommandItem {
  href: string;
  label: string;
  /** Ярлык блока — для контекста в списке. */
  group?: string;
}

// href → метка блока (первое вхождение). Строится один раз.
const groupLabelByHref = new Map<string, string>();
for (const group of NAV_GROUPS) {
  for (const href of group.hrefs) {
    if (!groupLabelByHref.has(href)) groupLabelByHref.set(href, group.label);
  }
}

/** Фильтр по подстроке (метка/href/блок), регистронезависимый. Пустой запрос → все. */
export const filterCommands = (items: CommandItem[], query: string): CommandItem[] => {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter(
    (item) =>
      item.label.toLowerCase().includes(q) ||
      item.href.toLowerCase().includes(q) ||
      (item.group?.toLowerCase().includes(q) ?? false)
  );
};

/** Все доступные пользователю страницы (после RBAC-фильтра) как команды. */
export const buildCommandItems = (session: UserSession | null): CommandItem[] =>
  getVisibleNavigation(session).map((item) => {
    const group = groupLabelByHref.get(item.href);
    // exactOptionalPropertyTypes: group добавляем только если есть.
    return group
      ? { href: item.href, label: item.label, group }
      : { href: item.href, label: item.label };
  });

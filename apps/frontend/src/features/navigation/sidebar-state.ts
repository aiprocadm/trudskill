import { NAV_GROUPS, resolveGroupForPath } from './nav-groups';
import { LayoutDashboardIcon } from './nav-icons';

import type { LucideIcon } from '@trudskill/ui';

/**
 * Колонка меню: свёрнута или развёрнута (ТЗ «Стабилизация, UX и развитие», 3.3 / Н2).
 *
 * **Как было.** Колонка меню прокручивалась вместе с содержимым: раскрыв группы, человек получал
 * страницу в несколько экранов, где слева меню, справа пустота, — а прокручивая длинную таблицу,
 * он терял меню из виду совсем. После задачи 3.1 меню стало выше (группы теперь видны сразу), и
 * это стало заметнее.
 *
 * **Свёрнутый вид.** ТЗ просит «остаются иконки». Своего значка у пункта меню нет и не было —
 * заводить шестьдесят глифов значило бы выдумывать. Но жёсткий инвариант архитектуры
 * (`ia-architecture.e2e.test.ts`) гарантирует: каждый маршрут первого уровня принадлежит ровно
 * одному блоку ИА, а у блока значок ЕСТЬ. Поэтому значок пункта берётся у его блока — это не
 * изобретение, а уже записанное в системе соответствие.
 */

/** Ключ с префиксом проекта — в одном домене может жить не только этот продукт. */
export const SIDEBAR_COLLAPSED_STORAGE_KEY = 'trudskill.nav.sidebar-collapsed';

/** Прочитать сохранённое. Любая беда (нет доступа, мусор) — «развёрнуто», как было всегда. */
export const readSidebarCollapsed = (storage: Storage | null | undefined): boolean => {
  if (!storage) return false;
  try {
    return storage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === 'true';
  } catch {
    /* приватный режим бросает исключение — меню важнее памяти о его ширине */
    return false;
  }
};

export const writeSidebarCollapsed = (
  storage: Storage | null | undefined,
  collapsed: boolean
): void => {
  if (!storage) return;
  try {
    storage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, collapsed ? 'true' : 'false');
  } catch {
    /* места нет или запись запрещена — колонка работает, просто не запомнит ширину */
  }
};

/**
 * Значок пункта меню — значок его блока ИА.
 *
 * `LayoutDashboardIcon` как запасной: пункт вне блоков попадает в служебный блок «Прочее»
 * (см. `groupItemsByNavGroup`), и значок у него тот же. Возвращать `null` нельзя — в свёрнутой
 * колонке пункт без значка стал бы пустой строкой, то есть исчез бы для человека.
 */
export const iconForHref = (href: string): LucideIcon =>
  resolveGroupForPath(href)?.icon ?? LayoutDashboardIcon;

/** Название блока, к которому относится пункт, — для подписи в свёрнутом виде. */
export const groupLabelForHref = (href: string): string | null =>
  NAV_GROUPS.find((group) => group.id === resolveGroupForPath(href)?.id)?.label ?? null;

import { getVisibleNavigation } from './helpers';
import {
  BarChart3Icon,
  BookOpenIcon,
  Building2Icon,
  ClipboardCheckIcon,
  FileBadgeIcon,
  GraduationCapIcon,
  LayoutDashboardIcon,
  MessagesSquareIcon,
  SettingsIcon,
  UsersIcon
} from './nav-icons';

import type { NavigationItem } from './model';
import type { UserSession } from '../../entities/session/model';
import type { LucideIcon } from '@trudskill/ui';

/** Смысловой блок навигации (надстройка над RBAC — чистая презентация). */
export interface NavGroup {
  id: string;
  label: string;
  icon: LucideIcon;
  /** hrefs пунктов блока в нужном порядке. Часть может не иметь пункта меню — это ок. */
  hrefs: string[];
}

/** Блок с уже отфильтрованными по правам пунктами (для рендера). */
export interface NavGroupView {
  id: string;
  label: string;
  icon: LucideIcon;
  items: NavigationItem[];
}

/** 10 блоков ИА (согласованы владельцем, Фаза 2). Порядок блоков и hrefs — как в ТЗ. */
export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'overview',
    label: 'Обзор',
    icon: LayoutDashboardIcon,
    // `/methodist` — сводка методиста (ФТ-H2, Фаза 5 Task 2): такой же обзорный экран,
    // как `/workspace` у администратора, поэтому живёт в том же блоке.
    hrefs: ['/', '/workspace', '/methodist', '/learning/calendar']
  },
  {
    id: 'my-learning',
    label: 'Моё обучение',
    icon: GraduationCapIcon,
    hrefs: [
      '/learner',
      '/learner/courses',
      '/learner/tests',
      '/learner/assignments',
      '/learner/webinars',
      '/learner/payments',
      '/learner/identity'
    ]
  },
  {
    id: 'courses',
    label: 'Курсы и контент',
    icon: BookOpenIcon,
    hrefs: ['/courses', '/library', '/materials', '/scorm', '/directions', '/admin/webinars']
  },
  {
    id: 'assessment',
    label: 'Проверка и оценивание',
    icon: ClipboardCheckIcon,
    hrefs: [
      '/assessment',
      '/admin/tests',
      '/admin/question-banks',
      '/question-import',
      '/admin/assignments',
      '/teacher/review',
      '/proctoring',
      '/admin/proctoring-recordings',
      '/admin/identity-verifications'
    ]
  },
  {
    id: 'people',
    label: 'Люди и группы',
    icon: UsersIcon,
    hrefs: ['/learners', '/groups', '/admin/bulk-enrollments']
  },
  {
    id: 'clients',
    label: 'Клиенты и продажи',
    icon: Building2Icon,
    hrefs: ['/admin/clients', '/counterparty-portal', '/admin/orders']
  },
  {
    id: 'documents',
    label: 'Документы и удостоверения',
    icon: FileBadgeIcon,
    hrefs: [
      '/documents',
      '/learner/documents',
      '/admin/issuance-journal',
      '/admin/commissions',
      '/admin/recertification',
      '/esign/applications',
      '/esign/processes',
      '/esign/legal-log',
      '/academy/commission'
    ]
  },
  {
    id: 'reports',
    label: 'Отчёты и выгрузки',
    icon: BarChart3Icon,
    hrefs: [
      '/reports',
      '/admin/analytics',
      '/admin/reports/builder',
      '/gov-export',
      '/exports',
      '/audit'
    ]
  },
  {
    id: 'communications',
    label: 'Коммуникации',
    icon: MessagesSquareIcon,
    hrefs: ['/notifications', '/chat']
  },
  {
    id: 'settings',
    label: 'Настройки и система',
    icon: SettingsIcon,
    hrefs: [
      '/settings',
      '/users',
      '/integrations',
      '/sync-logs',
      '/academy',
      '/academy/requisites',
      '/telephony',
      '/admin/licenses',
      '/admin/usage',
      // Экран «Эксплуатация» (Фаза 6 Task 8): что не доехало и кнопки, чтобы это починить.
      '/admin/operations',
      '/onboarding',
      '/platform/tenants'
    ]
  }
];

const normalizePath = (path: string) => {
  const withoutQuery = path.split('?')[0] ?? '/';
  if (withoutQuery === '/') return '/';
  return withoutQuery.replace(/\/+$/, '') || '/';
};

/**
 * Раскладывает ПЕРЕДАННЫЕ пункты по блокам ИА. Пустые блоки отбрасываются,
 * порядок внутри блока — по group.hrefs.
 *
 * Отделена от getGroupedNavigation, потому что второй уровень меню («Ещё»)
 * группирует не все видимые пункты, а только те, что не попали в короткое меню
 * роли (IA-015).
 *
 * Пункт, не найденный ни в одном блоке, уходит в служебный блок, а не исчезает:
 * потеря раздела из интерфейса — критерий провала фазы (ТЗ §1.3), а сторож
 * ia-architecture следит за маршрутами, но не за пунктами меню.
 */
export const groupItemsByNavGroup = (items: NavigationItem[]): NavGroupView[] => {
  const byHref = new Map(items.map((item) => [item.href, item]));
  const placed = new Set<string>();

  const groups = NAV_GROUPS.map((group) => {
    const groupItems = group.hrefs
      .map((href) => byHref.get(href))
      .filter((item): item is NavigationItem => Boolean(item));
    groupItems.forEach((item) => placed.add(item.href));
    return { id: group.id, label: group.label, icon: group.icon, items: groupItems };
  }).filter((group) => group.items.length > 0);

  const orphans = items.filter((item) => !placed.has(item.href));
  if (!orphans.length) return groups;

  return [...groups, { id: 'other', label: 'Прочее', icon: LayoutDashboardIcon, items: orphans }];
};

/**
 * Все видимые (по правам) пункты меню, разложенные по блокам.
 * Надстройка над RBAC: источник — getVisibleNavigation (правами не управляем).
 */
export const getGroupedNavigation = (session: UserSession | null): NavGroupView[] =>
  groupItemsByNavGroup(getVisibleNavigation(session));

/**
 * Определяет блок для произвольного пути (для хлебных крошек).
 * Длиннейший префикс-матч среди всех group.hrefs; '/' матчит только сам корень.
 */
export const resolveGroupForPath = (pathname: string): NavGroup | null => {
  const normalized = normalizePath(pathname);
  let best: { group: NavGroup; len: number } | null = null;
  for (const group of NAV_GROUPS) {
    for (const href of group.hrefs) {
      const isMatch = normalized === href || (href !== '/' && normalized.startsWith(`${href}/`));
      if (isMatch && (!best || href.length > best.len)) {
        best = { group, len: href.length };
      }
    }
  }
  return best?.group ?? null;
};

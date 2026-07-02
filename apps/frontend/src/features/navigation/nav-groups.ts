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
    hrefs: ['/', '/workspace', '/student/dashboard', '/learning/calendar', '/admin/cockpit']
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
    hrefs: ['/courses', '/materials', '/scorm', '/directions', '/admin/webinars']
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
      '/teacher/grading-center',
      '/proctoring',
      '/admin/proctoring-recordings',
      '/admin/identity-verifications'
    ]
  },
  {
    id: 'people',
    label: 'Люди и группы',
    icon: UsersIcon,
    hrefs: ['/learners', '/admin/learners', '/groups', '/admin/bulk-enrollments']
  },
  {
    id: 'clients',
    label: 'Клиенты и продажи',
    icon: Building2Icon,
    hrefs: ['/counterparties', '/admin/clients', '/counterparty-portal', '/admin/orders']
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
      '/registry',
      '/audit'
    ]
  },
  {
    id: 'communications',
    label: 'Коммуникации',
    icon: MessagesSquareIcon,
    hrefs: ['/notifications', '/chat', '/admin/notification-settings']
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
      '/admin/payments/settings',
      '/admin/webinars/settings',
      '/admin/licenses'
    ]
  }
];

const normalizePath = (path: string) => {
  const withoutQuery = path.split('?')[0] ?? '/';
  if (withoutQuery === '/') return '/';
  return withoutQuery.replace(/\/+$/, '') || '/';
};

/**
 * Раскладывает видимые (по правам) пункты меню по блокам.
 * Надстройка над RBAC: источник — getVisibleNavigation (правами не управляем).
 * Пустые блоки отбрасываются. Порядок пунктов — по group.hrefs.
 */
export const getGroupedNavigation = (session: UserSession | null): NavGroupView[] => {
  const visible = getVisibleNavigation(session);
  const byHref = new Map(visible.map((item) => [item.href, item]));
  return NAV_GROUPS.map((group) => ({
    id: group.id,
    label: group.label,
    icon: group.icon,
    items: group.hrefs
      .map((href) => byHref.get(href))
      .filter((item): item is NavigationItem => Boolean(item))
  })).filter((group) => group.items.length > 0);
};

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

export interface RouteMeta {
  public: boolean;
  requiredPermissions?: string[];
}

export interface RouteMetaEntry {
  pattern: string;
  meta: RouteMeta;
}

export interface NavigationItem {
  href: string;
  label: string;
  requiredPermissions?: string[];
}

export const routeMeta: RouteMetaEntry[] = [
  { pattern: '/', meta: { public: false } },
  { pattern: '/users', meta: { public: false, requiredPermissions: ['iam.manage_roles'] } },
  { pattern: '/courses', meta: { public: false, requiredPermissions: ['tenant.read'] } },
  { pattern: '/groups', meta: { public: false, requiredPermissions: ['tenant.read'] } },
  { pattern: '/documents', meta: { public: false, requiredPermissions: ['tenant.read'] } },
  { pattern: '/settings', meta: { public: false, requiredPermissions: ['iam.manage_roles'] } },
  { pattern: '/audit', meta: { public: false, requiredPermissions: ['auth.manage_sessions'] } },
  { pattern: '/registry', meta: { public: false, requiredPermissions: ['tenant.read'] } },
  { pattern: '/forms', meta: { public: false, requiredPermissions: ['tenant.read'] } },
  { pattern: '/module-empty', meta: { public: false, requiredPermissions: ['tenant.read'] } },
  { pattern: '/login', meta: { public: true } },
  { pattern: '/logout', meta: { public: true } },
  { pattern: '/forbidden', meta: { public: true } },
  { pattern: '/not-found', meta: { public: true } }
];

export const navigationModel: NavigationItem[] = [
  { href: '/', label: 'Главная' },
  { href: '/users', label: 'Пользователи', requiredPermissions: ['iam.manage_roles'] },
  { href: '/courses', label: 'Курсы', requiredPermissions: ['tenant.read'] },
  { href: '/groups', label: 'Группы', requiredPermissions: ['tenant.read'] },
  { href: '/documents', label: 'Документы', requiredPermissions: ['tenant.read'] },
  { href: '/settings', label: 'Настройки', requiredPermissions: ['iam.manage_roles'] },
  { href: '/audit', label: 'Аудит', requiredPermissions: ['auth.manage_sessions'] }
];

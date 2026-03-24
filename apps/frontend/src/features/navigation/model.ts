export interface RouteMeta {
  public: boolean;
  requiredPermissions?: string[];
}

export interface NavigationItem {
  href: string;
  label: string;
  requiredPermissions?: string[];
}

export const routeMeta: Record<string, RouteMeta> = {
  '/': { public: false },
  '/users': { public: false, requiredPermissions: ['iam.manage_roles'] },
  '/courses': { public: false, requiredPermissions: ['tenant.read'] },
  '/groups': { public: false, requiredPermissions: ['tenant.read'] },
  '/documents': { public: false, requiredPermissions: ['tenant.read'] },
  '/settings': { public: false, requiredPermissions: ['iam.manage_roles'] },
  '/audit': { public: false, requiredPermissions: ['auth.manage_sessions'] },
  '/registry': { public: false, requiredPermissions: ['tenant.read'] },
  '/forms': { public: false, requiredPermissions: ['tenant.read'] },
  '/module-empty': { public: false, requiredPermissions: ['tenant.read'] },
  '/login': { public: true },
  '/forbidden': { public: true }
};

export const navigationModel: NavigationItem[] = [
  { href: '/', label: 'Главная' },
  { href: '/users', label: 'Пользователи', requiredPermissions: ['iam.manage_roles'] },
  { href: '/courses', label: 'Курсы', requiredPermissions: ['tenant.read'] },
  { href: '/groups', label: 'Группы', requiredPermissions: ['tenant.read'] },
  { href: '/documents', label: 'Документы', requiredPermissions: ['tenant.read'] },
  { href: '/settings', label: 'Настройки', requiredPermissions: ['iam.manage_roles'] },
  { href: '/audit', label: 'Аудит', requiredPermissions: ['auth.manage_sessions'] }
];

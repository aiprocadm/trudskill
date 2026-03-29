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
  { pattern: '/counterparties', meta: { public: false, requiredPermissions: ['counterparties.read'] } },
  { pattern: '/directions', meta: { public: false, requiredPermissions: ['directions.read'] } },
  { pattern: '/courses', meta: { public: false, requiredPermissions: ['courses.read'] } },
  { pattern: '/groups', meta: { public: false, requiredPermissions: ['groups.read'] } },
  { pattern: '/assessment', meta: { public: false, requiredPermissions: ['assessment.tests.read'] } },
  { pattern: '/learner/courses', meta: { public: false, requiredPermissions: ['enrollments.read'] } },
  { pattern: '/documents', meta: { public: false, requiredPermissions: ['tenant.read'] } },
  { pattern: '/notifications', meta: { public: false, requiredPermissions: ['tenant.read'] } },
  { pattern: '/chat', meta: { public: false, requiredPermissions: ['tenant.read'] } },
  { pattern: '/settings', meta: { public: false, requiredPermissions: ['iam.manage_roles'] } },
  { pattern: '/integrations', meta: { public: false, requiredPermissions: ['tenant.read'] } },
  { pattern: '/exports', meta: { public: false, requiredPermissions: ['tenant.read'] } },
  { pattern: '/sync-logs', meta: { public: false, requiredPermissions: ['tenant.read'] } },
  { pattern: '/audit', meta: { public: false, requiredPermissions: ['auth.manage_sessions'] } },
  { pattern: '/esign/applications', meta: { public: false, requiredPermissions: ['esign.applications.read'] } },
  { pattern: '/esign/processes', meta: { public: false, requiredPermissions: ['esign.processes.read'] } },
  { pattern: '/esign/legal-log', meta: { public: false, requiredPermissions: ['esign.legal.read'] } },
  { pattern: '/login', meta: { public: true } },
  { pattern: '/logout', meta: { public: true } },
  { pattern: '/forbidden', meta: { public: true } },
  { pattern: '/not-found', meta: { public: true } }
];

export const navigationModel: NavigationItem[] = [
  { href: '/', label: 'Главная' },
  { href: '/users', label: 'Пользователи', requiredPermissions: ['iam.manage_roles'] },
  { href: '/counterparties', label: 'Контрагенты', requiredPermissions: ['counterparties.read'] },
  { href: '/directions', label: 'Направления', requiredPermissions: ['directions.read'] },
  { href: '/courses', label: 'Курсы', requiredPermissions: ['courses.read'] },
  { href: '/groups', label: 'Группы', requiredPermissions: ['groups.read'] },
  { href: '/assessment', label: 'Assessment', requiredPermissions: ['assessment.tests.read'] },
  { href: '/learner/courses', label: 'Мои курсы', requiredPermissions: ['enrollments.read'] },
  { href: '/notifications', label: 'Уведомления', requiredPermissions: ['tenant.read'] },
  { href: '/chat', label: 'Чат', requiredPermissions: ['tenant.read'] },
  { href: '/audit', label: 'Аудит', requiredPermissions: ['auth.manage_sessions'] },
  { href: '/esign/applications', label: 'НЭП заявки', requiredPermissions: ['esign.applications.read'] },
  { href: '/esign/processes', label: 'Подписание', requiredPermissions: ['esign.processes.read'] },
  { href: '/esign/legal-log', label: 'Legal log', requiredPermissions: ['esign.legal.read'] },
  { href: '/integrations', label: 'Интеграции', requiredPermissions: ['tenant.read'] },
  { href: '/exports', label: 'Экспорты', requiredPermissions: ['tenant.read'] },
  { href: '/sync-logs', label: 'Sync logs', requiredPermissions: ['tenant.read'] },
];

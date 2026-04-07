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

/** Более специфичные пути должны идти раньше (первое совпадение в evaluateRouteAccess). */
export const routeMeta: RouteMetaEntry[] = [
  { pattern: '/academy/requisites', meta: { public: false, requiredPermissions: ['tenant.read'] } },
  { pattern: '/academy/commission', meta: { public: false, requiredPermissions: ['tenant.read'] } },
  { pattern: '/academy', meta: { public: false, requiredPermissions: ['tenant.read'] } },
  { pattern: '/crm/deals', meta: { public: false, requiredPermissions: ['tenant.read'] } },
  {
    pattern: '/counterparty-portal',
    meta: { public: false, requiredPermissions: ['counterparties.read'] }
  },
  {
    pattern: '/question-import',
    meta: { public: false, requiredPermissions: ['assessment.questions.write'] }
  },
  { pattern: '/learners', meta: { public: false, requiredPermissions: ['learners.read'] } },
  { pattern: '/materials', meta: { public: false, requiredPermissions: ['materials.read'] } },
  { pattern: '/webinars', meta: { public: false, requiredPermissions: ['tenant.read'] } },
  { pattern: '/reports', meta: { public: false, requiredPermissions: ['tenant.read'] } },
  { pattern: '/proctoring', meta: { public: false, requiredPermissions: ['tenant.read'] } },
  { pattern: '/scorm', meta: { public: false, requiredPermissions: ['materials.read'] } },
  { pattern: '/gov-export', meta: { public: false, requiredPermissions: ['tenant.read'] } },
  { pattern: '/mailings', meta: { public: false, requiredPermissions: ['tenant.read'] } },
  { pattern: '/telephony', meta: { public: false, requiredPermissions: ['tenant.read'] } },
  { pattern: '/workspace', meta: { public: false, requiredPermissions: ['tenant.read'] } },
  { pattern: '/', meta: { public: false } },
  { pattern: '/users', meta: { public: false, requiredPermissions: ['iam.manage_roles'] } },
  {
    pattern: '/counterparties',
    meta: { public: false, requiredPermissions: ['counterparties.read'] }
  },
  { pattern: '/directions', meta: { public: false, requiredPermissions: ['directions.read'] } },
  { pattern: '/courses', meta: { public: false, requiredPermissions: ['courses.read'] } },
  { pattern: '/groups', meta: { public: false, requiredPermissions: ['groups.read'] } },
  {
    pattern: '/assessment',
    meta: { public: false, requiredPermissions: ['assessment.tests.read'] }
  },
  {
    pattern: '/learner/courses',
    meta: { public: false, requiredPermissions: ['enrollments.read'] }
  },
  { pattern: '/documents', meta: { public: false, requiredPermissions: ['tenant.read'] } },
  { pattern: '/registry', meta: { public: false, requiredPermissions: ['tenant.read'] } },
  { pattern: '/notifications', meta: { public: false, requiredPermissions: ['tenant.read'] } },
  { pattern: '/chat', meta: { public: false, requiredPermissions: ['tenant.read'] } },
  { pattern: '/settings', meta: { public: false, requiredPermissions: ['iam.manage_roles'] } },
  { pattern: '/integrations', meta: { public: false, requiredPermissions: ['tenant.read'] } },
  { pattern: '/exports', meta: { public: false, requiredPermissions: ['tenant.read'] } },
  { pattern: '/sync-logs', meta: { public: false, requiredPermissions: ['tenant.read'] } },
  { pattern: '/audit', meta: { public: false, requiredPermissions: ['auth.manage_sessions'] } },
  {
    pattern: '/esign/applications',
    meta: { public: false, requiredPermissions: ['esign.applications.read'] }
  },
  {
    pattern: '/esign/processes',
    meta: { public: false, requiredPermissions: ['esign.processes.read'] }
  },
  {
    pattern: '/esign/legal-log',
    meta: { public: false, requiredPermissions: ['esign.legal.read'] }
  },
  { pattern: '/login', meta: { public: true } },
  { pattern: '/logout', meta: { public: true } },
  { pattern: '/forbidden', meta: { public: true } },
  { pattern: '/not-found', meta: { public: true } }
];

/** Порядок — логические блоки по ТЗ СДО. */
export const navigationModel: NavigationItem[] = [
  { href: '/', label: 'Главная' },
  { href: '/academy', label: 'Учебный центр', requiredPermissions: ['tenant.read'] },
  { href: '/academy/requisites', label: '··· Реквизиты УЦ', requiredPermissions: ['tenant.read'] },
  { href: '/academy/commission', label: '··· Комиссия', requiredPermissions: ['tenant.read'] },
  { href: '/users', label: 'Пользователи и доступы', requiredPermissions: ['iam.manage_roles'] },
  { href: '/learners', label: 'Слушатели', requiredPermissions: ['learners.read'] },
  { href: '/counterparties', label: 'Контрагенты', requiredPermissions: ['counterparties.read'] },
  {
    href: '/counterparty-portal',
    label: 'Контур контрагента',
    requiredPermissions: ['counterparties.read']
  },
  { href: '/directions', label: 'Направления', requiredPermissions: ['directions.read'] },
  { href: '/courses', label: 'Курсы', requiredPermissions: ['courses.read'] },
  { href: '/materials', label: 'Контент (модули)', requiredPermissions: ['materials.read'] },
  { href: '/groups', label: 'Группы', requiredPermissions: ['groups.read'] },
  {
    href: '/assessment',
    label: 'Тесты и экзамены',
    requiredPermissions: ['assessment.tests.read']
  },
  {
    href: '/question-import',
    label: 'Импорт вопросов',
    requiredPermissions: ['assessment.questions.write']
  },
  {
    href: '/learner/courses',
    label: 'Мои курсы (слушатель)',
    requiredPermissions: ['enrollments.read']
  },
  { href: '/documents', label: 'Документы', requiredPermissions: ['tenant.read'] },
  {
    href: '/esign/applications',
    label: 'НЭП заявки',
    requiredPermissions: ['esign.applications.read']
  },
  {
    href: '/esign/processes',
    label: 'НЭП подписание',
    requiredPermissions: ['esign.processes.read']
  },
  { href: '/esign/legal-log', label: 'НЭП legal log', requiredPermissions: ['esign.legal.read'] },
  { href: '/webinars', label: 'Вебинары', requiredPermissions: ['tenant.read'] },
  { href: '/proctoring', label: 'Прокторинг', requiredPermissions: ['tenant.read'] },
  { href: '/scorm', label: 'SCORM / тренажёры', requiredPermissions: ['materials.read'] },
  { href: '/mailings', label: 'Рассылки', requiredPermissions: ['tenant.read'] },
  { href: '/notifications', label: 'Уведомления', requiredPermissions: ['tenant.read'] },
  { href: '/chat', label: 'Чат', requiredPermissions: ['tenant.read'] },
  { href: '/crm/deals', label: 'CRM · Сделки', requiredPermissions: ['tenant.read'] },
  { href: '/gov-export', label: 'ФРДО / ЕИСОТ', requiredPermissions: ['tenant.read'] },
  { href: '/integrations', label: 'Интеграции', requiredPermissions: ['tenant.read'] },
  { href: '/exports', label: 'Экспорты', requiredPermissions: ['tenant.read'] },
  { href: '/sync-logs', label: 'Sync logs', requiredPermissions: ['tenant.read'] },
  { href: '/reports', label: 'Отчёты', requiredPermissions: ['tenant.read'] },
  { href: '/telephony', label: 'Телефония', requiredPermissions: ['tenant.read'] },
  { href: '/workspace', label: 'Operational workspace', requiredPermissions: ['tenant.read'] },
  { href: '/registry', label: 'Registry (UI)', requiredPermissions: ['tenant.read'] },
  { href: '/settings', label: 'Настройки', requiredPermissions: ['iam.manage_roles'] },
  { href: '/audit', label: 'Аудит', requiredPermissions: ['auth.manage_sessions'] }
];

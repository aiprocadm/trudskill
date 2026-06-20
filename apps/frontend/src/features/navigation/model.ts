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
  navSlot?: 'main' | 'more';
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
  // More-specific pattern first: resolveRouteMeta uses `.find` with prefix matching, so
  // `/admin/webinars/settings` must precede `/admin/webinars` or it'd inherit webinars.read.
  {
    pattern: '/admin/webinars/settings',
    meta: { public: false, requiredPermissions: ['webinars.configure'] }
  },
  { pattern: '/admin/webinars', meta: { public: false, requiredPermissions: ['webinars.read'] } },
  {
    pattern: '/learner/webinars',
    meta: { public: false, requiredPermissions: ['webinars.attend'] }
  },
  { pattern: '/reports', meta: { public: false, requiredPermissions: ['tenant.read'] } },
  { pattern: '/proctoring', meta: { public: false, requiredPermissions: ['tenant.read'] } },
  { pattern: '/scorm', meta: { public: false, requiredPermissions: ['materials.read'] } },
  {
    pattern: '/gov-export',
    meta: { public: false, requiredPermissions: ['regulatory.export.read'] }
  },
  { pattern: '/mailings', meta: { public: false, requiredPermissions: ['tenant.read'] } },
  { pattern: '/telephony', meta: { public: false, requiredPermissions: ['tenant.read'] } },
  { pattern: '/workspace', meta: { public: false, requiredPermissions: ['tenant.read'] } },
  {
    pattern: '/student/dashboard',
    meta: { public: false, requiredPermissions: ['enrollments.read'] }
  },
  {
    pattern: '/teacher/grading-center',
    meta: { public: false, requiredPermissions: ['assessment.reviews.review'] }
  },
  {
    pattern: '/admin/cockpit',
    meta: { public: false, requiredPermissions: ['auth.manage_sessions'] }
  },
  {
    pattern: '/admin/analytics',
    meta: { public: false, requiredPermissions: ['enrollments.read'] }
  },
  {
    pattern: '/admin/reports/builder',
    meta: { public: false, requiredPermissions: ['enrollments.read'] }
  },
  {
    pattern: '/admin/commissions',
    meta: { public: false, requiredPermissions: ['learning.commissions.read'] }
  },
  {
    pattern: '/admin/commissions/[id]',
    meta: { public: false, requiredPermissions: ['learning.commissions.read'] }
  },
  {
    pattern: '/admin/bulk-enrollments',
    meta: { public: false, requiredPermissions: ['learners.write', 'enrollments.write'] }
  },
  {
    pattern: '/admin/learners',
    meta: { public: false, requiredPermissions: ['learners.read'] }
  },
  {
    pattern: '/admin/clients/[id]',
    meta: { public: false, requiredPermissions: ['counterparties.read'] }
  },
  {
    pattern: '/admin/clients',
    meta: { public: false, requiredPermissions: ['counterparties.read'] }
  },
  {
    pattern: '/admin/recertification',
    meta: { public: false, requiredPermissions: ['recertification.read'] }
  },
  {
    pattern: '/admin/orders',
    meta: { public: false, requiredPermissions: ['payments.read'] }
  },
  {
    pattern: '/admin/identity-verifications/[id]',
    meta: { public: false, requiredPermissions: ['identity.read'] }
  },
  {
    pattern: '/admin/identity-verifications',
    meta: { public: false, requiredPermissions: ['identity.read'] }
  },
  {
    pattern: '/admin/proctoring-recordings/[id]',
    meta: { public: false, requiredPermissions: ['proctoring.read'] }
  },
  {
    pattern: '/admin/proctoring-recordings',
    meta: { public: false, requiredPermissions: ['proctoring.read'] }
  },
  {
    pattern: '/admin/question-banks/[id]',
    meta: { public: false, requiredPermissions: ['assessment.question_banks.read'] }
  },
  {
    pattern: '/admin/question-banks',
    meta: { public: false, requiredPermissions: ['assessment.question_banks.read'] }
  },
  {
    pattern: '/admin/tests/[id]',
    meta: { public: false, requiredPermissions: ['assessment.tests.read'] }
  },
  {
    pattern: '/admin/tests',
    meta: { public: false, requiredPermissions: ['assessment.tests.read'] }
  },
  {
    pattern: '/admin/assignments/[id]',
    meta: { public: false, requiredPermissions: ['assessment.assignments.read'] }
  },
  {
    pattern: '/admin/assignments',
    meta: { public: false, requiredPermissions: ['assessment.assignments.read'] }
  },
  {
    pattern: '/teacher/review',
    meta: { public: false, requiredPermissions: ['assessment.reviews.review'] }
  },
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
    pattern: '/learning/calendar',
    meta: { public: false, requiredPermissions: ['enrollments.read'] }
  },
  {
    pattern: '/learner/courses',
    meta: { public: false, requiredPermissions: ['enrollments.read'] }
  },
  {
    pattern: '/learner/tests/[testId]/attempt/[attemptId]',
    meta: { public: false, requiredPermissions: ['assessment.attempts.take'] }
  },
  {
    pattern: '/learner/tests/[testId]/result',
    meta: { public: false, requiredPermissions: ['assessment.results.read'] }
  },
  {
    pattern: '/learner/tests',
    meta: { public: false, requiredPermissions: ['assessment.tests.read'] }
  },
  {
    pattern: '/learner/assignments/[id]/submit',
    meta: { public: false, requiredPermissions: ['assessment.submissions.submit'] }
  },
  {
    pattern: '/learner/assignments',
    meta: { public: false, requiredPermissions: ['assessment.assignments.read'] }
  },
  {
    pattern: '/learner/identity',
    meta: { public: false, requiredPermissions: ['identity.submit'] }
  },
  {
    pattern: '/learner/payments',
    meta: { public: false, requiredPermissions: ['payments.self_purchase'] }
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
  { href: '/learner/courses', label: 'Мои курсы', requiredPermissions: ['enrollments.read'] },
  {
    href: '/learner/documents',
    label: 'Мои документы',
    requiredPermissions: ['enrollments.read']
  },
  { href: '/learner/tests', label: 'Мои тесты', requiredPermissions: ['assessment.tests.read'] },
  {
    href: '/learner/assignments',
    label: 'Мои задания',
    requiredPermissions: ['assessment.assignments.read']
  },
  {
    href: '/learner/identity',
    label: 'Подтверждение личности',
    requiredPermissions: ['identity.submit']
  },
  {
    href: '/learner/payments',
    label: 'Мои оплаты',
    requiredPermissions: ['payments.self_purchase']
  },
  { href: '/courses', label: 'Курсы', requiredPermissions: ['courses.read'] },
  { href: '/assessment', label: 'Задания и тесты', requiredPermissions: ['assessment.tests.read'] },
  { href: '/notifications', label: 'Сообщения', requiredPermissions: ['tenant.read'] },
  { href: '/users', label: 'Пользователи', requiredPermissions: ['iam.manage_roles'] },
  { href: '/groups', label: 'Группы', requiredPermissions: ['groups.read'] },
  {
    href: '/learning/calendar',
    label: 'Календарь',
    requiredPermissions: ['enrollments.read']
  },
  { href: '/reports', label: 'Отчеты', requiredPermissions: ['tenant.read'] },
  { href: '/settings', label: 'Настройки', requiredPermissions: ['iam.manage_roles'] },
  {
    href: '/admin/question-banks',
    label: 'Банки вопросов',
    requiredPermissions: ['assessment.question_banks.read'],
    navSlot: 'more'
  },
  {
    href: '/admin/tests',
    label: 'Тесты',
    requiredPermissions: ['assessment.tests.read'],
    navSlot: 'more'
  },
  {
    href: '/admin/assignments',
    label: 'Задания',
    requiredPermissions: ['assessment.assignments.read'],
    navSlot: 'more'
  },
  {
    href: '/teacher/review',
    label: 'Очередь на проверку',
    requiredPermissions: ['assessment.reviews.review'],
    navSlot: 'more'
  },
  {
    href: '/academy',
    label: 'Учебный центр',
    requiredPermissions: ['tenant.read'],
    navSlot: 'more'
  },
  {
    href: '/academy/requisites',
    label: 'Реквизиты учебного центра',
    requiredPermissions: ['tenant.read'],
    navSlot: 'more'
  },
  {
    href: '/academy/commission',
    label: 'Комиссия',
    requiredPermissions: ['tenant.read'],
    navSlot: 'more'
  },
  {
    href: '/learners',
    label: 'Слушатели',
    requiredPermissions: ['learners.read'],
    navSlot: 'more'
  },
  {
    href: '/counterparties',
    label: 'Контрагенты',
    requiredPermissions: ['counterparties.read'],
    navSlot: 'more'
  },
  {
    href: '/counterparty-portal',
    label: 'Кабинет контрагента',
    requiredPermissions: ['counterparties.read'],
    navSlot: 'more'
  },
  {
    href: '/directions',
    label: 'Направления',
    requiredPermissions: ['directions.read'],
    navSlot: 'more'
  },
  {
    href: '/materials',
    label: 'Материалы',
    requiredPermissions: ['materials.read'],
    navSlot: 'more'
  },
  {
    href: '/question-import',
    label: 'Импорт вопросов',
    requiredPermissions: ['assessment.questions.write'],
    navSlot: 'more'
  },
  { href: '/documents', label: 'Документы', requiredPermissions: ['tenant.read'], navSlot: 'more' },
  {
    href: '/esign/applications',
    label: 'НЭП заявки',
    requiredPermissions: ['esign.applications.read'],
    navSlot: 'more'
  },
  {
    href: '/esign/processes',
    label: 'НЭП подписание',
    requiredPermissions: ['esign.processes.read'],
    navSlot: 'more'
  },
  {
    href: '/esign/legal-log',
    label: 'НЭП журнал',
    requiredPermissions: ['esign.legal.read'],
    navSlot: 'more'
  },
  {
    href: '/admin/webinars',
    label: 'Вебинары',
    requiredPermissions: ['webinars.read'],
    navSlot: 'more'
  },
  {
    href: '/learner/webinars',
    label: 'Мои вебинары',
    requiredPermissions: ['webinars.attend'],
    navSlot: 'more'
  },
  {
    href: '/proctoring',
    label: 'Прокторинг',
    requiredPermissions: ['tenant.read'],
    navSlot: 'more'
  },
  { href: '/scorm', label: 'SCORM', requiredPermissions: ['materials.read'], navSlot: 'more' },
  { href: '/mailings', label: 'Рассылки', requiredPermissions: ['tenant.read'], navSlot: 'more' },
  { href: '/chat', label: 'Чат', requiredPermissions: ['tenant.read'], navSlot: 'more' },
  { href: '/crm/deals', label: 'Сделки', requiredPermissions: ['tenant.read'], navSlot: 'more' },
  {
    href: '/gov-export',
    label: 'Госвыгрузки',
    requiredPermissions: ['regulatory.export.read'],
    navSlot: 'more'
  },
  {
    href: '/integrations',
    label: 'Интеграции',
    requiredPermissions: ['tenant.read'],
    navSlot: 'more'
  },
  { href: '/exports', label: 'Экспорт', requiredPermissions: ['tenant.read'], navSlot: 'more' },
  {
    href: '/sync-logs',
    label: 'Журнал синхронизации',
    requiredPermissions: ['tenant.read'],
    navSlot: 'more'
  },
  { href: '/telephony', label: 'Телефония', requiredPermissions: ['tenant.read'], navSlot: 'more' },
  {
    href: '/workspace',
    label: 'Оперативная панель',
    requiredPermissions: ['tenant.read'],
    navSlot: 'more'
  },
  { href: '/registry', label: 'Реестр', requiredPermissions: ['tenant.read'], navSlot: 'more' },
  {
    href: '/audit',
    label: 'Аудит',
    requiredPermissions: ['auth.manage_sessions'],
    navSlot: 'more'
  },
  {
    href: '/student/dashboard',
    label: 'Student dashboard',
    requiredPermissions: ['enrollments.read'],
    navSlot: 'more'
  },
  {
    href: '/teacher/grading-center',
    label: 'Teacher grading center',
    requiredPermissions: ['assessment.reviews.review'],
    navSlot: 'more'
  },
  {
    href: '/admin/cockpit',
    label: 'Admin cockpit',
    requiredPermissions: ['auth.manage_sessions'],
    navSlot: 'more'
  },
  {
    href: '/admin/analytics',
    label: 'Аналитика',
    requiredPermissions: ['enrollments.read'],
    navSlot: 'more'
  },
  {
    href: '/admin/reports/builder',
    label: 'Конструктор отчётов',
    requiredPermissions: ['enrollments.read'],
    navSlot: 'more'
  },
  {
    href: '/admin/commissions',
    label: 'Комиссии',
    requiredPermissions: ['learning.commissions.read'],
    navSlot: 'more'
  },
  {
    href: '/admin/bulk-enrollments',
    label: 'Массовая загрузка',
    requiredPermissions: ['learners.write', 'enrollments.write'],
    navSlot: 'more'
  },
  {
    href: '/admin/learners',
    label: 'Ученики',
    requiredPermissions: ['learners.read'],
    navSlot: 'more'
  },
  {
    href: '/admin/clients',
    label: 'Компании',
    requiredPermissions: ['counterparties.read'],
    navSlot: 'more'
  },
  {
    href: '/admin/recertification',
    label: 'Переаттестация',
    requiredPermissions: ['recertification.read'],
    navSlot: 'more'
  },
  {
    href: '/admin/orders',
    label: 'Заказы',
    requiredPermissions: ['payments.read'],
    navSlot: 'more'
  },
  {
    href: '/admin/identity-verifications',
    label: 'Идентификация',
    requiredPermissions: ['identity.read'],
    navSlot: 'more'
  },
  {
    href: '/admin/proctoring-recordings',
    label: 'Записи прокторинга',
    requiredPermissions: ['proctoring.read'],
    navSlot: 'more'
  }
];

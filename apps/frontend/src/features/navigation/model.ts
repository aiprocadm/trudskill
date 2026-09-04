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
  /*
   * Журнал 343 (§5.418): право экрана — право его ДАННЫХ, то же, что на ручках бэкенда,
   * которые экран вызывает. Пятнадцать экранов сотрудников стояли под `tenant.read` — оно
   * есть у ВСЕХ ролей, включая слушателя, — и слушатель видел их в меню «Ещё»: одни
   * отвечали ему 403 (тупик), другие показывали данные сотрудников. Сторож класса —
   * `apps/backend/src/common/guards/learner-reaches-staff-screen.isolation.test.ts`.
   *
   * Реквизиты — форма правки (PUT /tenant/requisites, /tenant/settings под
   * `tenant.settings.write`); комиссия — состав, как у `/admin/commissions`
   * (`learning.commissions.read`); «Учебный центр» — узел этих настроек.
   */
  {
    pattern: '/academy/requisites',
    meta: { public: false, requiredPermissions: ['tenant.settings.write'] }
  },
  {
    pattern: '/academy/commission',
    meta: { public: false, requiredPermissions: ['learning.commissions.read'] }
  },
  { pattern: '/academy', meta: { public: false, requiredPermissions: ['tenant.settings.write'] } },
  // Сделки читают контрагентов (GET /counterparties) — их право.
  { pattern: '/crm/deals', meta: { public: false, requiredPermissions: ['counterparties.read'] } },
  {
    // ФТ-D2.2: платформенная админка — только platform_admin (0073).
    pattern: '/platform/tenants',
    meta: { public: false, requiredPermissions: ['platform.tenants.read'] }
  },
  {
    // ФТ-D4.2: использование тарифа — администрация центра (0076).
    pattern: '/admin/usage',
    meta: { public: false, requiredPermissions: ['tenant.usage.read'] }
  },
  {
    // ФТ-D2.3: мастер онбординга — настройка центра, дело его администрации: то же право,
    // что у реквизитов (журнал 343; прежде `tenant.read` — и слушатель видел ход настройки).
    // Сами шаги записываются своими правами на своих экранах.
    pattern: '/onboarding',
    meta: { public: false, requiredPermissions: ['tenant.settings.write'] }
  },
  {
    // ФТ-D6: каталог курсов платформы — читают все, кто работает с курсами.
    pattern: '/library',
    meta: { public: false, requiredPermissions: ['courses.read'] }
  },
  {
    // ФТ-E5: отдельное право портала. `counterparties.read` означает «видеть справочник
    // контрагентов центра» — ровно ту клиентскую базу, которую представитель видеть не должен.
    pattern: '/counterparty-portal',
    meta: { public: false, requiredPermissions: ['portal.read'] }
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
  // Фаза 6 Task 1: было `tenant.read` — оно есть у слушателя, и он видел раздел
  // отчётов по всему центру. Теперь как на бэкенде: `learners.read`.
  { pattern: '/reports', meta: { public: false, requiredPermissions: ['learners.read'] } },
  // Журнал 343: право раздела прокторинга, как у записей и настроек (`proctoring.read`).
  { pattern: '/proctoring', meta: { public: false, requiredPermissions: ['proctoring.read'] } },
  { pattern: '/scorm', meta: { public: false, requiredPermissions: ['materials.read'] } },
  {
    pattern: '/gov-export',
    meta: { public: false, requiredPermissions: ['regulatory.export.read'] }
  },
  // Журнал 343: рассылки — доставки и шаблоны писем под `notifications.read`.
  { pattern: '/mailings', meta: { public: false, requiredPermissions: ['notifications.read'] } },
  // ФТ-H1 (Фаза 5 Task 8): страницы, найденные сверкой ВНЕ карты доступа. Маршрут
  // вне карты считается not-found, и ProtectedPage выбрасывала посетителя — тот же
  // класс бага, что был у /learner (§5.241). Анкеты собираются в «Документах» (журнал 197),
  // право — их (журнал 343).
  { pattern: '/forms', meta: { public: false, requiredPermissions: ['documents.read'] } },
  { pattern: '/module-empty', meta: { public: false } },
  // Страница «нет интернета» (Фаза 6 Task 11): показывается при обрыве связи, в том числе
  // когда человек ещё не вошёл, — поэтому публичная.
  { pattern: '/offline', meta: { public: true } },
  // Журнал 343: телефония читает поставщиков и ключи интеграций — их право.
  { pattern: '/telephony', meta: { public: false, requiredPermissions: ['integrations.read'] } },
  // Журнал 342/343: оперативная панель — рабочий стол сотрудника; право заведено
  // миграцией 0091 всем ролям центра, кроме слушателя, и стоит на её ручках.
  { pattern: '/workspace', meta: { public: false, requiredPermissions: ['workspace.read'] } },
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
    pattern: '/admin/ui-kit',
    meta: { public: false, requiredPermissions: ['auth.manage_sessions'] }
  },
  {
    pattern: '/admin/analytics',
    meta: { public: false, requiredPermissions: ['learners.read'] }
  },
  {
    pattern: '/admin/reports/builder',
    meta: { public: false, requiredPermissions: ['learners.read'] }
  },
  {
    /* Карточка — раньше раздела: иначе правило карточки не выбирается никогда (ревизия 2026-08-26). */
    pattern: '/admin/commissions/[id]',
    meta: { public: false, requiredPermissions: ['learning.commissions.read'] }
  },
  {
    pattern: '/admin/commissions',
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
    pattern: '/admin/notification-settings',
    meta: { public: false, requiredPermissions: ['notifications.read'] }
  },
  // More-specific pattern first: /admin/payments/settings must precede /admin/orders or it'd inherit payments.read.
  {
    pattern: '/admin/payments/settings',
    meta: { public: false, requiredPermissions: ['payments.configure'] }
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
    // Журнал 343: как у ручки GET /admin/documents/issuance-journal.
    pattern: '/admin/issuance-journal',
    meta: { public: false, requiredPermissions: ['documents.read'] }
  },
  {
    // Экран «Эксплуатация» (Фаза 6 Task 8). Право то же, что у карантина на бэкенде:
    // разбирать застрявшие выпуски и письма — работа администрации, не методиста.
    pattern: '/admin/operations',
    meta: { public: false, requiredPermissions: ['operations.quarantine.read'] }
  },
  {
    pattern: '/admin/licenses',
    meta: { public: false, requiredPermissions: ['auth.manage_sessions'] }
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
    pattern: '/learner/documents',
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
  /**
   * Главная кабинета слушателя. **Строго ПОСЛЕ всех `/learner/*`:** совпадение ищется
   * по префиксу и берётся первое, поэтому запись выше перехватила бы все внутренние
   * страницы кабинета и навязала им своё право.
   *
   * Записи здесь не было вовсе, и это ломало кабинет вживую: неизвестный маршрут
   * считается `not-found`, а `ProtectedRoute` на этом уводит на `/not-found` — то есть
   * слушатель после входа выпадал из кабинета. Обнаружено при Фазе 5 Task 1, когда
   * перенаправление ролей стало сверяться с картой доступа.
   */
  { pattern: '/learner', meta: { public: false, requiredPermissions: ['enrollments.read'] } },
  // ФТ-H2 (Фаза 5 Task 2): сводка по обучению. Право `courses.read` — самое широкое из
  // тех, что нужны хотя бы одному разделу; окончательное решение принимает сервер,
  // который гейтит разделы по правам актора и отвечает отказом, если не положен ни один
  // (у слушателя `courses.read` есть, но экран персонала ему не открывается).
  { pattern: '/methodist', meta: { public: false, requiredPermissions: ['courses.read'] } },
  // Журнал 343: как у ручек GET /templates, GET /document-tasks.
  { pattern: '/documents', meta: { public: false, requiredPermissions: ['documents.read'] } },
  /*
   * IA-017: `/registry` — редирект на `/audit` (тот же журнал, тот же источник данных).
   * Право выровнено с сервером: ручка `/audit/events` требует `auth.manage_sessions`,
   * а маршрут обещал `tenant.read` — роль с этим правом открывала раздел и получала отказ.
   */
  {
    pattern: '/registry',
    meta: { public: false, requiredPermissions: ['auth.manage_sessions'] }
  },
  { pattern: '/notifications', meta: { public: false, requiredPermissions: ['tenant.read'] } },
  { pattern: '/chat', meta: { public: false, requiredPermissions: ['tenant.read'] } },
  /*
   * Срез 13: проверялась гипотеза «после переезда настроек оплаты внутрь `/settings` человек
   * с `payments.configure`, но без права на роли, потерял путь». По миграции 0056 это право
   * выдаётся только `platform_admin` и `tenant_admin`, а у них есть и `iam.manage_roles`
   * (0010 выдаёт админу центра ВСЕ права) — то есть дыра теоретическая, живой роли без пути нет.
   * Право маршрута оставлено прежним: ослаблять доступ ради искусственной сессии из теста нельзя.
   */
  { pattern: '/settings', meta: { public: false, requiredPermissions: ['iam.manage_roles'] } },
  // Журнал 343: все три раздела читают ручки под `integrations.read`.
  { pattern: '/integrations', meta: { public: false, requiredPermissions: ['integrations.read'] } },
  { pattern: '/exports', meta: { public: false, requiredPermissions: ['integrations.read'] } },
  { pattern: '/sync-logs', meta: { public: false, requiredPermissions: ['integrations.read'] } },
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
  { pattern: '/not-found', meta: { public: true } },
  // ФТ-H1 (Фаза 5 Task 8): публичные страницы, жившие вне карты доступа.
  // Проверка подлинности по QR и вход на экзамен по токену обязаны открываться
  // без сессии; «центр не найден» — посадочная резолвера поддоменов (ФТ-D3.2).
  { pattern: '/verify', meta: { public: true } },
  { pattern: '/exam-auth', meta: { public: true } },
  { pattern: '/tenant-not-found', meta: { public: true } }
];

/** Порядок — логические блоки по ТЗ СДО. */
export const navigationModel: NavigationItem[] = [
  { href: '/', label: 'Главная' },
  // ФТ-H1 (Фаза 5 Task 8): '/learner' стоял в блоке «Моё обучение», но пункта меню
  // не имел — блок ссылался в пустоту, и в кабинет нельзя было вернуться из меню.
  { href: '/learner', label: 'Мой кабинет', requiredPermissions: ['enrollments.read'] },
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
  { href: '/reports', label: 'Отчеты', requiredPermissions: ['learners.read'] },
  { href: '/settings', label: 'Настройки', requiredPermissions: ['iam.manage_roles'] },
  {
    // ФТ-D2.2: право есть только у platform_admin (0073) — у админов центров пункт скрыт.
    href: '/platform/tenants',
    label: 'Арендаторы платформы',
    requiredPermissions: ['platform.tenants.read'],
    navSlot: 'more'
  },
  {
    // ФТ-D4.2: экран «Использование» — тариф и лимиты центра.
    href: '/admin/usage',
    label: 'Использование',
    requiredPermissions: ['tenant.usage.read'],
    navSlot: 'more'
  },
  {
    // ФТ-D2.3: мастер онбординга нового центра.
    href: '/onboarding',
    label: 'Настройка центра',
    requiredPermissions: ['tenant.settings.write'],
    navSlot: 'more'
  },
  {
    // ФТ-D6: библиотека готовых программ платформы.
    href: '/library',
    label: 'Библиотека курсов',
    requiredPermissions: ['courses.read'],
    navSlot: 'more'
  },
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
    requiredPermissions: ['tenant.settings.write'],
    navSlot: 'more'
  },
  {
    href: '/academy/requisites',
    label: 'Реквизиты учебного центра',
    requiredPermissions: ['tenant.settings.write'],
    navSlot: 'more'
  },
  {
    href: '/academy/commission',
    label: 'Комиссия',
    requiredPermissions: ['learning.commissions.read'],
    navSlot: 'more'
  },
  {
    href: '/learners',
    label: 'Слушатели',
    requiredPermissions: ['learners.read'],
    navSlot: 'more'
  },
  {
    href: '/counterparty-portal',
    label: 'Портал заказчика',
    requiredPermissions: ['portal.read'],
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
  {
    href: '/documents',
    label: 'Документы',
    requiredPermissions: ['documents.read'],
    navSlot: 'more'
  },
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
    requiredPermissions: ['proctoring.read'],
    navSlot: 'more'
  },
  /* «SCORM» — имя отраслевого стандарта учебных пакетов; само по себе оно администратору
     учебного центра ничего не говорит, поэтому в подписи есть и русские слова. */
  {
    href: '/scorm',
    label: 'Учебные пакеты (SCORM)',
    requiredPermissions: ['materials.read'],
    navSlot: 'more'
  },
  { href: '/chat', label: 'Чат', requiredPermissions: ['tenant.read'], navSlot: 'more' },
  {
    href: '/gov-export',
    label: 'Госвыгрузки',
    requiredPermissions: ['regulatory.export.read'],
    navSlot: 'more'
  },
  {
    href: '/integrations',
    label: 'Интеграции',
    requiredPermissions: ['integrations.read'],
    navSlot: 'more'
  },
  {
    href: '/exports',
    label: 'Экспорт',
    requiredPermissions: ['integrations.read'],
    navSlot: 'more'
  },
  {
    href: '/sync-logs',
    label: 'Журнал синхронизации',
    requiredPermissions: ['integrations.read'],
    navSlot: 'more'
  },
  {
    href: '/telephony',
    label: 'Телефония',
    requiredPermissions: ['integrations.read'],
    navSlot: 'more'
  },
  {
    href: '/workspace',
    label: 'Оперативная панель',
    requiredPermissions: ['workspace.read'],
    navSlot: 'more'
  },
  // ФТ-H2 (Фаза 5 Task 2): сводка методиста. Пункт нужен и в навигации, а не только
  // как точка приземления: методист уходит с неё в группы и возвращается обратно.
  {
    href: '/methodist',
    label: 'Обучение: сводка',
    requiredPermissions: ['courses.read'],
    navSlot: 'more'
  },
  {
    href: '/audit',
    label: 'Аудит',
    requiredPermissions: ['auth.manage_sessions'],
    navSlot: 'more'
  },
  {
    href: '/admin/analytics',
    label: 'Аналитика',
    requiredPermissions: ['learners.read'],
    navSlot: 'more'
  },
  {
    href: '/admin/reports/builder',
    label: 'Конструктор отчётов',
    requiredPermissions: ['learners.read'],
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
    // TXT-003: у слушателя этот же раздел называется «Подтверждение личности» —
    // одно понятие не должно менять имя при переходе между кабинетами.
    label: 'Подтверждение личности',
    requiredPermissions: ['identity.read'],
    navSlot: 'more'
  },
  {
    href: '/admin/proctoring-recordings',
    // «Прокторинг» — жаргон: администратор учебного центра такого слова не знает.
    label: 'Видеозаписи экзаменов',
    requiredPermissions: ['proctoring.read'],
    navSlot: 'more'
  },
  {
    href: '/admin/issuance-journal',
    label: 'Журнал выдачи',
    requiredPermissions: ['documents.read'],
    navSlot: 'more'
  },
  {
    href: '/admin/operations',
    label: 'Эксплуатация',
    requiredPermissions: ['operations.quarantine.read'],
    navSlot: 'more'
  },
  {
    href: '/admin/licenses',
    label: 'Лицензии',
    requiredPermissions: ['auth.manage_sessions'],
    navSlot: 'more'
  }
];

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
  /**
   * Пункт показывается только при включённом флаге функции (ТЗ 5.12.6, решение Р3).
   *
   * Не «скрыть и забыть»: раздел остаётся в модели вместе с правами и слотом, поэтому его
   * возвращение — это переключатель, а не восстановление удалённого кода по истории.
   */
  featureFlag?: 'chat';
  /**
   * Чья это работа (ТЗ 3.2, пункт 2: «маршрут → название → группа → СПИСОК РОЛЕЙ»).
   *
   * Права отвечают на вопрос «можно ли сюда войти», а этот список — на вопрос «нужно ли это
   * показывать в меню». Вопросы разные, и подменять один другим — как раз то, из-за чего
   * методист видел в меню «Заявки на НЭП», «Подписание документов», «Переаттестацию» и
   * «Госвыгрузки»: права на чтение у него есть, а работа это не его (ТЗ 8.4, журнал 534).
   *
   * Поле НЕ трогает доступ: по прямой ссылке раздел откроется, как и раньше, если права
   * позволяют. Скрыть из меню и отобрать право — разные действия, и второе делается
   * миграцией, а не разметкой.
   *
   * Не задано — раздел показывается всем, кого пускают права (так у подавляющего большинства).
   */
  audience?: string[];
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
    /*
     * ТЗ 12.2: раздел «Фоновые задачи».
     *
     * Своего права у раздела нет: он показывает СВОИ задачи, и право «смотреть свои задачи»
     * означало бы, что кто-то отправит задачу и не узнает её судьбы. Но и показывать раздел
     * всем нельзя — представитель заказчика фоновых задач не ставит, и пустой пункт меню у
     * него был бы мусором. Поэтому берётся право того, кто эти задачи СОЗДАЁТ.
     *
     * Когда в реестр подключатся выдача документов и госвыгрузки (срез 2 плана фазы 12),
     * условие расширится их правами.
     */
    pattern: '/admin/background-tasks',
    meta: { public: false, requiredPermissions: ['enrollments.write'] }
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
  /*
   * ТЗ 8.4: предпросмотр программы глазами слушателя.
   *
   * Право АВТОРСКОЕ (`materials.write`), а не читательское. Сначала здесь стояло
   * `courses.read` + `materials.read` — и сторож изоляции показал, почему так нельзя: оба
   * этих права есть у СЛУШАТЕЛЯ (живая `iam.role_permissions`). По прямой ссылке он открыл
   * бы предпросмотр ЛЮБОГО курса центра и увидел его материалы, не будучи зачисленным, —
   * обход того самого правила, ради которого материалы и выдаются по зачислению
   * (журнал 538). `materials.write` выдан методисту и администрации — тем, кто программу
   * и составляет.
   *
   * Стоит ПЕРЕД '/courses': совпадение ищется первым подходящим, и общий префикс иначе
   * поглотил бы этот адрес вместе с его правами.
   */
  {
    pattern: '/courses/[id]/preview',
    meta: { public: false, requiredPermissions: ['courses.read', 'materials.write'] }
  },
  { pattern: '/courses', meta: { public: false, requiredPermissions: ['courses.read'] } },
  /* ТЗ перехода с CDOPROF, МГ-G2.3: задачи сотрудников. */
  { pattern: '/tasks', meta: { public: false, requiredPermissions: ['tasks.read'] } },
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
    /*
     * ТЗ 6.1 (С1): пятый раздел меню слушателя. Общий экран настроек живёт под правом
     * `iam.manage_roles`, которого у слушателя нет, — свой профиль ему был негде открыть.
     */
    pattern: '/learner/profile',
    meta: { public: false, requiredPermissions: ['enrollments.read'] }
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
  /*
   * ТЗ 8.3: панель руководителя. Право — И группы, И компании: по живой
   * `iam.role_permissions` такая пара есть ровно у тех, кто ведёт заказчиков и группы.
   */
  {
    pattern: '/manager',
    meta: { public: false, requiredPermissions: ['groups.read', 'counterparties.read'] }
  },
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
  /*
   * ТЗ 17.3: политика обработки персональных данных ПУБЛИЧНА. Её читают до входа и вообще без
   * учётной записи: слушатель переходит по ссылке из письма-приглашения, работодатель
   * проверяет, кому отдаёт данные сотрудников. Требовать вход, чтобы прочитать, на что
   * соглашаешься, — то же самое, что не показывать текст вовсе (журнал 579).
   */
  /*
   * ТЗ 15.5: «Сообщить о проблеме». Без требования прав намеренно: сообщить о поломке должен
   * мочь любой вошедший, включая слушателя, — именно у него чаще всего что-то не открывается,
   * и именно он не дозвонится в центр вечером (журнал 583).
   */
  { pattern: '/support/problem', meta: { public: false } },
  /*
   * ТЗ 18.3: состояние системы. Публично, потому что смотреть сюда приходят именно тогда, когда
   * войти не получается: страница состояния, требующая входа, бесполезна ровно в тот момент,
   * ради которого заведена (журнал 586).
   */
  { pattern: '/status', meta: { public: true } },
  { pattern: '/legal/privacy', meta: { public: true } },
  { pattern: '/exam-auth', meta: { public: true } },
  { pattern: '/tenant-not-found', meta: { public: true } }
];

/** Порядок — логические блоки по ТЗ СДО. */
export const navigationModel: NavigationItem[] = [
  // ФТ-H1 (Фаза 5 Task 8): '/learner' стоял в блоке «Моё обучение», но пункта меню
  // не имел — блок ссылался в пустоту, и в кабинет нельзя было вернуться из меню.
  { href: '/learner', label: 'Мой кабинет', requiredPermissions: ['enrollments.read'] },
  /*
   * ТЗ 6.1 (С1): «Мои курсы» ушли из меню — главная кабинета показывает те же курсы с
   * прогрессом и те же документы, только под другими заголовками. Дубль слит редиректом
   * (решение Р2), карточка курса `/learner/courses/[id]` не тронута (журнал 493).
   */
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
    /*
     * ТЗ 6.1 (С1): пятый пункт меню слушателя. «Подтверждение личности» и «Мои оплаты»
     * открываются отсюда — по прямому указанию ТЗ они уходят «в профиль» (журнал 490).
     */
    href: '/learner/profile',
    label: 'Профиль',
    requiredPermissions: ['enrollments.read']
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
  { href: '/assessment', label: 'Оценивание', requiredPermissions: ['assessment.tests.read'] },
  { href: '/notifications', label: 'Уведомления', requiredPermissions: ['tenant.read'] },
  { href: '/users', label: 'Люди и доступ', requiredPermissions: ['iam.manage_roles'] },
  { href: '/groups', label: 'Группы', requiredPermissions: ['groups.read'] },
  {
    href: '/learning/calendar',
    label: 'Календарь окончаний',
    requiredPermissions: ['enrollments.read']
  },
  { href: '/reports', label: 'Отчёты', requiredPermissions: ['learners.read'] },
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
    label: 'Потребление',
    requiredPermissions: ['tenant.usage.read'],
    navSlot: 'more'
  },
  {
    // ФТ-D2.3: мастер онбординга нового центра.
    href: '/onboarding',
    label: 'Запуск центра',
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
    href: '/academy/requisites',
    label: 'Реквизиты центра',
    requiredPermissions: ['tenant.settings.write'],
    navSlot: 'more'
  },
  {
    href: '/academy/commission',
    label: 'Комиссия центра',
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
    href: '/tasks',
    label: 'Задачи',
    requiredPermissions: ['tasks.read'],
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
    label: 'Направления обучения',
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
    label: 'Шаблоны документов',
    requiredPermissions: ['documents.read'],
    navSlot: 'more'
  },
  /*
   * ТЗ 3.2 называет НЭП и подписание «работой юриста и делопроизводителя», а ТЗ 8.4 — прямо
   * не работой методиста. Права на чтение у него есть, поэтому убирается ИМЕННО из меню.
   */
  {
    href: '/esign/applications',
    label: 'Заявки на НЭП',
    requiredPermissions: ['esign.applications.read'],
    navSlot: 'more',
    audience: ['platform_admin', 'tenant_admin', 'manager']
  },
  {
    href: '/esign/processes',
    label: 'Подписание документов',
    requiredPermissions: ['esign.processes.read'],
    navSlot: 'more',
    audience: ['platform_admin', 'tenant_admin', 'manager']
  },
  {
    href: '/esign/legal-log',
    label: 'Журнал НЭП',
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
  /*
   * Решение владельца Р3 (ТЗ 5.12.6): чат убран из меню ВСЕХ ролей. Пустой список диалогов
   * без объяснения и без кнопки «Написать» — тупик, а незаконченная функция хуже
   * отсутствующей (журнал 482). Пункт остаётся в модели и включается флагом функции:
   * удалять код чата решением Р3 не велено.
   */
  {
    href: '/chat',
    label: 'Чат',
    requiredPermissions: ['tenant.read'],
    navSlot: 'more',
    featureFlag: 'chat'
  },
  /* ТЗ 8.4: отчётность в надзор ведёт администрация центра, а не автор программ. */
  {
    href: '/gov-export',
    label: 'Госвыгрузки',
    requiredPermissions: ['regulatory.export.read'],
    navSlot: 'more',
    audience: ['platform_admin', 'tenant_admin', 'manager']
  },
  {
    href: '/integrations',
    label: 'Интеграции',
    requiredPermissions: ['integrations.read'],
    navSlot: 'more'
  },
  {
    href: '/exports',
    label: 'Задачи выгрузки',
    requiredPermissions: ['integrations.read'],
    navSlot: 'more'
  },
  {
    href: '/sync-logs',
    label: 'Журнал обмена',
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
  /*
   * ТЗ 8.3: панель руководителя — его стартовая страница и первый пункт меню.
   *
   * Подпись не «Панель», как в перечне ТЗ, а «Панель руководителя»: права на неё есть и у
   * администратора центра, а у него в меню уже стоит «Оперативная панель». Два пункта с
   * одним смыслом в одном меню — ровно то, что запрещает правило «одна вещь — одно имя».
   */
  {
    href: '/manager',
    label: 'Панель руководителя',
    requiredPermissions: ['groups.read', 'counterparties.read'],
    navSlot: 'main'
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
    label: 'Журнал действий',
    requiredPermissions: ['auth.manage_sessions'],
    navSlot: 'more'
  },
  {
    href: '/admin/analytics',
    label: 'Аналитика обучения',
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
    label: 'Аттестационные комиссии',
    requiredPermissions: ['learning.commissions.read'],
    navSlot: 'more'
  },
  {
    href: '/admin/bulk-enrollments',
    label: 'Зачисление списком',
    requiredPermissions: ['learners.write', 'enrollments.write'],
    navSlot: 'more'
  },
  {
    href: '/admin/clients',
    label: 'Компании',
    requiredPermissions: ['counterparties.read'],
    navSlot: 'more'
  },
  /* ТЗ 8.4: кого и когда переаттестовать — работа администрации, а не автора программ. */
  {
    href: '/admin/recertification',
    label: 'Переаттестация',
    requiredPermissions: ['recertification.read'],
    navSlot: 'more',
    audience: ['platform_admin', 'tenant_admin']
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
    label: 'Проверка личности',
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
    label: 'Книга выдачи документов',
    requiredPermissions: ['documents.read'],
    navSlot: 'more'
  },
  {
    href: '/admin/background-tasks',
    label: 'Фоновые задачи',
    /* Право того, кто ставит задачи: см. пояснение у записи карты доступа. */
    requiredPermissions: ['enrollments.write'],
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
    label: 'Лицензии и аккредитации',
    requiredPermissions: ['auth.manage_sessions'],
    navSlot: 'more'
  }
];

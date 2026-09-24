/**
 * Читаемые подписи журнала действий (`TXT-006`).
 *
 * В журнале колонки назывались «Actor», «Action», «Entity», «Entity ID», а значениями стояли
 * коды: `learning.learner_created`, `assessment.attempt_started`. Человеку это ни о чём.
 *
 * Код построен по образцу `раздел.объект_действие`, поэтому разбираем его по частям:
 * объект — из OBJECTS, глагол — из VERBS, согласованный с родом объекта. Коды, которые
 * образцу не следуют (`auth.login`, `documents.task.retried`, `iam.user_roles_updated`),
 * названы целой фразой в PHRASES. Незнакомый код показывается как есть: потерять сведения
 * хуже, чем показать код, — но незнакомых кодов быть не должно: сторож
 * `e2e/audit-codes-described` собирает все коды, которые пишет бэкенд, и требует фразу
 * для каждого (журнал 346 — до него 125 из 170 действий и все типы объектов шли кодом).
 *
 * ⚠️ Глагол согласуется с родом объекта. Без этого получалось «Попытка теста начат» —
 * интерфейс, говорящий на ломаном русском, ничем не лучше кода.
 */

type Gender = 'm' | 'f' | 'n';
type Noun = { label: string; gender: Gender };

const DOMAIN_LABELS: Record<string, string> = {
  learning: 'Обучение',
  /*
   * ТЗ 17.2: раскрытие персональных данных пишется отдельным разделом, а не внутри «Обучения».
   * На проверке спрашивают именно про доступ к персональным данным — отдельный раздел в
   * фильтре журнала позволяет ответить одним запросом, а не вычитывать его из общего потока.
   */
  learners: 'Персональные данные',
  /* ТЗ 15.5: обращения в поддержку — свой раздел, чтобы их можно было отобрать отдельно. */
  support: 'Поддержка',
  assessment: 'Оценивание',
  documents: 'Документы',
  iam: 'Доступ',
  auth: 'Вход',
  org: 'Учебный центр',
  tasks: 'Задачи',
  tenant: 'Настройки центра',
  platform: 'Платформа',
  payments: 'Оплаты',
  notifications: 'Уведомления',
  communication: 'Рассылки',
  integrations: 'Интеграции',
  integration: 'Интеграции',
  esign: 'Подписание',
  regulatory: 'Отчётность',
  reports: 'Отчёты',
  operations: 'Эксплуатация',
  /*
   * §5.433: «Компании» — одно слово на одну сущность во всём продукте (решение владельца
   * IA-017 от 14.08.2026). Раздел журнала называется так же, как раздел в меню, иначе
   * человек ищет в журнале «Заказчиков», а в меню находит «Компании».
   */
  crm: 'Компании',
  identity: 'Проверка личности',
  learner: 'Персональные данные',
  storage: 'Файлы'
};

const OBJECTS: Record<string, Noun> = {
  learner: { label: 'слушатель', gender: 'm' },
  group: { label: 'учебная группа', gender: 'f' },
  group_course: { label: 'курс группы', gender: 'm' },
  course: { label: 'курс', gender: 'm' },
  course_version: { label: 'версия курса', gender: 'f' },
  course_document_set: { label: 'комплект документов курса', gender: 'm' },
  library_course: { label: 'курс из библиотеки', gender: 'm' },
  direction: { label: 'направление обучения', gender: 'n' },
  enrollment: { label: 'зачисление', gender: 'n' },
  progress: { label: 'прогресс обучения', gender: 'm' },
  module: { label: 'модуль', gender: 'm' },
  material: { label: 'материал', gender: 'm' },
  scorm_package: { label: 'учебный пакет', gender: 'm' },
  test: { label: 'тест', gender: 'm' },
  test_question: { label: 'вопрос теста', gender: 'm' },
  question: { label: 'вопрос', gender: 'm' },
  question_bank: { label: 'банк вопросов', gender: 'm' },
  answer: { label: 'ответ', gender: 'm' },
  assignment: { label: 'задание', gender: 'n' },
  assignment_review: { label: 'проверка работы', gender: 'f' },
  assignment_submission: { label: 'сданная работа', gender: 'f' },
  attempt: { label: 'попытка теста', gender: 'f' },
  attempt_review: { label: 'проверка попытки', gender: 'f' },
  pre_exam_token: { label: 'код допуска к экзамену', gender: 'm' },
  exam_result: { label: 'итог экзамена', gender: 'm' },
  identity_verification: { label: 'проверка личности', gender: 'f' },
  policy: { label: 'правило проверки личности', gender: 'n' },
  recertification: { label: 'переаттестация', gender: 'f' },
  proctoring: { label: 'прокторинг', gender: 'm' },
  template: { label: 'шаблон документа', gender: 'm' },
  template_version: { label: 'версия шаблона', gender: 'f' },
  template_variable: { label: 'переменная шаблона', gender: 'f' },
  template_binding: { label: 'привязка шаблона', gender: 'f' },
  numbering_rule: { label: 'правило нумерации', gender: 'n' },
  number: { label: 'номер документа', gender: 'm' },
  document: { label: 'документ', gender: 'm' },
  task: { label: 'задача выпуска документа', gender: 'f' },
  commission: { label: 'комиссия', gender: 'f' },
  commission_member: { label: 'член комиссии', gender: 'm' },
  counterparty: { label: 'компания-заказчик', gender: 'f' },
  order: { label: 'заказ', gender: 'm' },
  user: { label: 'пользователь', gender: 'm' },
  role: { label: 'роль', gender: 'f' },
  session: { label: 'сеанс входа', gender: 'm' },
  license: { label: 'лицензия', gender: 'f' },
  tenant: { label: 'учебный центр', gender: 'm' },
  plan: { label: 'тариф', gender: 'm' },
  rental_invoice: { label: 'счёт за аренду', gender: 'm' },
  application: { label: 'заявка на электронную подпись', gender: 'f' },
  email: { label: 'письмо', gender: 'n' },
  file: { label: 'файл', gender: 'm' },
  quarantine: { label: 'задача из карантина', gender: 'f' }
};

/** Один и тот же объект в разных разделах — разные вещи: «шаблон» отчётов — не шаблон документа. */
const DOMAIN_OBJECTS: Record<string, Record<string, Noun>> = {
  /* ТЗ перехода с CDOPROF, МГ-G2: задачи сотрудников — не задачи выпуска документов. */
  tasks: {
    task: { label: 'задача', gender: 'f' },
    comment: { label: 'комментарий к задаче', gender: 'm' }
  },
  reports: { template: { label: 'шаблон отчёта', gender: 'm' } }
};

/** Раздел, чьи коды бывают без объекта (`documents.signed`): объект подразумевается. */
const DOMAIN_DEFAULT_OBJECT: Record<string, string> = { documents: 'document' };

/** Три формы каждого глагола: явно, а не правилом — русский язык правилу не поддаётся. */
const VERBS: Record<string, Record<Gender, string>> = {
  created: { m: 'заведён', f: 'заведена', n: 'заведено' },
  registered: { m: 'зарегистрирован', f: 'зарегистрирована', n: 'зарегистрировано' },
  updated: { m: 'изменён', f: 'изменена', n: 'изменено' },
  deleted: { m: 'удалён', f: 'удалена', n: 'удалено' },
  archived: { m: 'отправлен в архив', f: 'отправлена в архив', n: 'отправлено в архив' },
  published: { m: 'опубликован', f: 'опубликована', n: 'опубликовано' },
  copied: { m: 'скопирован', f: 'скопирована', n: 'скопировано' },
  started: { m: 'начат', f: 'начата', n: 'начато' },
  finished: { m: 'завершён', f: 'завершена', n: 'завершено' },
  submitted: { m: 'отправлен', f: 'отправлена', n: 'отправлено' },
  completed: { m: 'завершён', f: 'завершена', n: 'завершено' },
  returned: {
    m: 'возвращён на доработку',
    f: 'возвращена на доработку',
    n: 'возвращено на доработку'
  },
  cancelled: { m: 'отменён', f: 'отменена', n: 'отменено' },
  revoked: { m: 'аннулирован', f: 'аннулирована', n: 'аннулировано' },
  reissued: { m: 'перевыпущен', f: 'перевыпущена', n: 'перевыпущено' },
  issued: { m: 'выдан', f: 'выдана', n: 'выдано' },
  signed: { m: 'подписан', f: 'подписана', n: 'подписано' },
  downloaded: { m: 'скачан', f: 'скачана', n: 'скачано' },
  released: { m: 'освобождён', f: 'освобождена', n: 'освобождено' },
  saved: { m: 'сохранён', f: 'сохранена', n: 'сохранено' },
  expired: { m: 'просрочен', f: 'просрочена', n: 'просрочено' },
  verified: { m: 'подтверждён', f: 'подтверждена', n: 'подтверждено' },
  requested: { m: 'запрошен', f: 'запрошена', n: 'запрошено' },
  // Было «подведён итог» — с объектом «итог экзамена» давало «Итог экзамена подведён итог».
  finalized: { m: 'утверждён', f: 'утверждена', n: 'утверждено' },
  subscribed: { m: 'подписан', f: 'подписана', n: 'подписано' },
  unsubscribed: { m: 'отписан', f: 'отписана', n: 'отписано' },
  added: { m: 'добавлен', f: 'добавлена', n: 'добавлено' },
  removed: { m: 'убран', f: 'убрана', n: 'убрано' },
  reordered: { m: 'переставлен', f: 'переставлена', n: 'переставлено' },
  activated: { m: 'включён', f: 'включена', n: 'включено' },
  deactivated: { m: 'выключен', f: 'выключена', n: 'выключено' },
  set_current: { m: 'сделан текущим', f: 'сделана текущей', n: 'сделано текущим' },
  approved: { m: 'одобрен', f: 'одобрена', n: 'одобрено' },
  rejected: { m: 'отклонён', f: 'отклонена', n: 'отклонено' },
  retried: { m: 'перезапущен', f: 'перезапущена', n: 'перезапущено' },
  processed: { m: 'обработан', f: 'обработана', n: 'обработано' },
  scanned: {
    m: 'проверен антивирусом',
    f: 'проверена антивирусом',
    n: 'проверено антивирусом'
  },
  resent: { m: 'отправлен повторно', f: 'отправлена повторно', n: 'отправлено повторно' },
  assigned: { m: 'назначен', f: 'назначена', n: 'назначено' },
  paid: { m: 'оплачен', f: 'оплачена', n: 'оплачено' },
  discarded: { m: 'отброшен', f: 'отброшена', n: 'отброшено' },
  republished: { m: 'отправлен заново', f: 'отправлена заново', n: 'отправлено заново' }
};

/**
 * Коды, не следующие образцу «объект_глагол»: без объекта, с двумя объектами, с
 * обстоятельством («по приказу», «за неуплату»). Фраза — целиком, ТЗ редизайна §9.
 */
const PHRASES: Record<string, string> = {
  /* ТЗ перехода с CDOPROF, МГ-G2: переходы задачи и её комментарии. */
  'tasks.task_status_changed': 'Статус задачи изменён',
  'tasks.task_rescheduled': 'Срок задачи перенесён',
  'tasks.comment_added': 'К задаче добавлен комментарий',
  'tasks.comment_deleted': 'Комментарий к задаче удалён',
  /*
   * ТЗ 8.4: перестановка пунктов программы. Целой фразой, а не по образцу
   * «<объект>_<глагол>»: объект тут во множественном числе («модули переставлены»), а
   * согласование в словаре построено на роде единственного — вышло бы «модули переставлен».
   */
  'learning.modules_reordered': 'Порядок модулей программы изменён',
  'learning.materials_reordered': 'Порядок материалов модуля изменён',
  'auth.login': 'Вход в систему',
  /*
   * ТЗ 17.1: неудачные попытки входа тоже попадают в журнал — раньше писались только успешные,
   * и по журналу нельзя было увидеть ни подбора пароля, ни того, что человек сам не может
   * войти (журнал 573). Фразой, а не по образцу «<объект>_<глагол>»: здесь нет объекта, есть
   * событие целиком.
   */
  'auth.login_failed': 'Неудачная попытка входа',
  /*
   * ТЗ 17.2: раскрытие персональных данных целиком. Фразой, а не по образцу
   * «<объект>_<глагол>»: раскрывают не «слушателя», а его данные, и по образцу вышло бы
   * «слушатель раскрыт» — формально по-русски, по смыслу мимо (журнал 577).
   */
  'learners.pii_revealed': 'Персональные данные показаны полностью',
  /* ТЗ 15.5: обращение из кнопки «Сообщить о проблеме». */
  'support.problem_reported': 'Сообщение о проблеме',
  'auth.esia_login': 'Вход через Госуслуги',
  'auth.magic_link_login': 'Вход по ссылке из письма',
  'auth.logout': 'Выход из системы',
  'auth.logout_all': 'Выход на всех устройствах',
  'auth.refresh': 'Сеанс продлён',
  'auth.session_revoke': 'Сеанс завершён принудительно',
  'auth.sessions_revoked_on_block': 'Все сеансы завершены при блокировке',
  'auth.totp_setup_started': 'Настройка двухфакторного входа начата',
  'auth.totp_enabled': 'Двухфакторный вход включён',
  'auth.totp_disabled': 'Двухфакторный вход выключен',
  'iam.user_roles_updated': 'Роли пользователя изменены',
  'iam.password_rehashed': 'Пароль перешифрован',
  'learner.personal_data_accessed': 'Персональные данные слушателя просмотрены',
  'learner.personal_data_exported': 'Персональные данные слушателя выгружены',
  'learner.personal_data_erased': 'Персональные данные слушателя стёрты',
  'assessment.attempt_expired_by_timer': 'Попытка теста завершена по таймеру',
  'assessment.test_questions_attached': 'Вопросы прикреплены к тесту',
  'assessment.test_rules_updated': 'Правила теста изменены',
  'learning.enrollments_bulk': 'Массовое зачисление выполнено',
  'learning.enrollment_status_changed': 'Статус зачисления изменён',
  'learning.group_close_chain': 'Закрытие группы выполнено цепочкой шагов',
  'learning.group_closed_with_checks': 'Учебная группа закрыта после проверок',
  'learning.group_counterparty_linked': 'Компания привязана к группе',
  'learning.group_counterparty_unlinked': 'Компания отвязана от группы',
  'learning.group_status_changed': 'Статус группы изменён вручную',
  'learning.group_status_auto': 'Статус группы изменён по расписанию',
  'learning.group_archived': 'Группа отправлена в архив',
  'learning.group_course_created': 'Курс назначен группе',
  'learning.group_wizard_completed': 'Группа создана мастером',
  'learning.learner_linked_to_user': 'Слушатель связан с пользователем',
  'learning.commission_member_removed': 'Член комиссии исключён',
  'learning.course_version_program_meta_updated': 'Сведения о программе в версии курса изменены',
  'learning.identity_verification_approved_by_esia':
    'Проверка личности подтверждена через Госуслуги',
  'learning.identity_verification_images_purged': 'Снимки проверки личности удалены',
  'learning.proctoring_override_set': 'Решение по прокторингу изменено вручную',
  'learning.proctoring_video_purged': 'Видео прокторинга удалено',
  'identity.policy_removed': 'Правило проверки личности удалено',
  'documents.group_closed': 'Учебная группа закрыта',
  'documents.group_order_issued': 'Приказ по группе издан',
  'documents.certificate_issued_via_order': 'Удостоверение выдано по приказу',
  'documents.certificate_reused_in_order': 'В приказ включено ранее выданное удостоверение',
  'documents.enrollment_document_set_issued': 'Комплект документов по зачислению выдан',
  'documents.enrollment_document_set_failed': 'Комплект документов по зачислению не выдан: ошибка',
  'documents.enrollment_certificate_failed': 'Удостоверение по зачислению не выдано: ошибка',
  'documents.enrollment_certificate_skipped': 'Выдача удостоверения по зачислению пропущена',
  'documents.qr_verification_requested': 'Проверка подлинности документа запрошена',
  'documents.qr_verification_failed': 'Проверка подлинности: документ по коду не найден',
  'documents.task.failed': 'Задача выпуска документа не выполнена: ошибка',
  'integration.credentials.created': 'Доступ к интеграции заведён',
  'integration.credentials.secret_rotated': 'Ключ доступа к интеграции заменён',
  'communication.staff_recipients_updated': 'Получатели уведомлений среди сотрудников изменены',
  'notifications.push_subscribed': 'Подписка на уведомления в браузере оформлена',
  'notifications.push_unsubscribed': 'Подписка на уведомления в браузере отменена',
  'payments.order_marked_paid': 'Заказ отмечен оплаченным',
  'platform.impersonation_started': 'Вход от имени пользователя начат',
  'platform.rental_invoice_issued': 'Счёт за аренду выставлен',
  'platform.tenant_status_changed': 'Статус учебного центра изменён',
  'platform.tenant_suspended_for_nonpayment': 'Учебный центр приостановлен за неуплату',
  'tenant.requisites_updated': 'Реквизиты учебного центра изменены',
  'tenant.settings_updated': 'Настройки учебного центра изменены',
  'regulatory.frdo_exported': 'Выгрузка в ФРДО выполнена',
  'regulatory.nmo_exported': 'Выгрузка в НМО выполнена',
  'regulatory.eisot_testing_exported': 'Выгрузка в ЕИСОТ (тестирование) выполнена',
  'regulatory.rostechnadzor_exported': 'Выгрузка в Ростехнадзор выполнена',
  'regulatory.ot_registry_exported': 'Выгрузка в реестр Минтруда выполнена',
  'regulatory.ot_registry_response_imported': 'Ответ реестра Минтруда загружен'
};

/**
 * Типы объектов, которые словарь OBJECTS не покрывает: с префиксом раздела, где то же слово
 * значит другое (`reports.template`), и служебные типы обёрток без префикса (`document_task`).
 */
const ENTITY_LABELS: Record<string, string> = {
  /* ТЗ 15.5: обращение из кнопки «Сообщить о проблеме». */
  'support.problem_report': 'Обращение в поддержку',
  'reports.template': 'Шаблон отчёта',
  'documents.generated': 'Выпущенный документ',
  'documents.generated_document': 'Выпущенный документ',
  'assessment.test_attempt': 'Попытка теста',
  'assessment.attempt_answer': 'Ответ в попытке',
  'learning.material_progress': 'Прогресс по материалу',
  'learning.proctoring_recording': 'Запись прокторинга',
  'communication.notification_settings': 'Настройки уведомлений',
  'core.platform_library_course': 'Курс из библиотеки платформы',
  'core.tenant_subscription': 'Подписка учебного центра',
  'org.training_license': 'Лицензия на обучение',
  document_task: 'Задача выпуска документа',
  number_reservation: 'Резерв номера документа',
  integration_credential: 'Доступ к интеграции',
  push_subscription: 'Подписка на уведомления в браузере',
  email_delivery: 'Доставка письма',
  job_quarantine: 'Задача в карантине',
  recertification_draft: 'Черновик переаттестации',
  frdo_registry_batch: 'Пакет выгрузки в ФРДО',
  nmo_batch: 'Пакет выгрузки в НМО',
  eisot_testing_batch: 'Пакет выгрузки в ЕИСОТ',
  ot_registry_batch: 'Пакет выгрузки в реестр Минтруда',
  rostechnadzor_batch: 'Пакет выгрузки в Ростехнадзор'
};

const capitalize = (value: string): string => `${value.charAt(0).toUpperCase()}${value.slice(1)}`;

const splitCode = (code: string): { domain: string; rest: string } => {
  const dot = code.indexOf('.');
  if (dot === -1) return { domain: '', rest: '' };
  // Трёхчастные коды (`documents.task.retried`) читаются как `объект_глагол`.
  return { domain: code.slice(0, dot), rest: code.slice(dot + 1).replace(/\./g, '_') };
};

const objectOf = (domain: string, key: string): Noun | undefined =>
  DOMAIN_OBJECTS[domain]?.[key] ?? OBJECTS[key];

export const domainLabel = (action: string): string => {
  const [domain] = action.split('.');
  return DOMAIN_LABELS[domain ?? ''] ?? domain ?? action;
};

/**
 * «Что произошло» человеческой фразой.
 *
 * `learning.learner_created` → «Слушатель заведён».
 * `assessment.attempt_started` → «Попытка теста начата».
 * `auth.login` → «Вход в систему» (из PHRASES).
 * Неизвестный код возвращается как есть.
 */
export const describeAction = (action: string): string => {
  const phrase = PHRASES[action];
  if (phrase) return phrase;
  const { domain, rest } = splitCode(action);
  if (!rest) return action;

  const parts = rest.split('_');
  // Идём от самого длинного имени объекта: `question_bank_created` — это «банк вопросов»,
  // а не «вопрос», и разбор по первому слову дал бы неверную фразу.
  for (let take = parts.length - 1; take >= 1; take -= 1) {
    const object = objectOf(domain, parts.slice(0, take).join('_'));
    const verb = VERBS[parts.slice(take).join('_')];
    if (object && verb) return `${capitalize(object.label)} ${verb[object.gender]}`;
  }
  const implied = objectOf(domain, DOMAIN_DEFAULT_OBJECT[domain] ?? '');
  const verb = VERBS[rest];
  if (implied && verb) return `${capitalize(implied.label)} ${verb[implied.gender]}`;
  return action;
};

/**
 * Тип объекта в журнале приходит кодом — с разделом (`learning.group`, `iam.user`)
 * или без (`group`, `document_task`).
 */
export const entityLabel = (entityType: string): string => {
  const exact = ENTITY_LABELS[entityType];
  if (exact) return exact;
  const dot = entityType.indexOf('.');
  const domain = dot === -1 ? '' : entityType.slice(0, dot);
  const object = objectOf(domain, dot === -1 ? entityType : entityType.slice(dot + 1));
  return object ? capitalize(object.label) : entityType;
};

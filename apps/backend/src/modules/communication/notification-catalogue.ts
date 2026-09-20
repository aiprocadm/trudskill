import type { RecipientKind } from './email-deliveries.repository.js';
import type { EmailTemplateKey } from './email-templates.js';

/**
 * Матрица уведомлений: событие → кому → по каким каналам → каким шаблоном
 * (ТЗ «Стабилизация, UX и развитие», 11.1).
 *
 * **Зачем данными, а не таблицей в документе.** Таблица в документе врёт через месяц после
 * написания: код уезжает, а строку никто не правит. Репозиторий на этом уже обжигался —
 * запись журнала 211: «сводке, которой нельзя верить, перестают верить целиком». Здесь
 * матрица — ОДИН источник: сторож сверяет её и с кодом (каждый шаблон учтён, у каждого
 * действующего события есть отправитель), и с документом `docs/notifications-matrix.md`.
 *
 * **Чего эта запись НЕ делает.** Она ничего не отправляет и не включает. Это опись: что
 * система обещает человеку и чем это обещание исполняется.
 */

/** Канал доставки. `in_app` — колокольчик внутри системы, `push` — уведомление браузера. */
export type NotificationChannel = 'email' | 'in_app' | 'push' | 'sms' | 'telegram';

export interface NotificationEvent {
  /** Короткий ключ события — им же назван шаблон, когда шаблон есть. */
  key: string;
  /** Человеческое название: так событие называется в документе и в разговоре с владельцем. */
  title: string;
  /** Кому уходит. Виды получателей — те же, что пишет журнал отправок. */
  audience: RecipientKind[];
  /** Каналы, которые РАБОТАЮТ сегодня, а не задуманы. */
  channels: NotificationChannel[];
  /** Шаблон письма; отсутствует у событий, которые ещё не отправляются. */
  templateKey?: EmailTemplateKey;
  /** Файл, который это событие отправляет, — чтобы обещание можно было проверить. */
  sender?: string;
  /**
   * `live` — работает сегодня; `planned` — названо в ТЗ 11.1, но отправителя нет.
   * Второе не выдумка «на будущее», а честная запись долга: без неё он потеряется.
   */
  status: 'live' | 'planned';
  /** Почему событие ещё не сделано — только у `planned`. */
  gap?: string;
}

export const NOTIFICATION_CATALOGUE: NotificationEvent[] = [
  {
    key: 'enrollment_invite',
    title: 'Слушателя записали на курс',
    audience: ['learner'],
    channels: ['email', 'in_app', 'push'],
    templateKey: 'enrollment_invite',
    sender: 'modules/communication/enrollment-email.listener.ts',
    status: 'live'
  },
  {
    key: 'course_completed',
    title: 'Обучение завершено, документы готовы',
    audience: ['learner'],
    channels: ['email', 'in_app', 'push'],
    templateKey: 'course_completed',
    sender: 'modules/communication/enrollment-email.listener.ts',
    status: 'live'
  },
  {
    key: 'course_deadline',
    title: 'Приближается срок завершения обучения',
    audience: ['learner'],
    channels: ['email', 'in_app', 'push'],
    templateKey: 'course_deadline',
    sender: 'modules/mvp/reminders/course-deadline-scanner.service.ts',
    status: 'live'
  },
  {
    /*
     * ТЗ 11.3 + 10.4 (Р9). Получатели — слушатель И сотрудники центра: по пункту 79 Порядка
     * № 2464 повторную проверку организует центр, а не слушатель, и узнать о ней из письма
     * одному слушателю недостаточно.
     */
    key: 'knowledge_retest',
    title: 'Требуется повторная проверка знаний',
    audience: ['learner', 'employer', 'curator', 'admin'],
    channels: ['email', 'in_app', 'push'],
    templateKey: 'knowledge_retest',
    sender: 'modules/mvp/reminders/knowledge-retest-scanner.service.ts',
    status: 'live'
  },
  {
    key: 'recertification_due',
    title: 'Истекает срок действия удостоверения',
    audience: ['learner'],
    channels: ['email', 'in_app', 'push'],
    templateKey: 'recertification_due',
    sender: 'modules/mvp/recertification/recertification-scanner.service.ts',
    status: 'live'
  },
  {
    key: 'document_revoked',
    title: 'Документ аннулирован',
    audience: ['learner'],
    channels: ['email', 'in_app', 'push'],
    templateKey: 'document_revoked',
    sender: 'modules/mvp/reminders/document-revoked-email.listener.ts',
    status: 'live'
  },
  {
    key: 'pre_exam_auth',
    title: 'Перед экзаменом нужно подтвердить личность',
    audience: ['learner'],
    channels: ['email', 'in_app', 'push'],
    templateKey: 'pre_exam_auth',
    sender: 'modules/communication/exam-identity-email.listener.ts',
    status: 'live'
  },
  {
    key: 'identity_verification_rejected',
    title: 'Подтверждение личности отклонено',
    audience: ['learner'],
    channels: ['email', 'in_app', 'push'],
    templateKey: 'identity_verification_rejected',
    sender: 'modules/communication/exam-identity-email.listener.ts',
    status: 'live'
  },
  {
    key: 'license_expiring',
    title: 'Заканчивается лицензия центра',
    audience: ['admin'],
    channels: ['email', 'in_app', 'push'],
    templateKey: 'license_expiring',
    sender: 'modules/mvp/reminders/license-expiry-scanner.service.ts',
    status: 'live'
  },
  {
    key: 'magic_link',
    title: 'Вход в систему по ссылке из письма',
    audience: ['learner', 'admin', 'curator'],
    channels: ['email'],
    /* Ссылка входа не идёт через общий диспетчер: её отправитель живёт в IAM и не зависит
       от шаблонов центра — иначе центр мог бы сломать себе вход, правя текст письма. */
    sender: 'modules/iam/services/email-magic-link-email-sender.ts',
    status: 'live'
  },

  /* ---------------------------------------------------------------------------------------
   * Ниже — события, названные в таблице ТЗ 11.1, у которых сегодня НЕТ отправителя.
   * Это долг, а не замысел: строка существует, чтобы он не потерялся.
   * ------------------------------------------------------------------------------------- */
  {
    key: 'exam_failed_retry_available',
    title: 'Экзамен не сдан, доступна пересдача',
    audience: ['learner'],
    channels: [],
    status: 'planned',
    gap: 'Попытка закрывается и оценивается, но человек узнаёт об этом, только зайдя в кабинет. Нужен шаблон и отправка из перехода статуса попытки.'
  },
  {
    key: 'order_received',
    title: 'Поступила заявка или заказ',
    audience: ['admin'],
    channels: [],
    status: 'planned',
    gap: 'Заявки приходят из портала заказчика; администратор центра узнаёт о них только из списка на экране.'
  },
  {
    key: 'gov_export_failed',
    title: 'Госвыгрузка завершилась с ошибкой',
    audience: ['admin'],
    /* ТЗ 12.3: долг закрыт — отказ выгрузки кладётся в колокольчик администратора центра. */
    channels: ['in_app'],
    sender: 'modules/integrations/services/integration-orchestrator.service.ts',
    status: 'live'
  },
  {
    key: 'deadline_for_employer',
    title: 'Сроки обучения — руководителю от организации',
    audience: ['employer'],
    channels: [],
    status: 'planned',
    gap: 'ТЗ 11.1 требует слать сроки и переаттестацию не только слушателю, но и руководителю; сегодня оба письма уходят только слушателю.'
  }
];

/** События, которые работают сегодня. */
export const liveEvents = (): NotificationEvent[] =>
  NOTIFICATION_CATALOGUE.filter((event) => event.status === 'live');

/** Названный в ТЗ, но ещё не исполняемый долг — с причиной у каждой строки. */
export const plannedEvents = (): NotificationEvent[] =>
  NOTIFICATION_CATALOGUE.filter((event) => event.status === 'planned');

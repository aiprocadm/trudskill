export type EmailTemplateKey =
  | 'enrollment_invite'
  | 'course_completed'
  | 'recertification_due'
  | 'course_deadline'
  | 'knowledge_retest'
  | 'document_revoked'
  | 'license_expiring'
  | 'pre_exam_auth'
  | 'identity_verification_rejected';

export interface EmailTemplateBody {
  subject: string;
  body: string;
}

/** Code defaults. Per-tenant overrides in communication.email_templates win over these (spec §2 decision 3). */
export const EMAIL_TEMPLATE_DEFAULTS: Record<EmailTemplateKey, EmailTemplateBody> = {
  enrollment_invite: {
    subject: 'Вас записали на курс «{{courseTitle}}»',
    body:
      'Здравствуйте, {{learnerName}}!\n\n' +
      'Вы записаны на обучение по программе «{{courseTitle}}». ' +
      'Войдите в личный кабинет, чтобы приступить к занятиям: {{loginUrl}}\n' +
      'Для входа укажите этот e-mail — ссылка для входа придёт на него.\n\n' +
      'С уважением, {{tenantName}}.'
  },
  course_completed: {
    subject: 'Курс «{{courseTitle}}» завершён',
    body:
      'Здравствуйте, {{learnerName}}!\n\n' +
      'Вы успешно завершили обучение по программе «{{courseTitle}}». ' +
      'Выданные документы доступны в личном кабинете.\n\n' +
      'С уважением, {{tenantName}}.'
  },
  recertification_due: {
    subject: 'Истекает срок действия удостоверения по программе «{{courseTitle}}»',
    body:
      'Здравствуйте, {{learnerName}}!\n\n' +
      'Срок действия вашего удостоверения по программе «{{courseTitle}}» истекает {{validUntil}}. ' +
      'Для продления необходимо пройти переаттестацию. ' +
      'Учебный центр свяжется с вами для записи на ближайший поток.\n\n' +
      'С уважением, {{tenantName}}.'
  },
  course_deadline: {
    subject: 'Приближается срок завершения обучения по программе «{{courseTitle}}»',
    body:
      'Здравствуйте, {{learnerName}}!\n\n' +
      'Срок завершения обучения по программе «{{courseTitle}}» — {{deadline}}. ' +
      'Пожалуйста, завершите оставшиеся материалы и итоговое тестирование в личном кабинете до этой даты.\n\n' +
      'С уважением, {{tenantName}}.'
  },
  /*
   * ТЗ 11.3 + 10.4 (решение Р9): напоминание о повторной проверке знаний.
   *
   * Тон здесь важнее обычного. По пункту 79 Порядка № 2464 неудовлетворительный результат
   * НЕ отменяет обучение — работник направляется на повторную проверку в течение 30
   * календарных дней. Письмо не должно читаться как выговор: человек и так расстроен, а
   * задача письма — привести его на пересдачу, а не наказать. Поэтому ни слова «провал», ни
   * «неудача»: названы срок и действие.
   */
  knowledge_retest: {
    subject: 'Повторная проверка знаний по программе «{{courseTitle}}» — до {{dueDate}}',
    body:
      'Здравствуйте, {{learnerName}}!\n\n' +
      'По программе «{{courseTitle}}» требуется повторная проверка знаний. ' +
      'Пройти её нужно до {{dueDate}} — осталось {{daysLeft}}.\n' +
      'Открыть проверку можно в личном кабинете. Если у вас есть вопросы или нужна другая ' +
      'дата — напишите в учебный центр.\n\n' +
      'С уважением, {{tenantName}}.'
  },
  document_revoked: {
    subject: 'Документ по программе «{{courseTitle}}» аннулирован',
    body:
      'Здравствуйте, {{learnerName}}!\n\n' +
      'Выданный вам документ по программе «{{courseTitle}}» был аннулирован. ' +
      'Причина: {{reason}}. ' +
      'По вопросам перевыпуска обратитесь в учебный центр.\n\n' +
      'С уважением, {{tenantName}}.'
  },
  // Ссылка одноразовая и живёт 15 минут (PRE_EXAM_TOKEN_TTL_MS) — в письме это
  // проговаривается, чтобы слушатель не откладывал переход.
  pre_exam_auth: {
    subject: 'Подтверждение личности перед экзаменом — «{{courseTitle}}»',
    body:
      'Здравствуйте, {{learnerName}}!\n\n' +
      'Для допуска к итоговому тестированию по программе «{{courseTitle}}» подтвердите личность, ' +
      'перейдя по ссылке: {{verifyUrl}}\n' +
      'Ссылка одноразовая и действует 15 минут. Если вы не запрашивали допуск — проигнорируйте это письмо.\n\n' +
      'С уважением, {{tenantName}}.'
  },
  identity_verification_rejected: {
    subject: 'Проверка личности не пройдена',
    body:
      'Здравствуйте, {{learnerName}}!\n\n' +
      'Загруженные вами документы для проверки личности отклонены. ' +
      'Причина: {{reason}}.\n' +
      'Пожалуйста, загрузите документы повторно в личном кабинете.\n\n' +
      'С уважением, {{tenantName}}.'
  },
  // Staff-facing (sent to the configured notification recipients, not a learner): a center
  // license/accreditation is approaching its expiry date.
  license_expiring: {
    subject: 'Истекает срок действия лицензии № {{licenseNumber}}',
    body:
      'Внимание!\n\n' +
      'Срок действия лицензии/аккредитации № {{licenseNumber}} ({{issuerName}}) истекает {{validUntil}}. ' +
      'Продлите документ заранее, чтобы не приостанавливать публикацию программ и выдачу удостоверений.\n\n' +
      'Учебный центр (системное уведомление).'
  }
};

/** Pure {{var}} interpolation. Unknown placeholders collapse to an empty string. */
export function renderTemplate(
  template: EmailTemplateBody,
  variables: Record<string, string>
): EmailTemplateBody {
  const apply = (text: string): string =>
    text.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => variables[key] ?? '');
  return { subject: apply(template.subject), body: apply(template.body) };
}

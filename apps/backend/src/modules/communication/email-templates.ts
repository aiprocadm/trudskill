export type EmailTemplateKey =
  | 'enrollment_invite'
  | 'course_completed'
  | 'recertification_due'
  | 'course_deadline'
  | 'document_revoked';

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
      'Войдите в личный кабинет, чтобы приступить к занятиям.\n\n' +
      'С уважением, учебный центр.'
  },
  course_completed: {
    subject: 'Курс «{{courseTitle}}» завершён',
    body:
      'Здравствуйте, {{learnerName}}!\n\n' +
      'Вы успешно завершили обучение по программе «{{courseTitle}}». ' +
      'Выданные документы доступны в личном кабинете.\n\n' +
      'С уважением, учебный центр.'
  },
  recertification_due: {
    subject: 'Истекает срок действия удостоверения по программе «{{courseTitle}}»',
    body:
      'Здравствуйте, {{learnerName}}!\n\n' +
      'Срок действия вашего удостоверения по программе «{{courseTitle}}» истекает {{validUntil}}. ' +
      'Для продления необходимо пройти переаттестацию. ' +
      'Учебный центр свяжется с вами для записи на ближайший поток.\n\n' +
      'С уважением, учебный центр.'
  },
  course_deadline: {
    subject: 'Приближается срок завершения обучения по программе «{{courseTitle}}»',
    body:
      'Здравствуйте, {{learnerName}}!\n\n' +
      'Срок завершения обучения по программе «{{courseTitle}}» — {{deadline}}. ' +
      'Пожалуйста, завершите оставшиеся материалы и итоговое тестирование в личном кабинете до этой даты.\n\n' +
      'С уважением, учебный центр.'
  },
  document_revoked: {
    subject: 'Документ по программе «{{courseTitle}}» аннулирован',
    body:
      'Здравствуйте, {{learnerName}}!\n\n' +
      'Выданный вам документ по программе «{{courseTitle}}» был аннулирован. ' +
      'Причина: {{reason}}. ' +
      'По вопросам перевыпуска обратитесь в учебный центр.\n\n' +
      'С уважением, учебный центр.'
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

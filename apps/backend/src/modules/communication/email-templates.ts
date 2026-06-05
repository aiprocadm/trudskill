export type EmailTemplateKey = 'enrollment_invite' | 'course_completed';

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

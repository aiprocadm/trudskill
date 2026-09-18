import { NoopMailer } from './mailer.service.js';
import { SmtpMailer } from './smtp-mailer.service.js';

import type { EmailMessage, MailerService, SendResult } from './mailer.service.js';

/**
 * Защита от случайной рассылки живым людям с нерабочего стенда
 * (ТЗ «Стабилизация, UX и развитие», 11.2 п.4).
 *
 * **Чем это опасно.** Стенд работает на копии данных: там настоящие фамилии и настоящие адреса
 * слушателей. Достаточно включить почту «на посмотреть» — и сотни человек получат письмо о
 * курсе, на который их никто не записывал. Отозвать отправленное письмо нельзя.
 *
 * **Правило.** Вне рабочего окружения письмо НЕ уходит по своему адресу никогда. Либо все
 * письма перенаправляются на один разрешённый адрес (его задаёт настройка), либо не уходят
 * вовсе. Умолчание — «не уходят»: когда непонятно, безопаснее промолчать, чем разослать.
 */

export interface MailRoutingInput {
  /** Рабочее окружение: только здесь письмо идёт по своему адресу. */
  production: boolean;
  /** Адрес-приёмник для нерабочего окружения; пустой — значит письма не отправлять вовсе. */
  redirectTo?: string;
  /** Кому письмо адресовано на самом деле. */
  to: string;
}

export type MailRouting =
  | { kind: 'deliver'; to: string }
  | { kind: 'redirect'; to: string; original: string }
  | { kind: 'blocked'; reason: string };

/**
 * Куда на самом деле уйдёт письмо.
 *
 * Чистая функция, потому что это правило безопасности: его нужно проверять значениями, а не
 * надеяться, что оно соблюдено в двух местах сборки транспорта.
 */
export const mailRouting = (input: MailRoutingInput): MailRouting => {
  if (input.production) return { kind: 'deliver', to: input.to };
  const redirectTo = (input.redirectTo ?? '').trim();
  if (redirectTo === '') {
    return {
      kind: 'blocked',
      reason:
        'Письмо не отправлено: нерабочее окружение. Чтобы получать письма со стенда, задайте адрес-приёмник MAIL_REDIRECT_TO.'
    };
  }
  return { kind: 'redirect', to: redirectTo, original: input.to };
};

/**
 * Обёртка над любым транспортом, применяющая правило выше.
 *
 * Перенаправленное письмо помечается в теме и в теле настоящим адресатом — иначе на стенде
 * невозможно понять, кому оно предназначалось, и проверка теряет смысл.
 */
export class SafeMailer implements MailerService {
  constructor(
    private readonly inner: MailerService,
    private readonly config: { production: boolean; redirectTo?: string }
  ) {}

  async send(message: EmailMessage): Promise<SendResult> {
    const routing = mailRouting({
      production: this.config.production,
      ...(this.config.redirectTo ? { redirectTo: this.config.redirectTo } : {}),
      to: message.to
    });

    if (routing.kind === 'blocked') {
      /* Не отправлено — не выдаём это за отправку: журнал писем обязан показать причину. */
      return { status: 'failed', error: routing.reason };
    }
    if (routing.kind === 'deliver') return this.inner.send(message);

    return this.inner.send({
      ...message,
      to: routing.to,
      subject: `[стенд → ${routing.original}] ${message.subject}`,
      body: `Письмо со стенда. Настоящий адресат: ${routing.original}\n\n${message.body}`
    });
  }
}

/**
 * Единственная сборка почтового транспорта на весь бэкенд.
 *
 * До этого транспорт собирали ДВА места — модуль рассылок и модуль доступа (ссылка для входа), —
 * каждое со своей копией настроек. Защита, поставленная в одном, вторым бы обходилась: правило,
 * которое обязан помнить каждый вызывающий, соблюсти нельзя.
 */
export interface MailerEnv {
  NODE_ENV: string;
  NOTIFICATIONS_EMAIL_ENABLED: boolean;
  SMTP_HOST?: string;
  SMTP_PORT: number;
  SMTP_FROM: string;
  SMTP_USER?: string;
  SMTP_PASSWORD?: string;
  MAIL_REDIRECT_TO?: string;
}

export const createMailer = (env: MailerEnv): MailerService => {
  if (!env.NOTIFICATIONS_EMAIL_ENABLED) return new NoopMailer();
  const transport = new SmtpMailer({
    host: env.SMTP_HOST ?? '',
    port: env.SMTP_PORT,
    from: env.SMTP_FROM,
    ...(env.SMTP_USER ? { user: env.SMTP_USER } : {}),
    ...(env.SMTP_PASSWORD ? { password: env.SMTP_PASSWORD } : {})
  });
  return new SafeMailer(transport, {
    production: env.NODE_ENV === 'production',
    ...(env.MAIL_REDIRECT_TO ? { redirectTo: env.MAIL_REDIRECT_TO } : {})
  });
};

import { createTransport as realCreateTransport } from 'nodemailer';

import { senderFrom } from './sender-name.js';

import type { EmailMessage, MailerService, SendResult } from './mailer.service.js';

export interface SmtpMailerConfig {
  host: string;
  port: number;
  from: string;
  user?: string;
  password?: string;
}

/** Minimal transport surface we depend on — keeps the impl unit-testable with a fake. */
interface MailTransport {
  sendMail(options: {
    from: string;
    to: string;
    subject: string;
    text: string;
  }): Promise<{ messageId?: string }>;
}

export type CreateTransport = (config: SmtpMailerConfig) => MailTransport;

/**
 * Сроки SMTP (журнал 335). Письмо со ссылкой для входа уходит прямо в запросе, и без сроков
 * молчащий почтовый сервер держал вход по ссылке: у nodemailer подключение ждёт две минуты,
 * а ответ на письмо — десять.
 */
const SMTP_CONNECTION_TIMEOUT_MS = 10_000;
const SMTP_GREETING_TIMEOUT_MS = 10_000;
const SMTP_SOCKET_TIMEOUT_MS = 30_000;

const defaultCreateTransport: CreateTransport = (config) =>
  realCreateTransport({
    host: config.host,
    port: config.port,
    auth: config.user ? { user: config.user, pass: config.password } : undefined,
    connectionTimeout: SMTP_CONNECTION_TIMEOUT_MS,
    greetingTimeout: SMTP_GREETING_TIMEOUT_MS,
    socketTimeout: SMTP_SOCKET_TIMEOUT_MS
  }) as unknown as MailTransport;

export class SmtpMailer implements MailerService {
  private readonly transport: MailTransport;

  constructor(
    private readonly config: SmtpMailerConfig,
    createTransport: CreateTransport = defaultCreateTransport
  ) {
    this.transport = createTransport(config);
  }

  async send(message: EmailMessage): Promise<SendResult> {
    try {
      const info = await this.transport.sendMail({
        /*
         * ТЗ 13.3 (Р14): слушатель видит письмо от СВОЕГО учебного центра, а не от платформы.
         * Меняется только видимое имя — адрес остаётся платформенным, иначе письмо уходит в
         * спам: подписи SPF/DKIM принадлежат платформе (журнал 556).
         */
        from: senderFrom(this.config.from, message.tenantName),
        to: message.to,
        subject: message.subject,
        text: message.body
      });
      return { status: 'sent', ...(info.messageId ? { providerMessageId: info.messageId } : {}) };
    } catch (err) {
      return { status: 'failed', error: err instanceof Error ? err.message : String(err) };
    }
  }
}

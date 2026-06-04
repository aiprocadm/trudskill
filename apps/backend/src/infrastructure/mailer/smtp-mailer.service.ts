import { createTransport as realCreateTransport } from 'nodemailer';

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

const defaultCreateTransport: CreateTransport = (config) =>
  realCreateTransport({
    host: config.host,
    port: config.port,
    auth: config.user ? { user: config.user, pass: config.password } : undefined
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
        from: this.config.from,
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

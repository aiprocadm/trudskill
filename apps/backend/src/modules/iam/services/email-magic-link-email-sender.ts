import {
  type MagicLinkEmailSender,
  type SendMagicLinkInput,
  buildMagicLinkUrl
} from './magic-link-email-sender.js';
import { type MailerService } from '../../../infrastructure/mailer/mailer.service.js';

/**
 * Production magic-link delivery: emails the login link via the shared MailerService.
 * Selected over LoggingMagicLinkEmailSender when NOTIFICATIONS_EMAIL_ENABLED=true (see factory).
 */
export class EmailMagicLinkEmailSender implements MagicLinkEmailSender {
  constructor(private readonly mailer: MailerService) {}

  async sendMagicLink(input: SendMagicLinkInput): Promise<void> {
    const url = buildMagicLinkUrl(input.rawToken);
    const body = [
      'Здравствуйте!',
      '',
      'Чтобы войти в CDOProf, перейдите по ссылке (действует 15 минут):',
      url,
      '',
      'Если вы не запрашивали вход, просто проигнорируйте это письмо.'
    ].join('\n');

    const result = await this.mailer.send({
      to: input.email,
      subject: 'Вход в CDOProf',
      body,
      templateKey: 'magic_link'
    });

    if (result.status === 'failed') {
      throw new Error(`magic_link email delivery failed: ${result.error ?? 'unknown error'}`);
    }
  }
}

import { EmailMagicLinkEmailSender } from './email-magic-link-email-sender.js';
import {
  LoggingMagicLinkEmailSender,
  type MagicLinkEmailSender
} from './magic-link-email-sender.js';

import type { MailerService } from '../../../infrastructure/mailer/mailer.service.js';

/** Selects the magic-link delivery strategy. Mirrors communication.module's MAILER factory. */
export function createMagicLinkEmailSender(
  env: { NOTIFICATIONS_EMAIL_ENABLED: boolean },
  mailerFactory: () => MailerService
): MagicLinkEmailSender {
  return env.NOTIFICATIONS_EMAIL_ENABLED
    ? new EmailMagicLinkEmailSender(mailerFactory())
    : new LoggingMagicLinkEmailSender();
}

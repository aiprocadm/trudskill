import { describe, expect, it, vi } from 'vitest';

import { EmailMagicLinkEmailSender } from './email-magic-link-email-sender.js';
import { createMagicLinkEmailSender } from './magic-link-email-sender.factory.js';
import { LoggingMagicLinkEmailSender } from './magic-link-email-sender.js';

import type { MailerService } from '../../../infrastructure/mailer/mailer.service.js';

const fakeMailer: MailerService = { send: vi.fn().mockResolvedValue({ status: 'sent' }) };

describe('createMagicLinkEmailSender', () => {
  it('returns the email sender when notifications email is enabled', () => {
    const sender = createMagicLinkEmailSender(
      { NOTIFICATIONS_EMAIL_ENABLED: true },
      () => fakeMailer
    );
    expect(sender).toBeInstanceOf(EmailMagicLinkEmailSender);
  });

  it('returns the log-only sender when notifications email is disabled', () => {
    const mailerFactory = vi.fn(() => fakeMailer);
    const sender = createMagicLinkEmailSender(
      { NOTIFICATIONS_EMAIL_ENABLED: false },
      mailerFactory
    );
    expect(sender).toBeInstanceOf(LoggingMagicLinkEmailSender);
    expect(mailerFactory).not.toHaveBeenCalled();
  });
});

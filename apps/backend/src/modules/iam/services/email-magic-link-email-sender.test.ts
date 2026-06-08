import { describe, expect, it, vi } from 'vitest';

import { EmailMagicLinkEmailSender } from './email-magic-link-email-sender.js';

import type { MailerService, SendResult } from '../../../infrastructure/mailer/mailer.service.js';

const makeMailer = (result: SendResult): MailerService & { send: ReturnType<typeof vi.fn> } => ({
  send: vi.fn().mockResolvedValue(result)
});

describe('EmailMagicLinkEmailSender', () => {
  it('sends the magic-link URL to the email via the mailer', async () => {
    const mailer = makeMailer({ status: 'sent' });
    const sender = new EmailMagicLinkEmailSender(mailer);

    await sender.sendMagicLink({ email: 'user@example.ru', rawToken: 'tok-123' });

    expect(mailer.send).toHaveBeenCalledTimes(1);
    const msg = mailer.send.mock.calls[0]![0];
    expect(msg.to).toBe('user@example.ru');
    expect(msg.templateKey).toBe('magic_link');
    expect(msg.subject).toContain('CDOProf');
    expect(msg.body).toContain('/login/magic-link/tok-123');
  });

  it('throws when the mailer reports failure (do not pretend the email was sent)', async () => {
    const sender = new EmailMagicLinkEmailSender(
      makeMailer({ status: 'failed', error: 'smtp down' })
    );
    await expect(sender.sendMagicLink({ email: 'u@e.ru', rawToken: 't' })).rejects.toThrow();
  });

  it('does not throw when the mailer is a noop (email disabled)', async () => {
    const sender = new EmailMagicLinkEmailSender(makeMailer({ status: 'skipped_noop' }));
    await expect(sender.sendMagicLink({ email: 'u@e.ru', rawToken: 't' })).resolves.toBeUndefined();
  });
});

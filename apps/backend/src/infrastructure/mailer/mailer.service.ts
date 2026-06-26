/** Outcome of one send attempt. `skipped_noop` = mailer disabled (no real send happened). */
export type EmailSendStatus = 'sent' | 'failed' | 'skipped_noop';

export interface EmailMessage {
  to: string;
  subject: string;
  body: string;
  /** Template key, carried through for the delivery journal. */
  templateKey: string;
}

export interface SendResult {
  status: EmailSendStatus;
  providerMessageId?: string;
  error?: string;
}

export interface MailerService {
  /**
   * Send one message. MUST NOT throw — transport failures are returned as
   * `{ status: 'failed', error }`. `NotificationDispatcher` relies on this: it loops over
   * recipients recording a per-recipient delivery (which carries the send-once `dedupKey`),
   * so a throw mid-loop would strand the remaining recipients (their dispatch is skipped on
   * the next run once an earlier recipient's `dedupKey` row exists). Implementations wrap
   * their transport in try/catch (see `SmtpMailer`).
   */
  send(message: EmailMessage): Promise<SendResult>;
}

/** DI token for the active mailer. Mirrors ANTIVIRUS_SCANNER. */
export const MAILER = Symbol('MAILER');

/**
 * Default mailer for dev/test and any environment where NOTIFICATIONS_EMAIL_ENABLED=false.
 * Records the attempt as skipped_noop so the dispatcher + journal flow is fully exercised
 * without an SMTP server. Real sending is opt-in via SmtpMailer behind the flag.
 */
export class NoopMailer implements MailerService {
  async send(_message: EmailMessage): Promise<SendResult> {
    return { status: 'skipped_noop' };
  }
}

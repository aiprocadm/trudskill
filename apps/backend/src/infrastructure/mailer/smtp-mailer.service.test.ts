import { describe, expect, it, vi } from 'vitest';

import { SmtpMailer } from './smtp-mailer.service.js';

describe('SmtpMailer', () => {
  const config = { host: 'mail', port: 587, from: 'no-reply@cdoprof.local' };

  it('sends via the transport and maps the message id', async () => {
    const sendMail = vi.fn().mockResolvedValue({ messageId: 'abc-123' });
    const createTransport = vi.fn().mockReturnValue({ sendMail });
    const mailer = new SmtpMailer(config, createTransport as never);

    const result = await mailer.send({
      to: 'learner@example.com',
      subject: 'S',
      body: 'B',
      templateKey: 'enrollment_invite'
    });

    expect(createTransport).toHaveBeenCalledWith(config);
    expect(result.status).toBe('sent');
    expect(result.providerMessageId).toBe('abc-123');
    expect(sendMail).toHaveBeenCalledWith({
      from: 'no-reply@cdoprof.local',
      to: 'learner@example.com',
      subject: 'S',
      text: 'B'
    });
  });

  it('reports failed and the error message when the transport throws', async () => {
    const sendMail = vi.fn().mockRejectedValue(new Error('connection refused'));
    const createTransport = vi.fn().mockReturnValue({ sendMail });
    const mailer = new SmtpMailer(config, createTransport as never);

    const result = await mailer.send({
      to: 'x@example.com',
      subject: 'S',
      body: 'B',
      templateKey: 'course_completed'
    });

    expect(createTransport).toHaveBeenCalledWith(config);
    expect(result.status).toBe('failed');
    expect(result.error).toContain('connection refused');
  });
});

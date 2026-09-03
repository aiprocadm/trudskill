import { describe, expect, it, vi } from 'vitest';

const { createTransportMock } = vi.hoisted(() => ({
  createTransportMock: vi.fn(() => ({ sendMail: vi.fn() }))
}));
vi.mock('nodemailer', () => ({ createTransport: createTransportMock }));

import { SmtpMailer } from './smtp-mailer.service.js';

describe('SmtpMailer', () => {
  const config = { host: 'mail', port: 587, from: 'no-reply@trudskill.local' };

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
      from: 'no-reply@trudskill.local',
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

describe('SmtpMailer срок ожидания (журнал 335)', () => {
  it('транспорт по умолчанию создаётся со сроками: молчащий SMTP не держит вход по ссылке', () => {
    new SmtpMailer({ host: 'mail', port: 587, from: 'no-reply@trudskill.local' });

    expect(createTransportMock).toHaveBeenCalledOnce();
    const [options] = createTransportMock.mock.calls[0] as unknown as [
      { connectionTimeout?: number; greetingTimeout?: number; socketTimeout?: number }
    ];
    expect(options.connectionTimeout ?? 0).toBeGreaterThan(0);
    expect(options.greetingTimeout ?? 0).toBeGreaterThan(0);
    expect(options.socketTimeout ?? 0).toBeGreaterThan(0);
  });
});

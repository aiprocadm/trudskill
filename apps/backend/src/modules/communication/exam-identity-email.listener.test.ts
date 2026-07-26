import { describe, expect, it, vi } from 'vitest';

import { ExamIdentityEmailListener } from './exam-identity-email.listener.js';
import { InMemoryEmailDeliveriesState } from './in-memory-email-deliveries.state.js';
import { InMemoryEmailTemplatesState } from './in-memory-email-templates.state.js';
import { NotificationDispatcher } from './notification-dispatcher.service.js';

import type { EmailMessage, MailerService } from '../../infrastructure/mailer/mailer.service.js';

function makeDispatcher() {
  const sent: EmailMessage[] = [];
  const mailer: MailerService = {
    send: vi.fn(async (message: EmailMessage) => {
      sent.push(message);
      return { status: 'sent' as const };
    })
  };
  const templates = new InMemoryEmailTemplatesState();
  const deliveries = new InMemoryEmailDeliveriesState();
  const dispatcher = new NotificationDispatcher(mailer, templates, deliveries);
  return { dispatcher, deliveries, sent };
}

const preExamBase = {
  tenantId: 't1',
  tokenId: 'preexam_1',
  enrollmentId: 'enr1',
  testId: 'test1',
  learnerId: 'l1',
  verifyUrl: 'https://lms.example/exam-auth/RAW',
  expiresAt: '2026-07-26T10:00:00.000Z',
  courseTitle: 'Охрана труда'
};
const preExamPayload = {
  ...preExamBase,
  recipient: { email: 'a@example.com', name: 'Иванов Иван' }
};

const rejectedBase = {
  tenantId: 't1',
  verificationId: 'idv1',
  learnerId: 'l1',
  reviewedAt: '2026-07-26T10:00:00.000Z',
  recipient: { email: 'a@example.com', name: 'Иванов Иван' }
};
const rejectedPayload = { ...rejectedBase, reason: 'фото нечитаемо' };

describe('ExamIdentityEmailListener', () => {
  it('dispatches pre_exam_auth with the verify link and a per-token dedup key', async () => {
    const { dispatcher, deliveries, sent } = makeDispatcher();
    const listener = new ExamIdentityEmailListener(dispatcher);
    await listener.handlePreExamAuthRequested(preExamPayload);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.body).toContain('https://lms.example/exam-auth/RAW');
    expect(sent[0]!.subject).toContain('Охрана труда');
    const list = await deliveries.list('t1', {});
    expect(list.total).toBe(1);
    expect(list.items[0]!.templateKey).toBe('pre_exam_auth');
    expect(list.items[0]!.relatedEntityId).toBe('preexam_1');
  });

  it('re-emitting the same pre-exam token does not duplicate the email (dedup)', async () => {
    const { dispatcher, sent } = makeDispatcher();
    const listener = new ExamIdentityEmailListener(dispatcher);
    await listener.handlePreExamAuthRequested(preExamPayload);
    await listener.handlePreExamAuthRequested(preExamPayload);
    expect(sent).toHaveLength(1);
  });

  it('does nothing when the pre-exam payload has no recipient e-mail', async () => {
    const { dispatcher, sent } = makeDispatcher();
    const listener = new ExamIdentityEmailListener(dispatcher);
    await listener.handlePreExamAuthRequested(preExamBase);
    expect(sent).toHaveLength(0);
  });

  it('dispatches identity_verification_rejected with the reason', async () => {
    const { dispatcher, deliveries, sent } = makeDispatcher();
    const listener = new ExamIdentityEmailListener(dispatcher);
    await listener.handleIdentityVerificationRejected(rejectedPayload);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.body).toContain('фото нечитаемо');
    const list = await deliveries.list('t1', {});
    expect(list.items[0]!.templateKey).toBe('identity_verification_rejected');
  });

  it('falls back to a readable placeholder when no rejection reason is given', async () => {
    const { dispatcher, sent } = makeDispatcher();
    const listener = new ExamIdentityEmailListener(dispatcher);
    await listener.handleIdentityVerificationRejected(rejectedBase);
    expect(sent[0]!.body).toContain('не указана');
  });

  it('a repeat reject after resubmit (new reviewedAt) sends a new email', async () => {
    const { dispatcher, sent } = makeDispatcher();
    const listener = new ExamIdentityEmailListener(dispatcher);
    await listener.handleIdentityVerificationRejected(rejectedPayload);
    await listener.handleIdentityVerificationRejected({
      ...rejectedPayload,
      reviewedAt: '2026-07-27T10:00:00.000Z'
    });
    expect(sent).toHaveLength(2);
  });

  it('swallows dispatcher errors without throwing (domain flow must not break)', async () => {
    const dispatcher = {
      dispatch: vi.fn().mockRejectedValue(new Error('smtp down'))
    } as unknown as NotificationDispatcher;
    const listener = new ExamIdentityEmailListener(dispatcher);
    await expect(listener.handlePreExamAuthRequested(preExamPayload)).resolves.toBeUndefined();
    await expect(
      listener.handleIdentityVerificationRejected(rejectedPayload)
    ).resolves.toBeUndefined();
  });
});

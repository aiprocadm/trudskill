import { describe, expect, it } from 'vitest';

import { EMAIL_TEMPLATE_DEFAULTS, renderTemplate } from './email-templates.js';
import { EnrollmentEmailListener } from './enrollment-email.listener.js';
import { InMemoryEmailDeliveriesState } from './in-memory-email-deliveries.state.js';
import { InMemoryEmailTemplatesState } from './in-memory-email-templates.state.js';
import { NotificationDispatcher } from './notification-dispatcher.service.js';
import { NoopMailer } from '../../infrastructure/mailer/mailer.service.js';

describe('email templates', () => {
  it('has a default for every template key', () => {
    expect(EMAIL_TEMPLATE_DEFAULTS.enrollment_invite.subject.length).toBeGreaterThan(0);
    expect(EMAIL_TEMPLATE_DEFAULTS.course_completed.subject.length).toBeGreaterThan(0);
  });

  it('interpolates {{variables}} into subject and body', () => {
    const rendered = renderTemplate(
      { subject: 'Курс {{courseTitle}}', body: 'Здравствуйте, {{learnerName}}!' },
      { courseTitle: 'Охрана труда', learnerName: 'Иванов И.' }
    );
    expect(rendered.subject).toBe('Курс Охрана труда');
    expect(rendered.body).toBe('Здравствуйте, Иванов И.!');
  });

  it('replaces an unknown placeholder with an empty string', () => {
    const rendered = renderTemplate({ subject: 'A {{missing}}', body: 'B' }, {});
    expect(rendered.subject).toBe('A ');
  });
});

describe('email templates repository (in-memory)', () => {
  it('upserts and reads back an override, scoped by tenant', async () => {
    const repo = new InMemoryEmailTemplatesState();
    await repo.upsertOverride('t1', 'enrollment_invite', {
      subject: 'Custom',
      body: 'Body',
      updatedBy: 'u1'
    });
    const found = await repo.getOverride('t1', 'enrollment_invite');
    expect(found?.subject).toBe('Custom');
    expect(await repo.getOverride('t2', 'enrollment_invite')).toBeNull();
  });

  it('upsert replaces an existing override rather than duplicating', async () => {
    const repo = new InMemoryEmailTemplatesState();
    await repo.upsertOverride('t1', 'course_completed', { subject: 'A', body: 'a' });
    await repo.upsertOverride('t1', 'course_completed', { subject: 'B', body: 'b' });
    const list = await repo.listOverrides('t1');
    expect(list).toHaveLength(1);
    expect(list[0]!.subject).toBe('B');
  });
});

describe('email deliveries journal (in-memory)', () => {
  it('records a delivery and lists it back, scoped by tenant', async () => {
    const repo = new InMemoryEmailDeliveriesState();
    await repo.record({
      tenantId: 't1',
      templateKey: 'enrollment_invite',
      recipientEmail: 'a@example.com',
      recipientKind: 'learner',
      subject: 'S',
      status: 'skipped_noop'
    });
    const t1 = await repo.list('t1', {});
    expect(t1.total).toBe(1);
    expect(t1.items[0]!.recipientEmail).toBe('a@example.com');
    expect((await repo.list('t2', {})).total).toBe(0);
  });
});

function makeDispatcher() {
  const templates = new InMemoryEmailTemplatesState();
  const deliveries = new InMemoryEmailDeliveriesState();
  const dispatcher = new NotificationDispatcher(new NoopMailer(), templates, deliveries);
  return { dispatcher, templates, deliveries };
}

describe('NotificationDispatcher', () => {
  it('renders the default template and records a skipped_noop delivery', async () => {
    const { dispatcher, deliveries } = makeDispatcher();
    await dispatcher.dispatch({
      tenantId: 't1',
      templateKey: 'enrollment_invite',
      recipients: [{ email: 'a@example.com', name: 'Иванов', kind: 'learner' }],
      variables: { courseTitle: 'ОТ', learnerName: 'Иванов' }
    });
    const list = await deliveries.list('t1', {});
    expect(list.total).toBe(1);
    expect(list.items[0]!.status).toBe('skipped_noop');
    expect(list.items[0]!.subject).toBe('Вас записали на курс «ОТ»');
    expect(list.items[0]!.recipientKind).toBe('learner');
  });

  it('uses a tenant override when present', async () => {
    const { dispatcher, templates, deliveries } = makeDispatcher();
    await templates.upsertOverride('t1', 'enrollment_invite', {
      subject: 'Переопределённая тема {{courseTitle}}',
      body: 'тело'
    });
    await dispatcher.dispatch({
      tenantId: 't1',
      templateKey: 'enrollment_invite',
      recipients: [{ email: 'a@example.com', kind: 'learner' }],
      variables: { courseTitle: 'ПБ' }
    });
    const list = await deliveries.list('t1', {});
    expect(list.items[0]!.subject).toBe('Переопределённая тема ПБ');
  });

  it('records one delivery per recipient', async () => {
    const { dispatcher, deliveries } = makeDispatcher();
    await dispatcher.dispatch({
      tenantId: 't1',
      templateKey: 'course_completed',
      recipients: [
        { email: 'a@example.com', kind: 'learner' },
        { email: 'b@example.com', kind: 'employer' }
      ],
      variables: { courseTitle: 'ОТ', learnerName: 'Иванов' }
    });
    expect((await deliveries.list('t1', {})).total).toBe(2);
  });
});

describe('EnrollmentEmailListener', () => {
  it('dispatches enrollment_invite on the invited event', async () => {
    const { dispatcher, deliveries } = makeDispatcher();
    const listener = new EnrollmentEmailListener(dispatcher);
    await listener.handleInvited({
      tenantId: 't1',
      enrollmentId: 'enr1',
      learnerId: 'l1',
      groupId: 'g1',
      recipient: { email: 'a@example.com', name: 'Иванов' }
    });
    const list = await deliveries.list('t1', {});
    expect(list.total).toBe(1);
    expect(list.items[0]!.templateKey).toBe('enrollment_invite');
    expect(list.items[0]!.relatedEntityId).toBe('enr1');
  });

  it('uses courseTitle from invited payload in the email subject', async () => {
    const { dispatcher, deliveries } = makeDispatcher();
    const listener = new EnrollmentEmailListener(dispatcher);
    await listener.handleInvited({
      tenantId: 't1',
      enrollmentId: 'enr1',
      learnerId: 'l1',
      groupId: 'g1',
      courseTitle: 'Охрана труда',
      recipient: { email: 'a@example.com', name: 'Иванов' }
    });
    const list = await deliveries.list('t1', {});
    expect(list.items[0]!.subject).toContain('Охрана труда');
  });

  it('does nothing when the payload has no recipient e-mail', async () => {
    const { dispatcher, deliveries } = makeDispatcher();
    const listener = new EnrollmentEmailListener(dispatcher);
    await listener.handleInvited({
      tenantId: 't1',
      enrollmentId: 'enr1',
      learnerId: 'l1',
      groupId: 'g1'
    });
    expect((await deliveries.list('t1', {})).total).toBe(0);
  });

  it('dispatches course_completed on the completed event', async () => {
    const { dispatcher, deliveries } = makeDispatcher();
    const listener = new EnrollmentEmailListener(dispatcher);
    await listener.handleCompleted({
      tenantId: 't1',
      enrollmentId: 'enr1',
      learnerId: 'l1',
      groupId: 'g1',
      groupCourseIds: [],
      recipient: { email: 'a@example.com', name: 'Иванов' }
    });
    const list = await deliveries.list('t1', {});
    expect(list.items[0]!.templateKey).toBe('course_completed');
    expect(list.items[0]!.relatedEntityId).toBe('enr1');
  });
});

import { describe, expect, it, vi } from 'vitest';

import { InMemoryEmailDeliveriesState } from './in-memory-email-deliveries.state.js';
import { NotificationDispatcher } from './notification-dispatcher.service.js';

function make() {
  const mailer = { send: vi.fn().mockResolvedValue({ status: 'sent' }) };
  const templates = { getOverride: vi.fn().mockResolvedValue(null) };
  const deliveries = new InMemoryEmailDeliveriesState();
  const pushSender = { sendToUsers: vi.fn().mockResolvedValue(undefined) };
  const dispatcher = new NotificationDispatcher(
    mailer as never,
    templates as never,
    deliveries as never,
    pushSender as never
  );
  return { dispatcher, mailer, deliveries, pushSender };
}

const baseInput = {
  tenantId: 't1',
  templateKey: 'recertification_due' as const,
  recipients: [{ email: 'ivan@example.com', name: 'Иван', kind: 'learner' as const }],
  variables: { learnerName: 'Иван', courseTitle: 'ОТ', validUntil: '2026-08-01' }
};

describe('NotificationDispatcher dedup', () => {
  it('sends and records when no dedupKey is provided (unchanged behaviour)', async () => {
    const { dispatcher, mailer, deliveries } = make();
    await dispatcher.dispatch(baseInput);
    expect(mailer.send).toHaveBeenCalledTimes(1);
    expect((await deliveries.list('t1', {})).total).toBe(1);
  });

  it('skips the send when the single recipient is already delivered under this dedupKey', async () => {
    const { dispatcher, mailer, deliveries } = make();
    await dispatcher.dispatch({ ...baseInput, dedupKey: 'recert:d1:30' });
    expect(mailer.send).toHaveBeenCalledTimes(1);
    await dispatcher.dispatch({ ...baseInput, dedupKey: 'recert:d1:30' });
    // the single recipient is already delivered under this dedupKey, so it is skipped on retry
    expect(mailer.send).toHaveBeenCalledTimes(1);
    expect((await deliveries.list('t1', {})).total).toBe(1);
  });

  it('records the dedupKey so subsequent sends are deduped', async () => {
    const { dispatcher, deliveries } = make();
    await dispatcher.dispatch({ ...baseInput, dedupKey: 'recert:d1:7' });
    expect(await deliveries.findByDedupKey('t1', 'recert:d1:7')).not.toBeNull();
  });
});

describe('NotificationDispatcher stranding (audit tail 1b)', () => {
  it('a mid-loop send failure does not strand later recipients on retry', async () => {
    const { dispatcher, mailer, deliveries } = make();

    // Three recipients; b@ fails on first attempt
    mailer.send
      .mockResolvedValueOnce({ status: 'sent' }) // a@ succeeds
      .mockRejectedValueOnce(new Error('smtp boom')) // b@ throws
      .mockResolvedValueOnce({ status: 'sent' }); // c@ succeeds

    await dispatcher.dispatch({
      ...baseInput,
      dedupKey: 'recert:d1:30',
      recipients: [
        { email: 'a@x.com', kind: 'learner' as const },
        { email: 'b@x.com', kind: 'learner' as const },
        { email: 'c@x.com', kind: 'learner' as const }
      ]
    });

    // Loop must have continued past b@'s throw: all three get a delivery row
    const { items } = await deliveries.list('t1', {});
    expect(items.length).toBe(3);
    const byEmail = Object.fromEntries(items.map((r) => [r.recipientEmail, r.status]));
    expect(byEmail['a@x.com']).toBe('sent');
    expect(byEmail['b@x.com']).toBe('failed');
    expect(byEmail['c@x.com']).toBe('sent');

    // Retry: only b@ (the failed row) should be re-attempted; a@ and c@ are skipped
    mailer.send.mockClear();
    mailer.send.mockResolvedValue({ status: 'sent' });

    await dispatcher.dispatch({
      ...baseInput,
      dedupKey: 'recert:d1:30',
      recipients: [
        { email: 'a@x.com', kind: 'learner' as const },
        { email: 'b@x.com', kind: 'learner' as const },
        { email: 'c@x.com', kind: 'learner' as const }
      ]
    });

    expect(mailer.send).toHaveBeenCalledTimes(1);
    expect(mailer.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'b@x.com' }));
  });

  it('a recipient with both a failed and a later sent row is recognised as delivered (no re-send)', async () => {
    const { dispatcher, mailer, deliveries } = make();
    const recipients = [
      { email: 'a@x.com', kind: 'learner' as const },
      { email: 'b@x.com', kind: 'learner' as const },
      { email: 'c@x.com', kind: 'learner' as const }
    ];

    // First attempt: b@ throws (records a 'failed' row), a@/c@ succeed.
    mailer.send
      .mockResolvedValueOnce({ status: 'sent' })
      .mockRejectedValueOnce(new Error('smtp boom'))
      .mockResolvedValueOnce({ status: 'sent' });
    await dispatcher.dispatch({ ...baseInput, dedupKey: 'recert:d1:30', recipients });

    // Retry: only b@ is re-attempted and now succeeds, so b@ has BOTH a 'failed' and a 'sent' row.
    mailer.send.mockClear();
    mailer.send.mockResolvedValue({ status: 'sent' });
    await dispatcher.dispatch({ ...baseInput, dedupKey: 'recert:d1:30', recipients });
    expect(mailer.send).toHaveBeenCalledTimes(1);

    const bRows = (await deliveries.list('t1', {})).items.filter(
      (r) => r.recipientEmail === 'b@x.com'
    );
    expect(bRows.map((r) => r.status).sort()).toEqual(['failed', 'sent']);

    // Third dispatch: b@ is delivered (it has a non-failed row) despite also having a failed row,
    // so no recipient is re-sent.
    mailer.send.mockClear();
    await dispatcher.dispatch({ ...baseInput, dedupKey: 'recert:d1:30', recipients });
    expect(mailer.send).not.toHaveBeenCalled();
  });
});

describe('NotificationDispatcher dispatch summary (audit tail fix)', () => {
  it('dispatch returns a {sent,skipped,failed} summary', async () => {
    const { dispatcher, mailer } = make();

    // First dispatch: a@ sent, b@ rejects, c@ sent
    mailer.send
      .mockResolvedValueOnce({ status: 'sent' }) // a@
      .mockRejectedValueOnce(new Error('smtp boom')) // b@
      .mockResolvedValueOnce({ status: 'sent' }); // c@

    const firstResult = await dispatcher.dispatch({
      ...baseInput,
      dedupKey: 'recert:d1:30',
      recipients: [
        { email: 'a@x.com', kind: 'learner' as const },
        { email: 'b@x.com', kind: 'learner' as const },
        { email: 'c@x.com', kind: 'learner' as const }
      ]
    });
    expect(firstResult).toEqual({ sent: 2, skipped: 0, failed: 1 });

    // Re-dispatch: a@ & c@ already delivered (skipped), b@ retried & sent
    mailer.send.mockClear();
    mailer.send.mockResolvedValue({ status: 'sent' });

    const secondResult = await dispatcher.dispatch({
      ...baseInput,
      dedupKey: 'recert:d1:30',
      recipients: [
        { email: 'a@x.com', kind: 'learner' as const },
        { email: 'b@x.com', kind: 'learner' as const },
        { email: 'c@x.com', kind: 'learner' as const }
      ]
    });
    expect(secondResult).toEqual({ sent: 1, skipped: 2, failed: 0 });
  });
});

describe('NotificationDispatcher push fan-out (Phase 10 Track C)', () => {
  const withUserId = {
    ...baseInput,
    recipients: [
      { email: 'ivan@example.com', name: 'Иван', kind: 'learner' as const, userId: 'u1' }
    ]
  };

  it('after the email loop calls pushSender.sendToUsers with title/body from rendered', async () => {
    const { dispatcher, pushSender } = make();
    await dispatcher.dispatch(withUserId);

    expect(pushSender.sendToUsers).toHaveBeenCalledTimes(1);
    const [tenantId, userIds, notification] = pushSender.sendToUsers.mock.calls[0];
    expect(tenantId).toBe('t1');
    expect(userIds).toEqual(['u1']);
    expect(notification.title).toBe('Истекает срок действия удостоверения по программе «ОТ»');
    expect(typeof notification.body).toBe('string');
    expect(notification.body.length).toBeGreaterThan(0);
  });

  it('recipients without userId are skipped by push fan-out; email still sends', async () => {
    const { dispatcher, mailer, pushSender } = make();
    await dispatcher.dispatch(baseInput); // recipient has no userId
    expect(mailer.send).toHaveBeenCalledTimes(1);
    expect(pushSender.sendToUsers).not.toHaveBeenCalled();
  });

  it('dedup-skipped dispatch sends no push (early return preserved)', async () => {
    const { dispatcher, pushSender } = make();
    await dispatcher.dispatch({ ...withUserId, dedupKey: 'recert:d1:30' });
    expect(pushSender.sendToUsers).toHaveBeenCalledTimes(1);
    await dispatcher.dispatch({ ...withUserId, dedupKey: 'recert:d1:30' });
    expect(pushSender.sendToUsers).toHaveBeenCalledTimes(1); // not re-pushed
  });

  it('a push error does not break dispatch (email already journaled)', async () => {
    const { dispatcher, deliveries, pushSender } = make();
    pushSender.sendToUsers.mockRejectedValueOnce(new Error('push boom'));
    await expect(dispatcher.dispatch(withUserId)).rejects.toThrow('push boom');
    // email was recorded before the push fan-out ran
    expect((await deliveries.list('t1', {})).total).toBe(1);
  });

  it('only known userIds are forwarded (mixed recipients)', async () => {
    const { dispatcher, pushSender } = make();
    await dispatcher.dispatch({
      ...baseInput,
      recipients: [
        { email: 'a@x.com', kind: 'learner' as const, userId: 'u1' },
        { email: 'b@x.com', kind: 'learner' as const }, // external, no userId
        { email: 'c@x.com', kind: 'learner' as const, userId: 'u3' }
      ]
    });
    const [, userIds] = pushSender.sendToUsers.mock.calls[0];
    expect(userIds).toEqual(['u1', 'u3']);
  });
});

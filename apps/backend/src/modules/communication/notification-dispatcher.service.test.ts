import { describe, expect, it, vi } from 'vitest';

import { InMemoryEmailDeliveriesState } from './in-memory-email-deliveries.state.js';
import { NotificationDispatcher } from './notification-dispatcher.service.js';

function make() {
  const mailer = { send: vi.fn().mockResolvedValue({ status: 'sent' }) };
  const templates = { getOverride: vi.fn().mockResolvedValue(null) };
  const deliveries = new InMemoryEmailDeliveriesState();
  const dispatcher = new NotificationDispatcher(
    mailer as never,
    templates as never,
    deliveries as never
  );
  return { dispatcher, mailer, deliveries };
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

  it('skips the send entirely when a delivery with the dedupKey already exists', async () => {
    const { dispatcher, mailer, deliveries } = make();
    await dispatcher.dispatch({ ...baseInput, dedupKey: 'recert:d1:30' });
    expect(mailer.send).toHaveBeenCalledTimes(1);
    await dispatcher.dispatch({ ...baseInput, dedupKey: 'recert:d1:30' });
    expect(mailer.send).toHaveBeenCalledTimes(1); // not re-sent
    expect((await deliveries.list('t1', {})).total).toBe(1);
  });

  it('records the dedupKey so subsequent sends are deduped', async () => {
    const { dispatcher, deliveries } = make();
    await dispatcher.dispatch({ ...baseInput, dedupKey: 'recert:d1:7' });
    expect(await deliveries.findByDedupKey('t1', 'recert:d1:7')).not.toBeNull();
  });
});

import { describe, expect, it } from 'vitest';

import { InMemoryEmailDeliveriesState } from './in-memory-email-deliveries.state.js';

import type { EmailDeliverySeed } from './email-deliveries.repository.js';

function seed(over: Partial<EmailDeliverySeed> = {}): EmailDeliverySeed {
  return {
    tenantId: 't1',
    templateKey: 'recertification_due',
    recipientEmail: 'ivan@example.com',
    recipientKind: 'learner',
    subject: 'тест',
    status: 'sent',
    ...over
  };
}

describe('InMemoryEmailDeliveriesState.findByDedupKey', () => {
  it('returns null when no delivery has the key', async () => {
    const repo = new InMemoryEmailDeliveriesState();
    expect(await repo.findByDedupKey('t1', 'recert:d1:30')).toBeNull();
  });

  it('returns a recorded delivery by (tenant, dedupKey)', async () => {
    const repo = new InMemoryEmailDeliveriesState();
    await repo.record(seed({ dedupKey: 'recert:d1:30' }));
    const found = await repo.findByDedupKey('t1', 'recert:d1:30');
    expect(found?.dedupKey).toBe('recert:d1:30');
  });

  it('is tenant-scoped', async () => {
    const repo = new InMemoryEmailDeliveriesState();
    await repo.record(seed({ tenantId: 't1', dedupKey: 'recert:d1:30' }));
    expect(await repo.findByDedupKey('t2', 'recert:d1:30')).toBeNull();
  });
});

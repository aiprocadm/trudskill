// apps/backend/src/infrastructure/webinar-provider/webinar.provider.test.ts
import { describe, expect, it } from 'vitest';

import { NoopWebinarProvider } from './webinar.provider.js';

describe('NoopWebinarProvider', () => {
  it('has id "noop"', () => {
    expect(new NoopWebinarProvider().code).toBe('noop');
  });

  it('createSession returns null (provider asleep)', async () => {
    const result = await new NoopWebinarProvider().createSession({
      tenantId: 't1',
      webinarId: 'w1',
      title: 'Intro',
      plannedStartAt: '2026-07-01T10:00:00.000Z',
      plannedEndAt: '2026-07-01T11:00:00.000Z'
    });
    expect(result).toBeNull();
  });

  it('parseWebhook returns null', async () => {
    const events = await new NoopWebinarProvider().parseWebhook(Buffer.from('{}'), {});
    expect(events).toBeNull();
  });
});

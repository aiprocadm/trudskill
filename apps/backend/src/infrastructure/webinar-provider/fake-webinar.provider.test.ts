// apps/backend/src/infrastructure/webinar-provider/fake-webinar.provider.test.ts
import { describe, expect, it } from 'vitest';

import { FakeWebinarProvider } from './fake-webinar.provider.js';

describe('FakeWebinarProvider', () => {
  it('createSession returns synthetic, self-marked URLs', async () => {
    const s = await new FakeWebinarProvider().createSession({
      tenantId: 't1',
      webinarId: 'w1',
      title: 'Intro',
      plannedStartAt: '2026-07-01T10:00:00.000Z',
      plannedEndAt: '2026-07-01T11:00:00.000Z'
    });
    expect(s?.providerSessionId).toBe('fake-webinar:w1');
    expect(s?.joinUrl).toContain('fake-webinar://');
    expect(s?.hostUrl).toContain('fake-webinar://');
  });

  it('parseWebhook maps a synthetic attendance payload', async () => {
    const raw = Buffer.from(
      JSON.stringify({
        providerSessionId: 'fake-webinar:w1',
        events: [{ participantRef: 'l1', type: 'joined', occurredAt: '2026-07-01T10:00:00.000Z' }]
      })
    );
    const events = await new FakeWebinarProvider().parseWebhook(raw, {});
    expect(events?.[0]?.participantRef).toBe('l1');
    expect(events?.[0]?.type).toBe('joined');
  });

  it('parseWebhook returns null for garbage', async () => {
    expect(await new FakeWebinarProvider().parseWebhook(Buffer.from('not json'), {})).toBeNull();
  });
});

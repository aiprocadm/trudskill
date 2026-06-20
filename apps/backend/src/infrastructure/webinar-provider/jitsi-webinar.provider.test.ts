// apps/backend/src/infrastructure/webinar-provider/jitsi-webinar.provider.test.ts
import { describe, expect, it } from 'vitest';

import { JitsiWebinarProvider } from './jitsi-webinar.provider.js';

describe('JitsiWebinarProvider (skeleton)', () => {
  it('has code "jitsi"', () => {
    expect(new JitsiWebinarProvider('https://meet.example.org').code).toBe('jitsi');
  });

  it('createSession returns null until the real adapter is implemented', async () => {
    const result = await new JitsiWebinarProvider('https://meet.example.org').createSession({
      tenantId: 't1',
      webinarId: 'w1',
      title: 'Intro',
      plannedStartAt: '2026-07-01T10:00:00.000Z',
      plannedEndAt: '2026-07-01T11:00:00.000Z'
    });
    expect(result).toBeNull();
  });

  it('parseWebhook returns null', async () => {
    expect(
      await new JitsiWebinarProvider('https://meet.example.org').parseWebhook(Buffer.from('{}'), {})
    ).toBeNull();
  });
});

// apps/backend/src/infrastructure/webinar-provider/webinar.provider.test.ts
import { describe, expect, it } from 'vitest';

import { NoopWebinarProvider, type WebinarProvider } from './webinar.provider.js';

describe('NoopWebinarProvider', () => {
  // Тип интерфейса, а не класса: тест обязан звать шов так же, как его зовёт продукт,
  // и заодно доказывает, что заглушка договору соответствует.
  const noop: WebinarProvider = new NoopWebinarProvider();

  it('has id "noop"', () => {
    expect(noop.code).toBe('noop');
  });

  it('createSession returns null (provider asleep)', async () => {
    const result = await noop.createSession({
      tenantId: 't1',
      webinarId: 'w1',
      title: 'Intro',
      plannedStartAt: '2026-07-01T10:00:00.000Z',
      plannedEndAt: '2026-07-01T11:00:00.000Z'
    });
    expect(result).toBeNull();
  });

  it('parseWebhook returns null', async () => {
    const events = await noop.parseWebhook(Buffer.from('{}'), {});
    expect(events).toBeNull();
  });
});

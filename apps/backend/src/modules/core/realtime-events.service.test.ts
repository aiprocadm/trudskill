import { afterEach, describe, expect, it, vi } from 'vitest';

// Не 'test': в тестовом окружении публикация наружу отключена, а проверяем мы именно её.
vi.mock('../../env.js', () => ({
  backendEnv: {
    NODE_ENV: 'production',
    REALTIME_PUBLIC_URL: 'http://realtime.local',
    REALTIME_PUBLISH_KEY: 'publish-key-12345'
  }
}));

import { RealtimeEventsService } from './realtime-events.service.js';

describe('RealtimeEventsService срок ожидания (журнал 335)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('публикация уходит со сроком: молчащий realtime не копит висящие запросы в API', () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    new RealtimeEventsService().publish({
      event_name: 'notification.created',
      version: '1',
      tenant_id: 't1',
      occurred_at: '2026-09-03T00:00:00.000Z',
      payload: { recipient_user_id: 'u1' }
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://realtime.local/publish/user:u1');
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.signal?.aborted).toBe(false);
  });
});

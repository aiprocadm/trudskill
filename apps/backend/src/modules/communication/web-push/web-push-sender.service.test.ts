import { beforeEach, describe, expect, it, vi } from 'vitest';

const { setVapidDetails, sendNotification } = vi.hoisted(() => ({
  setVapidDetails: vi.fn(),
  sendNotification: vi.fn()
}));

vi.mock('web-push', () => ({
  default: { setVapidDetails, sendNotification },
  setVapidDetails,
  sendNotification
}));

// Mutable VAPID env mock — read at module init time inside the sender.
const envMock = {
  WEB_PUSH_ENABLED: true,
  VAPID_PUBLIC_KEY: 'pub-key',
  VAPID_PRIVATE_KEY: 'priv-key',
  VAPID_SUBJECT: 'mailto:admin@center.ru'
};
vi.mock('../../../env.js', () => ({
  get backendEnv() {
    return envMock;
  }
}));

import { WebPushSender } from './web-push-sender.service.js';

import type { PushSubscriptionService } from './push-subscription.service.js';
import type { PushSubscription } from '../../mvp/mvp.types.js';

const sub = (endpoint: string, userId = 'u1'): PushSubscription => ({
  id: `id-${endpoint}`,
  tenantId: 't1',
  status: 'active',
  createdAt: 'now',
  updatedAt: 'now',
  userId,
  endpoint,
  p256dh: 'p256',
  auth: 'auth'
});

function makeSender(subs: PushSubscription[]) {
  const removeByEndpoint = vi.fn();
  const listEndpointsForUsers = vi.fn().mockReturnValue(subs);
  const pushService = {
    listEndpointsForUsers,
    removeByEndpoint
  } as unknown as PushSubscriptionService;
  const sender = new WebPushSender(pushService);
  return { sender, listEndpointsForUsers, removeByEndpoint };
}

describe('WebPushSender', () => {
  beforeEach(() => {
    setVapidDetails.mockClear();
    sendNotification.mockReset();
    sendNotification.mockResolvedValue({ statusCode: 201 });
  });

  it('setVapidDetails вызывается с subject/public/private из env один раз при инициализации', () => {
    makeSender([]);
    expect(setVapidDetails).toHaveBeenCalledWith('mailto:admin@center.ru', 'pub-key', 'priv-key');
  });

  it('sendToUsers: резолвит подписки и шлёт web-push.sendNotification на каждую', async () => {
    const { sender, listEndpointsForUsers } = makeSender([sub('https://p/a'), sub('https://p/b')]);
    await sender.sendToUsers('t1', ['u1'], { title: 'T', body: 'B' });

    expect(listEndpointsForUsers).toHaveBeenCalledWith('t1', ['u1']);
    expect(sendNotification).toHaveBeenCalledTimes(2);
  });

  it('payload содержит title/body/url в JSON', async () => {
    const { sender } = makeSender([sub('https://p/a')]);
    await sender.sendToUsers('t1', ['u1'], { title: 'T', body: 'B', url: '/x' });

    const [subscriptionArg, payloadArg] = sendNotification.mock.calls[0];
    expect(subscriptionArg).toEqual({
      endpoint: 'https://p/a',
      keys: { p256dh: 'p256', auth: 'auth' }
    });
    expect(JSON.parse(payloadArg)).toEqual({ title: 'T', body: 'B', url: '/x' });
  });

  it('410/404 от push-сервиса → removeByEndpoint; остальные доставляются', async () => {
    const { sender, removeByEndpoint } = makeSender([sub('https://p/gone'), sub('https://p/ok')]);
    sendNotification.mockImplementation((s: { endpoint: string }) => {
      if (s.endpoint === 'https://p/gone') {
        return Promise.reject({ statusCode: 410 });
      }
      return Promise.resolve({ statusCode: 201 });
    });

    await sender.sendToUsers('t1', ['u1'], { title: 'T', body: 'B' });

    expect(removeByEndpoint).toHaveBeenCalledWith('t1', 'https://p/gone');
    expect(removeByEndpoint).toHaveBeenCalledTimes(1);
    expect(sendNotification).toHaveBeenCalledTimes(2);
  });

  it('прочие ошибки не бросаются и не зачищают подписку (best-effort)', async () => {
    const { sender, removeByEndpoint } = makeSender([sub('https://p/a')]);
    sendNotification.mockRejectedValue({ statusCode: 500 });

    await expect(
      sender.sendToUsers('t1', ['u1'], { title: 'T', body: 'B' })
    ).resolves.toBeUndefined();
    expect(removeByEndpoint).not.toHaveBeenCalled();
  });

  it('нет подписок → ноль вызовов sendNotification (no-op)', async () => {
    const { sender } = makeSender([]);
    await sender.sendToUsers('t1', ['u1'], { title: 'T', body: 'B' });
    expect(sendNotification).not.toHaveBeenCalled();
  });
});

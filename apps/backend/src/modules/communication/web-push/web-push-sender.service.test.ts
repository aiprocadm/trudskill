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
import { InMemoryMvpState } from '../../mvp/infrastructure/in-memory-mvp.state.js';

import type { MvpTenantRunner } from '../../mvp/infrastructure/mvp-tenant-runner.service.js';
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

/** Build a fake MvpTenantRunner backed by a single shared in-memory state. */
function makeRunner(initial: PushSubscription[]) {
  const state = new InMemoryMvpState();
  state.pushSubscriptions = [...initial];
  const runWithTenantState = vi.fn(
    async (_t: string, fn: (s: InMemoryMvpState) => Promise<unknown>) => fn(state)
  );
  const runWithTenantStateAndSave = vi.fn(
    async (_t: string, fn: (s: InMemoryMvpState) => Promise<unknown>) => fn(state)
  );
  const runner = {
    runWithTenantState,
    runWithTenantStateAndSave
  } as unknown as MvpTenantRunner;
  return { runner, state, runWithTenantState, runWithTenantStateAndSave };
}

function makeSender(initial: PushSubscription[]) {
  const { runner, state, runWithTenantState, runWithTenantStateAndSave } = makeRunner(initial);
  const sender = new WebPushSender(runner);
  return { sender, state, runWithTenantState, runWithTenantStateAndSave };
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

  it('sendToUsers: резолвит подписки через tenant-runner и шлёт web-push.sendNotification на каждую', async () => {
    const { sender, runWithTenantState } = makeSender([sub('https://p/a'), sub('https://p/b')]);
    await sender.sendToUsers('t1', ['u1'], { title: 'T', body: 'B' });

    expect(runWithTenantState).toHaveBeenCalledWith('t1', expect.any(Function));
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

  it('410/404 от push-сервиса → подписка зачищается write-mode; остальные доставляются', async () => {
    const { sender, state, runWithTenantStateAndSave } = makeSender([
      sub('https://p/gone'),
      sub('https://p/ok')
    ]);
    sendNotification.mockImplementation((s: { endpoint: string }) => {
      if (s.endpoint === 'https://p/gone') {
        return Promise.reject({ statusCode: 410 });
      }
      return Promise.resolve({ statusCode: 201 });
    });

    await sender.sendToUsers('t1', ['u1'], { title: 'T', body: 'B' });

    expect(runWithTenantStateAndSave).toHaveBeenCalledTimes(1);
    expect(state.pushSubscriptions.map((s) => s.endpoint)).toEqual(['https://p/ok']);
    expect(sendNotification).toHaveBeenCalledTimes(2);
  });

  it('прочие ошибки не бросаются и не зачищают подписку (best-effort)', async () => {
    const { sender, state, runWithTenantStateAndSave } = makeSender([sub('https://p/a')]);
    sendNotification.mockRejectedValue({ statusCode: 500 });

    await expect(
      sender.sendToUsers('t1', ['u1'], { title: 'T', body: 'B' })
    ).resolves.toBeUndefined();
    expect(runWithTenantStateAndSave).not.toHaveBeenCalled();
    expect(state.pushSubscriptions).toHaveLength(1);
  });

  it('нет подписок → ноль вызовов sendNotification (no-op)', async () => {
    const { sender } = makeSender([]);
    await sender.sendToUsers('t1', ['u1'], { title: 'T', body: 'B' });
    expect(sendNotification).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it } from 'vitest';

import {
  listSubscriptionsForUser,
  listSubscriptionsForUsers,
  removeSubscriptionByEndpoint,
  removeSubscriptionForUser,
  upsertSubscription
} from './push-subscription-store.js';
import { InMemoryMvpState } from '../../mvp/infrastructure/in-memory-mvp.state.js';

const raw = (endpoint: string, p256dh = 'p256', auth = 'auth') => ({
  endpoint,
  keys: { p256dh, auth }
});

describe('push-subscription-store', () => {
  let state: InMemoryMvpState;

  beforeEach(() => {
    state = new InMemoryMvpState();
  });

  it('upsertSubscription дедуплицирует по (tenant, endpoint) и обновляет keys/userId', () => {
    upsertSubscription(state, 't1', 'u1', raw('https://p/a'));
    upsertSubscription(state, 't1', 'u2', raw('https://p/a', 'newP', 'newA'));

    expect(state.pushSubscriptions).toHaveLength(1);
    expect(state.pushSubscriptions[0]).toMatchObject({
      userId: 'u2',
      p256dh: 'newP',
      auth: 'newA'
    });
  });

  it('изоляция по tenantId', () => {
    upsertSubscription(state, 't1', 'u1', raw('https://p/a'));
    upsertSubscription(state, 't2', 'u1', raw('https://p/b'));

    expect(listSubscriptionsForUser(state, 't1', 'u1')).toHaveLength(1);
    expect(listSubscriptionsForUser(state, 't2', 'u1')[0]?.endpoint).toBe('https://p/b');
  });

  it('removeSubscriptionForUser удаляет только свою; чужую не трогает', () => {
    upsertSubscription(state, 't1', 'u1', raw('https://p/a'));
    expect(removeSubscriptionForUser(state, 't1', 'u2', 'https://p/a')).toBe(false);
    expect(state.pushSubscriptions).toHaveLength(1);
    expect(removeSubscriptionForUser(state, 't1', 'u1', 'https://p/a')).toBe(true);
    expect(state.pushSubscriptions).toHaveLength(0);
  });

  it('listSubscriptionsForUsers — батч-резолв по множеству userId, изолирован по тенанту', () => {
    upsertSubscription(state, 't1', 'u1', raw('https://p/a'));
    upsertSubscription(state, 't1', 'u2', raw('https://p/b'));
    upsertSubscription(state, 't1', 'u3', raw('https://p/c'));
    upsertSubscription(state, 't2', 'u1', raw('https://p/d'));

    const resolved = listSubscriptionsForUsers(state, 't1', ['u1', 'u2']);
    expect(resolved.map((s) => s.endpoint).sort()).toEqual(['https://p/a', 'https://p/b']);
  });

  it('removeSubscriptionByEndpoint зачищает независимо от userId', () => {
    upsertSubscription(state, 't1', 'u1', raw('https://p/a'));
    expect(removeSubscriptionByEndpoint(state, 't1', 'https://p/a')).toBe(true);
    expect(state.pushSubscriptions).toHaveLength(0);
  });

  it('store keeps userAgent only when provided', () => {
    upsertSubscription(state, 't1', 'u1', { ...raw('https://p/a'), userAgent: 'Firefox' });
    expect(state.pushSubscriptions[0]?.userAgent).toBe('Firefox');
    upsertSubscription(state, 't1', 'u1', raw('https://p/b'));
    expect(state.pushSubscriptions[1]).not.toHaveProperty('userAgent');
  });
});

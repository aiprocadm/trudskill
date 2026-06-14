import { describe, expect, it } from 'vitest';

import { isValidBrowserSubscription, normalizeSubscription } from './web-push-keys.js';

describe('normalizeSubscription', () => {
  it('извлекает endpoint + keys из PushSubscription.toJSON()', () => {
    const raw = {
      endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
      keys: { p256dh: 'BPp256', auth: 'AuthKey' }
    };
    expect(normalizeSubscription(raw)).toEqual({
      endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
      p256dh: 'BPp256',
      auth: 'AuthKey'
    });
  });
});

describe('isValidBrowserSubscription', () => {
  it('true для корректной подписки', () => {
    expect(
      isValidBrowserSubscription({ endpoint: 'https://x/y', keys: { p256dh: 'a', auth: 'b' } })
    ).toBe(true);
  });
  for (const bad of [
    null,
    {},
    { endpoint: 'https://x' },
    { endpoint: 'not-a-url', keys: { p256dh: 'a', auth: 'b' } },
    { endpoint: 'https://x', keys: { p256dh: 'a' } }
  ]) {
    it(`false для ${JSON.stringify(bad)}`, () => {
      expect(isValidBrowserSubscription(bad)).toBe(false);
    });
  }
});

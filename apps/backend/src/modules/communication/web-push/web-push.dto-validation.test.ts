import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { SubscribePushRequest, UnsubscribePushRequest } from './web-push.dto.js';

function errors<T extends object>(Cls: new () => T, plain: unknown) {
  const instance = plainToInstance(Cls, plain);
  return validateSync(instance, { whitelist: true, forbidNonWhitelisted: false });
}

describe('SubscribePushRequest', () => {
  it('passes for a valid browser subscription', () => {
    expect(
      errors(SubscribePushRequest, {
        endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
        keys: { p256dh: 'p256-key', auth: 'auth-key' },
        userAgent: 'Firefox'
      })
    ).toHaveLength(0);
  });

  it('passes without the optional userAgent', () => {
    expect(
      errors(SubscribePushRequest, {
        endpoint: 'https://x/y',
        keys: { p256dh: 'a', auth: 'b' }
      })
    ).toHaveLength(0);
  });

  it('fails when keys.auth is missing', () => {
    const result = errors(SubscribePushRequest, {
      endpoint: 'https://x/y',
      keys: { p256dh: 'a' }
    });
    expect(result.length).toBeGreaterThan(0);
  });

  it('fails when endpoint is empty', () => {
    const result = errors(SubscribePushRequest, {
      endpoint: '',
      keys: { p256dh: 'a', auth: 'b' }
    });
    expect(result.some((e) => e.property === 'endpoint')).toBe(true);
  });

  it('fails when keys is missing entirely', () => {
    const result = errors(SubscribePushRequest, { endpoint: 'https://x/y' });
    expect(result.some((e) => e.property === 'keys')).toBe(true);
  });
});

describe('UnsubscribePushRequest', () => {
  it('passes with a non-empty endpoint', () => {
    expect(errors(UnsubscribePushRequest, { endpoint: 'https://x/y' })).toHaveLength(0);
  });

  it('fails with an empty endpoint', () => {
    expect(errors(UnsubscribePushRequest, { endpoint: '' }).length).toBeGreaterThan(0);
  });
});

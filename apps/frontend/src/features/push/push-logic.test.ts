import { describe, expect, it } from 'vitest';

import { isPushSupported, serializeSubscription, urlBase64ToUint8Array } from './push-logic';

describe('urlBase64ToUint8Array', () => {
  it('decodes a VAPID public key into a 65-byte Uint8Array (uncompressed P-256 point)', () => {
    // A real VAPID public key is 65 raw bytes (uncompressed P-256 point) as base64url.
    const key =
      'BBlIyLY27VTpSZOjHhVPZabn70rcJEo9lmjNO-G3eJRPxCNZPjIAMLy99PP7XTVlcLAObL7IVAXcj9gftYkJ6x0';
    const result = urlBase64ToUint8Array(key);
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBe(65);
    // Uncompressed EC point always starts with 0x04.
    expect(result[0]).toBe(0x04);
  });

  it('adds padding and replaces -_ with +/ before decoding', () => {
    // 'aa-_' base64url == 'aa+/' base64; length 4 needs no padding.
    const result = urlBase64ToUint8Array('aa-_');
    // base64 'aa+/' decodes to 3 bytes.
    expect(result.length).toBe(3);
  });
});

describe('serializeSubscription', () => {
  it('maps a PushSubscriptionJSON to the POST body shape', () => {
    const json = {
      endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
      keys: { p256dh: 'p256-key', auth: 'auth-key' }
    };
    expect(serializeSubscription(json)).toEqual({
      endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
      keys: { p256dh: 'p256-key', auth: 'auth-key' }
    });
  });

  it('passes through userAgent when provided', () => {
    const result = serializeSubscription(
      { endpoint: 'https://x/y', keys: { p256dh: 'a', auth: 'b' } },
      'Firefox/120'
    );
    expect(result.userAgent).toBe('Firefox/120');
  });
});

describe('isPushSupported', () => {
  it('true when both serviceWorker and PushManager are present', () => {
    expect(isPushSupported({ serviceWorker: {}, PushManager: function () {} })).toBe(true);
  });

  it('false when serviceWorker is missing', () => {
    expect(isPushSupported({ PushManager: function () {} })).toBe(false);
  });

  it('false when PushManager is missing', () => {
    expect(isPushSupported({ serviceWorker: {} })).toBe(false);
  });

  it('false for an empty environment', () => {
    expect(isPushSupported({})).toBe(false);
  });
});

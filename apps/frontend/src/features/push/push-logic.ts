// Phase 10 Track C — pure helpers for browser web-push, framework-free and unit-tested.

import type { SubscribePushRequest } from './types';

/**
 * Convert a base64url VAPID public key into the Uint8Array `applicationServerKey` expects.
 * Mirrors the canonical web-push snippet: pad to a multiple of 4, swap the URL-safe `-_`
 * alphabet back to standard `+/`, then atob → byte array.
 */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    output[i] = rawData.charCodeAt(i);
  }
  return output;
}

/** Minimal shape of PushSubscription.toJSON() we depend on. */
interface PushSubscriptionJSONLike {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** Map a browser PushSubscription JSON into the POST /web-push/subscribe body. */
export function serializeSubscription(
  sub: PushSubscriptionJSONLike,
  userAgent?: string
): SubscribePushRequest {
  return {
    endpoint: sub.endpoint,
    keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    ...(userAgent ? { userAgent } : {})
  };
}

/**
 * Feature-detect push support from an environment object (e.g. `window`/`navigator`-like).
 * Takes the env as an argument so it is testable without a real `window`.
 */
export function isPushSupported(env: Record<string, unknown>): boolean {
  return 'serviceWorker' in env && 'PushManager' in env;
}

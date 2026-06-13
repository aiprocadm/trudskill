/**
 * Phase 10 Track C — E2E smoke for web-push (route access, navigation, VAPID/serialize pipeline,
 * module smoke). Conventions: NO React Testing Library / no render — only evaluateRouteAccess +
 * getVisibleNavigation, pure pipeline integration, and dynamic-import smoke. The SW (src/app/sw.ts)
 * is webworker-only and intentionally NOT imported here.
 */

import { describe, expect, it } from 'vitest';

import { evaluateRouteAccess, getVisibleNavigation } from '../features/navigation/helpers';

import type { UserSession } from '../entities/session/model';

// The push subscription UI lives on /notifications (self-service, gated by tenant.read — the
// inbox-notifications access policy). Any authenticated tenant user can reach it.
const sessionWithTenantRead: UserSession = {
  user: {
    id: 'u_learner',
    tenantId: 'tenant_demo',
    login: 'learner',
    email: null,
    status: 'active',
    displayName: 'Learner'
  },
  tokens: { accessToken: 'tok', sessionId: 's1', expiresIn: 3600 },
  roles: ['learner'],
  permissions: ['tenant.read']
};

describe('push — routing (subscription UI on /notifications)', () => {
  it('/notifications: allowed with tenant.read', () => {
    expect(evaluateRouteAccess('/notifications', sessionWithTenantRead)).toEqual({ kind: 'ok' });
  });

  it('/notifications: redirect-login when session is null', () => {
    expect(evaluateRouteAccess('/notifications', null)).toEqual({ kind: 'redirect-login' });
  });
});

describe('push — navigation visibility', () => {
  it('«Сообщения» nav entry visible to a tenant.read user (push toggle reachable there)', () => {
    const hrefs = getVisibleNavigation(sessionWithTenantRead).map((i) => i.href);
    expect(hrefs).toContain('/notifications');
  });
});

describe('push — VAPID/serialize pipeline (pure functions)', () => {
  it('urlBase64ToUint8Array decodes a real VAPID key to 65 bytes starting with 0x04', async () => {
    const { urlBase64ToUint8Array } = await import('../features/push/push-logic');
    const key =
      'BBlIyLY27VTpSZOjHhVPZabn70rcJEo9lmjNO-G3eJRPxCNZPjIAMLy99PP7XTVlcLAObL7IVAXcj9gftYkJ6x0';
    const bytes = urlBase64ToUint8Array(key);
    expect(bytes.length).toBe(65);
    expect(bytes[0]).toBe(0x04);
  });

  it('serializeSubscription maps PushSubscription.toJSON() to the POST body', async () => {
    const { serializeSubscription } = await import('../features/push/push-logic');
    expect(
      serializeSubscription(
        { endpoint: 'https://fcm/abc', keys: { p256dh: 'p', auth: 'a' } },
        'UA/1'
      )
    ).toEqual({ endpoint: 'https://fcm/abc', keys: { p256dh: 'p', auth: 'a' }, userAgent: 'UA/1' });
  });

  it('isPushSupported true only when serviceWorker + PushManager present', async () => {
    const { isPushSupported } = await import('../features/push/push-logic');
    expect(isPushSupported({ serviceWorker: {}, PushManager: function () {} })).toBe(true);
    expect(isPushSupported({})).toBe(false);
  });
});

describe('push — module smoke', () => {
  it('api module loads and exposes pushApi with the 4 endpoints', async () => {
    const mod = await import('../features/push/api');
    expect(typeof mod.pushApi.getPublicKey).toBe('function');
    expect(typeof mod.pushApi.subscribe).toBe('function');
    expect(typeof mod.pushApi.unsubscribe).toBe('function');
    expect(typeof mod.pushApi.listSubscriptions).toBe('function');
  });

  it('screens module loads and exports PushSettingsScreen (browser APIs only touched in effects)', async () => {
    const mod = await import('../features/push/screens');
    expect(typeof mod.PushSettingsScreen).toBe('function');
  });
});

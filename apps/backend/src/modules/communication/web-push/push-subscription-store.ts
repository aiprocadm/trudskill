import { randomUUID } from 'node:crypto';

import { normalizeSubscription } from './web-push-keys.js';

import type { InMemoryMvpState } from '../../mvp/infrastructure/in-memory-mvp.state.js';
import type { PushSubscription } from '../../mvp/mvp.types.js';

/**
 * Pure operations over `state.pushSubscriptions`. Shared by the request-scoped
 * PushSubscriptionService (self-service CRUD) and the singleton WebPushSender (which loads
 * tenant state via MvpTenantRunner). Keeping the data logic here means both read/write paths
 * stay consistent and unit-testable without Nest DI.
 */

export interface BrowserSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent?: string;
}

function id(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, '')}`;
}

/** Upsert a browser subscription, deduped by (tenantId, endpoint). Returns the stored record. */
export function upsertSubscription(
  state: InMemoryMvpState,
  tenantId: string,
  userId: string,
  raw: BrowserSubscriptionInput
): PushSubscription {
  const normalized = normalizeSubscription(raw);
  const now = new Date().toISOString();
  const existing = state.pushSubscriptions.find(
    (s) => s.tenantId === tenantId && s.endpoint === normalized.endpoint
  );

  if (existing) {
    existing.userId = userId;
    existing.p256dh = normalized.p256dh;
    existing.auth = normalized.auth;
    existing.updatedAt = now;
    if (raw.userAgent !== undefined) {
      existing.userAgent = raw.userAgent;
    }
    return existing;
  }

  const record: PushSubscription = {
    id: id('push'),
    tenantId,
    status: 'active',
    createdAt: now,
    updatedAt: now,
    userId,
    endpoint: normalized.endpoint,
    p256dh: normalized.p256dh,
    auth: normalized.auth,
    ...(raw.userAgent !== undefined ? { userAgent: raw.userAgent } : {})
  };
  state.pushSubscriptions.push(record);
  return record;
}

/** Remove the subscription with `endpoint` owned by `userId` (self-service unsubscribe). Returns true if removed. */
export function removeSubscriptionForUser(
  state: InMemoryMvpState,
  tenantId: string,
  userId: string,
  endpoint: string
): boolean {
  const before = state.pushSubscriptions.length;
  state.pushSubscriptions = state.pushSubscriptions.filter(
    (s) => !(s.tenantId === tenantId && s.userId === userId && s.endpoint === endpoint)
  );
  return state.pushSubscriptions.length !== before;
}

/** Subscriptions of one (tenant, user). */
export function listSubscriptionsForUser(
  state: InMemoryMvpState,
  tenantId: string,
  userId: string
): PushSubscription[] {
  return state.pushSubscriptions.filter((s) => s.tenantId === tenantId && s.userId === userId);
}

/** Subscriptions for a set of users in a tenant (push fan-out resolution). */
export function listSubscriptionsForUsers(
  state: InMemoryMvpState,
  tenantId: string,
  userIds: string[]
): PushSubscription[] {
  const wanted = new Set(userIds);
  return state.pushSubscriptions.filter((s) => s.tenantId === tenantId && wanted.has(s.userId));
}

/** Drop any subscription with this endpoint in the tenant (stale-subscription cleanup). Returns true if removed. */
export function removeSubscriptionByEndpoint(
  state: InMemoryMvpState,
  tenantId: string,
  endpoint: string
): boolean {
  const before = state.pushSubscriptions.length;
  state.pushSubscriptions = state.pushSubscriptions.filter(
    (s) => !(s.tenantId === tenantId && s.endpoint === endpoint)
  );
  return state.pushSubscriptions.length !== before;
}

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PushSubscriptionService } from './push-subscription.service.js';
import { InMemoryMvpState } from '../../mvp/infrastructure/in-memory-mvp.state.js';

import type { RequestContext } from '../../../common/context/request-context.js';
import type { AuditService } from '../../audit/audit.service.js';

const ctx = (overrides: Partial<RequestContext> = {}): RequestContext =>
  ({
    tenantId: 't1',
    userId: 'u1',
    sessionId: 's1',
    requestId: 'r1',
    correlationId: 'c1',
    ip: '127.0.0.1',
    userAgent: 'jest',
    ...overrides
  }) as RequestContext;

const rawSub = (endpoint: string, p256dh = 'p256', auth = 'auth') => ({
  endpoint,
  keys: { p256dh, auth }
});

function makeService() {
  const state = new InMemoryMvpState();
  const audit = { write: vi.fn() } as unknown as AuditService;
  const service = new PushSubscriptionService(state, audit);
  return { state, audit, service };
}

describe('PushSubscriptionService', () => {
  let state: InMemoryMvpState;
  let audit: AuditService;
  let service: PushSubscriptionService;

  beforeEach(() => {
    ({ state, audit, service } = makeService());
  });

  it('subscribe: создаёт подписку для (tenant,user) с дедупом по endpoint (повтор → upsert, не дубль)', () => {
    service.subscribe('t1', 'u1', rawSub('https://push/abc'), ctx());
    service.subscribe('t1', 'u1', rawSub('https://push/abc', 'newP', 'newA'), ctx());

    expect(state.pushSubscriptions).toHaveLength(1);
    const sub = state.pushSubscriptions[0];
    expect(sub?.endpoint).toBe('https://push/abc');
    expect(sub?.p256dh).toBe('newP');
    expect(sub?.auth).toBe('newA');
  });

  it('subscribe: чужой tenant не видит подписку (listForUser изолирован по tenantId+userId)', () => {
    service.subscribe('t1', 'u1', rawSub('https://push/abc'), ctx());
    service.subscribe('t2', 'u1', rawSub('https://push/def'), ctx({ tenantId: 't2' }));

    expect(service.listForUser('t1', 'u1')).toHaveLength(1);
    expect(service.listForUser('t2', 'u1')).toHaveLength(1);
    expect(service.listForUser('t1', 'u1')[0]?.endpoint).toBe('https://push/abc');
  });

  it('subscribe: тот же endpoint у разных юзеров — отдельные подписки (upsert по tenant+endpoint забирает endpoint новому юзеру)', () => {
    // Endpoint уникален браузеру; если другой userId подписывает тот же endpoint —
    // владение переходит к нему (один браузер = один пользователь).
    service.subscribe('t1', 'u1', rawSub('https://push/abc'), ctx());
    service.subscribe('t1', 'u2', rawSub('https://push/abc'), ctx({ userId: 'u2' }));

    expect(state.pushSubscriptions).toHaveLength(1);
    expect(state.pushSubscriptions[0]?.userId).toBe('u2');
  });

  it('unsubscribe: по endpoint удаляет только свою подписку, чужие нетронуты', () => {
    service.subscribe('t1', 'u1', rawSub('https://push/abc'), ctx());
    service.subscribe('t1', 'u1', rawSub('https://push/def'), ctx());

    service.unsubscribe('t1', 'u1', 'https://push/abc', ctx());

    expect(state.pushSubscriptions).toHaveLength(1);
    expect(state.pushSubscriptions[0]?.endpoint).toBe('https://push/def');
  });

  it('unsubscribe: не трогает подписку другого пользователя с тем же endpoint', () => {
    service.subscribe('t1', 'u1', rawSub('https://push/abc'), ctx());
    // u2 пытается отписать endpoint, которым владеет u1 → no-op (скоуп по userId).
    service.unsubscribe('t1', 'u2', 'https://push/abc', ctx({ userId: 'u2' }));

    expect(state.pushSubscriptions).toHaveLength(1);
  });

  it('listForUser: возвращает только подписки данного (tenant,user)', () => {
    service.subscribe('t1', 'u1', rawSub('https://push/a'), ctx());
    service.subscribe('t1', 'u2', rawSub('https://push/b'), ctx({ userId: 'u2' }));

    const list = service.listForUser('t1', 'u1');
    expect(list).toHaveLength(1);
    expect(list[0]?.userId).toBe('u1');
  });

  it('listEndpointsForUsers: батч-резолв (tenant, userId[]) → подписки', () => {
    service.subscribe('t1', 'u1', rawSub('https://push/a'), ctx());
    service.subscribe('t1', 'u2', rawSub('https://push/b'), ctx({ userId: 'u2' }));
    service.subscribe('t1', 'u3', rawSub('https://push/c'), ctx({ userId: 'u3' }));
    service.subscribe('t2', 'u1', rawSub('https://push/d'), ctx({ tenantId: 't2' }));

    const resolved = service.listEndpointsForUsers('t1', ['u1', 'u2']);
    expect(resolved.map((s) => s.endpoint).sort()).toEqual(['https://push/a', 'https://push/b']);
  });

  it('removeByEndpoint: зачищает протухшую подписку независимо от userId', () => {
    service.subscribe('t1', 'u1', rawSub('https://push/abc'), ctx());
    service.removeByEndpoint('t1', 'https://push/abc');
    expect(state.pushSubscriptions).toHaveLength(0);
  });

  it('subscribe пишет audit (notifications.push_subscribed); unsubscribe — notifications.push_unsubscribed', () => {
    service.subscribe('t1', 'u1', rawSub('https://push/abc'), ctx());
    service.unsubscribe('t1', 'u1', 'https://push/abc', ctx());

    const calls = (audit.write as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0].action);
    expect(calls).toContain('notifications.push_subscribed');
    expect(calls).toContain('notifications.push_unsubscribed');
  });
});

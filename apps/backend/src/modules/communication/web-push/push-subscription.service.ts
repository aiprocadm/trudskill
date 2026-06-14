import { Inject, Injectable, Scope } from '@nestjs/common';

import {
  type BrowserSubscriptionInput,
  listSubscriptionsForUser,
  listSubscriptionsForUsers,
  removeSubscriptionByEndpoint,
  removeSubscriptionForUser,
  upsertSubscription
} from './push-subscription-store.js';
import { AuditService } from '../../audit/audit.service.js';
import { InMemoryMvpState } from '../../mvp/infrastructure/in-memory-mvp.state.js';
import { MVP_STATE } from '../../mvp/infrastructure/mvp-state.token.js';

import type { RequestContext } from '../../../common/context/request-context.js';
import type { PushSubscription } from '../../mvp/mvp.types.js';

export type { BrowserSubscriptionInput } from './push-subscription-store.js';

/**
 * Phase 10 Track C — request-scoped self-service CRUD of browser web-push subscriptions.
 * Reads/writes `pushSubscriptions` in the request's MVP-state via pure store helpers (shared
 * with WebPushSender). Dedup per (tenant, endpoint); user-scoped operations skoped by userId;
 * every mutation is audited.
 */
@Injectable({ scope: Scope.REQUEST })
export class PushSubscriptionService {
  constructor(
    @Inject(MVP_STATE) private readonly state: InMemoryMvpState,
    @Inject(AuditService) private readonly auditService: AuditService
  ) {}

  subscribe(
    tenantId: string,
    userId: string,
    raw: BrowserSubscriptionInput,
    ctx: RequestContext
  ): PushSubscription {
    const record = upsertSubscription(this.state, tenantId, userId, raw);
    this.audit(tenantId, ctx, 'notifications.push_subscribed', record.id, {
      endpoint: record.endpoint
    });
    return record;
  }

  unsubscribe(tenantId: string, userId: string, endpoint: string, ctx: RequestContext): void {
    if (removeSubscriptionForUser(this.state, tenantId, userId, endpoint)) {
      this.audit(tenantId, ctx, 'notifications.push_unsubscribed', endpoint, { endpoint });
    }
  }

  listForUser(tenantId: string, userId: string): PushSubscription[] {
    return listSubscriptionsForUser(this.state, tenantId, userId);
  }

  listEndpointsForUsers(tenantId: string, userIds: string[]): PushSubscription[] {
    return listSubscriptionsForUsers(this.state, tenantId, userIds);
  }

  removeByEndpoint(tenantId: string, endpoint: string): void {
    removeSubscriptionByEndpoint(this.state, tenantId, endpoint);
  }

  private audit(
    tenantId: string,
    ctx: RequestContext,
    action: string,
    entityId: string,
    newValues: Record<string, unknown>
  ): void {
    this.auditService.write({
      tenantId,
      actorId: ctx.userId,
      action,
      entityType: 'push_subscription',
      entityId,
      newValues,
      requestId: ctx.requestId,
      correlationId: ctx.correlationId,
      ip: ctx.ip,
      userAgent: ctx.userAgent
    });
  }
}

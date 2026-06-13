import { randomUUID } from 'node:crypto';

import { Inject, Injectable, Scope } from '@nestjs/common';

import { normalizeSubscription } from './web-push-keys.js';
import { AuditService } from '../../audit/audit.service.js';
import { InMemoryMvpState } from '../../mvp/infrastructure/in-memory-mvp.state.js';
import { MVP_STATE } from '../../mvp/infrastructure/mvp-state.token.js';

import type { RequestContext } from '../../../common/context/request-context.js';
import type { PushSubscription } from '../../mvp/mvp.types.js';

/** Сырой PushSubscription.toJSON() из браузера (после DTO-валидации). */
export interface BrowserSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent?: string;
}

/**
 * Phase 10 Track C — CRUD браузерных web-push подписок. Request-scoped (как другие
 * MVP-сервисы), читает/пишет `pushSubscriptions` в MVP-state. Дедуп per (tenant, endpoint):
 * один браузер = один endpoint = одна запись. Скоуп операций пользователя — по userId;
 * `removeByEndpoint`/`listEndpointsForUsers` — для push-sender-а (зачистка протухших,
 * батч-резолв получателей).
 */
@Injectable({ scope: Scope.REQUEST })
export class PushSubscriptionService {
  constructor(
    @Inject(MVP_STATE) private readonly state: InMemoryMvpState,
    @Inject(AuditService) private readonly auditService: AuditService
  ) {}

  /** Создаёт/обновляет подписку браузера; дедуп по (tenantId, endpoint). */
  subscribe(
    tenantId: string,
    userId: string,
    raw: BrowserSubscriptionInput,
    ctx: RequestContext
  ): PushSubscription {
    const normalized = normalizeSubscription(raw);
    const now = new Date().toISOString();
    const existing = this.state.pushSubscriptions.find(
      (s) => s.tenantId === tenantId && s.endpoint === normalized.endpoint
    );

    let record: PushSubscription;
    if (existing) {
      existing.userId = userId;
      existing.p256dh = normalized.p256dh;
      existing.auth = normalized.auth;
      existing.updatedAt = now;
      if (raw.userAgent !== undefined) {
        existing.userAgent = raw.userAgent;
      }
      record = existing;
    } else {
      record = {
        id: this.id('push'),
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
      this.state.pushSubscriptions.push(record);
    }

    this.audit(tenantId, ctx, 'notifications.push_subscribed', record.id, {
      endpoint: normalized.endpoint
    });
    return record;
  }

  /** Удаляет подписку с этим endpoint, принадлежащую userId (self-service). */
  unsubscribe(tenantId: string, userId: string, endpoint: string, ctx: RequestContext): void {
    const before = this.state.pushSubscriptions.length;
    this.state.pushSubscriptions = this.state.pushSubscriptions.filter(
      (s) => !(s.tenantId === tenantId && s.userId === userId && s.endpoint === endpoint)
    );
    if (this.state.pushSubscriptions.length !== before) {
      this.audit(tenantId, ctx, 'notifications.push_unsubscribed', endpoint, { endpoint });
    }
  }

  /** Подписки конкретного (tenant, user). */
  listForUser(tenantId: string, userId: string): PushSubscription[] {
    return this.state.pushSubscriptions.filter(
      (s) => s.tenantId === tenantId && s.userId === userId
    );
  }

  /** Батч-резолв подписок для множества пользователей (используется WebPushSender). */
  listEndpointsForUsers(tenantId: string, userIds: string[]): PushSubscription[] {
    const wanted = new Set(userIds);
    return this.state.pushSubscriptions.filter(
      (s) => s.tenantId === tenantId && wanted.has(s.userId)
    );
  }

  /** Зачистка протухшей подписки (вызывается sender-ом при 404/410 от push-сервиса). */
  removeByEndpoint(tenantId: string, endpoint: string): void {
    this.state.pushSubscriptions = this.state.pushSubscriptions.filter(
      (s) => !(s.tenantId === tenantId && s.endpoint === endpoint)
    );
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

  private id(prefix: string): string {
    return `${prefix}_${randomUUID().replace(/-/g, '')}`;
  }
}

import { Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';

import { DatabaseService } from '../../infrastructure/database/database.service.js';
import { RealtimeEventsService } from '../core/realtime-events.service.js';

const NOTIFICATION_CREATED_EVENT = 'notification.created';
const NOTIFICATION_READ_EVENT = 'notification.read';

export interface NotificationEntity {
  id: string;
  tenantId: string;
  recipientUserId?: string;
  recipientLearnerId?: string;
  channelCode: 'in_app';
  subjectText: string;
  bodyText: string;
  status: 'unread' | 'read';
  relatedEntityType?: string;
  relatedEntityId?: string;
  createdAt: string;
  readAt?: string;
  sentAt?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class NotificationsService {
  private notifications: NotificationEntity[] = [];

  constructor(
    @Inject(RealtimeEventsService) private readonly realtime: RealtimeEventsService,
    @Optional() @Inject(DatabaseService) private readonly databaseService?: DatabaseService
  ) {}

  async list(
    tenantId: string,
    userId: string | undefined,
    query: Record<string, string | undefined>
  ) {
    if (this.databaseService) {
      const rows = await this.databaseService.query<{
        id: string;
        tenant_id: string;
        recipient_user_id: string | null;
        recipient_learner_id: string | null;
        channel_code: 'in_app';
        subject_text: string;
        body_text: string;
        status: 'unread' | 'read';
        related_entity_type: string | null;
        related_entity_id: string | null;
        metadata_jsonb: Record<string, unknown> | null;
        created_at: string;
        read_at: string | null;
        sent_at: string | null;
      }>(
        `select id, tenant_id, recipient_user_id, recipient_learner_id, channel_code, subject_text, body_text, status, related_entity_type, related_entity_id, metadata_jsonb, created_at, read_at, sent_at
         from communication.notifications
         where tenant_id = $1
           and ($2::text is null or recipient_user_id is null or recipient_user_id = $2)
           and ($3::text is null or channel_code = $3)
           and ($4::text is null or related_entity_type = $4)
           and ($5::text <> 'unread' or status = 'unread')
         order by created_at desc`,
        [
          tenantId,
          userId ?? null,
          query.channel ?? null,
          query.related_entity_type ?? null,
          query.filter ?? null
        ]
      );
      const mapped = rows.map((row) => this.mapRow(row));
      return this.toListResponse(mapped, query);
    }

    const mapped = this.notifications.filter(
      (item) =>
        item.tenantId === tenantId &&
        (!item.recipientUserId || item.recipientUserId === userId) &&
        (!query.channel || item.channelCode === query.channel) &&
        (!query.related_entity_type || item.relatedEntityType === query.related_entity_type) &&
        (query.filter !== 'unread' || item.status === 'unread')
    );
    return this.toListResponse(mapped, query);
  }

  async create(seed: Omit<NotificationEntity, 'id' | 'createdAt' | 'status'>) {
    const item: NotificationEntity = {
      ...seed,
      id: this.id(),
      createdAt: new Date().toISOString(),
      status: 'unread'
    };
    if (this.databaseService) {
      await this.databaseService.query(
        `insert into communication.notifications (
          id, tenant_id, recipient_user_id, recipient_learner_id, channel_code, subject_text, body_text, status, related_entity_type, related_entity_id, metadata_jsonb, created_at
        ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::timestamptz)`,
        [
          item.id,
          item.tenantId,
          item.recipientUserId ?? null,
          item.recipientLearnerId ?? null,
          item.channelCode,
          item.subjectText,
          item.bodyText,
          item.status,
          item.relatedEntityType ?? null,
          item.relatedEntityId ?? null,
          JSON.stringify(item.metadata ?? {}),
          item.createdAt
        ]
      );
    } else {
      this.notifications.unshift(item);
    }
    this.publish(item.tenantId, NOTIFICATION_CREATED_EVENT, {
      notification_id: item.id,
      recipient_user_id: item.recipientUserId,
      status: item.status,
      channel_code: item.channelCode
    });
    return item;
  }

  async get(tenantId: string, id: string, userId?: string) {
    if (this.databaseService) {
      const rows = await this.databaseService.query<{
        id: string;
        tenant_id: string;
        recipient_user_id: string | null;
        recipient_learner_id: string | null;
        channel_code: 'in_app';
        subject_text: string;
        body_text: string;
        status: 'unread' | 'read';
        related_entity_type: string | null;
        related_entity_id: string | null;
        metadata_jsonb: Record<string, unknown> | null;
        created_at: string;
        read_at: string | null;
        sent_at: string | null;
      }>(
        `select id, tenant_id, recipient_user_id, recipient_learner_id, channel_code, subject_text, body_text, status, related_entity_type, related_entity_id, metadata_jsonb, created_at, read_at, sent_at
         from communication.notifications
         where tenant_id = $1 and id = $2`,
        [tenantId, id]
      );
      const row = rows[0];
      if (!row || (row.recipient_user_id && row.recipient_user_id !== userId))
        throw new NotFoundException('Notification not found');
      return this.mapRow(row);
    }
    const item = this.notifications.find((entry) => entry.id === id && entry.tenantId === tenantId);
    if (!item || (item.recipientUserId && item.recipientUserId !== userId))
      throw new NotFoundException('Notification not found');
    return item;
  }

  async read(tenantId: string, id: string, userId?: string) {
    const item = await this.get(tenantId, id, userId);
    item.status = 'read';
    item.readAt = new Date().toISOString();
    if (this.databaseService) {
      await this.databaseService.query(
        'update communication.notifications set status = $1, read_at = $2::timestamptz where tenant_id = $3 and id = $4',
        [item.status, item.readAt, tenantId, id]
      );
    }
    this.publish(tenantId, NOTIFICATION_READ_EVENT, { notification_id: item.id });
    return item;
  }

  async readAll(tenantId: string, userId?: string) {
    if (this.databaseService) {
      await this.databaseService.query(
        `update communication.notifications
         set status = 'read', read_at = now()
         where tenant_id = $1 and recipient_user_id = $2 and status = 'unread'`,
        [tenantId, userId ?? null]
      );
      return { updated: true };
    }

    this.notifications
      .filter(
        (item) =>
          item.tenantId === tenantId && item.recipientUserId === userId && item.status === 'unread'
      )
      .forEach((item) => void this.read(tenantId, item.id, userId));
    return { updated: true };
  }

  async unreadCounter(tenantId: string, userId?: string) {
    if (this.databaseService) {
      const rows = await this.databaseService.query<{ count: string }>(
        'select count(*)::text as count from communication.notifications where tenant_id = $1 and recipient_user_id = $2 and status = $3',
        [tenantId, userId ?? null, 'unread']
      );
      return Number(rows[0]?.count ?? 0);
    }
    return this.notifications.filter(
      (item) =>
        item.tenantId === tenantId && item.recipientUserId === userId && item.status === 'unread'
    ).length;
  }

  private toListResponse(items: NotificationEntity[], query: Record<string, string | undefined>) {
    const page = Math.max(1, Number(query.page ?? '1'));
    const pageSize = Math.min(100, Math.max(1, Number(query.page_size ?? '20')));
    const sort = query.sort ?? 'createdAt:desc';
    const sorted = [...items].sort((a, b) =>
      sort === 'createdAt:asc'
        ? a.createdAt.localeCompare(b.createdAt)
        : b.createdAt.localeCompare(a.createdAt)
    );
    const start = (page - 1) * pageSize;
    return { items: sorted.slice(start, start + pageSize), total: sorted.length, page, pageSize };
  }

  private publish(tenantId: string, eventName: string, payload: Record<string, unknown>) {
    this.realtime.publish({
      event_name: eventName,
      version: 'v1',
      tenant_id: tenantId,
      occurred_at: new Date().toISOString(),
      payload
    });
  }

  private id() {
    return `notif_${Math.random().toString(36).slice(2, 10)}`;
  }

  private mapRow(row: {
    id: string;
    tenant_id: string;
    recipient_user_id: string | null;
    recipient_learner_id: string | null;
    channel_code: 'in_app';
    subject_text: string;
    body_text: string;
    status: 'unread' | 'read';
    related_entity_type: string | null;
    related_entity_id: string | null;
    metadata_jsonb: Record<string, unknown> | null;
    created_at: string;
    read_at: string | null;
    sent_at: string | null;
  }): NotificationEntity {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      recipientUserId: row.recipient_user_id ?? undefined,
      recipientLearnerId: row.recipient_learner_id ?? undefined,
      channelCode: row.channel_code,
      subjectText: row.subject_text,
      bodyText: row.body_text,
      status: row.status,
      relatedEntityType: row.related_entity_type ?? undefined,
      relatedEntityId: row.related_entity_id ?? undefined,
      metadata: row.metadata_jsonb ?? undefined,
      createdAt: row.created_at,
      readAt: row.read_at ?? undefined,
      sentAt: row.sent_at ?? undefined
    };
  }
}

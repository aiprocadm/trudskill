import { Injectable, NotFoundException } from '@nestjs/common';
import { realtimeCatalog, type RealtimeEventEnvelope } from '@cdoprof/api-contracts';
import { RealtimeEventsService } from '../core/realtime-events.service.js';

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

  constructor(private readonly realtime: RealtimeEventsService) {}

  list(tenantId: string, userId: string | undefined, query: Record<string, string | undefined>) {
    return this.notifications.filter(
      (item) =>
        item.tenantId === tenantId &&
        (!item.recipientUserId || item.recipientUserId === userId) &&
        (!query.channel || item.channelCode === query.channel) &&
        (!query.related_entity_type || item.relatedEntityType === query.related_entity_type) &&
        (query.filter !== 'unread' || item.status === 'unread')
    );
  }

  create(seed: Omit<NotificationEntity, 'id' | 'createdAt' | 'status'>) {
    const item: NotificationEntity = { ...seed, id: this.id(), createdAt: new Date().toISOString(), status: 'unread' };
    this.notifications.unshift(item);
    this.publish(item.tenantId, realtimeCatalog.notificationCreated, {
      notification_id: item.id,
      recipient_user_id: item.recipientUserId,
      status: item.status,
      channel_code: item.channelCode
    });
    return item;
  }

  get(tenantId: string, id: string, userId?: string) {
    const item = this.notifications.find((entry) => entry.id === id && entry.tenantId === tenantId);
    if (!item || (item.recipientUserId && item.recipientUserId !== userId)) throw new NotFoundException('Notification not found');
    return item;
  }

  read(tenantId: string, id: string, userId?: string) {
    const item = this.get(tenantId, id, userId);
    item.status = 'read';
    item.readAt = new Date().toISOString();
    this.publish(tenantId, realtimeCatalog.notificationRead, { notification_id: item.id });
    return item;
  }

  readAll(tenantId: string, userId?: string) {
    this.notifications
      .filter((item) => item.tenantId === tenantId && item.recipientUserId === userId && item.status === 'unread')
      .forEach((item) => this.read(tenantId, item.id, userId));
    return { updated: true };
  }

  unreadCounter(tenantId: string, userId?: string) {
    return this.notifications.filter((item) => item.tenantId === tenantId && item.recipientUserId === userId && item.status === 'unread').length;
  }

  private publish(tenantId: string, eventName: RealtimeEventEnvelope['event_name'], payload: Record<string, unknown>) {
    this.realtime.publish({ event_name: eventName, version: 'v1', tenant_id: tenantId, occurred_at: new Date().toISOString(), payload });
  }

  private id() {
    return `notif_${Math.random().toString(36).slice(2, 10)}`;
  }
}

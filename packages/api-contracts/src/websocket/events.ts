export type RealtimeEventName =
  | 'async_task.status_changed'
  | 'notification.created'
  | 'notification.read'
  | 'chat.message.created'
  | 'dialog.updated'
  | 'unread.changed'
  | 'webinar.updated';

export interface RealtimeEventEnvelope<TPayload = unknown> {
  event_name: RealtimeEventName;
  version: 'v1';
  tenant_id: string;
  occurred_at: string;
  correlation_id?: string;
  payload: TPayload;
}

export interface AsyncTaskStatusChangedPayload {
  task_id: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'partial_success';
  source?: string;
}

export interface NotificationCreatedPayload {
  notification_id: string;
  recipient_user_id?: string;
  status: 'unread' | 'read';
  channel_code: 'in_app';
}

export interface ChatMessageCreatedPayload {
  dialog_id: string;
  message_id: string;
  sender_user_id: string;
  message_type: 'text' | 'system';
}

export const realtimeCatalog = {
  asyncTaskStatusChanged: 'async_task.status_changed',
  notificationCreated: 'notification.created',
  notificationRead: 'notification.read',
  chatMessageCreated: 'chat.message.created',
  dialogUpdated: 'dialog.updated',
  unreadChanged: 'unread.changed',
  webinarUpdated: 'webinar.updated'
} as const;

export interface WebSocketContractSkeleton {
  namespace: string;
  event: RealtimeEventName;
  payloadSchemaRef: string;
}

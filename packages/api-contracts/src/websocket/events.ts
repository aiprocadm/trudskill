/**
 * Полный список живых событий.
 *
 * Союз закрытый — он обещает фронтенду, что других событий не бывает. До 31.08.2026 обещание
 * было ложным в обе стороны (журнал 319): девять публикуемых событий (подпись и выгрузки
 * интеграций) в список не входили, а `dialog.updated` и `unread.changed` не публиковал никто.
 * Тип этого не ловил, потому что служба публикации объявляла свой конверт с
 * `event_name: string` — в этом месте союз терялся. Теперь она принимает именно этот тип.
 */
export type RealtimeEventName =
  | 'async_task.status_changed'
  | 'notification.created'
  | 'notification.read'
  | 'chat.message.created'
  | 'webinar.updated'
  | 'integration.export.requested'
  | 'integration.export.started'
  | 'integration.export.failed'
  | 'integration.export.completed'
  | 'esign.application.submitted'
  | 'esign.application.approved'
  | 'esign.application.rejected'
  | 'signature.completed'
  | 'signing.process.completed'
  | 'integration.webhook.received'
  | 'integration.webhook.processed'
  | 'integration.webhook.reprocess_requested';

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
  webinarUpdated: 'webinar.updated',
  integrationExportRequested: 'integration.export.requested',
  integrationExportStarted: 'integration.export.started',
  integrationExportFailed: 'integration.export.failed',
  integrationExportCompleted: 'integration.export.completed',
  esignApplicationSubmitted: 'esign.application.submitted',
  esignApplicationApproved: 'esign.application.approved',
  esignApplicationRejected: 'esign.application.rejected',
  signatureCompleted: 'signature.completed',
  signingProcessCompleted: 'signing.process.completed',
  integrationWebhookReceived: 'integration.webhook.received',
  integrationWebhookProcessed: 'integration.webhook.processed',
  integrationWebhookReprocessRequested: 'integration.webhook.reprocess_requested'
} as const;

export interface WebSocketContractSkeleton {
  namespace: string;
  event: RealtimeEventName;
  payloadSchemaRef: string;
}

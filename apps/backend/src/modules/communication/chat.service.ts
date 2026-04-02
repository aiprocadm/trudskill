import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { realtimeCatalog } from '@cdoprof/api-contracts';
import { NotificationsService } from './notifications.service.js';
import { RealtimeEventsService } from '../core/realtime-events.service.js';

interface Dialog { id: string; tenantId: string; type: 'direct' | 'entity_linked' | 'support'; relatedEntityType?: string; relatedEntityId?: string; assignedUserId?: string; createdAt: string; updatedAt: string; }
interface Participant { dialogId: string; tenantId: string; userId: string; role: string; unreadCount: number; }
interface Message { id: string; dialogId: string; tenantId: string; senderUserId: string; messageType: 'text' | 'system'; textBody: string; sentAt: string; editedAt?: string; deletedAt?: string; }

@Injectable()
export class ChatService {
  private dialogs: Dialog[] = [];
  private participants: Participant[] = [];
  private messages: Message[] = [];

  constructor(private readonly realtime: RealtimeEventsService, private readonly notifications: NotificationsService) {}

  listDialogs(tenantId: string, userId?: string) {
    const permitted = new Set(this.participants.filter((p) => p.tenantId === tenantId && p.userId === userId).map((p) => p.dialogId));
    return this.dialogs.filter((dialog) => dialog.tenantId === tenantId && permitted.has(dialog.id));
  }

  createDialog(tenantId: string, creatorUserId: string, body: { type: Dialog['type']; participantUserIds: string[]; relatedEntityType?: string; relatedEntityId?: string; assignedUserId?: string; }) {
    if (body.type === 'direct' && body.participantUserIds.length !== 2) throw new ForbiddenException('Direct dialog must have exactly 2 participants');
    const dialog: Dialog = { id: this.id('dlg'), tenantId, type: body.type, relatedEntityType: body.relatedEntityType, relatedEntityId: body.relatedEntityId, assignedUserId: body.assignedUserId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    this.dialogs.push(dialog);
    const uniqueParticipants = [...new Set([...body.participantUserIds, creatorUserId])];
    uniqueParticipants.forEach((userId) => this.participants.push({ dialogId: dialog.id, tenantId, userId, role: userId === creatorUserId ? 'owner' : 'member', unreadCount: 0 }));
    return dialog;
  }

  getDialog(tenantId: string, dialogId: string, userId?: string) {
    this.assertDialogAccess(tenantId, dialogId, userId);
    return this.dialogs.find((item) => item.id === dialogId)!;
  }

  listMessages(tenantId: string, dialogId: string, userId?: string) {
    this.assertDialogAccess(tenantId, dialogId, userId);
    return this.messages.filter((message) => message.tenantId === tenantId && message.dialogId === dialogId);
  }

  postMessage(tenantId: string, dialogId: string, senderUserId: string, textBody: string) {
    this.assertDialogAccess(tenantId, dialogId, senderUserId);
    const message: Message = { id: this.id('msg'), dialogId, tenantId, senderUserId, messageType: 'text', textBody, sentAt: new Date().toISOString() };
    this.messages.push(message);
    this.participants.filter((item) => item.tenantId === tenantId && item.dialogId === dialogId && item.userId !== senderUserId).forEach((item) => {
      item.unreadCount += 1;
      void this.notifications.create({ tenantId, recipientUserId: item.userId, channelCode: 'in_app', subjectText: 'Новое сообщение', bodyText: textBody.slice(0, 80), relatedEntityType: 'chat_dialog', relatedEntityId: dialogId });
    });
    this.realtime.publish({ event_name: realtimeCatalog.chatMessageCreated, version: 'v1', tenant_id: tenantId, occurred_at: new Date().toISOString(), payload: { dialog_id: dialogId, message_id: message.id, sender_user_id: senderUserId, message_type: message.messageType } });
    return message;
  }

  markRead(tenantId: string, dialogId: string, userId: string) {
    this.assertDialogAccess(tenantId, dialogId, userId);
    const participant = this.participants.find((item) => item.dialogId === dialogId && item.userId === userId && item.tenantId === tenantId)!;
    participant.unreadCount = 0;
    return { updated: true };
  }

  private assertDialogAccess(tenantId: string, dialogId: string, userId?: string) {
    const dialog = this.dialogs.find((item) => item.id === dialogId && item.tenantId === tenantId);
    if (!dialog) throw new NotFoundException('Dialog not found');
    const participant = this.participants.find((item) => item.dialogId === dialogId && item.userId === userId && item.tenantId === tenantId);
    if (!participant) throw new ForbiddenException('Dialog access denied');
  }

  private id(prefix: string) { return `${prefix}_${Math.random().toString(36).slice(2, 10)}`; }
}

import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';

import { CHAT_STATE } from './chat-state.token.js';
import {
  type ChatDialogRow,
  type ChatMessageRow,
  InMemoryChatState
} from './in-memory-chat.state.js';
import { NotificationsService } from './notifications.service.js';
import { RealtimeEventsService } from '../core/realtime-events.service.js';

const CHAT_MESSAGE_CREATED_EVENT = 'chat.message.created';

@Injectable()
export class ChatService {
  constructor(
    @Inject(CHAT_STATE) private readonly state: InMemoryChatState,
    @Inject(RealtimeEventsService) private readonly realtime: RealtimeEventsService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService
  ) {}

  listDialogs(tenantId: string, userId?: string) {
    const permitted = new Set(
      this.state.participants
        .filter((p) => p.tenantId === tenantId && p.userId === userId)
        .map((p) => p.dialogId)
    );
    return this.state.dialogs.filter(
      (dialog) => dialog.tenantId === tenantId && permitted.has(dialog.id)
    );
  }

  createDialog(
    tenantId: string,
    creatorUserId: string,
    body: {
      type: ChatDialogRow['type'];
      participantUserIds: string[];
      relatedEntityType?: string;
      relatedEntityId?: string;
      assignedUserId?: string;
    }
  ) {
    if (body.type === 'direct' && body.participantUserIds.length !== 2)
      throw new ForbiddenException('Direct dialog must have exactly 2 participants');
    const dialog: ChatDialogRow = {
      id: this.id('dlg'),
      tenantId,
      type: body.type,
      relatedEntityType: body.relatedEntityType,
      relatedEntityId: body.relatedEntityId,
      assignedUserId: body.assignedUserId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.state.dialogs.push(dialog);
    const uniqueParticipants = [...new Set([...body.participantUserIds, creatorUserId])];
    uniqueParticipants.forEach((userId) =>
      this.state.participants.push({
        dialogId: dialog.id,
        tenantId,
        userId,
        role: userId === creatorUserId ? 'owner' : 'member',
        unreadCount: 0
      })
    );
    return dialog;
  }

  getDialog(tenantId: string, dialogId: string, userId?: string) {
    this.assertDialogAccess(tenantId, dialogId, userId);
    return this.state.dialogs.find((item) => item.id === dialogId)!;
  }

  listMessages(tenantId: string, dialogId: string, userId?: string) {
    this.assertDialogAccess(tenantId, dialogId, userId);
    return this.state.messages.filter(
      (message) => message.tenantId === tenantId && message.dialogId === dialogId
    );
  }

  postMessage(tenantId: string, dialogId: string, senderUserId: string, textBody: string) {
    this.assertDialogAccess(tenantId, dialogId, senderUserId);
    const message: ChatMessageRow = {
      id: this.id('msg'),
      dialogId,
      tenantId,
      senderUserId,
      messageType: 'text',
      textBody,
      sentAt: new Date().toISOString()
    };
    this.state.messages.push(message);
    this.state.participants
      .filter(
        (item) =>
          item.tenantId === tenantId && item.dialogId === dialogId && item.userId !== senderUserId
      )
      .forEach((item) => {
        item.unreadCount += 1;
        void this.notifications.create({
          tenantId,
          recipientUserId: item.userId,
          channelCode: 'in_app',
          subjectText: 'Новое сообщение',
          bodyText: textBody.slice(0, 80),
          relatedEntityType: 'chat_dialog',
          relatedEntityId: dialogId
        });
      });
    this.realtime.publish({
      event_name: CHAT_MESSAGE_CREATED_EVENT,
      version: 'v1',
      tenant_id: tenantId,
      occurred_at: new Date().toISOString(),
      payload: {
        dialog_id: dialogId,
        message_id: message.id,
        sender_user_id: senderUserId,
        message_type: message.messageType
      }
    });
    return message;
  }

  markRead(tenantId: string, dialogId: string, userId: string) {
    this.assertDialogAccess(tenantId, dialogId, userId);
    const participant = this.state.participants.find(
      (item) => item.dialogId === dialogId && item.userId === userId && item.tenantId === tenantId
    )!;
    participant.unreadCount = 0;
    return { updated: true };
  }

  private assertDialogAccess(tenantId: string, dialogId: string, userId?: string) {
    const dialog = this.state.dialogs.find(
      (item) => item.id === dialogId && item.tenantId === tenantId
    );
    if (!dialog) throw new NotFoundException('Dialog not found');
    const participant = this.state.participants.find(
      (item) => item.dialogId === dialogId && item.userId === userId && item.tenantId === tenantId
    );
    if (!participant) throw new ForbiddenException('Dialog access denied');
  }

  private id(prefix: string) {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
  }
}

import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';

import {
  CHAT_REPOSITORY,
  type ChatDialogsQuery,
  type ChatMessagesQuery,
  type ChatRepository
} from './chat.repository.js';
import { type ChatDialogRow, type ChatMessageRow } from './in-memory-chat.state.js';
import { NotificationsService } from './notifications.service.js';
import { RealtimeEventsService } from '../core/realtime-events.service.js';

const CHAT_MESSAGE_CREATED_EVENT = 'chat.message.created';

@Injectable()
export class ChatService {
  constructor(
    @Inject(CHAT_REPOSITORY) private readonly repository: ChatRepository,
    @Inject(RealtimeEventsService) private readonly realtime: RealtimeEventsService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService
  ) {}

  async listDialogs(tenantId: string, userId: string | undefined, query: ChatDialogsQuery) {
    return this.repository.listDialogs(tenantId, userId, query);
  }

  async createDialog(
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
    const uniqueParticipants = [...new Set([...body.participantUserIds, creatorUserId])];
    await this.repository.createDialog(
      dialog,
      uniqueParticipants.map((userId) => ({
        dialogId: dialog.id,
        tenantId,
        userId,
        role: userId === creatorUserId ? 'owner' : 'member',
        unreadCount: 0
      }))
    );
    return dialog;
  }

  async getDialog(tenantId: string, dialogId: string, userId?: string) {
    await this.assertDialogAccess(tenantId, dialogId, userId);
    return this.repository.getDialog(tenantId, dialogId);
  }

  async listMessages(
    tenantId: string,
    dialogId: string,
    userId: string | undefined,
    query: ChatMessagesQuery
  ) {
    await this.assertDialogAccess(tenantId, dialogId, userId);
    return this.repository.listMessages(tenantId, dialogId, query);
  }

  async postMessage(tenantId: string, dialogId: string, senderUserId: string, textBody: string) {
    await this.assertDialogAccess(tenantId, dialogId, senderUserId);
    const message: ChatMessageRow = {
      id: this.id('msg'),
      dialogId,
      tenantId,
      senderUserId,
      messageType: 'text',
      textBody,
      sentAt: new Date().toISOString()
    };
    await this.repository.createMessage(message);
    const recipientUserIds = await this.repository.incrementUnreadForOtherParticipants(
      tenantId,
      dialogId,
      senderUserId
    );
    recipientUserIds.forEach((userId) => {
      void this.notifications.create({
        tenantId,
        recipientUserId: userId,
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

  async markRead(tenantId: string, dialogId: string, userId: string) {
    await this.assertDialogAccess(tenantId, dialogId, userId);
    await this.repository.resetUnreadCount(tenantId, dialogId, userId);
    return { updated: true };
  }

  private async assertDialogAccess(tenantId: string, dialogId: string, userId?: string) {
    const dialog = await this.repository.getDialog(tenantId, dialogId);
    if (!dialog) throw new NotFoundException('Dialog not found');
    const participant = await this.repository.isParticipant(tenantId, dialogId, userId);
    if (!participant) throw new ForbiddenException('Dialog access denied');
  }

  private id(prefix: string) {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
  }
}

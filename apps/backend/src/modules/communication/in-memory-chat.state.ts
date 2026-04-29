import { Injectable } from '@nestjs/common';

import type { ChatDialogsQuery, ChatMessagesQuery, ChatRepository } from './chat.repository.js';

/** Локальные типы из chat.service — хранение диалогов в памяти. */
export interface ChatDialogRow {
  id: string;
  tenantId: string;
  type: 'direct' | 'entity_linked' | 'support';
  relatedEntityType?: string;
  relatedEntityId?: string;
  assignedUserId?: string;
  createdAt: string;
  updatedAt: string;
}
export interface ChatParticipantRow {
  dialogId: string;
  tenantId: string;
  userId: string;
  role: string;
  unreadCount: number;
}
export interface ChatMessageRow {
  id: string;
  dialogId: string;
  tenantId: string;
  senderUserId: string;
  messageType: 'text' | 'system';
  textBody: string;
  sentAt: string;
  editedAt?: string;
  deletedAt?: string;
}

@Injectable()
export class InMemoryChatState implements ChatRepository {
  dialogs: ChatDialogRow[] = [];
  participants: ChatParticipantRow[] = [];
  messages: ChatMessageRow[] = [];

  async listDialogs(tenantId: string, userId: string | undefined, query: ChatDialogsQuery = {}) {
    const permitted = new Set(
      this.participants
        .filter((p) => p.tenantId === tenantId && p.userId === userId)
        .map((p) => p.dialogId)
    );
    const filtered = this.dialogs.filter(
      (dialog) => dialog.tenantId === tenantId && permitted.has(dialog.id)
    );
    const sorted = [...filtered].sort((a, b) =>
      query.sort === 'updatedAt:asc'
        ? a.updatedAt.localeCompare(b.updatedAt)
        : b.updatedAt.localeCompare(a.updatedAt)
    );
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const start = (page - 1) * pageSize;
    return { items: sorted.slice(start, start + pageSize), total: sorted.length };
  }

  async createDialog(dialog: ChatDialogRow, participants: ChatParticipantRow[]) {
    this.dialogs.push(dialog);
    this.participants.push(...participants);
  }

  async getDialog(tenantId: string, dialogId: string) {
    return this.dialogs.find((item) => item.id === dialogId && item.tenantId === tenantId) ?? null;
  }

  async isParticipant(tenantId: string, dialogId: string, userId: string | undefined) {
    return this.participants.some(
      (item) => item.dialogId === dialogId && item.userId === userId && item.tenantId === tenantId
    );
  }

  async listMessages(tenantId: string, dialogId: string, query: ChatMessagesQuery = {}) {
    const filtered = this.messages.filter(
      (m) => m.tenantId === tenantId && m.dialogId === dialogId
    );
    const sorted = [...filtered].sort((a, b) =>
      query.sort === 'sentAt:asc'
        ? a.sentAt.localeCompare(b.sentAt)
        : b.sentAt.localeCompare(a.sentAt)
    );
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const start = (page - 1) * pageSize;
    return { items: sorted.slice(start, start + pageSize), total: sorted.length };
  }

  async createMessage(message: ChatMessageRow) {
    this.messages.push(message);
  }

  async incrementUnreadForOtherParticipants(
    tenantId: string,
    dialogId: string,
    senderUserId: string
  ) {
    const recipients: string[] = [];
    this.participants
      .filter(
        (item) =>
          item.tenantId === tenantId && item.dialogId === dialogId && item.userId !== senderUserId
      )
      .forEach((item) => {
        item.unreadCount += 1;
        recipients.push(item.userId);
      });
    return recipients;
  }

  async resetUnreadCount(tenantId: string, dialogId: string, userId: string) {
    const participant = this.participants.find(
      (item) => item.dialogId === dialogId && item.userId === userId && item.tenantId === tenantId
    );
    if (participant) participant.unreadCount = 0;
  }
}

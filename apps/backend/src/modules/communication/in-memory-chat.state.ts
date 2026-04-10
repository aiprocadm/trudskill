import { Injectable } from '@nestjs/common';

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
export class InMemoryChatState {
  dialogs: ChatDialogRow[] = [];
  participants: ChatParticipantRow[] = [];
  messages: ChatMessageRow[] = [];
}
